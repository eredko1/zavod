#!/bin/bash
# Serves the game at http://localhost:8790 with no-store cache headers (idempotent; restarts an old plain http.server if found)
cd "$(dirname "$0")/.."
if curl -sI http://localhost:8790/ | grep -qi "no-store"; then echo "already serving on 8790 (no-store)"; exit 0; fi
pkill -f "http.server 8790" 2>/dev/null; pkill -f "qa/serve.py" 2>/dev/null; sleep 0.3
nohup python3 qa/serve.py 8790 > /tmp/zavod-serve.log 2>&1 &
sleep 0.6; curl -sI http://localhost:8790/ | grep -i "cache-control" | sed 's/^/serving on 8790: /'
