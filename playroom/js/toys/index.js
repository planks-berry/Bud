// The shelf, in order: simple to complex, left to right and top to bottom, the way a Montessori
// room arranges its materials. The first toys ask only for a touch; then a steadier hand, and then
// symbols. The machines and the worlds come last: the dig, where a finger is the digger's bucket;
// the crane, which acts at a distance through its hook; and the farm and the building site, worlds
// to build rather than materials, which hold a little of everything before them.

import { toy as pond } from './pond.js';
import { toy as busy } from './busy.js';
import { toy as bars } from './bars.js';
import { toy as tower } from './tower.js';
import { toy as pour } from './pour.js';
import { toy as easel } from './easel.js';
import { letters, numerals } from './sandpaper.js';
import { toy as dig } from './dig.js';
import { toy as crane } from './crane.js';
import { toy as farm } from './farm.js';
import { toy as site } from './site.js';

export const TOYS = [pond, busy, bars, tower, pour, easel, letters, numerals, dig, crane, farm, site];
