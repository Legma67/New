// Raster und A*-Wegfindung
import { N, SPAWN, GOAL, inPlot } from './config.js';

export class Grid {
  constructor() {
    this.cells = new Array(N * N);
    for (let i = 0; i < N * N; i++) this.cells[i] = { type: 'empty', ref: null };
    this.get(SPAWN.x, SPAWN.z).type = 'spawn';
    this.get(GOAL.x, GOAL.z).type = 'goal';
  }
  get(x, z) { return inPlot(x, z) ? this.cells[z * N + x] : null; }
  walkable(x, z) { const c = this.get(x, z); return !!c && (c.type === 'road' || c.type === 'spawn' || c.type === 'goal'); }
  isFree(x, z) { const c = this.get(x, z); return !!c && c.type === 'empty'; }

  // A* von start (oder Spawn) zum Ziel. blocked: optionales Feld, das als nicht begehbar gilt.
  findPath(start = SPAWN, blocked = null) {
    const key = (x, z) => z * N + x;
    const h = (x, z) => Math.abs(x - GOAL.x) + Math.abs(z - GOAL.z);
    const open = [{ x: start.x, z: start.z, g: 0, f: h(start.x, start.z) }];
    const came = new Map();
    const gScore = new Map([[key(start.x, start.z), 0]]);
    const closed = new Set();
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    while (open.length) {
      let bi = 0;
      for (let i = 1; i < open.length; i++) if (open[i].f < open[bi].f || (open[i].f === open[bi].f && open[i].g > open[bi].g)) bi = i;
      const cur = open.splice(bi, 1)[0];
      const ck = key(cur.x, cur.z);
      if (closed.has(ck)) continue;
      if (cur.x === GOAL.x && cur.z === GOAL.z) {
        const path = [{ x: cur.x, z: cur.z }];
        let k = ck;
        while (came.has(k)) { k = came.get(k); path.push({ x: k % N, z: Math.floor(k / N) }); }
        return path.reverse();
      }
      closed.add(ck);
      for (const [dx, dz] of dirs) {
        const nx = cur.x + dx, nz = cur.z + dz;
        if (!this.walkable(nx, nz)) continue;
        if (blocked && blocked.x === nx && blocked.z === nz) continue;
        const nk = key(nx, nz);
        if (closed.has(nk)) continue;
        const g = cur.g + 1;
        if (g < (gScore.get(nk) ?? Infinity)) {
          gScore.set(nk, g); came.set(nk, ck);
          open.push({ x: nx, z: nz, g, f: g + h(nx, nz) });
        }
      }
    }
    return null;
  }

  // Für die Straßenoptik: Welche Nachbarn sind begehbar?
  connections(x, z) {
    return {
      e: this.walkable(x + 1, z), w: this.walkable(x - 1, z),
      s: this.walkable(x, z + 1), n: this.walkable(x, z - 1),
    };
  }
}
