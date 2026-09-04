#!/bin/bash
# Omni-QA — one-command demo start (ponytail: no docker, no compose)
set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"
echo ">> Backend :8000"
cd "$ROOT/backend"
if [ ! -d .venv ]; then python3 -m venv .venv && .venv/bin/pip install -r requirements.txt && .venv/bin/python -m playwright install chromium; fi
HEADLESS=${HEADLESS:-false} .venv/bin/python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload &
BACK_PID=$!
echo "backend pid $BACK_PID"
echo ">> Frontend :5173"
cd "$ROOT/frontend"
if [ ! -d node_modules ]; then npm install; fi
npm run dev &
FRONT_PID=$!
echo "frontend pid $FRONT_PID"
echo "Ready: http://localhost:5173  (backend http://localhost:8000/health)"
wait
