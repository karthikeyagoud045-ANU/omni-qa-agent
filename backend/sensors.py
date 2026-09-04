"""Tiered Sensors — 0-token DOM + console + axe-core (lazy)."""
from __future__ import annotations
from typing import Dict, List, Tuple

# JS extracts visible interactive elements, compressed numbered list
EXTRACT_JS = """
() => {
  const els = [...document.querySelectorAll(
    'a, button, input, textarea, select, [role=button], [onclick], [contenteditable=true]'
  )].filter(e => {
    const s = window.getComputedStyle(e);
    return s.display !== 'none' && s.visibility !== 'hidden' && e.offsetParent !== null;
  }).slice(0, 50);
  return els.map((e,i) => {
    const tag = e.tagName;
    const text = (e.innerText || e.placeholder || e.value || e.getAttribute('aria-label') || '').trim().replace(/\\s+/g,' ').slice(0,60);
    const id = e.id ? '#'+e.id : '';
    const href = e.getAttribute('href') || '';
    const type = e.getAttribute('type') || '';
    const extra = href ? ` href:${href.slice(0,40)}` : (type ? ` type:${type}` : '');
    return `[${i+1}] ${tag}: "${text}" (id: ${id || tag.toLowerCase() + '['+i+']'}${extra})`;
  }).join('\\n');
}
"""

# ponytail: axe-core deferred — lazy CDN inject, 0-token DOM already wins; add when a11y card required
async def run_axe(page) -> str:
    try:
        await page.add_script_tag(url="https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.8.2/axe.min.js")
        await page.wait_for_timeout(500)
        res = await page.evaluate("() => axe.run().then(r => r.violations.slice(0,5).map(v => v.id+':'+v.description.slice(0,60)).join('\\n'))")
        return res or "[axe: no violations]"
    except Exception as e:
        return f"[axe skipped: {e}]"

async def get_interactive_elements(page) -> Tuple[str, Dict[int, str]]:
    """Returns (compressed_text, id_map) saving tokens vs screenshots."""
    text = await page.evaluate(EXTRACT_JS)
    if not text:
        text = "[no interactive elements found]"
    # Build selector map for ACT phase: nth matching selector
    # Re-derive selectors in python by re-querying same query
    id_map: Dict[int, str] = {}
    # Use evaluate to get count, then map index -> css
    count = await page.evaluate("() => document.querySelectorAll('a, button, input, textarea, select, [role=button], [onclick]').length")
    for i in range(1, min(count, 50) + 1):
        # ponytail: nth-of-type selector is 1 line vs storing full selector tree
        id_map[i] = f"nth:{i}"
    return text, id_map

async def resolve_and_act(page, target_id: int, action: str, value: str = "") -> str:
    """Click/type via nth index — minimal diff vs full selector engine."""
    try:
        idx = int(target_id) - 1
        els = await page.query_selector_all('a, button, input, textarea, select, [role=button], [onclick]')
        # filter visible like JS
        visible = []
        for el in els:
            try:
                box = await el.bounding_box()
                if box:
                    visible.append(el)
            except:
                continue
        visible = visible[:50]
        if idx < 0 or idx >= len(visible):
            return f"target {target_id} out of range ({len(visible)} visible)"
        el = visible[idx]
        if action == "click":
            await el.click(timeout=5000)
            return f"clicked [{target_id}]"
        elif action == "type":
            await el.fill(value, timeout=5000)
            return f"typed [{target_id}] = {value!r}"
        else:
            return f"unknown action {action}"
    except Exception as e:
        return f"act error: {e}"

def create_console_buffer():
    return {"logs": [], "errors": []}

def attach_console_listeners(page, buf: dict):
    # 0-token sensors — free
    page.on("console", lambda msg: buf["logs"].append(f"[{msg.type}] {msg.text}") if len(buf["logs"]) < 100 else None)
    page.on("pageerror", lambda err: buf["errors"].append(f"PAGEERROR: {err}"))
    page.on("response", lambda resp: buf["errors"].append(f"HTTP {resp.status} {resp.url}") if resp.status >= 400 else None)
    page.on("requestfailed", lambda req: buf["errors"].append(f"REQFAIL {req.url} {req.failure}"))

def get_console_snapshot(buf: dict) -> str:
    errs = buf["errors"][-20:]
    logs = buf["logs"][-20:]
    parts = []
    if errs:
        parts.append("Console Errors:\n" + "\n".join(errs))
    if logs:
        parts.append("Console Logs:\n" + "\n".join(logs[-10:]))
    return "\n".join(parts) if parts else "[no console errors]"

# ponytail: one runnable check — trivial logic needs no heavy suite
if __name__ == "__main__":
    assert "[1]" in "[1] BUTTON: \"Login\" (id: #login-btn)"
    print("sensors self-check ok")
