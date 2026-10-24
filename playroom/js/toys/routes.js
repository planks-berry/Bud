// Ways across a board of tiles, for the building site's machines that drive themselves somewhere:
// the truck taking its load to the edge of the site, the bulldozer pushing a pile to a hole, and
// the road machines working their way along a road. Pure, on tiles the caller describes, so the
// suite can check them in Node.
//
// A tile is [c, r], and tiles are neighbours when they share a side. Ties always go the same way,
// to the earlier side in the order north, east, south, west, so the same board gives the same way.

const SIDES = [
    [0, -1],
    [1, 0],
    [0, 1],
    [-1, 0],
];

const id = (c, r) => c * 100 + r;

// The cheapest way from `from` to a tile `goal` accepts, stepping only onto tiles `enter` lets in,
// each step costing `cost` of the tile stepped onto. The way includes both ends, and stops at the
// first goal it comes to: it never goes on through one. `from` is a way of its own if it is a goal.
// Null if there is no way.
export function route(from, goal, enter, cost = () => 1) {
    const best = new Map([[id(from[0], from[1]), 0]]);
    const back = new Map();
    const open = [[0, from[0], from[1]]];
    while (open.length) {
        // The cheapest tile still open. The board is a few dozen tiles, so a scan is plenty.
        let i = 0;
        for (let j = 1; j < open.length; j++) if (open[j][0] < open[i][0]) i = j;
        const [d, c, r] = open.splice(i, 1)[0];
        if (d > best.get(id(c, r))) continue;
        if (goal(c, r)) {
            const way = [[c, r]];
            let at = id(c, r);
            while (back.has(at)) {
                at = back.get(at);
                way.unshift([Math.floor(at / 100), at % 100]);
            }
            return way;
        }
        for (const [dc, dr] of SIDES) {
            const nc = c + dc;
            const nr = r + dr;
            if (!enter(nc, nr)) continue;
            const nd = d + cost(nc, nr);
            const was = best.get(id(nc, nr));
            if (was !== undefined && was <= nd) continue;
            best.set(id(nc, nr), nd);
            back.set(id(nc, nr), id(c, r));
            open.push([nd, nc, nr]);
        }
    }
    return null;
}

// A walk from `start` along the tiles `along` lets through, out to every tile `wanted` picks and
// home again, as a finger traces a maze: it turns into a branch only if something wanted lies down
// it. It begins and ends at `start`, which `along` need not let through. Just [start] if nothing
// wanted can be reached.
export function walk(start, along, wanted) {
    // The branches out from `start`, first come first served, and which of them lead to anything
    // wanted.
    const seen = new Set([id(start[0], start[1])]);
    const tree = new Map();
    const order = [start];
    for (let i = 0; i < order.length; i++) {
        const [c, r] = order[i];
        const kids = [];
        for (const [dc, dr] of SIDES) {
            const nc = c + dc;
            const nr = r + dr;
            if (seen.has(id(nc, nr)) || !along(nc, nr)) continue;
            seen.add(id(nc, nr));
            kids.push([nc, nr]);
        }
        tree.set(id(c, r), kids);
        order.push(...kids);
    }
    const leads = new Map();
    for (let i = order.length - 1; i >= 0; i--) {
        const [c, r] = order[i];
        let any = i > 0 && wanted(c, r);
        for (const [kc, kr] of tree.get(id(c, r))) if (leads.get(id(kc, kr))) any = true;
        leads.set(id(c, r), any);
    }
    const out = [start];
    const visit = (c, r) => {
        for (const [kc, kr] of tree.get(id(c, r))) {
            if (!leads.get(id(kc, kr))) continue;
            out.push([kc, kr]);
            visit(kc, kr);
            out.push([c, r]);
        }
    };
    visit(start[0], start[1]);
    return out;
}
