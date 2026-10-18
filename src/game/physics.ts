/** 2D (XZ) oriented-box colliders with circle resolution and a BFS flow-field for zombie navigation. */
export interface OBB {
  x: number;
  z: number;
  hx: number;
  hz: number;
  cos: number;
  sin: number;
}

export function makeOBB(x: number, z: number, hx: number, hz: number, rot = 0): OBB {
  return { x, z, hx, hz, cos: Math.cos(rot), sin: Math.sin(rot) };
}

export interface P2 {
  x: number;
  z: number;
}

/** Push a circle out of all colliders (slides along faces). Returns true if collided. */
export function resolveCircle(p: P2, r: number, cols: OBB[], bound: number): boolean {
  let hit = false;
  for (let iter = 0; iter < 2; iter++) {
    for (const c of cols) {
      const dx = p.x - c.x;
      const dz = p.z - c.z;
      if (Math.abs(dx) > c.hx + c.hz + r + 0.1 || Math.abs(dz) > c.hx + c.hz + r + 0.1) continue;
      const lx = dx * c.cos - dz * c.sin;
      const lz = dx * c.sin + dz * c.cos;
      const cx = Math.max(-c.hx, Math.min(c.hx, lx));
      const cz = Math.max(-c.hz, Math.min(c.hz, lz));
      let px = lx - cx;
      let pz = lz - cz;
      const d2 = px * px + pz * pz;
      if (d2 >= r * r) continue;
      hit = true;
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2);
        const k = (r - d) / d;
        px *= k;
        pz *= k;
      } else {
        const ox = c.hx - Math.abs(lx);
        const oz = c.hz - Math.abs(lz);
        if (ox < oz) {
          px = (ox + r) * Math.sign(lx || 1);
          pz = 0;
        } else {
          pz = (oz + r) * Math.sign(lz || 1);
          px = 0;
        }
      }
      p.x += px * c.cos + pz * c.sin;
      p.z += -px * c.sin + pz * c.cos;
    }
  }
  const b = bound - r;
  if (p.x > b) (p.x = b), (hit = true);
  if (p.x < -b) (p.x = -b), (hit = true);
  if (p.z > b) (p.z = b), (hit = true);
  if (p.z < -b) (p.z = -b), (hit = true);
  return hit;
}

export function circleBlocked(x: number, z: number, r: number, cols: OBB[], bound: number) {
  if (Math.abs(x) > bound - r || Math.abs(z) > bound - r) return true;
  for (const c of cols) {
    const dx = x - c.x;
    const dz = z - c.z;
    const lx = dx * c.cos - dz * c.sin;
    const lz = dx * c.sin + dz * c.cos;
    const cx = Math.max(-c.hx, Math.min(c.hx, lx));
    const cz = Math.max(-c.hz, Math.min(c.hz, lz));
    if ((lx - cx) ** 2 + (lz - cz) ** 2 < r * r) return true;
  }
  return false;
}

export class NavGrid {
  readonly cell = 1;
  readonly n: number;
  readonly origin: number;
  readonly walk: Uint8Array;
  readonly dist: Int32Array;
  private queue: Int32Array;

  constructor(cols: OBB[], bound: number, margin = 0.55) {
    this.n = Math.ceil((bound * 2) / this.cell);
    this.origin = -bound;
    this.walk = new Uint8Array(this.n * this.n);
    this.dist = new Int32Array(this.n * this.n).fill(-1);
    this.queue = new Int32Array(this.n * this.n);
    for (let j = 0; j < this.n; j++)
      for (let i = 0; i < this.n; i++) {
        const x = this.origin + (i + 0.5) * this.cell;
        const z = this.origin + (j + 0.5) * this.cell;
        this.walk[j * this.n + i] = circleBlocked(x, z, margin, cols, bound) ? 0 : 1;
      }
  }

  index(x: number, z: number) {
    const i = Math.floor((x - this.origin) / this.cell);
    const j = Math.floor((z - this.origin) / this.cell);
    if (i < 0 || j < 0 || i >= this.n || j >= this.n) return -1;
    return j * this.n + i;
  }

  walkable(x: number, z: number) {
    const k = this.index(x, z);
    return k >= 0 && this.walk[k] === 1;
  }

  /** BFS distance field from target position. */
  update(tx: number, tz: number) {
    const { n, walk, dist, queue } = this;
    dist.fill(-1);
    let start = this.index(tx, tz);
    if (start < 0) return;
    if (!walk[start]) {
      // find nearest walkable cell
      const si = start % n;
      const sj = (start / n) | 0;
      let found = -1;
      for (let r = 1; r < 6 && found < 0; r++)
        for (let dj = -r; dj <= r && found < 0; dj++)
          for (let di = -r; di <= r; di++) {
            const i = si + di;
            const j = sj + dj;
            if (i < 0 || j < 0 || i >= n || j >= n) continue;
            if (walk[j * n + i]) {
              found = j * n + i;
              break;
            }
          }
      if (found < 0) return;
      start = found;
    }
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    dist[start] = 0;
    while (head < tail) {
      const k = queue[head++]!;
      const i = k % n;
      const j = (k / n) | 0;
      const d = dist[k]! + 1;
      if (i > 0 && walk[k - 1] && dist[k - 1]! < 0) (dist[k - 1] = d), (queue[tail++] = k - 1);
      if (i < n - 1 && walk[k + 1] && dist[k + 1]! < 0) (dist[k + 1] = d), (queue[tail++] = k + 1);
      if (j > 0 && walk[k - n] && dist[k - n]! < 0) (dist[k - n] = d), (queue[tail++] = k - n);
      if (j < n - 1 && walk[k + n] && dist[k + n]! < 0) (dist[k + n] = d), (queue[tail++] = k + n);
    }
  }

  distAt(x: number, z: number) {
    const k = this.index(x, z);
    return k < 0 ? -1 : this.dist[k]!;
  }

  /** Direction toward the best neighbouring cell, or null if not on the field. */
  dirFrom(x: number, z: number, out: P2): boolean {
    const { n, dist, walk } = this;
    const k = this.index(x, z);
    if (k < 0 || dist[k]! < 0) return false;
    const i = k % n;
    const j = (k / n) | 0;
    let best = dist[k]!;
    let bi = -1;
    let bj = -1;
    for (let dj = -1; dj <= 1; dj++)
      for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ii = i + di;
        const jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= n || jj >= n) continue;
        const kk = jj * n + ii;
        if (dist[kk]! < 0) continue;
        if (di && dj && (!walk[j * n + ii] || !walk[jj * n + i])) continue;
        const v = dist[kk]! + (di && dj ? -0.4 : 0);
        if (v < best) {
          best = v;
          bi = ii;
          bj = jj;
        }
      }
    if (bi < 0) return false;
    const cx = this.origin + (bi + 0.5) * this.cell - x;
    const cz = this.origin + (bj + 0.5) * this.cell - z;
    const l = Math.hypot(cx, cz) || 1;
    out.x = cx / l;
    out.z = cz / l;
    return true;
  }
}
