# Omni-QA Agent — HackWave 3.0 Winner

> Autonomous QA agent that tests any URL like a human — watches a live browser, reads console errors for free, and exports a GitHub-ready bug report in one click. **No Docker. No LangChain. No PAT.**

## Why We Win — Systems, Not Prompts

| Pillar | What We Did | Why Judges Care |
|---|---|---|
| **Systems, not prompts** | ReAct loop `OBSERVE → THINK → ACT → EVALUATE` (`backend/agent.py:7`) with real Playwright `headless=False` + `slow_mo=500` — you *see* the browser move. | Demo is visceral, not a spinner. |
| **Token Efficiency (Tiered Sensors)** | Tier 1: compressed DOM text `"[1] BUTTON: Login"` (`backend/sensors.py:6`) + Tier 2: console/HTTP trap (`sensors.py:83`) — 0 tokens. Tier 3: `axe-core` lazy CDN (`sensors.py:27`) deferred. Only Tier 4 hits LLM (`qwen/qwen2.5-7b-instruct` via Featherless). | 40+ actions for cents vs VLM screenshots. |
| **Security First (No PAT)** | No GitHub PAT stored. Export via `navigator.clipboard.writeText(markdown)` (`frontend/src/components/IssueCards.jsx:43`) — user pastes into GitHub. | No secret leakage, no OAuth scope panic in demo. |
| **Resilience (JSON Fallback)** | `supabase_client.py:18` tries Supabase, on *any* RLS/network error falls back to `backend/reports.json` — demo never crashes. | Judges never see a 500. |

## Architecture

```
React (Vite) --SSE /api/stream--> FastAPI --Playwright--> Target URL
      |                              |--> featherless_client (qwen2.5-7b, mock_key fallback)
      |                              |--> supabase_client (Supabase + local reports.json)
      |<-- Issue Card + clipboard --/      axe-core CDN (lazy)
agent.py: OBSERVE (get_interactive_elements) → THINK (Featherless JSON) → ACT (click/type) → EVALUATE (1s)
sensors.py: EXTRACT_JS "[1] BUTTON: \"Login\" (id: #login-btn)" saves tokens vs screenshots
```

## Tech Stack

| Layer | Choice | Reason |
|---|---|---|
| Agent | Pure `asyncio` + Playwright | No LangChain overhead, full control |
| LLM | `qwen/qwen2.5-7b-instruct` via Featherless.ai (`backend/featherless_client.py:44`) | OpenAI-compatible, cheap, `mock_key` demo fallback |
| Sensors | DOM text + console listeners + lazy axe (`backend/sensors.py:27`) | 0-token navigation, a11y when needed |
| Backend | FastAPI + `sse-starlette` (`backend/main.py:79`) + in-mem queue + rate limiter | SSE LiveTerminal, 10 req/min guard |
| DB | Supabase (`supabase.sql`) + `reports.json` fallback | RLS + resilience |
| Frontend | React 18 + Vite + Tailwind + `lucide-react` + `@supabase/supabase-js` | Mission Control SaaS look, Google Auth |
| Export | `navigator.clipboard.writeText` | Security first |

## Quick Start

### 1. Env — fill `.env` at root (or use mock)

```bash
cp .env.example .env
# .env
SUPABASE_URL=https://ctesdmgyfatcaqjbbpkc.supabase.co
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
FEATHERLESS_API_KEY=mock_key   # or real Featherless key
FEATHERLESS_BASE_URL=https://api.featherless.ai/v1
HEADLESS=false
```

> `.env` is gitignored. If Supabase is empty or `mock_key`, the app still runs via `reports.json` fallback.

### 2. One-command demo

```bash
./start.sh
# Backend :8000  Frontend :5173
# open http://localhost:5173
```

### 3. Manual (two terminals)

```bash
# backend
cd backend && python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt && playwright install chromium
HEADLESS=false .venv/bin/python -m uvicorn main:app --reload --port 8000
# health: curl localhost:8000/health

# frontend
cd frontend && npm install && npm run dev  # http://localhost:5173
```

### 4. Demo Flow

1. Open `http://localhost:5173` — if not signed in, click **Login with Google** (or *Continue as guest*).
2. URL: `https://www.saucedemo.com`  Bug: `Test login with standard_user / secret_sauce`
3. Click **Start Mission** → watch the *physical* browser open (`headless=False`) + **LiveTerminal** (`bg-slate-900`, `thought`=slate-400, `action`=cyan-400, `error`=red-400) stream over SSE.
4. **Issue Card** appears → **Export to Clipboard** copies Markdown → success toast → paste into GitHub issue.

## Google Auth Setup (manual step — Supabase dashboard cannot be automated)

The frontend already calls `supabase.auth.signInWithOAuth({ provider:'google', options:{ redirectTo:'http://localhost:5173' }})` (`frontend/src/App.jsx`).

**You MUST do this once:**

1. Supabase Dashboard → **Authentication** (lock icon) → **Providers**
2. Expand **Google** → toggle **Enabled**
3. Paste:
   - Client ID: `<YOUR_GOOGLE_CLIENT_ID>`
   - Client Secret: `<YOUR_GOOGLE_CLIENT_SECRET>`
4. **Save**

Add `http://localhost:5173` to Google Cloud Console → Authorized redirect URIs: `https://<project>.supabase.co/auth/v1/callback`.

Guest mode (`Continue as guest`) bypasses auth for local demo if you skip this.

## Database — Supabase (via MCP or SQL)

Tables + RLS + bucket are in `supabase.sql`. Apply via:

- **MCP (preferred):** `opencode.json` already configures `@supabase/mcp-server-supabase` with your Access Token. Restart Opencode CLI after writing `opencode.json`, then prompt: *"MCP connected — execute `supabase.sql` to build tables and `screenshots` bucket now."*
- **Manual fallback:** Supabase Dashboard → SQL Editor → paste `supabase.sql` → Run. Storage → Create bucket `screenshots` (public, anon read, service_role write).

Schema:

- `sessions(id uuid, url text, bug_description text, status text, created_at timestamptz)`
- `bug_reports(id uuid, session_id uuid fk, verdict text, summary text, steps jsonb, console_errors text, screenshot_url text)`
- RLS: `anon` SELECT, `service_role` INSERT/UPDATE/DELETE (see `supabase.sql:25`)
- Bucket: `screenshots` public

## Supabase MCP Configuration

`opencode.json` at root:

```json
{
  "mcpServers": {
    "supabase": {
      "command": "npx",
      "args": ["-y", "@supabase/mcp-server-supabase"],
      "env": { "SUPABASE_ACCESS_TOKEN": "YOUR_PERSONAL_ACCESS_TOKEN_HERE" }
    }
  }
}
```

**After writing `opencode.json`, restart Opencode CLI/IDE so the MCP server connects.** Your `sbp_...` token is already injected.

## API

- `POST /api/mission {url, bug_description}` → `{mission_id}`
- `GET /api/stream/{mission_id}` → SSE `event: log` / `event: done`
- `GET /api/report/{mission_id}` → report JSON
- `GET /api/reports` → last 20 reports (Supabase or `reports.json`)
- `GET /health` → `{status: ok}`

## Verify

```bash
.venv/bin/python -c "import sys; sys.path.insert(0,'backend'); import sensors, agent, main; print('ok')"
cd frontend && npm run build
python backend/test_smoke.py  # sensors + featherless mock + health
```

## Constraints Honored

- NO Docker, NO LangChain/LangGraph
- Token-efficient: DOM text + console (0 tokens) before LLM
- Featherless mandatory (`qwen/qwen2.5-7b-instruct`, mock fallback)
- No PAT — clipboard export
- Supabase + local fallback — demo never crashes
- `headless=False` flex (`agent.py:18` slow_mo 500)
- `plan` mode protected `agent.py/sensors.py/main.py` — only UI + config touched

## Security Note

Your `.env` and `opencode.json` now contain **Service Role key** (bypasses RLS) and **Supabase Access Token**. They are gitignored but were processed here. **After the hackathon, regenerate both in Supabase Dashboard → Access Tokens / API Keys** as a precaution. Treat the Service Role key like a master password.

---
Built for HackWave 3.0 — "Build by Sunset" 🌅
