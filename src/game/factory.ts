import * as THREE from "three";
import { makeOBB, type OBB } from "./physics";
import type { World } from "./world";

export const FACTORY_BOUND = 58;

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

export function buildFactoryWorld(shadows: boolean): World {
  const rand = rng(9821);
  const group = new THREE.Group();
  const colliders: OBB[] = [];
  const blockers: THREE.Mesh[] = [];
  const disposables: { dispose: () => void }[] = [];

  const box = new THREE.BoxGeometry(1, 1, 1);
  const cyl = new THREE.CylinderGeometry(0.5, 0.5, 1, 14);
  const sphere = new THREE.SphereGeometry(1, 8, 6);
  disposables.push(box, cyl, sphere);

  const mat = (p: THREE.MeshStandardMaterialParameters) => {
    const m = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0.15, ...p });
    disposables.push(m);
    return m;
  };

  // ---------------------------------------------------------------------------
  // Procedural Textures (Concrete, Ribbed Metal, Wood Grain, Hazard, Stencils)
  // ---------------------------------------------------------------------------
  // High-resolution concrete with expansion seams, tonal gradients & hairline stress cracks
  const concreteTex = canvasTex(512, (g, s) => {
    speckle("#393e46", 4500, 0.14)(g, s);
    // Subtle slab tonal gradients
    const grad = typeof g.createLinearGradient === "function" ? g.createLinearGradient(0, 0, s, s) : null;
    if (grad && typeof grad.addColorStop === "function") {
      grad.addColorStop(0, "rgba(255,255,255,0.03)");
      grad.addColorStop(0.5, "rgba(0,0,0,0.04)");
      grad.addColorStop(1, "rgba(0,0,0,0.08)");
      g.fillStyle = grad;
      g.fillRect(0, 0, s, s);
    }
    // Slab expansion joint borders
    g.strokeStyle = "rgba(18,22,28,0.75)";
    g.lineWidth = 3;
    g.strokeRect(0, 0, s, s);
    // Hairline stress fractures
    g.strokeStyle = "rgba(14,18,22,0.55)";
    g.lineWidth = 1;
    for (let i = 0; i < 5; i++) {
      g.beginPath();
      let x = Math.random() * s, y = Math.random() * s;
      g.moveTo(x, y);
      for (let k = 0; k < 4; k++) g.lineTo((x += (Math.random() - 0.5) * 45), (y += (Math.random() - 0.5) * 45));
      g.stroke();
    }
  }, 20);

  // Ribbed industrial wall panel sheet metal
  const panelTex = canvasTex(128, (g, s) => {
    speckle("#727882", 1400, 0.08)(g, s);
    g.fillStyle = "rgba(26,30,36,0.55)";
    for (let y = 0; y < s; y += 16) {
      g.fillRect(0, y, s, 3);
    }
    g.fillStyle = "rgba(16,18,22,0.7)";
    for (let x = 12; x < s; x += 32) {
      for (let y = 8; y < s; y += 16) {
        g.fillRect(x - 1, y - 1, 2, 2);
      }
    }
  }, 6);

  // Yellow and black warning stripes for hazard safety zones
  const hazardTex = canvasTex(64, (g, s) => {
    g.fillStyle = "#df9e1c";
    g.fillRect(0, 0, s, s);
    g.fillStyle = "#1e2024";
    for (let i = -s; i < s * 2; i += 16) {
      g.beginPath();
      g.moveTo(i, 0);
      g.lineTo(i + 8, 0);
      g.lineTo(i + 8 + s, s);
      g.lineTo(i + s, s);
      g.fill();
    }
  }, 4);

  // Weathered wooden planks texture for crates and pallets with distinct grain
  const woodTex = canvasTex(128, (g, s) => {
    g.fillStyle = "#765335";
    g.fillRect(0, 0, s, s);
    g.strokeStyle = "rgba(44,28,14,0.38)";
    g.lineWidth = 1;
    for (let y = 0; y < s; y += 4) {
      g.beginPath();
      g.moveTo(0, y + (Math.random() - 0.5) * 2);
      g.bezierCurveTo(s * 0.33, y + (Math.random() - 0.5) * 3, s * 0.66, y + (Math.random() - 0.5) * 3, s, y);
      g.stroke();
    }
    // Slat seams
    g.fillStyle = "rgba(22,14,6,0.65)";
    g.fillRect(0, 31, s, 2);
    g.fillRect(0, 63, s, 2);
    g.fillRect(0, 95, s, 2);
  }, 2);

  // Industrial signage texture helper for wall sector plaques
  const makeSignTex = (title: string, subtitle: string, bg = "#252b34", accent = "#d49822") => {
    return canvasTex(256, (g, s) => {
      g.fillStyle = bg;
      g.fillRect(0, 0, s, s / 2);
      // Outer border & corner mounting bolts
      g.strokeStyle = accent;
      g.lineWidth = 4;
      g.strokeRect(6, 6, s - 12, s / 2 - 12);
      g.fillStyle = "#111418";
      const boltCoords: [number, number][] = [[12, 12], [s - 12, 12], [12, s / 2 - 12], [s - 12, s / 2 - 12]];
      for (const [bx, by] of boltCoords) {
        g.beginPath();
        g.arc(bx, by, 3, 0, Math.PI * 2);
        g.fill();
      }
      // Text
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillStyle = "#f0ece4";
      g.font = "bold 20px sans-serif";
      g.fillText(title, s / 2, s / 4 - 8);
      g.fillStyle = accent;
      g.font = "bold 13px sans-serif";
      g.fillText(subtitle, s / 2, s / 4 + 16);
    });
  };

  const signTexWest = makeSignTex("SEKTÖR A", "PRES VE DÖKÜM SALONU");
  const signTexEast = makeSignTex("SEKTÖR B", "MONTAJ VE İŞLEME");
  const signTexDepot = makeSignTex("LOJİSTİK 03", "HAMMADDE VE KARGO");
  const signTexHazard = makeSignTex("⚡ TEHLİKE ⚡", "YÜKSEK GERİLİM HATTI", "#361614", "#ff4433");

  disposables.push(concreteTex, panelTex, hazardTex, woodTex, signTexWest, signTexEast, signTexDepot, signTexHazard);

  // ---------------------------------------------------------------------------
  // Materials Library
  // ---------------------------------------------------------------------------
  const M = {
    floor: mat({ map: concreteTex, color: "#8e949c", roughness: 0.65, metalness: 0.1 }),
    concretePlinth: mat({ color: "#3d424a", roughness: 0.85, metalness: 0.15 }),
    wallExterior: mat({ map: panelTex, color: "#9aa1ab", roughness: 0.65, metalness: 0.28 }),
    wallInterior: mat({ color: "#747b84", roughness: 0.75, metalness: 0.15 }),
    wallDark: mat({ color: "#2d3036", roughness: 0.82, metalness: 0.2 }),
    roof: mat({ color: "#202328", roughness: 0.9, metalness: 0.2 }),
    steelBeam: mat({ color: "#22252c", roughness: 0.42, metalness: 0.72 }),
    steelYellow: mat({ color: "#cf9422", roughness: 0.48, metalness: 0.45 }),
    pipe: mat({ color: "#323842", roughness: 0.38, metalness: 0.68 }),
    pipeYellow: mat({ color: "#c69224", roughness: 0.44, metalness: 0.48 }),
    pipeFlange: mat({ color: "#1a1d22", roughness: 0.4, metalness: 0.78 }),
    machineGreen: mat({ color: "#2a4832", roughness: 0.5, metalness: 0.35 }),
    machineDark: mat({ color: "#1a1d21", roughness: 0.45, metalness: 0.65 }),
    motorFins: mat({ color: "#13161a", roughness: 0.4, metalness: 0.8 }),
    consoleFace: mat({ color: "#242930", roughness: 0.6, metalness: 0.4 }),
    indGreen: mat({ color: "#20e050", emissive: "#20e050", emissiveIntensity: 2.8 }),
    indAmber: mat({ color: "#ffaa14", emissive: "#ffaa14", emissiveIntensity: 2.8 }),
    crateWood1: mat({ map: woodTex, color: "#8a6644", roughness: 0.9, metalness: 0.05 }),
    crateWood2: mat({ map: woodTex, color: "#725336", roughness: 0.92, metalness: 0.05 }), // Darker aged crate
    crateWood3: mat({ map: woodTex, color: "#9a744e", roughness: 0.88, metalness: 0.05 }), // Lighter pine crate
    palletWood: mat({ map: woodTex, color: "#926e48", roughness: 0.9, metalness: 0.05 }),
    ironBracket: mat({ color: "#14171b", roughness: 0.45, metalness: 0.85 }),
    barrelRed: mat({ color: "#a82424", roughness: 0.46, metalness: 0.35 }),
    barrelRedChipped: mat({ color: "#862020", roughness: 0.52, metalness: 0.4 }),
    barrelWhite: mat({ color: "#dedcd4", roughness: 0.55, metalness: 0.3 }),
    barrelBlue: mat({ color: "#26486a", roughness: 0.5, metalness: 0.4 }),
    barrelRing: mat({ color: "#181a1f", roughness: 0.38, metalness: 0.75 }),
    containerBlue: mat({ color: "#284666", roughness: 0.65, metalness: 0.35 }),
    containerRust: mat({ color: "#6a3720", roughness: 0.85, metalness: 0.25 }),
    glass: mat({ color: "#141d26", roughness: 0.2, metalness: 0.6, transparent: true, opacity: 0.72 }),
    glassBroken: mat({ color: "#192834", roughness: 0.15, metalness: 0.7, transparent: true, opacity: 0.82 }),
    puddle: mat({ color: "#18222c", roughness: 0.06, metalness: 0.45 }),
    contactShadow: mat({ color: "#0c0e12", roughness: 1.0, transparent: true, opacity: 0.55 }),
    oilGrime: mat({ color: "#0a0c10", roughness: 0.9, transparent: true, opacity: 0.65 }),
    drainGrate: mat({ color: "#1c2026", roughness: 0.5, metalness: 0.7 }),
    hazard: mat({ map: hazardTex, roughness: 0.55 }),
    trim: mat({ color: "#181a1e" }),
    beaconRed: mat({ color: "#ff2020", emissive: "#ff1818", emissiveIntensity: 3.5 }),
    emergencyLamp: mat({ color: "#ff281c", emissive: "#ff2014", emissiveIntensity: 2.6 }),
    floodBulb: mat({ color: "#ffbe54", emissive: "#ff9918", emissiveIntensity: 3.8 }),
    chimney: mat({ color: "#3a322e", roughness: 0.95 }),
    chimneyStripeRed: mat({ color: "#9c2c26", roughness: 0.85 }),
    chimneyStripeWhite: mat({ color: "#dedcd4", roughness: 0.85 }),
    smokeSoft: mat({ color: "#484f58", roughness: 0.95, transparent: true, opacity: 0.32 }),
    steamSoft: mat({ color: "#a0a8b4", roughness: 0.95, transparent: true, opacity: 0.28 }),
    signWest: mat({ map: signTexWest, roughness: 0.6 }),
    signEast: mat({ map: signTexEast, roughness: 0.6 }),
    signDepot: mat({ map: signTexDepot, roughness: 0.6 }),
    signHazard: mat({ map: signTexHazard, roughness: 0.55 }),
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

  const solidBox = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, ry = 0) => {
    const mesh = B(w, h, d, m, x, y, z, ry);
    blockers.push(mesh);
    colliders.push(makeOBB(x, z, w / 2, d / 2, ry));
    return mesh;
  };

  // ---------------------------------------------------------------------------
  // Concrete Ground & Organic Rain Puddles & Drainage Grates
  // Layering to eliminate Z-fighting:
  // ground 0.000 -> contactShadows/oil 0.006 -> grates/joints 0.008 -> puddles 0.012 -> hazard 0.018 -> pallets 0.020+
  // ---------------------------------------------------------------------------
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(FACTORY_BOUND * 2, FACTORY_BOUND * 2), M.floor);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = shadows;
  group.add(ground);

  // Contact Shadow Plane Helper (Soft ambient occlusion grounding objects to floor)
  const contactShadow = (w: number, d: number, x: number, z: number, ry = 0) => {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(w, d), M.contactShadow);
    p.rotation.x = -Math.PI / 2;
    p.rotation.z = ry;
    p.position.set(x, 0.006, z);
    group.add(p);
  };

  // Organic irregular puddles positioned in natural low-lying depressions
  const addOrganicPuddle = (cx: number, cz: number, rx: number, rz: number, seed: number) => {
    const shape = new THREE.Shape();
    const segments = 16;
    for (let i = 0; i < segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      const wobble = 1 + Math.sin(a * 3 + seed) * 0.22 + Math.cos(a * 5 + seed * 2) * 0.14;
      const px = Math.cos(a) * rx * wobble;
      const pz = Math.sin(a) * rz * wobble;
      if (i === 0) shape.moveTo(px, pz);
      else shape.lineTo(px, pz);
    }
    shape.closePath();
    const geom = new THREE.ShapeGeometry(shape);
    disposables.push(geom);
    const pMesh = new THREE.Mesh(geom, M.puddle);
    pMesh.rotation.x = -Math.PI / 2;
    pMesh.position.set(cx, 0.012, cz);
    pMesh.receiveShadow = shadows;
    group.add(pMesh);
  };

  addOrganicPuddle(-5, 5, 3.2, 2.1, 1.2);
  addOrganicPuddle(4, -3, 3.8, 2.6, 2.8);
  addOrganicPuddle(2, 9, 2.4, 1.6, 3.4);
  addOrganicPuddle(-8, -8, 2.9, 2.0, 4.1);
  addOrganicPuddle(7, -14, 2.8, 1.9, 5.5);
  addOrganicPuddle(-3, -17, 2.4, 1.6, 6.2);

  // Storm drainage slotted trench grates along building edges
  const drainTrench = (x: number, z: number, length: number, horizontal = false) => {
    const w = horizontal ? length : 0.7;
    const d = horizontal ? 0.7 : length;
    B(w, 0.005, d, M.drainGrate, x, 0.008, z);
  };
  drainTrench(-15, 0, 18, false);
  drainTrench(15, 0, 18, false);
  drainTrench(0, 23.5, 16, true);

  // Concrete expansion joint lines on the courtyard floor
  for (let z = -24; z <= 24; z += 8) {
    B(32, 0.005, 0.08, M.trim, 0, 0.008, z);
  }
  for (let x = -16; x <= 16; x += 8) {
    B(0.08, 0.005, 48, M.trim, x, 0.008, 0);
  }

  // Worn yellow safety stripes along loading bay thresholds
  B(15, 0.018, 1.0, M.hazard, -16.5, 0.018, 0);
  B(15, 0.018, 1.0, M.hazard, 16.5, 0.018, 0);
  B(1.0, 0.018, 14, M.hazard, 0, 0.018, 24);

  // Outer Perimeter Walls
  const P = FACTORY_BOUND - 1;
  solidBox(FACTORY_BOUND * 2, 8, 1.2, M.wallDark, 0, 4, -P);
  solidBox(FACTORY_BOUND * 2, 8, 1.2, M.wallDark, 0, 4, P);
  solidBox(1.2, 8, FACTORY_BOUND * 2, M.wallDark, -P, 4, 0);
  solidBox(1.2, 8, FACTORY_BOUND * 2, M.wallDark, P, 4, 0);

  // ---------------------------------------------------------------------------
  // Structural Helper Functions (Columns, Roof Trusses, Windows, Pipes)
  // ---------------------------------------------------------------------------
  const steelColumn = (x: number, z: number, height = 7.8) => {
    B(0.9, 0.1, 0.9, M.trim, x, 0.05, z);
    B(0.12, height, 0.6, M.steelBeam, x, height / 2, z);
    B(0.5, height, 0.12, M.steelBeam, x, height / 2, z - 0.26);
    B(0.5, height, 0.12, M.steelBeam, x, height / 2, z + 0.26);
    colliders.push(makeOBB(x, z, 0.45, 0.45));
  };

  const roofTruss = (x1: number, x2: number, z: number, y: number, depth = 1.3) => {
    const span = Math.abs(x2 - x1);
    const cx = (x1 + x2) / 2;
    B(span, 0.14, 0.14, M.steelBeam, cx, y, z);
    B(span, 0.14, 0.14, M.steelBeam, cx, y - depth, z);
    const panels = Math.max(3, Math.round(span / 2.6));
    const step = span / panels;
    for (let i = 0; i <= panels; i++) {
      const px = Math.min(x1, x2) + i * step;
      B(0.1, depth, 0.1, M.steelBeam, px, y - depth / 2, z);
      if (i < panels) {
        const diag = Math.hypot(step, depth);
        const ang = Math.atan2(depth, step);
        const dMesh = B(diag, 0.08, 0.08, M.steelBeam, px + step / 2, y - depth / 2, z);
        dMesh.rotation.z = (i % 2 === 0 ? 1 : -1) * ang;
      }
    }
  };

  const framedWindowBay = (wallX: number, zCenter: number, facingEast: boolean) => {
    const nx = facingEast ? 1 : -1;
    const wx = wallX + nx * 0.52;
    for (const dz of [-5, 0, 5]) {
      const z = zCenter + dz;
      B(0.1, 2.2, 3.4, M.trim, wx, 6.2, z);
      B(0.12, 2.2, 0.08, M.steelBeam, wx, 6.2, z - 0.9);
      B(0.12, 2.2, 0.08, M.steelBeam, wx, 6.2, z + 0.9);
      B(0.12, 0.08, 3.4, M.steelBeam, wx, 6.2, z);
      B(0.04, 0.95, 0.8, M.glass, wx, 6.7, z - 1.25);
      B(0.04, 0.95, 0.8, M.glass, wx, 6.7, z + 1.25);
      B(0.04, 0.95, 0.8, M.glass, wx, 6.7, z);
      const shard1 = B(0.04, 0.5, 0.7, M.glassBroken, wx, 5.45, z - 1.2);
      shard1.rotation.z = nx * 0.15;
      const shard2 = B(0.04, 0.35, 0.5, M.glassBroken, wx, 5.35, z + 1.15);
      shard2.rotation.z = -nx * 0.2;
    }
  };

  // ---------------------------------------------------------------------------
  // Realistic Industrial Props (Crates, Barrels, Machines, Pallets, Tool Cart)
  // Calibrated to ~1.7m human scale
  // ---------------------------------------------------------------------------
  const detailedPallet = (x: number, y: number, z: number, ry = 0) => {
    contactShadow(1.4, 1.0, x, z, ry);
    const pg = new THREE.Group();
    pg.position.set(x, y, z);
    pg.rotation.y = ry;
    for (const rz of [-0.35, 0, 0.35]) {
      B(1.2, 0.04, 0.08, M.palletWood, 0, 0.02, rz, 0, pg);
    }
    for (const rx of [-0.5, 0, 0.5]) {
      for (const rz of [-0.35, 0.35]) {
        B(0.12, 0.08, 0.12, M.palletWood, rx, 0.08, rz, 0, pg);
      }
    }
    for (const rx of [-0.5, -0.25, 0, 0.25, 0.5]) {
      B(0.16, 0.03, 0.8, M.palletWood, rx, 0.135, 0, 0, pg);
    }
    group.add(pg);
    return pg;
  };

  const detailedCrate = (w: number, h: number, d: number, x: number, y: number, z: number, ry = 0, variant: 1 | 2 | 3 = 1) => {
    if (y < 0.1) contactShadow(w * 1.15, d * 1.15, x, z, ry);
    const crateMat = variant === 2 ? M.crateWood2 : variant === 3 ? M.crateWood3 : M.crateWood1;
    const cg = new THREE.Group();
    cg.position.set(x, y + h / 2, z);
    cg.rotation.y = ry;
    // Inner box
    B(w - 0.06, h - 0.06, d - 0.06, crateMat, 0, 0, 0, 0, cg);
    const slatT = 0.04;
    const slatW = 0.12;
    for (const side of [-1, 1]) {
      const fz = side * (d / 2 - slatT / 2);
      B(w, slatW, slatT, M.palletWood, 0, h / 2 - slatW / 2, fz, 0, cg);
      B(w, slatW, slatT, M.palletWood, 0, -h / 2 + slatW / 2, fz, 0, cg);
      B(slatW, h, slatT, M.palletWood, -w / 2 + slatW / 2, 0, fz, 0, cg);
      B(slatW, h, slatT, M.palletWood, w / 2 - slatW / 2, 0, fz, 0, cg);
      const diag = Math.hypot(w - slatW * 2, h - slatW * 2);
      const ang = Math.atan2(h - slatW * 2, w - slatW * 2);
      const x1 = B(diag, slatW * 0.8, slatT * 0.9, M.palletWood, 0, 0, fz, 0, cg);
      x1.rotation.z = ang;
      const x2 = B(diag, slatW * 0.8, slatT * 0.9, M.palletWood, 0, 0, fz, 0, cg);
      x2.rotation.z = -ang;
    }
    // Iron corner brackets
    for (const cx of [-w / 2, w / 2]) {
      for (const cy of [-h / 2, h / 2]) {
        for (const cz of [-d / 2, d / 2]) {
          B(0.18, 0.18, 0.18, M.ironBracket, cx, cy, cz, 0, cg);
        }
      }
    }
    group.add(cg);
    blockers.push(cg as unknown as THREE.Mesh);
    colliders.push(makeOBB(x, z, w / 2, d / 2, ry));
    return cg;
  };

  // 55-Gallon Drum (0.95m tall, 0.62m diam, human waist height)
  const oilDrum = (x: number, y: number, z: number, bodyMat: THREE.Material) => {
    if (y < 0.1) contactShadow(0.8, 0.8, x, z);
    const dg = new THREE.Group();
    dg.position.set(x, y + 0.475, z);
    C(0.31, 0.95, bodyMat, 0, 0, 0, dg);
    C(0.325, 0.04, M.barrelRing, 0, 0.16, 0, dg);
    C(0.325, 0.04, M.barrelRing, 0, -0.16, 0, dg);
    C(0.32, 0.035, M.barrelRing, 0, 0.46, 0, dg);
    B(0.06, 0.03, 0.06, M.ironBracket, 0.14, 0.485, 0.08, 0.4, dg);
    group.add(dg);
    return dg;
  };

  const barrelPalletCluster = (cx: number, cz: number, ry = 0) => {
    detailedPallet(cx, 0, cz, ry);
    const drums: [number, number, THREE.Material][] = [
      [-0.32, -0.18, M.barrelRed],
      [0.32, -0.18, M.barrelRedChipped],
      [-0.32, 0.18, M.barrelWhite],
      [0.32, 0.18, M.barrelBlue],
    ];
    for (const [ox, oz, bMat] of drums) {
      const cos = Math.cos(ry), sin = Math.sin(ry);
      const wx = cx + ox * cos - oz * sin;
      const wz = cz + ox * sin + oz * cos;
      oilDrum(wx, 0.15, wz, bMat);
    }
    const colMesh = B(1.3, 1.1, 0.9, M.trim, cx, 0.55, cz, ry);
    colMesh.visible = false;
    blockers.push(colMesh);
    colliders.push(makeOBB(cx, cz, 0.7, 0.5, ry));
  };

  // Industrial Heavy Machinery with Motors, Conduit, and Illuminated Consoles
  const industrialMachine = (x: number, z: number, ry: number, isPress = false) => {
    contactShadow(3.8, 2.2, x, z, ry);
    const mg = new THREE.Group();
    mg.position.set(x, 0, z);
    mg.rotation.y = ry;

    B(3.4, 0.9, 1.8, M.machineGreen, 0, 0.45, 0, 0, mg);
    B(3.5, 0.12, 1.9, M.machineDark, 0, 0.91, 0, 0, mg);

    if (isPress) {
      B(1.4, 2.6, 1.6, M.machineGreen, -0.6, 2.2, 0, 0, mg);
      B(0.8, 0.9, 0.8, M.steelBeam, -0.6, 1.25, 0, 0, mg);
      B(1.2, 0.4, 1.4, M.hazard, -0.6, 0.95, 0, 0, mg);
      const mot = C(0.42, 1.1, M.machineDark, -0.6, 3.8, 0, mg);
      mot.rotation.z = Math.PI / 2;
      C(0.45, 0.12, M.motorFins, -0.9, 3.8, 0, mg).rotation.z = Math.PI / 2;
      C(0.45, 0.12, M.motorFins, -0.3, 3.8, 0, mg).rotation.z = Math.PI / 2;
    } else {
      B(1.6, 1.4, 1.5, M.machineDark, -0.8, 1.6, 0, 0, mg);
      C(0.35, 1.2, M.steelBeam, 0.3, 1.4, 0, mg).rotation.z = Math.PI / 2;
      const mot = C(0.38, 0.9, M.machineDark, -1.8, 0.6, 0, mg);
      mot.rotation.z = Math.PI / 2;
    }

    // Operator control console
    B(0.45, 1.1, 0.45, M.trim, 1.3, 0.55, 0.65, 0, mg);
    const face = B(0.46, 0.35, 0.46, M.consoleFace, 1.3, 1.15, 0.65, 0, mg);
    face.rotation.x = -0.35;
    B(0.06, 0.06, 0.02, M.indGreen, 1.2, 1.22, 0.82, 0, mg);
    B(0.06, 0.06, 0.02, M.indAmber, 1.35, 1.22, 0.82, 0, mg);

    // Connecting yellow conduit line
    const feedPipe = C(0.12, 1.8, M.pipeYellow, -1.2, 1.8, -0.7, mg);
    feedPipe.rotation.x = 0.25;

    group.add(mg);
    blockers.push(mg as unknown as THREE.Mesh);
    colliders.push(makeOBB(x, z, 1.8, 1.1, ry));
    return mg;
  };

  // Abandoned Industrial Service Tool Cart / Handcart (Tekerlekli takım arabası)
  const toolTrolley = (x: number, z: number, ry: number) => {
    contactShadow(1.2, 0.8, x, z, ry);
    const tg = new THREE.Group();
    tg.position.set(x, 0, z);
    tg.rotation.y = ry;
    // 4 vertical tubular legs & caster wheels
    for (const lx of [-0.4, 0.4]) {
      for (const lz of [-0.25, 0.25]) {
        C(0.03, 0.85, M.steelBeam, lx, 0.45, lz, tg);
        C(0.06, 0.04, M.trim, lx, 0.05, lz, tg);
      }
    }
    // Bottom & top metal tray shelves
    B(0.9, 0.04, 0.6, M.machineGreen, 0, 0.16, 0, 0, tg);
    B(0.9, 0.04, 0.6, M.machineGreen, 0, 0.85, 0, 0, tg);
    // Push handle rail
    B(0.04, 0.25, 0.6, M.steelBeam, 0.45, 0.98, 0, 0, tg);
    // Small tools on top: oil squirt can and wrench
    C(0.05, 0.16, M.barrelRed, -0.2, 0.95, 0.1, tg);
    B(0.25, 0.02, 0.06, M.ironBracket, 0.1, 0.88, -0.1, 0.3, tg);

    group.add(tg);
    blockers.push(tg as unknown as THREE.Mesh);
    colliders.push(makeOBB(x, z, 0.5, 0.35, ry));
  };

  // Spilled / broken crate with scattered cargo on the loading dock
  const spilledCargo = (x: number, z: number) => {
    // Broken open crate body tipped
    const bCrate = detailedCrate(1.1, 0.9, 1.1, x, 0, z, 0.35, 2);
    bCrate.rotation.z = 0.15;
    // Loose wooden slats on floor
    B(0.9, 0.03, 0.14, M.palletWood, x + 1.1, 0.02, z - 0.3, 0.5);
    B(0.8, 0.03, 0.14, M.palletWood, x + 0.8, 0.02, z + 0.6, -0.4);
    // Machined steel gear and shaft cylinders spilled on concrete
    const g1 = C(0.24, 0.1, M.ironBracket, x + 1.2, 0.05, z + 0.2);
    g1.rotation.z = Math.PI / 2;
    C(0.12, 0.45, M.steelBeam, x + 1.6, 0.06, z - 0.1).rotation.x = Math.PI / 2;
    C(0.18, 0.08, M.steelBeam, x + 0.9, 0.04, z + 0.9);
  };

  // Foreground loading dock staging (just ahead of spawn)
  toolTrolley(-2.2, 10.5, 0.2);
  spilledCargo(3.2, 11.2);

  // ---------------------------------------------------------------------------
  // 1. WEST PRODUCTION HALL (Batı Üretim Salonu - x: [-48, -16], z: [-28, 28])
  // ---------------------------------------------------------------------------
  B(32, 0.6, 56, M.roof, -32, 8.3, 0);
  solidBox(32, 8, 1.2, M.wallExterior, -32, 4, 28);
  solidBox(32, 8, 1.2, M.wallExterior, -32, 4, -28);
  solidBox(1.2, 8, 56, M.wallExterior, -48, 4, 0);

  // Plinth
  solidBox(1.2, 1.4, 7, M.concretePlinth, -16, 0.7, -17.5);
  solidBox(1.2, 1.4, 7, M.concretePlinth, -16, 0.7, 17.5);

  // Facade facing courtyard (x = -16): 15m wide open portal
  solidBox(1.2, 8, 5.5, M.wallExterior, -16, 4, -18.25);
  solidBox(1.2, 8, 5.5, M.wallExterior, -16, 4, 18.25);
  solidBox(1.2, 8, 3.5, M.wallExterior, -16, 4, -26.25);
  solidBox(1.2, 8, 3.5, M.wallExterior, -16, 4, 26.25);

  solidBox(1.2, 2.5, 15, M.wallExterior, -16, 6.75, 0);
  B(1.6, 0.9, 15.6, M.trim, -16, 5.2, 0);
  solidBox(1.2, 3.5, 6, M.wallExterior, -16, 6.25, -12.5);
  solidBox(1.2, 3.5, 6, M.wallExterior, -16, 6.25, 12.5);

  // Wall Signage above portal
  const signWestMesh = B(0.08, 0.9, 2.8, M.signWest, -15.3, 6.2, 0);
  signWestMesh.castShadow = false;

  // Fire Hose Reel on column
  C(0.35, 0.18, M.barrelRed, -15.4, 2.2, -7.5).rotation.z = Math.PI / 2;

  // Columns & Trusses
  steelColumn(-16, -7.5, 7.8);
  steelColumn(-16, 7.5, 7.8);
  steelColumn(-16, -15.5, 7.8);
  steelColumn(-16, 15.5, 7.8);
  steelColumn(-28, -12, 8.0);
  steelColumn(-28, 0, 8.0);
  steelColumn(-28, 12, 8.0);
  steelColumn(-40, -12, 8.0);
  steelColumn(-40, 12, 8.0);

  roofTruss(-16, -48, -12, 8.0, 1.4);
  roofTruss(-16, -48, 0, 8.0, 1.4);
  roofTruss(-16, -48, 12, 8.0, 1.4);

  framedWindowBay(-16, -18.25, true);
  framedWindowBay(-16, 18.25, true);

  // Machines inside West Hall
  industrialMachine(-26, 0, Math.PI / 2, true);
  industrialMachine(-36, -8, 0, false);
  industrialMachine(-36, 12, 0, true);

  detailedCrate(1.8, 1.8, 1.8, -44, 0, -6, 0.1, 1);
  detailedCrate(1.4, 1.4, 1.4, -44, 0, 6, -0.15, 3);
  barrelPalletCluster(-28, 20, 0.3);

  // ---------------------------------------------------------------------------
  // 2. EAST PRODUCTION HALL (Doğu Üretim Salonu - x: [16, 48], z: [-28, 28])
  // ---------------------------------------------------------------------------
  B(32, 0.6, 56, M.roof, 32, 8.3, 0);
  solidBox(32, 8, 1.2, M.wallExterior, 32, 4, 28);
  solidBox(32, 8, 1.2, M.wallExterior, 32, 4, -28);
  solidBox(1.2, 8, 56, M.wallExterior, 48, 4, 0);

  solidBox(1.2, 1.4, 7, M.concretePlinth, 16, 0.7, -17.5);
  solidBox(1.2, 1.4, 7, M.concretePlinth, 16, 0.7, 17.5);

  solidBox(1.2, 8, 5.5, M.wallExterior, 16, 4, -18.25);
  solidBox(1.2, 8, 5.5, M.wallExterior, 16, 4, 18.25);
  solidBox(1.2, 8, 3.5, M.wallExterior, 16, 4, -26.25);
  solidBox(1.2, 8, 3.5, M.wallExterior, 16, 4, 26.25);

  solidBox(1.2, 2.5, 15, M.wallExterior, 16, 6.75, 0);
  B(1.6, 0.9, 15.6, M.trim, 16, 5.2, 0);
  solidBox(1.2, 3.5, 6, M.wallExterior, 16, 6.25, -12.5);
  solidBox(1.2, 3.5, 6, M.wallExterior, 16, 6.25, 12.5);

  // Wall Signage above East portal
  const signEastMesh = B(0.08, 0.9, 2.8, M.signEast, 15.3, 6.2, 0);
  signEastMesh.castShadow = false;

  // Electrical Breaker Cabinet on column
  B(0.3, 0.9, 0.6, M.trim, 15.4, 2.1, 7.5);
  B(0.06, 0.06, 0.02, M.indAmber, 15.2, 2.3, 7.5);

  steelColumn(16, -7.5, 7.8);
  steelColumn(16, 7.5, 7.8);
  steelColumn(16, -15.5, 7.8);
  steelColumn(16, 15.5, 7.8);
  steelColumn(28, -12, 8.0);
  steelColumn(28, 0, 8.0);
  steelColumn(28, 12, 8.0);
  steelColumn(40, -12, 8.0);
  steelColumn(40, 12, 8.0);

  roofTruss(16, 48, -12, 8.0, 1.4);
  roofTruss(16, 48, 0, 8.0, 1.4);
  roofTruss(16, 48, 12, 8.0, 1.4);

  framedWindowBay(16, -18.25, false);
  framedWindowBay(16, 18.25, false);

  industrialMachine(26, 0, -Math.PI / 2, true);
  industrialMachine(36, -8, 0, false);
  industrialMachine(36, 12, 0, false);

  detailedCrate(1.8, 1.8, 1.8, 44, 0, 6, -0.2, 2);
  detailedCrate(1.4, 1.4, 1.4, 44, 0, -6, 0.15, 1);
  barrelPalletCluster(28, -20, -0.3);

  // ---------------------------------------------------------------------------
  // 3. CENTRAL COURTYARD & OVERHEAD PIPE GANTRY (Ana Avlu)
  // ---------------------------------------------------------------------------
  const gantryZ = -4.0;
  steelColumn(-14, gantryZ, 7.2);
  steelColumn(14, gantryZ, 7.2);

  B(30, 0.55, 0.9, M.steelBeam, 0, 6.6, gantryZ);
  B(30, 0.55, 0.9, M.steelBeam, 0, 6.6, gantryZ + 2.4);

  for (let gx = -12; gx <= 12; gx += 4) {
    B(0.3, 0.2, 2.4, M.steelBeam, gx, 6.6, gantryZ + 1.2);
  }

  // Steam pipe with 90° elbows descending into buildings
  const pipe1 = C(0.32, 28, M.pipe, 0, 7.2, gantryZ);
  pipe1.rotation.z = Math.PI / 2;
  for (const fx of [-10, -4, 4, 10]) {
    const flg = C(0.38, 0.14, M.pipeFlange, fx, 7.2, gantryZ);
    flg.rotation.z = Math.PI / 2;
  }
  const elbowW = C(0.32, 0.32, M.pipe, -14.2, 7.2, gantryZ);
  elbowW.rotation.x = Math.PI / 4;
  C(0.32, 1.4, M.pipe, -14.3, 7.9, gantryZ);
  C(0.32, 2.2, M.pipe, -16.0, 7.0, gantryZ).rotation.z = 0;

  const elbowE = C(0.32, 0.32, M.pipe, 14.2, 7.2, gantryZ);
  elbowE.rotation.x = Math.PI / 4;
  C(0.32, 1.4, M.pipe, 14.3, 7.9, gantryZ);
  C(0.32, 2.2, M.pipe, 16.0, 7.0, gantryZ).rotation.z = 0;

  // Yellow chemical pipe
  const pipe2 = C(0.24, 28, M.pipeYellow, 0, 7.2, gantryZ + 2.4);
  pipe2.rotation.z = Math.PI / 2;
  for (const fx of [-8, 0, 8]) {
    const flg = C(0.29, 0.12, M.pipeFlange, fx, 7.2, gantryZ + 2.4);
    flg.rotation.z = Math.PI / 2;
  }
  for (const hx of [-9, -3, 3, 9]) {
    C(0.04, 0.7, M.steelBeam, hx, 6.9, gantryZ);
    C(0.04, 0.7, M.steelBeam, hx, 6.9, gantryZ + 2.4);
  }

  // Steam pressure relief valve on pipe
  C(0.08, 0.45, M.steelBeam, 2.0, 7.6, gantryZ);
  const steamVentNozzle = C(0.12, 0.2, M.pipeFlange, 2.0, 7.85, gantryZ);

  // Tactical Courtyard Cover
  contactShadow(3.6, 7.0, -6.5, -8);
  solidBox(3.0, 2.6, 6.4, M.containerBlue, -6.5, 1.3, -8);

  detailedCrate(1.3, 1.1, 1.3, 6.5, 0, 4, 0.25, 1);
  detailedCrate(1.1, 1.1, 1.1, 6.5, 1.1, 4, 0.05, 3);
  detailedCrate(1.4, 1.2, 1.4, 7.0, 0, -6, -0.2, 2);

  barrelPalletCluster(6.8, -1.5, 0.2);
  barrelPalletCluster(-7.2, 6.0, -0.4);

  // ---------------------------------------------------------------------------
  // 4. NORTH WAREHOUSE & CARGO DEPOT (x: [-20, 20], z: [24, 48])
  // ---------------------------------------------------------------------------
  B(40, 0.5, 24, M.roof, 0, 7.4, 36);
  solidBox(40, 7.2, 1.2, M.wallDark, 0, 3.6, 48);
  solidBox(1.2, 7.2, 24, M.wallDark, -20, 3.6, 36);
  solidBox(1.2, 7.2, 24, M.wallDark, 20, 3.6, 36);

  solidBox(7, 7.2, 1.2, M.wallExterior, -13.5, 3.6, 24);
  solidBox(7, 7.2, 1.2, M.wallExterior, 13.5, 3.6, 24);
  solidBox(16, 2.5, 1.2, M.wallExterior, 0, 5.95, 24);
  B(16.4, 0.8, 1.5, M.trim, 0, 4.7, 24);

  // Depot Signage
  const signDepotMesh = B(2.8, 0.9, 0.08, M.signDepot, 0, 6.2, 23.3);
  signDepotMesh.castShadow = false;

  contactShadow(3.8, 7.6, -8, 38);
  solidBox(3.2, 2.8, 7.2, M.containerBlue, -8, 1.4, 38);
  contactShadow(3.6, 7.0, 8, 38);
  solidBox(3.0, 2.6, 6.6, M.containerRust, 8, 1.3, 38);
  detailedCrate(1.6, 1.4, 1.6, 0, 0, 42, 0.1, 2);

  // ---------------------------------------------------------------------------
  // 5. SOUTH SUBSTATION & ESCAPE CORRIDORS (x: [-22, 22], z: [-48, -26])
  // ---------------------------------------------------------------------------
  contactShadow(4.2, 3.8, -8, -36);
  solidBox(3.8, 2.8, 3.4, M.machineDark, -8, 1.4, -36);
  contactShadow(4.2, 3.8, 8, -36);
  solidBox(3.8, 2.8, 3.4, M.machineDark, 8, 1.4, -36);

  // High Voltage Hazard Warning Sign on transformer
  const hazardSign = B(1.4, 0.7, 0.08, M.signHazard, -8, 2.1, -34.2);
  hazardSign.castShadow = false;

  const pSouth = C(0.38, 22, M.pipe, 0, 4.8, -36);
  pSouth.rotation.z = Math.PI / 2;

  // ---------------------------------------------------------------------------
  // 6. BACKGROUND SKYLINE: CHIMNEYS & SILOS & ROOF VENTILATION
  // ---------------------------------------------------------------------------
  const buildSmokestack = (x: number, z: number, height: number) => {
    const stack = C(2.2, height, M.chimney, x, height / 2, z);
    stack.castShadow = shadows;
    C(2.35, 2.4, M.chimneyStripeRed, x, height - 3.6, z);
    C(2.35, 2.4, M.chimneyStripeWhite, x, height - 1.2, z);
    B(0.5, 0.5, 0.5, M.beaconRed, x, height + 0.35, z);
  };
  buildSmokestack(-10, -52, 38);
  buildSmokestack(10, -53, 36);

  C(4.2, 16, M.pipe, -42, 8, -44);
  C(3.6, 14, M.pipeYellow, 42, 7, -44);
  C(4.0, 16, M.pipe, -44, 8, 44);
  C(3.6, 14, M.pipeYellow, 44, 7, 44);

  // Animated Rooftop Ventilators with rotating fan blades
  const fanRotors: THREE.Mesh[] = [];
  const roofVentUnit = (x: number, y: number, z: number, ry = 0) => {
    B(2.8, 1.4, 3.2, M.wallDark, x, y + 0.7, z, ry);
    C(0.8, 0.3, M.steelBeam, x, y + 1.55, z);
    C(0.28, 0.36, M.machineDark, x, y + 1.58, z);
    B(2.84, 0.8, 0.1, M.trim, x, y + 0.8, z + 1.61, ry);
    // 3-blade industrial fan rotor inside cowl
    const rotor = B(1.3, 0.04, 0.14, M.steelBeam, x, y + 1.65, z);
    rotor.castShadow = false;
    fanRotors.push(rotor);
  };
  roofVentUnit(-30, 8.6, -10, 0);
  roofVentUnit(-38, 8.6, 12, Math.PI / 2);
  roofVentUnit(30, 8.6, 10, 0);
  roofVentUnit(38, 8.6, -12, -Math.PI / 2);
  roofVentUnit(0, 7.6, 40, 0);

  // ---------------------------------------------------------------------------
  // 7. ANIMATED CHIMNEY SMOKE & STEAM VENT PARTICLES (Yaşanmışlık ve Hareket)
  // Gentle low-poly smoke puffs drifting from smokestacks into the night sky
  // ---------------------------------------------------------------------------
  const SMOKE_COUNT = 16;
  const smokePuffs: { mesh: THREE.Mesh; basePos: THREE.Vector3; speedY: number; driftX: number; life: number; maxLife: number }[] = [];

  for (let i = 0; i < SMOKE_COUNT; i++) {
    const isStack1 = i % 2 === 0;
    const startX = isStack1 ? -10 + (rand() - 0.5) * 0.8 : 10 + (rand() - 0.5) * 0.8;
    const startZ = isStack1 ? -52 + (rand() - 0.5) * 0.8 : -53 + (rand() - 0.5) * 0.8;
    const startY = isStack1 ? 38.5 : 36.5;

    const sm = new THREE.Mesh(sphere, M.smokeSoft);
    sm.castShadow = false;
    sm.receiveShadow = false;
    sm.position.set(startX, startY + (i / SMOKE_COUNT) * 14, startZ);
    const s = 1.2 + rand() * 1.4;
    sm.scale.set(s, s * 0.75, s);
    group.add(sm);

    smokePuffs.push({
      mesh: sm,
      basePos: new THREE.Vector3(startX, startY, startZ),
      speedY: 2.2 + rand() * 1.0,
      driftX: 0.6 + rand() * 0.4,
      life: (i / SMOKE_COUNT) * 6.0,
      maxLife: 6.0,
    });
  }

  // Steam puffs from courtyard pipe relief valve
  const STEAM_COUNT = 6;
  const steamPuffs: { mesh: THREE.Mesh; life: number; maxLife: number }[] = [];
  for (let i = 0; i < STEAM_COUNT; i++) {
    const stm = new THREE.Mesh(sphere, M.steamSoft);
    stm.castShadow = false;
    stm.receiveShadow = false;
    stm.position.set(2.0, 7.9, gantryZ);
    stm.scale.set(0.3, 0.3, 0.3);
    group.add(stm);
    steamPuffs.push({
      mesh: stm,
      life: (i / STEAM_COUNT) * 2.5,
      maxLife: 2.5,
    });
  }

  // ---------------------------------------------------------------------------
  // 8. LIGHTING ARCHITECTURE (Aydınlatma & Işık Havuzları)
  // - Cold blue moonlight outdoors
  // - Warm golden sodium glow inside West & East halls
  // - Warm floodlight pools on courtyard floor
  // - Subtle pulsing red emergency beacons at portals & chimney crests
  // ---------------------------------------------------------------------------
  const lampLights: THREE.PointLight[] = [];

  const yardPole = (x: number, z: number) => {
    C(0.14, 6.8, M.steelBeam, x, 3.4, z);
    B(0.65, 0.28, 0.75, M.trim, x, 6.7, z);
    B(0.5, 0.12, 0.6, M.floodBulb, x, 6.55, z).castShadow = false;
    colliders.push(makeOBB(x, z, 0.25, 0.25));

    const light = new THREE.PointLight("#ffaa38", 22, 26, 1.4);
    light.position.set(x, 6.2, z);
    light.userData["baseIntensity"] = 22;
    group.add(light);
    lampLights.push(light);
  };
  yardPole(-12, -12);
  yardPole(12, 12);
  yardPole(-12, 12);
  yardPole(12, -12);

  const addHighBayLight = (x: number, y: number, z: number, col = "#ffb84a") => {
    C(0.6, 0.45, M.steelBeam, x, y + 0.2, z);
    C(0.3, 0.12, M.floodBulb, x, y - 0.05, z).castShadow = false;
    C(0.04, 0.8, M.steelBeam, x, y + 0.7, z);

    const l = new THREE.PointLight(col, 22, 24, 1.5);
    l.position.set(x, y - 0.3, z);
    l.userData["baseIntensity"] = 22;
    group.add(l);
    lampLights.push(l);
  };

  addHighBayLight(-28, 6.8, 0, "#ffb84a");
  addHighBayLight(-28, 6.8, -12, "#ffa834");
  addHighBayLight(-28, 6.8, 12, "#ffba52");
  addHighBayLight(-40, 6.8, 0, "#ffaa38");

  addHighBayLight(28, 6.8, 0, "#ffb84a");
  addHighBayLight(28, 6.8, -12, "#ffa834");
  addHighBayLight(28, 6.8, 12, "#ffba52");
  addHighBayLight(40, 6.8, 0, "#ffaa38");

  addHighBayLight(0, 6.2, 36, "#ffb042");

  const addEmergencyBeacon = (x: number, y: number, z: number) => {
    B(0.35, 0.35, 0.15, M.trim, x, y, z);
    B(0.24, 0.24, 0.22, M.emergencyLamp, x, y, z + (z > 0 ? -0.12 : 0.12));
    const l = new THREE.PointLight("#ff2418", 14, 16, 1.8);
    l.position.set(x, y, z);
    l.userData["baseIntensity"] = 14;
    l.userData["pulse"] = true;
    group.add(l);
    lampLights.push(l);
  };
  addEmergencyBeacon(-15.8, 5.6, 0);
  addEmergencyBeacon(15.8, 5.6, 0);
  addEmergencyBeacon(0, 5.2, 23.4);
  addEmergencyBeacon(0, 6.9, gantryZ);

  // ---------------------------------------------------------------------------
  // 9. SPAWN POINTS & PLAYER START
  // ---------------------------------------------------------------------------
  const playerSpawn = { x: 0, z: 14 };

  const spawnPoints: THREE.Vector2[] = [
    new THREE.Vector2(-42, -18),
    new THREE.Vector2(-42, 0),
    new THREE.Vector2(-42, 18),
    new THREE.Vector2(-28, -20),
    new THREE.Vector2(-28, 20),
    new THREE.Vector2(42, -18),
    new THREE.Vector2(42, 0),
    new THREE.Vector2(42, 18),
    new THREE.Vector2(28, -20),
    new THREE.Vector2(28, 20),
    new THREE.Vector2(-12, 40),
    new THREE.Vector2(0, 44),
    new THREE.Vector2(12, 40),
    new THREE.Vector2(-14, -42),
    new THREE.Vector2(0, -44),
    new THREE.Vector2(14, -42),
    new THREE.Vector2(-12, -14),
    new THREE.Vector2(12, -14),
  ];

  // ---------------------------------------------------------------------------
  // 10. REAL-TIME AMBIENT ANIMATION HOOK (world.update)
  // Gentle smoke drift from chimneys, pipe steam venting, and spinning chiller fan blades
  // ---------------------------------------------------------------------------
  const update = (dt: number, time: number) => {
    // Spin rooftop chiller fans
    for (let i = 0; i < fanRotors.length; i++) {
      const rotor = fanRotors[i];
      if (rotor) rotor.rotation.y = time * 3.5 + i * 1.2;
    }

    // Drift smokestack puffs
    for (const sp of smokePuffs) {
      sp.life += dt;
      if (sp.life >= sp.maxLife) {
        sp.life -= sp.maxLife;
        sp.mesh.position.copy(sp.basePos);
      }
      const progress = sp.life / sp.maxLife;
      sp.mesh.position.y = sp.basePos.y + progress * 16;
      sp.mesh.position.x = sp.basePos.x + progress * sp.driftX * 4;
      const scale = 1.4 + progress * 2.8;
      sp.mesh.scale.set(scale, scale * 0.75, scale);
      (sp.mesh.material as THREE.MeshStandardMaterial).opacity = Math.max(0, 0.32 * (1 - progress));
    }

    // Intermittent steam relief valve puffs
    for (let i = 0; i < steamPuffs.length; i++) {
      const st = steamPuffs[i];
      if (!st) continue;
      st.life += dt;
      if (st.life >= st.maxLife) {
        st.life -= st.maxLife;
        st.mesh.position.set(2.0, 7.9, gantryZ);
      }
      const progress = st.life / st.maxLife;
      st.mesh.position.y = 7.9 + progress * 2.4;
      st.mesh.position.x = 2.0 + Math.sin(time * 3 + i) * 0.3;
      const s = 0.3 + progress * 0.9;
      st.mesh.scale.set(s, s * 1.2, s);
      (st.mesh.material as THREE.MeshStandardMaterial).opacity = Math.max(0, 0.28 * (1 - progress));
    }
  };

  return {
    group,
    colliders,
    blockers,
    spawnPoints,
    lampLights,
    playerSpawn,
    fogColor: "#141820",
    fogDensity: 0.024,
    bound: FACTORY_BOUND,
    update,
    dispose: () => disposables.forEach((d) => d.dispose()),
  };
}
