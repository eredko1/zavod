// Map registry. Owned by: main. Add a map = add a module exporting { meta, build(world) } and list it here.
import * as zavod from './zavod.js';
import * as railyard from './railyard.js';
import * as terminal from './terminal.js';
import * as wsp from './wsp.js';
import * as sbu from './sbu.js';
import * as coney from './coney.js';
export const MAPS = { zavod, railyard, terminal, wsp, sbu, coney };
export const DEFAULT_MAP = 'zavod';
