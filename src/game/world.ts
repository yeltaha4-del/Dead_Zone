import * as THREE from "three";
import { makeOBB, type OBB } from "./physics";

export const BOUND = 62;

export interface World {
  group: THREE.Group;
  colliders: OBB[];
  blockers: THREE.Mesh[];
  spawnPoints: THREE.Vector2[];
  lampLights: THREE.PointLight[];
  dispose: () => void;
}

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function canvasTex(size: number, draw: (g: CanvasRenderingContext2D, s: number) => void, repeat = 1) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  draw(g, size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function speckle(base: string, n: number, alpha: number) {
  return (g: CanvasRenderingContext2D, s: number) => {
    g.fillStyle = base;
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < n; i++) {
      const v = Math.random();
      g.fillStyle = v > 0.5 ? `rgba(255,255,255,${alpha * Math.random()})` : `rgba(0,0,0,${alpha * 1.5 * Math.random()})`;
      const w = 1 + Math.random() * 3;
      g.fillRect(Math.random() * s, Math.random() * s, w, w);
    }
  };
}

export function buildWorld(shadows: boolean): World {
  const rand = rng(1337);
  const group = new THREE.Group();
  const colliders: OBB[] = [];
  const blockers: THREE.Mesh[] = [];
  const disposables: { dispose: () => void }[] = [];
  const box = new THREE.BoxGeometry(1, 1, 1);
  const cyl = new THREE.CylinderGeometry(0.5, 0.5, 1, 10);
  disposables.push(box, cyl);

  const mat = (p: THREE.MeshStandardMaterialParameters) => {
    const m = new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0.05, ...p });
    disposables.push(m);
    return m;
  };

  const asphaltTex = canvasTex(256, (g, s) => {
    speckle("#2a2d33", 3500, 0.12)(g, s);
    g.strokeStyle = "rgba(10,10,12,0.6)";
    for (let i = 0; i < 6; i++) {
      g.lineWidth = 1 + Math.random();
      g.beginPath();
      let x = Math.random() * s;
      let y = Math.random() * s;
      g.moveTo(x, y);
      for (let k = 0; k < 6; k++) g.lineTo((x += (Math.random() - 0.5) * 40), (y += (Math.random() - 0.5) * 40));
      g.stroke();
    }
  }, 30);
  const concreteTex = canvasTex(128, speckle("#6a6e74", 1200, 0.15), 1);
  const facadeTex = canvasTex(128, speckle("#3a3f48", 1500, 0.18), 1);
  const tileTex = canvasTex(128, (g, s) => {
    speckle("#4a4d52", 800, 0.12)(g, s);
    g.strokeStyle = "rgba(20,20,22,0.7)";
    g.lineWidth = 2;
    for (let i = 0; i <= 4; i++) {
      g.beginPath();
      g.moveTo((i * s) / 4, 0);
      g.lineTo((i * s) / 4, s);
      g.moveTo(0, (i * s) / 4);
      g.lineTo(s, (i * s) / 4);
      g.stroke();
    }
  }, 12);
  disposables.push(asphaltTex, concreteTex, facadeTex, tileTex);

  const M = {
    asphalt: mat({ map: asphaltTex, color: "#9aa0aa" }),
    plaza: mat({ map: tileTex, color: "#8a8e96" }),
    sidewalk: mat({ map: concreteTex, color: "#7d8188" }),
    curb: mat({ color: "#5b5f66" }),
    facades: ["#2b3039", "#353a44", "#262a31", "#3a3530", "#2e343c"].map((c) => mat({ map: facadeTex, color: c })),
    trim: mat({ color: "#1b1e23" }),
    winDark: mat({ color: "#0c1018", roughness: 0.3, metalness: 0.4 }),
    winLit: mat({ color: "#ffb347", emissive: "#ff9a2e", emissiveIntensity: 1.3 }),
    roof: mat({ color: "#22262c" }),
    metal: mat({ color: "#4a4f57", metalness: 0.6, roughness: 0.5 }),
    rust: [mat({ color: "#6b3b24", roughness: 1 }), mat({ color: "#3d4a52", roughness: 0.8, metalness: 0.3 }), mat({ color: "#5a5248", roughness: 1 }), mat({ color: "#2f3a2e", roughness: 0.9 })],
    glass: mat({ color: "#0b0f14", roughness: 0.2, metalness: 0.6 }),
    tire: mat({ color: "#111214" }),
    concrete: mat({ map: concreteTex, color: "#9a9a96" }),
    red: mat({ color: "#a3161b", roughness: 0.7 }),
    white: mat({ color: "#d9d6cf" }),
    yellow: mat({ color: "#c9a227" }),
    bulb: mat({ color: "#ffd18a", emissive: "#ffb347", emissiveIntensity: 3 }),
    wall: mat({ map: concreteTex, color: "#585c62" }),
    rubble: mat({ color: "#55575a" }),
    warn: mat({ color: "#ff2a1f", emissive: "#ff2a1f", emissiveIntensity: 2 }),
  };

  const add = (m: THREE.Mesh, parent: THREE.Object3D = group) => {
    m.castShadow = shadows;
    m.receiveShadow = shadows;
    parent.add(m);
    return m;
  };
  const B = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, ry = 0, parent?: THREE.Object3D) => {
    const mesh = new THREE.Mesh(box, m);
    mesh.scale.set(w, h, d);
    mesh.position.set(x, y, z);
    mesh.rotation.y = ry;
    return add(mesh, parent);
  };
  const C = (r: number, h: number, m: THREE.Material, x: number, y: number, z: number, parent?: THREE.Object3D) => {
    const mesh = new THREE.Mesh(cyl, m);
    mesh.scale.set(r * 2, h, r * 2);
    mesh.position.set(x, y, z);
    return add(mesh, parent);
  };

  // Ground
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(BOUND * 2, BOUND * 2), M.asphalt);
  disposables.push(ground.geometry);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = shadows;
  group.add(ground);
  blockers.push(ground);
  const plaza = new THREE.Mesh(new THREE.PlaneGeometry(26, 26), M.plaza);
  disposables.push(plaza.geometry);
  plaza.rotation.x = -Math.PI / 2;
  plaza.position.y = 0.02;
  plaza.receiveShadow = shadows;
  group.add(plaza);

  // Window instancing
  const darkM: THREE.Matrix4[] = [];
  const litM: THREE.Matrix4[] = [];
  const tmpO = new THREE.Object3D();
  const pushWin = (x: number, y: number, z: number, w: number, h: number, d: number, lit: boolean) => {
    tmpO.position.set(x, y, z);
    tmpO.scale.set(w, h, d);
    tmpO.rotation.set(0, 0, 0);
    tmpO.updateMatrix();
    (lit ? litM : darkM).push(tmpO.matrix.clone());
  };

  const building = (cx: number, cz: number, w: number, d: number, h: number) => {
    const fm = M.facades[Math.floor(rand() * M.facades.length)]!;
    const body = B(w, h, d, fm, cx, h / 2, cz);
    blockers.push(body);
    colliders.push(makeOBB(cx, cz, w / 2, d / 2));
    // ground floor plinth + floor ledges
    B(w + 0.3, 1.2, d + 0.3, M.trim, cx, 0.6, cz);
    const floors = Math.floor((h - 2) / 3.2);
    for (let f = 1; f <= floors; f++) {
      if (f % 2 === 0) B(w + 0.24, 0.18, d + 0.24, M.trim, cx, 1.6 + f * 3.2 - 0.3, cz);
    }
    // windows on four faces
    const faces: [number, number, number, number, boolean][] = [
      [0, 1, w, d, true],
      [0, -1, w, d, true],
      [1, 0, d, w, false],
      [-1, 0, d, w, false],
    ];
    for (const [nx, nz, span, depth] of faces) {
      const cols = Math.max(2, Math.floor(span / 2.6));
      const step = span / cols;
      for (let f = 0; f < floors; f++) {
        const y = 2.8 + f * 3.2;
        if (y > h - 1.5) break;
        for (let c = 0; c < cols; c++) {
          if (rand() < 0.06) continue;
          const off = -span / 2 + step * (c + 0.5);
          const lit = rand() < 0.07;
          const ww = step * 0.55;
          if (nz !== 0) {
            const z = cz + nz * (depth / 2 + 0.02);
            pushWin(cx + off, y, z, ww, 1.7, 0.08, lit);
            pushWin(cx + off, y - 0.95, cz + nz * (depth / 2 + 0.1), ww + 0.3, 0.12, 0.25, false);
          } else {
            const x = cx + nx * (depth / 2 + 0.02);
            pushWin(x, y, cz + off, 0.08, 1.7, ww, lit);
            pushWin(cx + nx * (depth / 2 + 0.1), y - 0.95, cz + off, 0.25, 0.12, ww + 0.3, false);
          }
        }
      }
    }
    // roof: parapet + units
    const rt = 0.3;
    B(w, 0.8, rt, M.roof, cx, h + 0.4, cz - d / 2 + rt / 2);
    B(w, 0.8, rt, M.roof, cx, h + 0.4, cz + d / 2 - rt / 2);
    B(rt, 0.8, d, M.roof, cx - w / 2 + rt / 2, h + 0.4, cz);
    B(rt, 0.8, d, M.roof, cx + w / 2 - rt / 2, h + 0.4, cz);
    const units = 1 + Math.floor(rand() * 3);
    for (let i = 0; i < units; i++) B(1.4 + rand() * 1.5, 1 + rand(), 1.2 + rand(), M.metal, cx + (rand() - 0.5) * (w - 4), h + 0.6, cz + (rand() - 0.5) * (d - 4));
    if (rand() < 0.5) {
      const tx = cx + (rand() - 0.5) * (w - 5);
      const tz = cz + (rand() - 0.5) * (d - 5);
      C(1.2, 2.2, M.rust[0]!, tx, h + 2.6, tz);
      for (const [a, b] of [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]] as const) B(0.15, 1.5, 0.15, M.trim, tx + a, h + 0.75, tz + b);
    }
    if (rand() < 0.4) {
      const ax = cx + (rand() - 0.5) * (w - 3);
      const az = cz + (rand() - 0.5) * (d - 3);
      B(0.1, 5, 0.1, M.metal, ax, h + 2.5, az);
      B(0.25, 0.25, 0.25, M.warn, ax, h + 5.1, az);
    }
  };

  // City blocks (3x3 grid, centre is the plaza)
  const centres = [-38, 0, 38];
  for (const bx of centres)
    for (const bz of centres) {
      if (bx === 0 && bz === 0) continue;
      const S = 22;
      // sidewalk slab
      B(S + 3.4, 0.16, S + 3.4, M.sidewalk, bx, 0.08, bz).castShadow = false;
      B(S + 3.6, 0.1, S + 3.6, M.curb, bx, 0.05, bz).castShadow = false;
      const split = rand();
      if (split < 0.35) building(bx, bz, S, S, 14 + rand() * 18);
      else if (split < 0.7) {
        building(bx - S / 4 - 0.1, bz, S / 2 - 0.4, S, 12 + rand() * 18);
        building(bx + S / 4 + 0.1, bz, S / 2 - 0.4, S - 3, 10 + rand() * 20);
      } else {
        building(bx, bz - S / 4 - 0.1, S, S / 2 - 0.4, 12 + rand() * 18);
        building(bx - S / 4, bz + S / 4 + 0.1, S / 2 - 0.4, S / 2 - 0.4, 9 + rand() * 12);
        building(bx + S / 4, bz + S / 4 + 0.1, S / 2 - 0.6, S / 2 - 0.4, 16 + rand() * 16);
      }
    }

  const inst = (arr: THREE.Matrix4[], m: THREE.Material) => {
    const im = new THREE.InstancedMesh(box, m, arr.length);
    arr.forEach((mx, i) => im.setMatrixAt(i, mx));
    im.instanceMatrix.needsUpdate = true;
    im.receiveShadow = false;
    group.add(im);
  };
  inst(darkM, M.winDark);
  inst(litM, M.winLit);

  // Perimeter walls
  const wallH = 5;
  for (const s of [-1, 1]) {
    B(BOUND * 2 + 2, wallH, 1, M.wall, 0, wallH / 2, s * (BOUND + 0.5));
    B(1, wallH, BOUND * 2 + 2, M.wall, s * (BOUND + 0.5), wallH / 2, 0);
    for (let i = -BOUND; i <= BOUND; i += 8) {
      B(1.4, wallH + 0.6, 1.4, M.concrete, i, (wallH + 0.6) / 2, s * (BOUND + 0.3));
      B(1.4, wallH + 0.6, 1.4, M.concrete, s * (BOUND + 0.3), (wallH + 0.6) / 2, i);
    }
    // red warning stripe
    B(BOUND * 2, 0.35, 0.05, M.red, 0, 3.6, s * (BOUND - 0.02));
    B(0.05, 0.35, BOUND * 2, M.red, s * (BOUND - 0.02), 3.6, 0);
  }

  // Road markings
  const streets = [-19, 19, -55.5, 55.5];
  for (const s of streets) {
    for (let t = -BOUND + 3; t < BOUND - 3; t += 4.5) {
      const ext = s === 19 || s === -19;
      const m = ext ? M.white : M.yellow;
      B(0.18, 0.02, 2, m, s, 0.015, t).castShadow = false;
      B(2, 0.02, 0.18, m, t, 0.015, s).castShadow = false;
    }
  }
  // crosswalks around plaza
  for (const s of [-15, 15])
    for (let k = -5; k <= 5; k += 1.4) {
      B(0.7, 0.02, 3, M.white, k, 0.016, s * 1).castShadow = false;
      B(3, 0.02, 0.7, M.white, s, 0.016, k).castShadow = false;
    }

  // Plaza monument (burnt fountain)
  C(2.6, 0.6, M.concrete, 0, 0.3, 0);
  C(2.2, 0.62, M.trim, 0, 0.32, 0);
  C(0.6, 3.2, M.concrete, 0, 1.6, 0);
  B(1.4, 0.4, 1.4, M.trim, 0, 3.3, 0);
  const mono = B(5.2, 0.6, 5.2, M.concrete, 0, 0.3, 0);
  mono.visible = false;
  blockers.push(mono);
  colliders.push(makeOBB(0, 0, 2.5, 2.5, Math.PI / 4));

  // Cars
  const car = (x: number, z: number, ry: number) => {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = ry;
    group.add(g);
    const paint = M.rust[Math.floor(rand() * M.rust.length)]!;
    const body = B(2, 0.7, 4.4, paint, 0, 0.75, 0, 0, g);
    const cabin = B(1.8, 0.65, 2.2, paint, 0, 1.42, -0.2, 0, g);
    B(1.82, 0.5, 0.06, M.glass, 0, 1.42, 0.92, 0, g);
    B(1.82, 0.5, 0.06, M.glass, 0, 1.42, -1.32, 0, g);
    B(0.06, 0.45, 1.8, M.glass, 0.91, 1.42, -0.2, 0, g);
    B(0.06, 0.45, 1.8, M.glass, -0.91, 1.42, -0.2, 0, g);
    B(2.05, 0.18, 0.2, M.metal, 0, 0.55, 2.2, 0, g);
    B(2.05, 0.18, 0.2, M.metal, 0, 0.55, -2.2, 0, g);
    B(0.4, 0.15, 0.05, M.trim, 0.65, 0.85, 2.21, 0, g);
    B(0.4, 0.15, 0.05, M.trim, -0.65, 0.85, 2.21, 0, g);
    for (const [wx, wz] of [[0.95, 1.4], [-0.95, 1.4], [0.95, -1.4], [-0.95, -1.4]] as const) {
      const w = new THREE.Mesh(cyl, M.tire);
      w.scale.set(0.7, 0.3, 0.7);
      w.rotation.z = Math.PI / 2;
      w.position.set(wx, rand() < 0.3 ? 0.25 : 0.35, wz);
      add(w, g);
    }
    g.rotation.z = (rand() - 0.5) * 0.06;
    blockers.push(body, cabin);
    colliders.push(makeOBB(x, z, 1.05, 2.25, ry));
  };
  const carSpots: [number, number, number][] = [
    [-21.5, 8, 0.1], [21.5, -6, -0.08], [-17, -30, 0.25], [18, 34, Math.PI - 0.2], [-34, 17.5, Math.PI / 2 + 0.15],
    [30, -20.5, Math.PI / 2 - 0.3], [-52, -10, 0.05], [54, 22, 0.2], [8, 55, Math.PI / 2 + 0.1], [-26, -56, Math.PI / 2 - 0.15],
    [42, 57, Math.PI / 2], [-56, 40, -0.1], [12, -18, Math.PI / 2 + 0.6], [-9, 20, Math.PI / 2 - 0.4],
  ];
  carSpots.forEach(([x, z, r]) => car(x, z, r));

  // Jersey barriers
  const barrier = (x: number, z: number, ry: number, striped: boolean) => {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = ry;
    group.add(g);
    const base = B(3, 0.45, 0.9, M.concrete, 0, 0.225, 0, 0, g);
    const top = B(3, 0.6, 0.4, M.concrete, 0, 0.75, 0, 0, g);
    if (striped) for (let i = -1; i <= 1; i++) B(0.45, 0.5, 0.42, i === 0 ? M.white : M.red, i * 0.9, 0.78, 0, 0, g);
    blockers.push(base, top);
    colliders.push(makeOBB(x, z, 1.5, 0.45, ry));
  };
  const barriers: [number, number, number][] = [
    [-8, 14, 0], [6, -14, 0.1], [14, 6, Math.PI / 2], [-14, -6, Math.PI / 2 - 0.1], [-19, 38, 0.3], [19, -40, -0.2],
    [38, 19, Math.PI / 2], [-40, -19, Math.PI / 2 + 0.2], [-55, 0, 0.1], [55, -4, -0.1], [0, 55.5, Math.PI / 2], [4, -55, Math.PI / 2],
  ];
  barriers.forEach(([x, z, r], i) => barrier(x, z, r, i % 2 === 0));

  // Street lamps
  const lampLights: THREE.PointLight[] = [];
  const lamp = (x: number, z: number, armDir: number, withLight: boolean) => {
    C(0.12, 6, M.metal, x, 3, z);
    C(0.22, 0.4, M.trim, x, 0.2, z);
    const ax = Math.sin(armDir);
    const az = Math.cos(armDir);
    B(0.1, 0.1, 1.6, M.metal, x + ax * 0.8, 6, z + az * 0.8, armDir);
    B(0.5, 0.18, 0.8, M.trim, x + ax * 1.6, 5.95, z + az * 1.6, armDir);
    B(0.38, 0.06, 0.6, M.bulb, x + ax * 1.6, 5.84, z + az * 1.6, armDir).castShadow = false;
    colliders.push(makeOBB(x, z, 0.2, 0.2));
    if (withLight) {
      const l = new THREE.PointLight("#ffae52", 18, 16, 1.6);
      l.position.set(x + ax * 1.6, 5.5, z + az * 1.6);
      group.add(l);
      lampLights.push(l);
    }
  };
  lamp(-12, -12, Math.PI / 4, true);
  lamp(12, 12, (-3 * Math.PI) / 4, true);
  lamp(-12, 12, (3 * Math.PI) / 4, false);
  lamp(12, -12, -Math.PI / 4, false);
  lamp(-12.5, 34, Math.PI / 2, true);
  lamp(25.5, -32, -Math.PI / 2, true);
  lamp(-25.5, -44, -Math.PI / 2, false);
  lamp(34, 25.5, Math.PI, false);
  lamp(-44, 25.5, Math.PI, false);
  lamp(50, -50, Math.PI / 4, false);
  lamp(-50, 50, -Math.PI / 4, false);

  // Rubble (visual only, low)
  for (let i = 0; i < 70; i++) {
    const x = (rand() - 0.5) * (BOUND * 2 - 6);
    const z = (rand() - 0.5) * (BOUND * 2 - 6);
    const s = 0.2 + rand() * 0.5;
    const r = B(s, s * 0.5, s * (0.6 + rand()), M.rubble, x, s * 0.25, z, rand() * 6);
    r.rotation.x = (rand() - 0.5) * 0.4;
  }

  // Spawn points along streets near the perimeter and mid streets
  const spawnPoints: THREE.Vector2[] = [];
  for (const s of [-55.5, 55.5]) for (let t = -48; t <= 48; t += 12) spawnPoints.push(new THREE.Vector2(s, t), new THREE.Vector2(t, s));
  for (const s of [-19, 19]) for (const t of [-50, -30, 30, 50]) spawnPoints.push(new THREE.Vector2(s, t), new THREE.Vector2(t, s));

  return {
    group,
    colliders,
    blockers,
    spawnPoints,
    lampLights,
    dispose: () => disposables.forEach((d) => d.dispose()),
  };
}
