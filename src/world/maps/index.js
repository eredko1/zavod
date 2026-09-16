// Map registry. Owned by: main. Add a map = add a module exporting { meta, build(world) } and list it here.
import * as zavod from './zavod.js';
import * as railyard from './railyard.js';
import * as terminal from './terminal.js';
import * as wsp from './wsp.js';
import * as sbu from './sbu.js';
export const MAPS = { zavod, railyard, terminal, wsp, sbu };
export const DEFAULT_MAP = 'zavod';
