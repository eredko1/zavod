#!/bin/bash
# Mirrors every jpg/png under assets/ into assets-m/ at max 512px edge (phones load these via LoadingManager.setURLModifier).
cd "$(dirname "$0")/.."
n=0
while IFS= read -r f; do
  out="assets-m/${f#assets/}"; mkdir -p "$(dirname "$out")"
  if [ ! -f "$out" ] || [ "$f" -nt "$out" ]; then sips -Z 512 -s format jpeg -s formatOptions 80 "$f" --out "${out%.*}.jpg" >/dev/null 2>&1 && n=$((n+1)); fi
done < <(find assets -type f \( -name '*.jpg' -o -name '*.png' \) | grep -v '^assets/thumbs')
echo "mobile assets: $n converted, $(du -sh assets-m | cut -f1) total"
