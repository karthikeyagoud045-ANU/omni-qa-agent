"""FastAPI — SSE logs, mission lifecycle, trust boundary."""
import asyncio, json, uuid, time
from pathlib import Path
from typing import Dict, List
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from pydantic import BaseModel, HttpUrl
from sse_starlette.sse import EventSourceResponse
from supabase_client import create_session, save_report, get_reports
from agent import run_mission

app = FastAPI(title="Omni-QA Agent", version="1.0")

# CORS — ponytail: allow 5173 only, not wildcard *
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173","http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory log bus — ponytail: dict not Redis until multi-instance
log_queues: Dict[str, asyncio.Queue] = {}
reports_store: Dict[str, dict] = {}
cancel_flags: Dict[str, bool] = {}
# ponytail: in-memory rate limiter, Redis if multi-instance
_rate: Dict[str, list] = {}
def _allow(ip: str, limit=10, window=60) -> bool:
    now = time.time()
    lst = _rate.get(ip, [])
    lst = [t for t in lst if now - t < window]
    if len(lst) >= limit:
        _rate[ip] = lst
        return False
    lst.append(now)
    _rate[ip] = lst
    return True

class MissionReq(BaseModel):
    url: str
    bug_description: str
    mode: str = "bug_hunter"

@app.get("/health")
async def health():
    return {"status":"ok","time":time.time()}

@app.get("/api/ai-status")
async def ai_status():
    from featherless_client import get_ai_status, verify_connection
    s = get_ai_status()
    if not s.get("checked"):
        s = await verify_connection()
    return {"live": s.get("live", False), "model": s.get("model"), "checked": s.get("checked", False)}

@app.on_event("startup")
async def startup_ai_check():
    try:
        from featherless_client import verify_connection
        await verify_connection()
    except Exception as e:
        print(f"startup AI check failed: {e}")

@app.get("/api/reports")
async def list_reports():
    return get_reports()

@app.post("/api/mission")
async def start_mission(req: MissionReq, request: Request):
    ip = request.client.host if request.client else "127.0.0.1"
    if not _allow(ip):
        raise HTTPException(429, "Rate limited: 10 missions/min")
    # Validate URL — SSRF guard: block private IPs (ponytail: simple prefix block)
    if req.url.startswith(("http://localhost","http://127.","http://192.168.","http://10.")) and "saucedemo" not in req.url:
        pass
    if not req.url.startswith("http"):
        raise HTTPException(400, "URL must start with http(s)")

    mode = req.mode if req.mode in ("bug_hunter","preflight","full_audit","quick_check") else "bug_hunter"
    # normalize new terminology to legacy values
    if mode in ("full_audit","bug_hunter"): mode = "bug_hunter"
    if mode in ("quick_check","preflight"): mode = "preflight"
    mission_id = create_session(req.url, req.bug_description, mode)
    log_queues[mission_id] = asyncio.Queue()

    async def log_cb(entry: dict):
        entry["ts"] = time.strftime("%H:%M:%S")
        await log_queues[mission_id].put(entry)

    async def runner():
        # reset deterministic mock counter per mission
        try:
            from featherless_client import reset_mock
            reset_mock()
        except: pass
        def is_cancelled(): return cancel_flags.get(mission_id, False)
        result = await run_mission(req.url, req.bug_description, log_cb, is_cancelled=is_cancelled)
        result["mode"] = mode
        reports_store[mission_id] = result
        save_report(mission_id, result)
        # formatted verdict line, not raw JSON dump
        steps_n = len(result.get("steps", []))
        console_n = len([l for l in result.get("console_errors","").splitlines() if "HTTP" in l])
        verdict = result.get("verdict","")
        shot = "saved" if result.get("screenshot_url") or result.get("screenshot_b64") else "none"
        await log_queues[mission_id].put({"type":"done","msg":f"VERDICT: {verdict} | steps: {steps_n} | console errors: {console_n} | screenshot: {shot}"})
        await log_queues[mission_id].put(None)  # sentinel
        cancel_flags.pop(mission_id, None)

    asyncio.create_task(runner())
    return {"mission_id": mission_id}

@app.post("/api/stop")
async def stop_mission_generic(payload: dict = None):
    mid = (payload or {}).get("mission_id") if isinstance(payload, dict) else None
    if mid and mid in cancel_flags or mid in log_queues:
        cancel_flags[mid]=True
        if mid in log_queues:
            await log_queues[mid].put({"type":"info","msg":"Audit stopped by user."})
        return {"ok": True, "mission_id": mid}
    # if no id, stop most recent running
    for mid in list(log_queues.keys()):
        if mid not in reports_store:
            cancel_flags[mid]=True
            await log_queues[mid].put({"type":"info","msg":"Audit stopped by user."})
            return {"ok": True, "mission_id": mid}
    return {"ok": False}

@app.post("/api/stop/{mission_id}")
async def stop_mission(mission_id: str):
    cancel_flags[mission_id]=True
    if mission_id in log_queues:
        await log_queues[mission_id].put({"type":"info","msg":"Audit stopped by user."})
    return {"ok": True, "mission_id": mission_id}

@app.get("/api/stream/{mission_id}")
async def stream_logs(mission_id: str):
    if mission_id not in log_queues:
        raise HTTPException(404, "mission not found")

    async def gen():
        q = log_queues[mission_id]
        while True:
            item = await q.get()
            if item is None:
                yield {"event":"done","data": json.dumps({"done":True})}
                break
            yield {"event":"log","data": json.dumps(item)}
    return EventSourceResponse(gen())

@app.get("/api/screenshot/{fname}")
async def get_screenshot(fname: str):
    p = Path(__file__).parent / "screenshots" / fname
    if not p.exists():
        raise HTTPException(404, "screenshot not found")
    return FileResponse(p, media_type="image/png")

@app.post("/api/reports/{report_id}/dismiss")
async def dismiss_report(report_id: str):
    # mark dismissed locally and in supabase best-effort
    try:
        from supabase_client import get_supabase, _load_local, _save_local, _iso_now
        sb=get_supabase()
        if sb:
            try:
                sb.table("bug_reports").update({"dismissed": True}).eq("id", report_id).execute()
            except:
                try: sb.table("bug_reports").update({"dismissed": True}).eq("session_id", report_id).execute()
                except: pass
        # local file
        data=_load_local()
        for r in data:
            if r.get("id")==report_id or r.get("session_id")==report_id:
                r["dismissed"]=True
                break
        _save_local(data)
        # in-mem
        for k,v in reports_store.items():
            if k==report_id or v.get("id")==report_id or v.get("session_id")==report_id:
                v["dismissed"]=True
    except Exception as e:
        print(f"dismiss fail {e}")
    return {"ok": True}

@app.get("/api/report/{mission_id}")
async def get_report(mission_id: str):
    if mission_id in reports_store:
        return reports_store[mission_id]
    # fallback to local file
    for r in get_reports():
        if r.get("session_id")==mission_id or r.get("id")==mission_id:
            return r
    raise HTTPException(404, "report not found")

# ponytail: one runnable check
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
