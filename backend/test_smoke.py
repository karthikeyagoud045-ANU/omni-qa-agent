"""Minimal smoke test for CodeSpectra modularity — one file, no fixtures."""
import sys; sys.path.insert(0, ".")
def test_sensors():
    from sensors import get_console_snapshot, create_console_buffer
    buf = create_console_buffer()
    assert get_console_snapshot(buf) == "[no console errors]"
    buf["errors"].append("HTTP 500 /api")
    assert "HTTP 500" in get_console_snapshot(buf)
    print("sensors ok")

def test_featherless_mock():
    import asyncio, os
    os.environ["FEATHERLESS_API_KEY"] = "mock_key"
    from featherless_client import get_next_action
    r = asyncio.run(get_next_action('[1] BUTTON: "Login" (id: #login)', "[no console errors]", "test"))
    assert r["action"] in ("click","type","finish")
    print("featherless mock ok", r)

def test_health():
    from fastapi.testclient import TestClient
    from main import app
    c = TestClient(app)
    assert c.get("/health").status_code == 200
    print("health ok")

if __name__ == "__main__":
    test_sensors(); test_featherless_mock(); test_health()
    print("ALL SMOKE PASS")
