#!/bin/bash
# Batch QA shots for the WSP map: ./qa/wsp-shots.sh <round> [pose...]
cd "$(dirname "$0")/.."; source ~/.nvm/nvm.sh >/dev/null; nvm use 20 >/dev/null
N=${1:-1}; shift; POSES=${@:-"hero arch attic row bobst chess overview macdougal"}
for p in $POSES; do node qa/shot.mjs "http://localhost:8790/?qa=1&map=wsp&pose=$p&ai=0" qa/shots/wsp-$p-$N.png --settle 5000 --console 2>&1 | grep -o '"stats":{[^}]*}' | sed "s/^/$p: /"; done
