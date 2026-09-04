"""Featherless.ai gateway — single entry for all LLM calls (Model Gateway)."""
import os, json, re
from typing import Dict

try:
    from openai import AsyncOpenAI
except ImportError:
    AsyncOpenAI = None  # ponytail: lazy fallback if openai not installed

SYSTEM_PROMPT = """You are an elite QA engineer. Analyze DOM + console logs.
Output ONLY valid JSON: {"thought":"string","action":"click|type|finish","target_id":number,"value":"string"}
Rules:
- action=click -> target_id is the number in [N], value=""
- action=type -> target_id is INPUT/TEXTAREA number, value is text to type
- action=finish -> task complete or bug found, target_id 0, value is summary
- Never output markdown, only JSON.
"""

MODEL_CANDIDATES = [
    "qwen/qwen2.5-7b-instruct",
    "Qwen/Qwen2.5-7B-Instruct",
    "qwen2.5-7b-instruct",
    "meta-llama/Llama-3.1-8B-Instruct",
]
_ai_status = {"live": False, "model": None, "checked": False, "error": None}
_mock_step = 0  # deterministic fallback counter

def _mock_response(dom_text: str) -> Dict:
    global _mock_step
    _mock_step += 1
    # 4-step deterministic exploration + stay alive: click [1], click [2], type test, click [3], then finish
    has_input = "INPUT" in dom_text
    if _mock_step == 1:
        return {"thought": "Auto-pilot: exploring — clicking element [1]","action":"click","target_id":1,"value":""}
    if _mock_step == 2:
        return {"thought": "Auto-pilot: exploring — clicking element [2]","action":"click","target_id":2,"value":""}
    if _mock_step == 3 and has_input:
        return {"thought": "Auto-pilot: exploring — typing test into input [1]","action":"type","target_id":1,"value":"test"}
    if _mock_step == 4:
        # try clicking third element (often Login button)
        return {"thought": "Auto-pilot: exploring — clicking element [3]","action":"click","target_id":3,"value":""}
    if _mock_step <= 6:
        # extra waits to keep browser visibly alive 10+ seconds (agent waits 1.5s per step)
        return {"thought": f"Auto-pilot: observing state step {_mock_step}","action":"click","target_id":1,"value":""}
    return {"thought":"Auto-pilot: exploration complete — no bug detected","action":"finish","target_id":0,"value":"No bug detected — deterministic exploration complete"}
    # ponytail: 6+ steps * 1.5s evaluate + nav/screenshot pauses >10s

def reset_mock():
    global _mock_step
    _mock_step = 0

async def verify_connection() -> Dict:
    global _ai_status
    api_key = os.getenv("FEATHERLESS_API_KEY", "mock_key")
    base_url = os.getenv("FEATHERLESS_BASE_URL", "https://api.featherless.ai/v1")
    if api_key == "mock_key" or AsyncOpenAI is None:
        _ai_status = {"live": False, "model": None, "checked": True, "error": "mock_key"}
        print("FEATHERLESS UNREACHABLE -> deterministic fallback (mock_key)")
        return _ai_status
    # Use stdlib http to avoid new deps — GET {base_url}/models
    import urllib.request, urllib.error
    import asyncio as _asyncio
    def _sync_check():
        try:
            req = urllib.request.Request(f"{base_url.rstrip('/')}/models", headers={"Authorization": f"Bearer {api_key}"})
            with urllib.request.urlopen(req, timeout=8) as resp:
                data = json.loads(resp.read().decode())
                models = [m.get("id","") for m in data.get("data",[])] if isinstance(data, dict) else []
                # check if any candidate exists
                for cand in MODEL_CANDIDATES:
                    if cand in models:
                        return {"live": True, "model": cand, "checked": True, "error": None}
                # if models list non-empty but none match, still live
                if models:
                    return {"live": True, "model": models[0], "checked": True, "error": None}
                return {"live": True, "model": MODEL_CANDIDATES[0], "checked": True, "error": None}
        except Exception as e:
            return {"live": False, "model": None, "checked": True, "error": str(e)[:200]}
    try:
        result = await _asyncio.to_thread(_sync_check)
    except Exception as e:
        result = {"live": False, "model": None, "checked": True, "error": str(e)[:200]}
    # If /models is forbidden (403) some keys can still chat — probe a tiny chat across candidates
    if not result.get("live") and "403" in str(result.get("error","")):
        client = None
        try:
            client = AsyncOpenAI(api_key=api_key, base_url=base_url)
            for cand in MODEL_CANDIDATES:
                try:
                    probe = await client.chat.completions.create(
                        model=cand,
                        messages=[{"role":"user","content":"ping"}],
                        max_tokens=5,
                    )
                    if probe.choices:
                        result = {"live": True, "model": cand, "checked": True, "error": None}
                        break
                except Exception as e:
                    if "404" in str(e) or "not found" in str(e).lower():
                        continue
                    raise
            else:
                result = {"live": False, "model": None, "checked": True, "error": "models 403 + all chat probes 404"[:200]}
        except Exception as e:
            result = {"live": False, "model": None, "checked": True, "error": f"models 403 + chat probe failed: {e}"[:200]}
        finally:
            try:
                if client: await client.close()
            except: pass
    _ai_status = result
    if result["live"]:
        print(f"FEATHERLESS LIVE -> model {result['model']}")
    else:
        print(f"FEATHERLESS UNREACHABLE -> deterministic fallback ({result['error']})")
    return _ai_status

def get_ai_status() -> Dict:
    return _ai_status

async def get_next_action(dom_text: str, console_snapshot: str, bug_description: str) -> Dict:
    api_key = os.getenv("FEATHERLESS_API_KEY", "mock_key")
    base_url = os.getenv("FEATHERLESS_BASE_URL", "https://api.featherless.ai/v1")

    if api_key == "mock_key" or AsyncOpenAI is None:
        return _mock_response(dom_text)

    client = AsyncOpenAI(api_key=api_key, base_url=base_url)
    user_content = f"""<user_query>{bug_description}</user_query>
<dom>
{dom_text}
</dom>
<console>
{console_snapshot}
</console>
Decide next action. JSON only."""

    last_err = None
    for model in MODEL_CANDIDATES:
        try:
            resp = await client.chat.completions.create(
                model=model,
                messages=[
                    {"role":"system","content": SYSTEM_PROMPT},
                    {"role":"user","content": user_content}
                ],
                temperature=0.2,
                max_tokens=300,
                response_format={"type":"json_object"}
            )
            raw = resp.choices[0].message.content or "{}"
            try:
                data = json.loads(raw)
            except:
                m = re.search(r"\{.*\}", raw, re.S)
                data = json.loads(m.group(0)) if m else {"thought":raw[:200],"action":"finish","target_id":0,"value":raw[:200]}
            if data.get("action") not in ("click","type","finish"):
                data["action"]="finish"
            # success -> update live status
            _ai_status["live"] = True
            _ai_status["model"] = model
            _ai_status["checked"] = True
            return data
        except Exception as e:
            msg = str(e).lower()
            last_err = e
            # only fallback chain on 401/404/model errors — try next
            if any(k in msg for k in ["401","404","model","not found","unauthorized","does not exist"]):
                continue
            # for other errors, still try next model before giving up
            continue
    # all models failed -> deterministic fallback
    try:
        await client.close()
    except:
        pass
    print(f"FEATHERLESS all models failed -> fallback ({last_err})")
    return _mock_response(dom_text)
    # ponytail: never crash loop
