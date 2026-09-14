#!/bin/bash
# Serves the game at http://localhost:8790 (idempotent)
cd "$(dirname "$0")/.."
if curl -s -o /dev/null http://localhost:8790/; then echo "already serving on 8790"; exit 0; fi
nohup python3 -m http.server 8790 --bind 127.0.0.1 > /tmp/zavod-serve.log 2>&1 &
sleep 0.6; curl -s -o /dev/null -w "serving on 8790 (%{http_code})\n" http://localhost:8790/
