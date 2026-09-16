#!/bin/bash
# usage: qa/railyard-shots.sh <round> [poses...]
cd "$(dirname "$0")/.."
source ~/.nvm/nvm.sh >/dev/null; nvm use 20 >/dev/null
N=$1; shift
POSES=${@:-"hero spawn overview tracks overpass office_roof platform depot"}
for p in $POSES; do
  out=$(node qa/shot.mjs "http://localhost:8790/?qa=1&map=railyard&pose=$p" qa/shots/railyard-$p-$N.png --settle 6500 --console 2>&1 | grep -v "^\[log\]\|^\[info\]\|^\[warning\] RGBE")
  echo "== $p: $(echo "$out" | grep -o '"stats":{[^}]*}' ) $(echo "$out" | grep -i 'error\|warn' | grep -v '"errors":\[\]' | head -3)"
done
