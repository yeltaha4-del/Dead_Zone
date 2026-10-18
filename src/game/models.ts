import * as THREE from "three";
import type { WeaponId, ZombieKind } from "./config";

/** Shared geometry + material library for dynamic entities. */
export class Library {
  box = new THREE.BoxGeometry(1, 1, 1);
  cyl = new THREE.CylinderGeometry(0.5, 0.5, 1, 12);
  coin = new THREE.CylinderGeometry(0.22, 0.22, 0.06, 14);
  private mats: THREE.Material[] = [];
  m(p: THREE.MeshStandardMaterialParameters) {
    const m = new THREE.MeshStandardMaterial({ roughness: 0.85, ...p });
    this.mats.push(m);
    return m;
  }
  skin = {
    walker: this.m({ color: "#7d8f5a" }),
    runner: this.m({ color: "#8f8a72" }),
    tank: this.m({ color: "#5f6b4a" }),
    exploder: this.m({ color: "#6f9a3a", emissive: "#3cff2a", emissiveIntensity: 0.25 }),
  };
  shirt = {
    walker: this.m({ color: "#3f5a3a" }),
    runner: this.m({ color: "#6b2a24" }),
    tank: this.m({ color: "#33363d" }),
    exploder: this.m({ color: "#4a4a3a" }),
  };
  pants = this.m({ color: "#2e3a52" });
  pantsDark = this.m({ color: "#26282c" });
  blood = this.m({ color: "#6a0d0d" });
  hair = this.m({ color: "#2a1d14" });
  eyeDull = this.m({ color: "#e8e0a0", emissive: "#a89a40", emissiveIntensity: 0.6 });
  eyeRed = this.m({ color: "#ff2020", emissive: "#ff0000", emissiveIntensity: 3 });
  eyeGreen = this.m({ color: "#a0ff60", emissive: "#5cff2a", emissiveIntensity: 3 });
  belly = this.m({ color: "#9cff4a", emissive: "#4cff1a", emissiveIntensity: 1.4, transparent: true, opacity: 0.92 });
  gunDark = this.m({ color: "#1d1f22", roughness: 0.45, metalness: 0.6 });
  gunMid = this.m({ color: "#33363b", roughness: 0.5, metalness: 0.5 });
  gunWood = this.m({ color: "#4a2e1c", roughness: 0.8 });
  glove = this.m({ color: "#1a1b1c", roughness: 0.9 });
  sleeve = this.m({ color: "#2f3a2c", roughness: 1 });
  skinHand = this.m({ color: "#b98b6e" });
  sight = this.m({ color: "#ff3b2f", emissive: "#ff2010", emissiveIntensity: 2 });
  gold = this.m({ color: "#ffcf40", emissive: "#ffae00", emissiveIntensity: 1.2, metalness: 0.8, roughness: 0.3 });
  ammoBox = this.m({ color: "#4b5a2a" });
  ammoStripe = this.m({ color: "#e0b030", emissive: "#e0a020", emissiveIntensity: 0.8 });
  sentryBody = this.m({ color: "#3c4148", metalness: 0.6, roughness: 0.45 });
  sentryLed = this.m({ color: "#ff3020", emissive: "#ff2010", emissiveIntensity: 3 });
  flash = new THREE.MeshBasicMaterial({ color: "#ffd27a", transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
  boom = new THREE.MeshBasicMaterial({ color: "#ffb040", transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false });

  mesh(geo: THREE.BufferGeometry, mat: THREE.Material, sx: number, sy: number, sz: number, x: number, y: number, z: number, parent: THREE.Object3D, shadow = true) {
    const me = new THREE.Mesh(geo, mat);
    me.scale.set(sx, sy, sz);
    me.position.set(x, y, z);
    me.castShadow = shadow;
    parent.add(me);
    return me;
  }
  b(mat: THREE.Material, sx: number, sy: number, sz: number, x: number, y: number, z: number, parent: THREE.Object3D, shadow = true) {
    return this.mesh(this.box, mat, sx, sy, sz, x, y, z, parent, shadow);
  }
  dispose() {
    this.box.dispose();
    this.cyl.dispose();
    this.coin.dispose();
    this.mats.forEach((m) => m.dispose());
    this.flash.dispose();
    this.boom.dispose();
  }
}

export interface ZombieRig {
  root: THREE.Group;
  body: THREE.Group;
  torso: THREE.Mesh;
  head: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  belly: THREE.Mesh | null;
  hitMeshes: THREE.Mesh[];
}

export function buildZombie(L: Library, kind: ZombieKind, shadows: boolean): ZombieRig {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const skin = L.skin[kind];
  const shirt = L.shirt[kind];
  const hit: THREE.Mesh[] = [];
  const tag = (m: THREE.Mesh, part: "head" | "body") => {
    m.userData["part"] = part;
    hit.push(m);
    m.castShadow = shadows;
    return m;
  };
  const wide = kind === "tank" ? 1.25 : 1;
  // legs
  const leg = (x: number) => {
    const g = new THREE.Group();
    g.position.set(x, 0.86, 0);
    body.add(g);
    tag(L.b(kind === "tank" ? L.pantsDark : L.pants, 0.24 * wide, 0.82, 0.26, 0, -0.41, 0, g), "body");
    L.b(L.pantsDark, 0.26 * wide, 0.12, 0.34, 0, -0.8, 0.04, g, shadows);
    return g;
  };
  const legL = leg(-0.15 * wide);
  const legR = leg(0.15 * wide);
  // torso
  const torso = tag(L.b(shirt, 0.62 * wide, 0.72, 0.36 * wide, 0, 1.22, 0, body), "body");
  L.b(L.blood, 0.3, 0.25, 0.02, 0.1, 1.15, 0.185 * wide, body, false);
  L.b(skin, 0.2, 0.1, 0.05, -0.12, 0.92, 0.18 * wide, body, false);
  let belly: THREE.Mesh | null = null;
  if (kind === "exploder") {
    belly = tag(L.b(L.belly, 0.66, 0.5, 0.5, 0, 1.15, 0.12, body), "body");
    for (let i = 0; i < 4; i++) L.b(L.belly, 0.16, 0.16, 0.16, (i - 1.5) * 0.18, 1.45 + (i % 2) * 0.1, 0.2, body, false);
  }
  if (kind === "tank") {
    L.b(L.pantsDark, 0.9, 0.18, 0.5, 0, 1.6, 0, body);
    L.b(L.gunMid, 0.3, 0.3, 0.42, -0.5, 1.58, 0, body);
    L.b(L.gunMid, 0.3, 0.3, 0.42, 0.5, 1.58, 0, body);
  }
  // head
  const head = new THREE.Group();
  head.position.set(0, 1.62, 0.04);
  body.add(head);
  tag(L.b(skin, 0.4, 0.42, 0.4, 0, 0.21, 0, head), "head");
  L.b(L.hair, 0.42, 0.1, 0.42, 0, 0.44, -0.01, head, false);
  const eye = kind === "runner" ? L.eyeRed : kind === "exploder" ? L.eyeGreen : L.eyeDull;
  L.b(eye, 0.08, 0.06, 0.02, -0.09, 0.25, 0.205, head, false);
  L.b(eye, 0.08, 0.06, 0.02, 0.09, 0.25, 0.205, head, false);
  L.b(L.blood, 0.2, 0.06, 0.02, 0, 0.1, 0.205, head, false);
  // arms reaching forward
  const arm = (x: number) => {
    const g = new THREE.Group();
    g.position.set(x, 1.5, 0);
    body.add(g);
    tag(L.b(shirt, 0.18 * wide, 0.36, 0.18 * wide, 0, -0.18, 0, g), "body");
    tag(L.b(skin, 0.15 * wide, 0.36, 0.15 * wide, 0, -0.52, 0, g), "body");
    L.b(skin, 0.17 * wide, 0.12, 0.2, 0, -0.74, 0.02, g, false);
    g.rotation.x = -1.35;
    return g;
  };
  const armL = arm(-0.41 * wide);
  const armR = arm(0.41 * wide);
  return { root, body, torso, head, armL, armR, legL, legR, belly, hitMeshes: hit };
}

export interface ViewModel {
  group: THREE.Group;
  muzzle: THREE.Object3D;
}

export function buildViewModel(L: Library, id: WeaponId): ViewModel {
  const g = new THREE.Group();
  const C = (mat: THREE.Material, r: number, len: number, x: number, y: number, z: number) => {
    const m = L.mesh(L.cyl, mat, r * 2, len, r * 2, x, y, z, g, false);
    m.rotation.x = Math.PI / 2;
    return m;
  };
  const b = (mat: THREE.Material, sx: number, sy: number, sz: number, x: number, y: number, z: number, rx = 0) => {
    const m = L.b(mat, sx, sy, sz, x, y, z, g, false);
    m.rotation.x = rx;
    return m;
  };
  const muzzle = new THREE.Object3D();
  g.add(muzzle);
  if (id === "rifle") {
    b(L.gunDark, 0.07, 0.09, 0.42, 0, 0, -0.05);
    b(L.gunMid, 0.075, 0.07, 0.3, 0, 0.005, -0.38);
    for (let i = 0; i < 4; i++) b(L.gunDark, 0.08, 0.012, 0.03, 0, 0.045, -0.28 - i * 0.07);
    C(L.gunDark, 0.012, 0.28, 0, 0.01, -0.66);
    C(L.gunDark, 0.022, 0.06, 0, 0.01, -0.81);
    b(L.gunDark, 0.012, 0.07, 0.012, 0, 0.06, -0.5);
    b(L.gunDark, 0.05, 0.03, 0.18, 0, 0.065, -0.02);
    b(L.gunDark, 0.03, 0.05, 0.03, 0, 0.09, 0.05);
    b(L.sight, 0.006, 0.006, 0.004, 0, 0.098, 0.035);
    b(L.gunDark, 0.05, 0.16, 0.07, 0, -0.11, -0.12, 0.25);
    b(L.gunDark, 0.045, 0.11, 0.05, 0, -0.08, 0.08, -0.35);
    b(L.gunMid, 0.06, 0.08, 0.22, 0, -0.01, 0.25);
    b(L.gunDark, 0.065, 0.11, 0.04, 0, -0.025, 0.37);
    muzzle.position.set(0, 0.01, -0.86);
  } else if (id === "shotgun") {
    b(L.gunDark, 0.075, 0.09, 0.32, 0, 0, -0.02);
    C(L.gunDark, 0.022, 0.6, 0, 0.025, -0.45);
    C(L.gunMid, 0.018, 0.5, 0, -0.02, -0.4);
    b(L.gunWood, 0.07, 0.07, 0.18, 0, -0.025, -0.42);
    b(L.gunWood, 0.06, 0.1, 0.3, 0, -0.04, 0.27, -0.12);
    b(L.gunDark, 0.045, 0.1, 0.045, 0, -0.08, 0.1, -0.3);
    b(L.sight, 0.008, 0.008, 0.008, 0, 0.055, -0.73);
    muzzle.position.set(0, 0.025, -0.76);
  } else {
    b(L.gunDark, 0.05, 0.06, 0.26, 0, 0.02, -0.08);
    b(L.gunMid, 0.045, 0.03, 0.2, 0, -0.02, -0.1);
    b(L.gunDark, 0.045, 0.14, 0.06, 0, -0.08, 0.02, -0.25);
    b(L.gunDark, 0.008, 0.02, 0.008, 0, 0.06, -0.2);
    b(L.sight, 0.006, 0.006, 0.004, -0.012, 0.058, 0.03);
    b(L.sight, 0.006, 0.006, 0.004, 0.012, 0.058, 0.03);
    muzzle.position.set(0, 0.02, -0.22);
  }
  // Hands: right on grip, left support
  const handR = new THREE.Group();
  g.add(handR);
  const gripZ = id === "pistol" ? 0.02 : id === "shotgun" ? 0.1 : 0.08;
  L.b(L.glove, 0.07, 0.09, 0.1, 0.01, -0.1, gripZ + 0.02, handR, false);
  const armR = L.b(L.sleeve, 0.1, 0.1, 0.5, 0.06, -0.16, gripZ + 0.3, handR, false);
  armR.rotation.x = 0.35;
  armR.rotation.y = -0.15;
  const handL = new THREE.Group();
  g.add(handL);
  const supZ = id === "pistol" ? 0.0 : id === "shotgun" ? -0.42 : -0.38;
  L.b(L.glove, 0.08, 0.07, 0.11, -0.03, -0.06, supZ, handL, false);
  const armL = L.b(L.sleeve, 0.1, 0.1, 0.55, -0.16, -0.14, supZ + 0.28, handL, false);
  armL.rotation.y = 0.5;
  armL.rotation.x = 0.3;
  g.visible = false;
  return { group: g, muzzle };
}

export function buildSentry(L: Library, shadows: boolean) {
  const root = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const leg = L.b(L.gunDark, 0.06, 0.9, 0.06, Math.sin(a) * 0.3, 0.4, Math.cos(a) * 0.3, root, shadows);
    leg.rotation.set(Math.cos(a) * 0.45, 0, -Math.sin(a) * 0.45);
  }
  L.mesh(L.cyl, L.sentryBody, 0.3, 0.2, 0.3, 0, 0.85, 0, root, shadows);
  const head = new THREE.Group();
  head.position.y = 1.05;
  root.add(head);
  L.b(L.sentryBody, 0.36, 0.26, 0.5, 0, 0, 0, head, shadows);
  L.b(L.ammoBox, 0.16, 0.18, 0.24, 0.25, -0.02, 0.05, head, shadows);
  const barrel = L.mesh(L.cyl, L.gunDark, 0.06, 0.55, 0.06, 0, 0.03, 0.5, head, shadows);
  barrel.rotation.x = Math.PI / 2;
  L.b(L.sentryLed, 0.05, 0.05, 0.02, 0, 0.1, 0.26, head, false);
  const flash = L.b(L.flash, 0.22, 0.22, 0.3, 0, 0.03, 0.85, head, false);
  flash.visible = false;
  return { root, head, flash };
}
