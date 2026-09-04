"""Supabase + local fallback — demo never crashes if RLS/network fails."""
import os, json, uuid, time
from datetime import datetime, timezone
from pathlib import Path

def _iso_now():
    return datetime.now(timezone.utc).isoformat()

LOCAL_FILE = Path(__file__).parent / "reports.json"

def _load_local():
    if LOCAL_FILE.exists():
        try:
            return json.loads(LOCAL_FILE.read_text())
        except:
            return []
    return []

def _save_local(reports):
    LOCAL_FILE.write_text(json.dumps(reports, indent=2))

def get_supabase():
    try:
        from supabase import create_client
        url = os.getenv("SUPABASE_URL","")
        key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_ANON_KEY","")
        if not url or "your-project" in url or key == "mock_key" or not key:
            return None
        return create_client(url, key)
    except Exception:
        return None

def create_session(url: str, bug_description: str, mode: str = "bug_hunter") -> str:
    sid = str(uuid.uuid4())
    sb = get_supabase()
    if sb:
        try:
            sb.table("sessions").insert({"id":sid,"url":url,"bug_description":bug_description,"status":"running","mode":mode}).execute()
            return sid
        except Exception as e:
            # column may not exist on old schema — retry without mode
            try:
                sb.table("sessions").insert({"id":sid,"url":url,"bug_description":bug_description,"status":"running"}).execute()
                return sid
            except Exception as e2:
                print(f"supabase session fail, fallback local: {e2}")
    # local fallback
    reports = _load_local()
    reports.append({"session_id":sid,"url":url,"bug_description":bug_description,"mode":mode,"status":"running","created_at":_iso_now()})
    _save_local(reports)
    return sid

def save_report(session_id: str, report: dict):
    sb = get_supabase()
    if sb:
        try:
            payload = {"session_id":session_id,"verdict":report.get("verdict",""),"summary":report.get("summary",""),"steps":report.get("steps",[]),"console_errors":report.get("console_errors",""),"screenshot_url":report.get("screenshot_url",""),"mode":report.get("mode",""),"url":report.get("url",""),"bug_description":report.get("bug_description",""),"perf":report.get("perf"),"a11y_violations":report.get("a11y_violations",0),"warnings":report.get("warnings",[]),"dismissed":report.get("dismissed",False),"created_at":report.get("created_at", _iso_now())}
            # remove None to avoid insert errors
            payload = {k:v for k,v in payload.items() if v is not None}
            sb.table("bug_reports").insert(payload).execute()
            sb.table("sessions").update({"status":"done"}).eq("id",session_id).execute()
            return
        except Exception as e:
            # retry without new columns for old schema
            try:
                sb.table("bug_reports").insert({"session_id":session_id,"verdict":report.get("verdict",""),"summary":report.get("summary",""),"steps":report.get("steps",[]),"console_errors":report.get("console_errors",""),"screenshot_url":report.get("screenshot_url","")}).execute()
                sb.table("sessions").update({"status":"done"}).eq("id",session_id).execute()
                return
            except Exception as e2:
                print(f"supabase save fail, fallback: {e2}")
    # local fallback — update reports.json (store ISO)
    reports = _load_local()
    # ensure report has ISO timestamps + extra fields
    if "created_at" not in report or not isinstance(report.get("created_at"), str):
        report = {**report, "created_at": _iso_now()}
    for r in reports:
        if r.get("session_id")==session_id:
            r.update(report)
            r["status"]="done"
            r["created_at"]=report.get("created_at") or r.get("created_at") or _iso_now()
            break
    else:
        reports.append({"session_id":session_id,**report,"status":"done","created_at":report.get("created_at", _iso_now())})
    _save_local(reports)

def get_reports():
    sb = get_supabase()
    if sb:
        try:
            res = sb.table("bug_reports").select("*").order("created_at",desc=True).limit(50).execute()
            data = res.data or []
            # normalize: ensure history fields with defaults, sorted newest-first
            for r in data:
                r.setdefault("mode", r.get("mode") or "bug_hunter")
                r.setdefault("url", r.get("url") or "")
                r.setdefault("bug_description", r.get("bug_description") or "")
                r.setdefault("screenshot_url", r.get("screenshot_url") or r.get("screenshot_b64") or "")
                r.setdefault("steps", r.get("steps") or [])
            return data
        except:
            pass
    data = _load_local()
    # normalize local file too + fix legacy epoch floats
    for r in data:
        r.setdefault("id", r.get("id") or r.get("session_id") or "")
        r.setdefault("mode", r.get("mode") or "bug_hunter")
        r.setdefault("verdict", r.get("verdict") or r.get("status") or "CLEAN")
        ca=r.get("created_at")
        if isinstance(ca, (int,float)):
            # legacy epoch → ISO
            try:
                r["created_at"]=datetime.fromtimestamp(ca, tz=timezone.utc).isoformat()
            except: r["created_at"]=_iso_now()
        elif not isinstance(ca, str):
            r["created_at"]=_iso_now()
        r.setdefault("steps", r.get("steps") or [])
        r.setdefault("warnings", r.get("warnings") or [])
        r.setdefault("dismissed", r.get("dismissed") or False)
    # newest first — parse ISO
    def _key(x):
        try: return datetime.fromisoformat(x.get("created_at").replace("Z","+00:00"))
        except: return datetime.min.replace(tzinfo=timezone.utc)
    try:
        data = sorted(data, key=_key, reverse=True)
    except: pass
    return data
