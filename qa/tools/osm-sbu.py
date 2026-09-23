#!/usr/bin/env python3
"""OSM (Overpass JSON) -> src/world/sbu/osm.js for the University map.
Frame: same as sbu/layout.js (metres, +x campus-east, +z campus-south). Projection = equirectangular at (40.9147, -73.1235),
rotated +9.1 deg onto the campus grid, then offset (-23.7, +10.7) — calibrated against the hand-built Library / Frey footprints (<1 m).
No real names are emitted (de-branding rule); names are only used here to pick heights/styles."""
import json, math, sys
src, out = sys.argv[1], sys.argv[2]
d = json.load(open(src))['elements']
LAT0, LON0 = 40.9147, -73.1235
kx = 111320 * math.cos(math.radians(LAT0)); ky = 110540; th = math.radians(9.1)
def P(p):
    e = (p['lon'] - LON0) * kx; n = (p['lat'] - LAT0) * ky
    X = e * math.cos(th) - n * math.sin(th); N = e * math.sin(th) + n * math.cos(th)
    return (round(X - 23.7, 1), round(-N + 10.7, 1))
PLAY = (-330, 470, -700, 390)          # playable region
FAR = (-620, 760, -980, 680)           # backdrop ring
HAND = [(-19, 73, -144, -25), (-93, 11, 11, 97), (-97, -44, -130, -49), (-219, -121, -110, -54), (-239, -140, -41, 52), (55, 116, 19, 72),
        (69, 174, -198, -61), (198, 272, -65, 4), (175, 241, 11, 110), (50, 117, 109, 182), (89, 160, 151, 218), (-99, -51, 124, 227),
        (-19, 32, 164, 248), (-195, -129, 139, 194), (-117, -22, -199, -143), (-186, -134, -141, -98), (-24, 66, -306, -237), (-97, -31, -315, -220), (197, 340, -230, -130)]
inside = lambda x, z, r, m=0: r[0] - m <= x <= r[1] + m and r[2] - m <= z <= r[3] + m
def outer(el):
    if el.get('geometry'): return [el['geometry']]
    return [m['geometry'] for m in el.get('members', []) if m.get('role') == 'outer' and m.get('geometry')]
# height / style overrides by name (never emitted)
OVR = {'Physics': (6, 'precast'), 'Life Sciences': (5, 'precast'), 'Social and Behavioral Sciences': (7, 'precast'), 'Computer Science': (3, 'glass'),
       'Heavy Engineering': (3, 'precast'), 'Centers for Molecular Medicine': (4, 'glass'), 'East Side Dining / Chávez Hall': (6, 'glassbrick'), 'Tubman Hall': (6, 'glassbrick'),
       'Math Tower': (6, 'precast'), 'Graduate Chemistry': (7, 'precast'), 'Old Chemistry': (3, 'brick'), 'Old Engineering': (3, 'brick'), 'Nobel Halls': (5, 'glassbrick'),
       'Sports Complex': (3, 'arena'), 'Island Federal Credit Union Arena': (3, 'arena'), 'Kenneth P. LaValle Athletic Stadium': (0, 'stadium'), 'Administration Parking Garage': (5, 'garage'),
       'Simons Center for Geometry and Physics': (4, 'glass'), 'Advanced Energy Research and Technology Center': (3, 'glass'), 'Chapin Apartments': (3, 'brick')}
bld, roads, paths, lots, pitches, woods, water, grass, tracks = [], [], [], [], [], [], [], [], []
def area(Q): return abs(sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(Q, Q[1:] + Q[:1]))) / 2
for el in d:
    t = el.get('tags', {})
    for ring in outer(el):
        Q = [P(p) for p in ring]
        if len(Q) < 2: continue
        cx = sum(q[0] for q in Q) / len(Q); cz = sum(q[1] for q in Q) / len(Q)
        if 'building' in t:
            if t['building'] in ('house', 'shed', 'construction', 'bridge', 'roof', 'garage') or not inside(cx, cz, FAR): continue
            if len(Q) > 1 and Q[0] == Q[-1]: Q = Q[:-1]
            if len(Q) < 3 or area(Q) < 60: continue
            if any(inside(cx, cz, h, 4) for h in HAND): continue
            name = t.get('name', ''); a = area(Q)
            lv = t.get('building:levels'); h = t.get('height')
            if name in OVR: floors, style = OVR[name]
            else:
                floors = int(float(lv)) if lv else (4 if t['building'] == 'dormitory' and a > 2000 else 3 if t['building'] == 'dormitory' else 4 if a > 3000 else 3 if a > 800 else 2)
                style = 'brick' if t['building'] in ('dormitory', 'apartments', 'residential') else 'hospital' if t['building'] == 'hospital' else 'garage' if t['building'] == 'parking' else 'service' if t['building'] in ('service', 'industrial', 'warehouse') else 'precast'
            if h:
                try: floors = max(1, round(float(str(h).split()[0]) / 4))
                except ValueError: pass
            bld.append({'p': Q, 'f': floors, 's': style, 'play': inside(cx, cz, PLAY)})
            continue
        if not any(inside(x, z, FAR) for x, z in Q): continue
        hw = t.get('highway')
        if hw and el['type'] == 'way':
            if hw in ('motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'unclassified', 'residential', 'service', 'motorway_link', 'primary_link', 'secondary_link', 'tertiary_link'):
                w = {'motorway': 14, 'trunk': 14, 'primary': 12, 'secondary': 10, 'tertiary': 9, 'unclassified': 7.5, 'residential': 7.5}.get(hw.replace('_link', ''), 6 if t.get('service') not in ('parking_aisle', 'driveway') else 5)
                if t.get('tunnel') == 'yes': continue
                roads.append({'p': Q, 'w': w, 'k': 1 if w >= 12 else 0})
            elif hw in ('footway', 'pedestrian', 'path', 'cycleway', 'steps', 'living_street'):
                if t.get('footway') == 'crossing' or t.get('tunnel') == 'yes' or t.get('indoor') == 'yes': continue
                if hw == 'pedestrian' and Q[0] == Q[-1] and area(Q) > 50: grass.append({'p': Q, 'k': 'plaza'}); continue
                paths.append({'p': Q, 'w': 5 if hw == 'pedestrian' else 3 if hw in ('footway', 'cycleway', 'living_street') else 2.2, 's': 1 if hw == 'steps' else 0})
            continue
        closed = len(Q) > 3 and Q[0] == Q[-1]
        if not closed: continue
        Q = Q[:-1]
        if t.get('amenity') == 'parking' and t.get('parking') not in ('multi-storey', 'underground'): lots.append(Q)
        elif t.get('leisure') in ('pitch', 'track') or t.get('landuse') == 'recreation_ground':
            (tracks if t.get('leisure') == 'track' else pitches).append({'p': Q, 'sport': t.get('sport', '')})
        elif t.get('natural') in ('wood', 'scrub') or t.get('landuse') == 'forest': woods.append(Q)
        elif t.get('natural') == 'water' or t.get('water'): water.append(Q)
        elif t.get('landuse') in ('grass',) or t.get('leisure') in ('park', 'garden'): grass.append({'p': Q, 'k': 'grass'})
def r(v): return round(v, 1)
js = '// GENERATED by qa/tools/osm-sbu.py from OpenStreetMap (ODbL, (c) OpenStreetMap contributors). Do not edit by hand.\n'
js += '// Game-space campus plan (metres, +x campus-east, +z campus-south). b: buildings {p: footprint, f: floors, s: style, play: inside bounds}; r: roads {p, w, k: 1 = arterial}; w: footpaths {p, w, s: 1 = steps};\n'
js += '// l: parking lots; pi: pitches {p, sport}; tr: running tracks; wd: woods; wa: water; g: lawns / plazas {p, k}.\n'
js += 'export const PLAY = ' + json.dumps({'x0': PLAY[0], 'x1': PLAY[1], 'z0': PLAY[2], 'z1': PLAY[3]}) + ';\n'
js += 'export const OSM = ' + json.dumps({'b': bld, 'r': roads, 'w': paths, 'l': lots, 'pi': pitches, 'tr': tracks, 'wd': woods, 'wa': water, 'g': grass}, separators=(',', ':')) + ';\n'
open(out, 'w').write(js)
print('buildings', len(bld), 'in play', sum(b['play'] for b in bld), 'roads', len(roads), 'paths', len(paths), 'lots', len(lots), 'pitches', len(pitches), 'tracks', len(tracks), 'woods', len(woods), 'water', len(water), 'grass', len(grass), 'bytes', len(js))
