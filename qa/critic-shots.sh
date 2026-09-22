#!/bin/bash
# Critic-loop capture pass: ./qa/critic-shots.sh <map> <round> [pose ...]
# Writes qa/critic/r<round>/<map>-<pose>.png (1280x720) and prints per-pose stats.
cd "$(dirname "$0")/.."; source ~/.nvm/nvm.sh >/dev/null; nvm use 20 >/dev/null
MAP=${1:?map}; N=${2:?round}; shift 2
if [ $# -eq 0 ]; then
  POSES=$(awk '/poses[ ]*=|poses:/,/^  };|^  }/' src/world/maps/$MAP.js | grep -oE "^\s{4}[a-zA-Z0-9_]+:" | tr -d ' :')
else POSES="$@"; fi
OUT=qa/critic/r$N; mkdir -p $OUT
for p in $POSES; do
  node qa/shot.mjs "http://localhost:8790/?qa=1&map=$MAP&pose=$p&ai=0" $OUT/$MAP-$p.png --w 1280 --h 720 --settle 4500 2>&1 \
    | grep -oE '"(fps|drawCalls|triangles)":[0-9]+|"errors":\[[^]]*\]' | tr '\n' ' ' | sed "s|^|$MAP/$p: |"; echo
done
