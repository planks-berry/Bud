// The shelf, in order: simple to complex, left to right and top to bottom, the way a Montessori
// room arranges its materials. The first row asks only for a touch; the second asks for a
// steadier hand, and then for symbols. The farm comes last: it is a world to build rather than a
// material, and it holds a little of everything before it.

import { toy as pond } from './pond.js';
import { toy as busy } from './busy.js';
import { toy as bars } from './bars.js';
import { toy as tower } from './tower.js';
import { toy as pour } from './pour.js';
import { toy as easel } from './easel.js';
import { letters, numerals } from './sandpaper.js';
import { toy as farm } from './farm.js';

export const TOYS = [pond, busy, bars, tower, pour, easel, letters, numerals, farm];
