"""Omni-QA Brain — ReAct loop: OBSERVE → THINK → ACT → EVALUATE."""
import asyncio
import re
from urllib.parse import urlparse
from typing import Callable, Dict, List, Tuple
from sensors import get_interactive_elements, resolve_and_act, create_console_buffer, attach_console_listeners, get_console_snapshot
from featherless_client import get_next_action, get_ai_status

def _classify_errors(console_text: str, target_host: str) -> Tuple[List[str], List[str]]:
    """Split into bug_signals vs warnings per Task1.
    bug: 5xx any host, PAGEERROR, failed primary doc, same-host 4xx
    warn: cross-origin 4xx, REQFAIL, CDN/analytics 4xx
    """
    bug, warn = [], []
    if not console_text:
        return bug, warn
    for line in console_text.splitlines():
        line=line.strip()
        if not line:
            continue
        if "PAGEERROR" in line or "PAGE ERROR" in line:
            bug.append(line); continue
        # HTTP status extraction
        m = re.search(r"HTTP\s+(\d{3})\s+(\S+)", line)
        if m:
            try: status=int(m.group(1))
            except: continue
            url=m.group(2)
            try: host=urlparse(url).netloc.lower()
            except: host=""
            target=target_host.lower()
            same = host==target or (host and target and host==target)
            # 5xx always bug
            if 500 <= status <= 599:
                bug.append(line)
            elif 400 <= status <= 499:
                if same:
                    bug.append(line)
                else:
                    warn.append(line)
            continue
        if "REQFAIL" in line:
            # treat as warning unless it looks like same-host document
            # need host extraction
            m2=re.search(r"REQFAIL\s+(\S+)", line)
            if m2:
                try: host=urlparse(m2.group(1)).netloc.lower()
                except: host=""
                if host==target_host.lower() and host:
                    bug.append(line)
                else:
                    warn.append(line)
            else:
                warn.append(line)
            continue
        # other console error lines without HTTP — treat as warn unless PAGEERROR
        if "ERROR" in line.upper() and "Console Errors" not in line:
            warn.append(line)
    return bug, warn

async def run_mission(url: str, bug_description: str, log_cb: Callable, max_steps: int = 12, is_cancelled: Callable[[], bool] = lambda: False) -> Dict:
    from playwright.async_api import async_playwright

    buf = create_console_buffer()
    steps: List[Dict] = []
    verdict = "INCONCLUSIVE"
    summary = ""

    import os
    headless = os.getenv("HEADLESS", "false").lower() == "true"
    # caches for verdict intelligence
    _warnings_cache: List[str] = []
    _bug_signals_cache: List[str] = []
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=headless, slow_mo=500)  # FLEX headless=False, HEADLESS=true for CI
        context = await browser.new_context()
        page = await context.new_page()
        attach_console_listeners(page, buf)

        try:
            await log_cb({"type":"info","msg":f"Navigating to {url}"})
            await page.goto(url, wait_until="domcontentloaded", timeout=45000)
            await page.wait_for_timeout(1000)
        except Exception as e:
            await log_cb({"type":"info","msg":f"WARN goto timeout/err: {e} — analyzing whatever DOM loaded"})
            # only FAIL if DOM truly empty
            try:
                probe = await page.content()
                if not probe or len(probe.strip()) < 100:
                    await browser.close()
                    return {"verdict":"FAILED","summary":f"Could not load {url}: {e}","steps":steps,"console_errors":get_console_snapshot(buf),"screenshot_url":None,"screenshot_b64":None}
            except:
                await browser.close()
                return {"verdict":"FAILED","summary":f"Could not load {url}: {e}","steps":steps,"console_errors":get_console_snapshot(buf),"screenshot_url":None,"screenshot_b64":None}

        for step in range(1, max_steps+1):
            if is_cancelled():
                await log_cb({"type":"info","msg":"Audit stopped by user."})
                verdict="STOPPED"
                summary=f"Stopped by user after {len(steps)} steps"
                break
            # OBSERVE
            await log_cb({"type":"observe","msg":f"Step {step}: OBSERVING"})
            try:
                dom_text, id_map = await get_interactive_elements(page)
            except Exception as e:
                dom_text, id_map = f"[extract error: {e}]", {}
            console = get_console_snapshot(buf)
            await log_cb({"type":"dom","msg":dom_text[:800]})
            if "HTTP 4" in console or "HTTP 5" in console or "PAGEERROR" in console:
                await log_cb({"type":"error","msg":console[:600]})

            # THINK
            await log_cb({"type":"think","msg":"THINKING..."})
            decision = await get_next_action(dom_text, console, bug_description)
            thought = decision.get("thought","")
            action = decision.get("action","finish")
            target_id = decision.get("target_id",0)
            value = decision.get("value","")
            await log_cb({"type":"thought","msg":thought})
            await log_cb({"type":"action","msg":f"ACTION: {action} target={target_id} value={value!r}"})
            steps.append({"step":step,"thought":thought,"action":action,"target_id":target_id,"value":value,"dom":dom_text[:500],"console":console[:500]})

            if action == "finish":
                summary = value or thought
                # TASK1 verdict intelligence
                try: target_host=urlparse(url).netloc
                except: target_host=""
                bug_signals, warnings = _classify_errors(console, target_host)
                is_live = False
                try: is_live = bool(get_ai_status().get("live"))
                except: is_live=False
                has_desc = bool(bug_description and bug_description.strip())
                # LLM live + description → LLM decides
                if is_live and has_desc:
                    is_no_bug_llm = "no bug" in summary.lower() or "not confirmed" in summary.lower()
                    has_bug_kw = any(k in summary.lower() for k in ["bug","error","fail","issue","confirmed"])
                    if bug_signals:
                        verdict="BUG_FOUND"
                        summary=f"{len(bug_signals)} same-origin failures detected ({', '.join([s.split()[1] if len(s.split())>1 else s[:30] for s in bug_signals[:2]])})"
                    elif has_bug_kw and not is_no_bug_llm:
                        verdict="BUG_FOUND"
                    else:
                        verdict="CLEAN"
                        if warnings:
                            summary = (summary or "Clean") + f" — {len(warnings)} third-party warnings ignored"
                    # attach warnings count for UI
                else:
                    # fallback / no description: only bug_signals flip to BUG
                    if bug_signals:
                        verdict="BUG_FOUND"
                        summary=f"{len(bug_signals)} failing network/auth calls detected ({', '.join([s.split()[1] if len(s.split())>1 else s[:30] for s in bug_signals[:2]])})"
                    else:
                        verdict="CLEAN"
                        if warnings:
                            summary = (summary or "No bug detected") + f" — {len(warnings)} third-party warnings ignored" if "no bug" not in summary.lower() else summary + f" — {len(warnings)} third-party warnings ignored"
                        elif "no bug" not in summary.lower() and not summary:
                            summary="Clean — no user-facing failures detected"
                _warnings_cache = warnings
                _bug_signals_cache = bug_signals
                break

            # ACT
            if is_cancelled():
                await log_cb({"type":"info","msg":"Audit stopped by user."})
                verdict="STOPPED"
                summary=f"Stopped by user after {len(steps)} steps"
                break
            result = await resolve_and_act(page, target_id, action, value)
            await log_cb({"type":"act_result","msg":result})
            # EVALUATE — longer to keep demo visibly alive 10+ sec in fallback
            await page.wait_for_timeout(1500)
            if is_cancelled():
                await log_cb({"type":"info","msg":"Audit stopped by user."})
                verdict="STOPPED"
                summary=f"Stopped by user after {len(steps)} steps"
                break

        # keep browser visibly alive before screenshot to hit 10+ sec
        await page.wait_for_timeout(2500)
        # final snapshot
        console_final = get_console_snapshot(buf)
        # perf metrics (cheap wow)
        perf = {}
        try:
            perf = await page.evaluate("""() => {
                const t = performance.timing;
                const nav = performance.getEntriesByType('navigation')[0];
                const ttfb = t.responseStart - t.navigationStart;
                const dom = t.domContentLoadedEventEnd - t.navigationStart;
                const load = t.loadEventEnd - t.navigationStart;
                let lcp = null;
                return {ttfb, domContentLoaded: dom, load, lcp}
            }""")
            # try LCP via PerformanceObserver if available (guarded)
            try:
                lcp_val = await page.evaluate("""() => new Promise(r=>{
                    try{
                        let v=null;
                        const obs=new PerformanceObserver(es=>{ es.getEntries().forEach(e=>{ if(e.entryType==='largest-contentful-paint') v=e.startTime }); });
                        obs.observe({type:'largest-contentful-paint', buffered:true});
                        setTimeout(()=>{ obs.disconnect(); r(v)}, 300);
                    }catch(e){ r(null) }
                })""")
                if lcp_val: perf["lcp"]=int(lcp_val)
            except: pass
        except: pass
        # a11y lazy
        a11y_violations = 0
        a11y_details = ""
        try:
            from sensors import run_axe
            axe_res = await run_axe(page)
            if "axe:" in axe_res or "violations" in axe_res.lower():
                # count lines
                if "[axe:" in axe_res:
                    a11y_violations = 0
                else:
                    a11y_violations = axe_res.count("\n")+1 if axe_res.strip() else 0
                a11y_details = axe_res[:500]
            else:
                a11y_details = axe_res[:500]
        except: pass
        # TASK4: final verdict reconciliation if summary empty
        if not summary:
            try: target_host2=urlparse(url).netloc
            except: target_host2=""
            b2,w2=_classify_errors(console_final, target_host2)
            if b2:
                verdict="BUG_FOUND"; summary=f"{len(b2)} same-origin failures detected"
            else:
                verdict="CLEAN"; summary="Clean — no user-facing failures detected" if not w2 else f"Clean — {len(w2)} third-party warnings ignored"
            _warnings_cache=w2; _bug_signals_cache=b2
        elif verdict=="INCONCLUSIVE":
            try: target_host2=urlparse(url).netloc
            except: target_host2=""
            b2,w2=_classify_errors(console_final, target_host2)
            if b2: verdict="BUG_FOUND"
            else: verdict="CLEAN"
            _warnings_cache=w2; _bug_signals_cache=b2
        screenshot_url = None
        screenshot_b64 = None
        try:
            png = await page.screenshot(type="png", full_page=False)
            import uuid, base64
            from pathlib import Path
            fname = f"{uuid.uuid4().hex[:8]}.png"
            local_dir = Path(__file__).parent / "screenshots"
            local_dir.mkdir(exist_ok=True)
            (local_dir / fname).write_bytes(png)
            screenshot_b64 = "data:image/png;base64," + base64.b64encode(png).decode()
            # attempt supabase upload — 0 extra tokens, best effort
            try:
                import os
                from supabase import create_client
                url_env = os.getenv("SUPABASE_URL","")
                key_env = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_ANON_KEY","")
                if url_env and key_env and "your-project" not in url_env:
                    sb = create_client(url_env, key_env)
                    sb.storage.from_("screenshots").upload(fname, png, {"content-type":"image/png"})
                    pub = sb.storage.from_("screenshots").get_public_url(fname)
                    # supabase-py returns string or dict
                    screenshot_url = pub if isinstance(pub, str) else pub.get("publicUrl") or str(pub)
                    if not screenshot_url or "screenshots" not in screenshot_url:
                        screenshot_url = f"{url_env}/storage/v1/object/public/screenshots/{fname}"
                else:
                    screenshot_url = f"/api/screenshot/{fname}"
            except Exception:
                screenshot_url = f"/api/screenshot/{fname}"
            # fallback local path if upload gave nothing
            if not screenshot_url:
                screenshot_url = f"/api/screenshot/{fname}"
        except Exception:
            pass

        await browser.close()

    return {"verdict":verdict,"summary":summary,"steps":steps,"console_errors":console_final,"url":url,"bug_description":bug_description,"screenshot_url":screenshot_url,"screenshot_b64":screenshot_b64,"warnings":_warnings_cache,"bug_signals":_bug_signals_cache,"perf":perf,"a11y_violations":a11y_violations,"a11y_details":a11y_details}
