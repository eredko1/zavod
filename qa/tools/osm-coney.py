#!/usr/bin/env python3
"""OSM (Overpass JSON) -> src/world/coney/osm.js for the Coney Island map.
Frame: metres, origin (40.5745 N, -73.9800 W), rotated 8.33 deg so the boardwalk / street grid run along +x; +z = ocean side.
No real names are emitted (de-branding rule); names only pick styles/heights here."""
import json, math, sys
src, out = sys.argv[1], sys.argv[2]
d = json.load(open(src))['elements']
LAT0, LON0 = 40.5745, -73.9800
kx = 111320 * math.cos(math.radians(LAT0)); ky = 110540
TH = math.radians(8.33)   # rotate onto the street grid: the boardwalk then runs along +x
def P(p):
    x = (p['lon'] - LON0) * kx; z = -(p['lat'] - LAT0) * ky
    return (round(x * math.cos(TH) - z * math.sin(TH), 1), round(x * math.sin(TH) + z * math.cos(TH), 1))
PLAY = (-440, 280, -420, 390)
FAR = (-900, 800, -900, 900)
inside = lambda x, z, r, m=0: r[0] - m <= x <= r[1] + m and r[2] - m <= z <= r[3] + m
def outer(el):
    if el.get('geometry'): return [el['geometry']]
    return [m['geometry'] for m in el.get('members', []) if m.get('role') == 'outer' and m.get('geometry')]
def area(Q): return abs(sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(Q, Q[1:] + Q[:1]))) / 2
HAND = {'Parachute Jump', 'Coney Island–Stillwell Avenue', 'Maimonides Park', 'Brooklyn Cyclones'}   # hand-built landmarks
COASTERS = {'Coney Island Cyclone': ('wood', 26), 'The Thunderbolt': ('steel', 35), "Tony's Express": ('steel', 14), 'The Phoenix': ('steel', 12),
            'Steeplechase': ('steel', 12), "Soarin' Eagle": ('steel', 11), 'Circus Coaster': ('steel', 7), 'The Tickler': ('steel', 13)}
RIDE = {'big_wheel': 'wheel', 'drop_tower': 'drop', 'carousel': 'carousel', 'swinging_ship': 'ship', 'roller_coaster': None, 'swing_carousel': 'swing', 'water_slide': 'flume', 'bumper_car': 'bumper'}
b, roads, paths, bw, piers, groynes, rails, lots, pitches, parks, beach, rc, rides = [], [], [], [], [], [], [], [], [], [], [], [], []
for el in d:
    t = el.get('tags', {}); name = t.get('name', '')
    if el['type'] == 'node':
        if 'attraction' in t or t.get('tourism') == 'attraction':
            x, z = P(el)
            if not inside(x, z, FAR): continue
            k = RIDE.get(t.get('attraction'), 'flat')
            if k and name not in ('Wonder Wheel',): rides.append({'x': x, 'z': z, 't': k, 'h': float(t.get('height', 0) or 0)})
        continue
    for ring in outer(el):
        Q = [P(p) for p in ring]
        if len(Q) < 2 or not any(inside(x, z, FAR) for x, z in Q): continue
        closed = len(Q) > 3 and Q[0] == Q[-1]
        if name in COASTERS and closed and 'building' not in t:
            kind, h = COASTERS[name]; rc.append({'p': Q[:-1], 'k': kind, 'h': h}); continue
        if 'building' in t:
            if name in HAND or t['building'] in ('roof', 'construction') or not closed: continue
            Q = Q[:-1]
            if len(Q) < 3 or area(Q) < 25: continue
            try: h = float(str(t.get('height', '')).split()[0])
            except (ValueError, IndexError): h = 0
            lv = t.get('building:levels')
            if not h: h = float(lv) * 3.3 if lv else 7
            bt = t['building']
            style = 'tower' if h > 30 else 'rowhouse' if bt in ('terrace', 'semidetached_house', 'house') else 'shop' if bt in ('retail', 'commercial') or (h < 12 and bt == 'yes') else 'apart' if bt in ('apartments', 'residential') else 'service' if bt in ('industrial', 'warehouse', 'garage', 'service', 'shed') else 'civic'
            if t.get('leisure') in ('amusement_arcade',) or t.get('attraction'): style = 'arcade'
            if t.get('tourism') == 'aquarium' or name.startswith('Ocean Wonders'): style = 'aquarium'
            b.append({'p': Q, 'h': round(h, 1), 's': style, 'play': inside(sum(q[0] for q in Q) / len(Q), sum(q[1] for q in Q) / len(Q), PLAY)})
            continue
        hw = t.get('highway')
        if t.get('bridge') == 'boardwalk' or name == 'Riegelmann Boardwalk': bw.append(Q); continue
        if t.get('man_made') == 'pier': piers.append({'p': Q, 'closed': closed}); continue
        if t.get('man_made') in ('groyne', 'breakwater'): groynes.append(Q); continue
        if t.get('railway') in ('subway', 'rail', 'light_rail'):
            if t.get('tunnel') == 'yes': continue
            rails.append({'p': Q, 'el': 1 if t.get('bridge') == 'yes' or t.get('layer') in ('1', '2', '3') else 0}); continue
        if hw:
            if t.get('tunnel') == 'yes' or t.get('indoor') == 'yes': continue
            if hw in ('primary', 'secondary', 'tertiary', 'residential', 'unclassified', 'service', 'trunk', 'primary_link', 'secondary_link', 'living_street'):
                w = {'trunk': 18, 'primary': 16, 'secondary': 15, 'tertiary': 12, 'residential': 10, 'unclassified': 9}.get(hw.replace('_link', ''), 6 if t.get('service') not in ('parking_aisle', 'driveway') else 5)
                if name.startswith('Surf Avenue'): w = 22
                roads.append({'p': Q, 'w': w})
            elif hw in ('footway', 'pedestrian', 'path', 'steps', 'cycleway'):
                if t.get('footway') in ('crossing', 'sidewalk'): continue
                paths.append({'p': Q, 'w': 6 if hw == 'pedestrian' else 2.5, 's': 1 if hw == 'steps' else 0})
            continue
        if not closed: continue
        Q = Q[:-1]
        if t.get('natural') in ('beach', 'sand'): beach.append(Q)
        elif t.get('amenity') == 'parking': lots.append(Q)
        elif t.get('leisure') in ('pitch', 'stadium'): pitches.append({'p': Q, 'sport': t.get('sport', '')})
        elif t.get('leisure') in ('park', 'garden', 'playground') or t.get('landuse') in ('grass',): parks.append(Q)
js = '// GENERATED by qa/tools/osm-coney.py from OpenStreetMap (ODbL, (c) OpenStreetMap contributors). Do not edit by hand.\n'
js += '// Frame: metres, +x east, +z south (ocean). b: buildings {p, h metres, s style, play}; r: roads {p, w}; w: paths; bw: boardwalk centrelines;\n'
js += '// pi: piers; gr: groynes (jetties); rl: rail {p, el: 1 = elevated}; l: lots; pt: pitches; pk: parks; be: beach polygons; rc: coaster footprints {p, k, h}; rd: ride nodes {x, z, t, h}.\n'
js += 'export const PLAY = ' + json.dumps({'x0': PLAY[0], 'x1': PLAY[1], 'z0': PLAY[2], 'z1': PLAY[3]}) + ';\n'
js += 'export const OSM = ' + json.dumps({'b': b, 'r': roads, 'w': paths, 'bw': bw, 'pi': piers, 'gr': groynes, 'rl': rails, 'l': lots, 'pt': pitches, 'pk': parks, 'be': beach, 'rc': rc, 'rd': rides}, separators=(',', ':')) + ';\n'
open(out, 'w').write(js)
print({k: len(v) for k, v in [('b', b), ('r', roads), ('w', paths), ('bw', bw), ('pi', piers), ('gr', groynes), ('rl', rails), ('l', lots), ('pt', pitches), ('pk', parks), ('be', beach), ('rc', rc), ('rd', rides)]}, 'play buildings', sum(x['play'] for x in b), 'bytes', len(js))
