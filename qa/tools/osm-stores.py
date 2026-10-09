#!/usr/bin/env python3
"""OSM named places (Overpass JSON, qa/tools/data/coney-pois.json) -> src/world/coney/stores.js: every street business on Surf Ave,
Mermaid Ave, Stillwell Ave, W 12th St, W 8th St and Neptune Ave at its real position, for coney/fronts.js to put a storefront on.
De-branding rule: the real name never ships. Each place gets a stand-in name (a parody for chains, a made-up one for local spots)
that keeps the look: sign colours, lettering style, awning. Places with no entry in LOOK get a generic sign by their OSM kind.
Fetch: [out:json];(nwr["name"]["shop"](40.570,-73.995,40.581,-73.97);nwr["name"]["amenity"](...);nwr["name"]["tourism"](...););out center tags;
Usage: python3 qa/tools/osm-stores.py qa/tools/data/coney-pois.json src/world/coney/stores.js"""
import json, math, sys
src, out = sys.argv[1], sys.argv[2]
LAT0, LON0 = 40.5745, -73.9800
kx = 111320 * math.cos(math.radians(LAT0)); ky = 110540; TH = math.radians(8.33)
def P(lat, lon):
    x = (lon - LON0) * kx; z = -(lat - LAT0) * ky
    return (round(x * math.cos(TH) - z * math.sin(TH), 1), round(x * math.sin(TH) + z * math.cos(TH), 1))

# real OSM name -> (shown name, sub line, style, sign bg, letters, awning colour or None)
# styles: box (bold sans on a panel), script (italic serif), chan (lit channel letters on a dark band), bulb (marquee with bulbs)
LOOK = {
    "Nathan's": ("NORMAN'S", 'FAMOUS · SINCE 1916', 'landmark', '#f6c51b', '#1d6b34', None),
    "IT'SUGAR": ("IT'SWEET", 'CANDY · SWEETS · GIFTS', 'bubble', '#ffffff', '#e8247c', None),
    'Williams Candy Shop': ("WALLY'S CANDY", 'CANDY APPLES · SINCE 1936', 'script', '#c8202a', '#fff4d0', '#c8202a'),
    "Pete's Clam Stop": ("SAL'S CLAM STOP", 'CLAMS · SHRIMP · BEER', 'box', '#1f5fae', '#ffffff', '#1f5fae'),
    'Popeyes': ("POPPA'S", 'LOUISIANA CHICKEN', 'box', '#f47a20', '#ffffff', None),
    'Lunatics Ice Cream': ('MOONSTRUCK', 'ICE CREAM', 'script', '#2b2d6e', '#ffd84a', None),
    "Dunkin'": ('DUNKIRK DONUTS', 'COFFEE · DONUTS', 'box', '#ff6c0c', '#e5137f', None),
    'Eat In Deli': ('EAT-IN DELI', 'HOT & COLD SANDWICHES', 'box', '#f2f2f2', '#c8202a', '#2a8a3a'),
    'Wonder': ('WONDER BURGERS', '', 'chan', '#1a1a1a', '#ffd23a', None),
    'Crab House Brooklyn': ('CRAB SHACK', 'BROOKLYN', 'box', '#d8301e', '#ffffff', '#d8301e'),
    'Hook and Reel': ('LINE & SINKER', 'CAJUN SEAFOOD & BAR', 'box', '#0d3b66', '#ffd23a', None),
    'Kpot Korean BBQ & Hot Pot': ('SEOUL POT', 'KOREAN BBQ & HOT POT', 'chan', '#141414', '#ff3b3b', None),
    'Teura Il Ponte': ('IL PONTE', 'RISTORANTE', 'script', '#1d3a2a', '#f2e6c8', '#1d3a2a'),
    'The Red Doors Bar & Grill': ('THE BLUE DOORS', 'BAR & GRILL', 'box', '#16336b', '#ffffff', None),
    "Tex's Chicken & Burgers": ("DEX'S", 'CHICKEN & BURGERS', 'box', '#c8202a', '#ffd23a', None),
    'Taco Bell Cantina': ('TACO BELLE', 'CANTINA', 'box', '#5b2a86', '#ffffff', None),
    'IHOP': ('IHOF', 'INT\'L HOUSE OF FLAPJACKS', 'box', '#1f4fa8', '#ffffff', '#c8202a'),
    'High Tidez': ('HIGH TIDE', 'DISPENSARY', 'chan', '#0f2a24', '#36e08a', None),
    'Buck-!t Sports Bar & Latin Grill': ('BUCKET', 'SPORTS BAR & LATIN GRILL', 'chan', '#111111', '#ff9a1f', None),
    'Home Decor On The Surf': ('HOME DECOR', 'ON THE SURF', 'box', '#f2c418', '#1a1a1a', None),
    'Rare': ('MEDIUM RARE', 'STEAKHOUSE', 'chan', '#121212', '#e8c26a', None),
    'TaoXi': ('TAO TAO', 'ASIAN CUISINE', 'chan', '#1a1a1a', '#ff5fa8', None),
    'Surf City Pizzaria': ('SURF TOWN', 'PIZZERIA · PASTA', 'bulb', '#f7f7f2', '#1d3f9e', '#c0303a'),
    'Starbucks': ('STARBOARD', 'COFFEE', 'box', '#1e3932', '#ffffff', None),
    'Liman': ('LIMANI', 'RESTAURANT', 'script', '#f2efe6', '#1d4e7a', None),
    'Fun Island': ('FUN ISLE', 'PARTY HALL', 'bulb', '#2a1a4a', '#ffd23a', None),
    'Milk+Honey Coffee+Kitchen': ('MILK & HONEY', 'COFFEE + KITCHEN', 'script', '#f4eadb', '#6b4a2b', None),
    "Art's House Schools": ('ARTS HOUSE', 'DANCE · MUSIC · ART', 'box', '#e8f0f7', '#d23a6a', None),
    'Footprints': ('FOOTSTEPS', 'CARIBBEAN CAFE', 'box', '#1d7a3a', '#ffd23a', '#1d7a3a'),
    'Health Choice Pharmacy II & Medical Supply': ('HEALTH FIRST', 'PHARMACY & MEDICAL SUPPLY', 'box', '#ffffff', '#1a7a4a', None),
    'Ida G Israel Community Health Center': ('COMMUNITY HEALTH', 'CENTER', 'box', '#e8eef4', '#1f4fa8', None),
    'The Coney Island Sandbar': ('THE SANDBAR', 'BEACH BAR', 'chan', '#1a2a3a', '#ffb84a', None),
    'Coney Island Beach Shop': ('BEACH SHOP', 'SOUVENIRS · TOWELS', 'box', '#1aa0d8', '#ffffff', '#f2c418'),
    'White Castle': ('WHITE TOWER', 'HAMBURGERS', 'box', '#ffffff', '#1f4fa8', None),
    "McDonald's": ("MacDOUGAL'S", '', 'box', '#d8201e', '#ffc72c', None),
    'Chase': ('CHARTER BANK', '', 'box', '#ffffff', '#1468b8', None),
    'Chow Time': ('CHOW TIME', 'CHINESE · BUFFET', 'box', '#c8202a', '#ffd23a', None),
    "Gargiulo's": ("GAROFALO'S", 'RESTAURANT · SINCE 1907', 'script', '#f2ead8', '#7a1a1a', '#7a1a1a'),
    'Henry Liquors': ("HENRY'S", 'WINE & LIQUOR', 'box', '#1a1a1a', '#ffffff', None),
    'Leanly Chinese Food': ('LUCKY CHINESE FOOD', 'TAKE OUT', 'box', '#c8202a', '#ffffff', None),
    'L.Q.A. Grocery II': ('L&Q GROCERY', 'DELI · CANDY · ATM', 'box', '#2a8a3a', '#ffffff', '#2a8a3a'),
    'Arch Auto Parts': ('ARCH AUTO PARTS', '', 'box', '#f2c418', '#1a1a1a', None),
    'C&T Nail Salon': ('C&T NAILS', 'MANICURE · PEDICURE', 'script', '#f7d6e4', '#c2185b', None),
    'Café Dacha': ('CAFE IZBA', 'ЧАЙ · КОФЕ', 'script', '#3a2a1a', '#f2d8a0', '#3a2a1a'),
    'Dollar Tree': ('DOLLAR PALACE', 'EVERYTHING $1.25', 'box', '#1e7a3a', '#ffffff', None),
    'NYU Langone Medical Associates': ('BAYSIDE MEDICAL', 'ASSOCIATES', 'box', '#ffffff', '#5a2a8a', None),
    "Hangry Joe's Hot Chicken and Wings": ("ANGRY JOE'S", 'HOT CHICKEN & WINGS', 'box', '#1a1a1a', '#ff3b1f', None),
    'Luna Park Pharmacy': ('LUNA PHARMACY', '', 'box', '#ffffff', '#1a7a4a', None),
    'MV Quick Food': ('QUICK FOOD', 'DELI · GROCERY', 'box', '#f2c418', '#c8202a', None),
    'New York Engine Company 245;New York Ladder Company 161': ('ENGINE 245 · LADDER 161', 'FIREHOUSE', 'firehouse', '#8a1a14', '#f2e6c8', None),
    'NYPD 60th Precinct': ('60TH PRECINCT', 'POLICE', 'police', '#1a2a4a', '#ffffff', None),
    "Domino's": ("DOMENICO'S", 'PIZZA', 'box', '#0b5f9e', '#ffffff', '#c8202a'),
    'A&G Pharmacy': ('A&G PHARMACY', '', 'box', '#ffffff', '#c8202a', None),
    'Benjamin Moore': ('PAINT & HARDWARE', '', 'box', '#1a3a7a', '#ffffff', None),
    'Neptune Deli & Grocery': ('NEPTUNE DELI', 'GROCERY', 'box', '#c8202a', '#ffffff', '#c8202a'),
    "Totonno's Pizzeria Napolitana": ("TOTO'S", 'PIZZERIA NAPOLETANA', 'script', '#f2ead8', '#1d6b34', None),
    'Boardwalk Liquids': ('BOARDWALK LIQUORS', '', 'box', '#1a1a1a', '#ffd23a', None),
    'Neptune Deli': ('NEPTUNE DELI', '', 'box', '#c8202a', '#ffffff', None),
    'Burger King': ('BURGER BARON', '', 'box', '#f2a81e', '#d8201e', None),
    'Anfex Medical Supply': ('MEDICAL SUPPLY', '', 'box', '#ffffff', '#1f4fa8', None),
    'Interior Decor NY': ('INTERIOR DECOR', '', 'box', '#f2f2f2', '#333333', None),
}
SKIP_KIND = {'bench', 'waste_basket', 'parking', 'bicycle_parking', 'toilets', 'drinking_water', 'fountain', 'vending_machine', 'atm', 'parking_entrance', 'shelter', 'telephone',
             'recycling', 'charging_station', 'bicycle_rental', 'post_box', 'information', 'picnic_table', 'attraction', 'theme_park', 'artwork', 'place_of_worship', 'school', 'fuel',
             'social_facility', 'stripclub', 'aquarium', 'ticket', 'library', 'cinema', 'gallery', 'car_wash', 'tyres', 'car'}
SKIP_NAME = {'Sideshows by the Seashore', 'The Freak Bar', 'Luna Park', 'FDNY Battalion 43, Engine 245 & Ladder 161', 'Tagging Robot'}
GENERIC = {'restaurant': ('box', '#7a1a1a', '#f2e6c8'), 'fast_food': ('box', '#d8301e', '#ffffff'), 'cafe': ('script', '#3a2a1a', '#f2d8a0'), 'bar': ('chan', '#141414', '#ff9a1f'),
           'convenience': ('box', '#2a8a3a', '#ffffff'), 'chemist': ('box', '#ffffff', '#1a7a4a'), 'alcohol': ('box', '#1a1a1a', '#ffffff'), 'clinic': ('box', '#ffffff', '#1f4fa8')}
GEN_NAME = {'restaurant': 'RESTAURANT', 'fast_food': 'TAKE OUT', 'cafe': 'CAFE', 'bar': 'BAR', 'convenience': 'DELI & GROCERY', 'chemist': 'PHARMACY', 'alcohol': 'WINE & LIQUOR', 'clinic': 'MEDICAL'}
d = json.load(open(src))['elements']
rows, seen = [], set()
for e in d:
    t = e.get('tags', {}); name = t.get('name', ''); c = e.get('center', e)
    kind = t.get('shop') or t.get('amenity') or t.get('tourism') or ''
    if kind in SKIP_KIND or name in SKIP_NAME or 'lat' not in c: continue
    x, z = P(c['lat'], c['lon'])
    if not (-450 < x < 460 and -548 < z < -60): continue   # the streets north of the boardwalk, inside the walkable map
    if name in LOOK: show, sub, style, bg, fg, awn = LOOK[name]
    elif kind in GENERIC: show = GEN_NAME[kind]; sub = ''; style, bg, fg = GENERIC[kind]; awn = None
    else: continue
    key = (round(x / 3), round(z / 3), show)
    if key in seen: continue
    seen.add(key)
    rows.append({'x': x, 'z': z, 'k': kind, 'n': show, 's': sub, 'st': style, 'bg': bg, 'fg': fg, 'aw': awn})
rows.sort(key=lambda r: (r['z'], r['x']))
js = '// GENERATED by qa/tools/osm-stores.py from OpenStreetMap (ODbL, (c) OpenStreetMap contributors). Do not edit by hand.\n'
js += '// Street businesses at their real positions (map frame, metres). Names are stand-ins (de-branding rule); the look is the real one.\n'
js += '// {x, z, k: OSM kind, n: sign, s: sub line, st: style, bg / fg: sign colours, aw: awning colour}\n'
js += 'export const STORES = ' + json.dumps(rows, ensure_ascii=False, separators=(',', ':')) + ';\n'
open(out, 'w').write(js)
print(len(rows), 'stores ->', out)
