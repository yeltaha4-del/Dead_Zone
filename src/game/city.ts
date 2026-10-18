import * as THREE from "three";
import { makeOBB, type OBB } from "./physics";
import type { World } from "./world";
import type { Quality } from "./config";

export const BOUND = 62;

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function canvasTex(size: number, draw: (g: CanvasRenderingContext2D, s: number) => void, repeat = 1, anisotropy = 4) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d");
  if (g) draw(g, size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = anisotropy;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  return t;
}

function bumpTex(size: number, draw: (g: CanvasRenderingContext2D, s: number) => void, repeat = 1, anisotropy = 4) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d");
  if (g) draw(g, size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.colorSpace = THREE.NoColorSpace;
  t.anisotropy = anisotropy;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

export function buildCityWorld(shadows: boolean, quality: Quality = "medium"): World {
  const rand = rng(4242);
  const group = new THREE.Group();
  const colliders: OBB[] = [];
  const blockers: THREE.Mesh[] = [];
  const lampLights: THREE.PointLight[] = [];
  const disposables: { dispose: () => void }[] = [];

  const isHigh = quality === "high" || quality === "ultra";
  const isUltra = quality === "ultra";
  const aniso = isUltra ? 16 : isHigh ? 8 : 4;
  const texBase = isUltra ? 1024 : isHigh ? 512 : 256;

  const box = new THREE.BoxGeometry(1, 1, 1);
  const cyl = new THREE.CylinderGeometry(0.5, 0.5, 1, isHigh ? 16 : 10);
  disposables.push(box, cyl);

  const mat = (p: THREE.MeshStandardMaterialParameters) => {
    const m = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0.05, ...p });
    disposables.push(m);
    return m;
  };

  // 1. Procedural Texture Maps with Bump Details
  const asphaltTex = canvasTex(texBase, (g, s) => {
    g.fillStyle = "#202328";
    g.fillRect(0, 0, s, s);
    // Subtle aggregate speckle
    const speckleCount = s * 8;
    for (let i = 0; i < speckleCount; i++) {
      const v = Math.random();
      g.fillStyle = v > 0.5 ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.12)";
      g.fillRect(Math.random() * s, Math.random() * s, 1.5, 1.5);
    }
    // Asphalt micro-cracks
    g.strokeStyle = "rgba(10,12,16,0.65)";
    for (let i = 0; i < 8; i++) {
      g.lineWidth = 1 + Math.random() * 1.5;
      g.beginPath();
      let x = Math.random() * s, y = Math.random() * s;
      g.moveTo(x, y);
      for (let k = 0; k < 6; k++) {
        x += (Math.random() - 0.5) * 35;
        y += (Math.random() - 0.5) * 35;
        g.lineTo(x, y);
      }
      g.stroke();
    }
  }, 16, aniso);

  const asphaltBump = bumpTex(texBase / 2, (g, s) => {
    g.fillStyle = "#808080";
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < s * 4; i++) {
      g.fillStyle = Math.random() > 0.5 ? "#a0a0a0" : "#606060";
      g.fillRect(Math.random() * s, Math.random() * s, 2, 2);
    }
  }, 16, aniso);

  const concreteTex = canvasTex(texBase / 2, (g, s) => {
    g.fillStyle = "#585c64";
    g.fillRect(0, 0, s, s);
    g.strokeStyle = "rgba(22,25,30,0.6)";
    g.lineWidth = 2;
    g.strokeRect(4, 4, s - 8, s - 8);
    for (let i = 0; i < s * 3; i++) {
      g.fillStyle = Math.random() > 0.5 ? "rgba(255,255,255,0.07)" : "rgba(10,12,15,0.1)";
      g.fillRect(Math.random() * s, Math.random() * s, 2, 2);
    }
  }, 6, aniso);

  const concreteBump = bumpTex(texBase / 4, (g, s) => {
    g.fillStyle = "#808080";
    g.fillRect(0, 0, s, s);
    g.strokeStyle = "#404040";
    g.lineWidth = 3;
    g.strokeRect(2, 2, s - 4, s - 4);
  }, 6, aniso);

  const brickTex = canvasTex(texBase / 2, (g, s) => {
    g.fillStyle = "#5a3126";
    g.fillRect(0, 0, s, s);
    g.strokeStyle = "rgba(35,26,24,0.75)";
    g.lineWidth = 2;
    const rows = 16;
    const rh = s / rows;
    for (let r = 0; r < rows; r++) {
      const y = r * rh;
      g.beginPath();
      g.moveTo(0, y); g.lineTo(s, y);
      g.stroke();
      const bw = s / 6;
      const off = (r % 2) * (bw / 2);
      for (let x = -bw; x <= s + bw; x += bw) {
        g.beginPath();
        g.moveTo(x + off, y); g.lineTo(x + off, y + rh);
        g.stroke();
      }
    }
  }, 4, aniso);

  const brickBump = bumpTex(texBase / 4, (g, s) => {
    g.fillStyle = "#909090";
    g.fillRect(0, 0, s, s);
    g.strokeStyle = "#404040";
    g.lineWidth = 2;
    const rows = 16;
    const rh = s / rows;
    for (let r = 0; r < rows; r++) {
      const y = r * rh;
      g.beginPath();
      g.moveTo(0, y); g.lineTo(s, y);
      g.stroke();
      const bw = s / 6;
      const off = (r % 2) * (bw / 2);
      for (let x = -bw; x <= s + bw; x += bw) {
        g.beginPath();
        g.moveTo(x + off, y); g.lineTo(x + off, y + rh);
        g.stroke();
      }
    }
  }, 4, aniso);

  const plazaPaverTex = canvasTex(texBase / 2, (g, s) => {
    g.fillStyle = "#464a52";
    g.fillRect(0, 0, s, s);
    g.strokeStyle = "rgba(15,18,22,0.85)";
    g.lineWidth = 2.5;
    const tiles = 4;
    const ts = s / tiles;
    for (let i = 0; i <= tiles; i++) {
      g.beginPath();
      g.moveTo(i * ts, 0); g.lineTo(i * ts, s);
      g.moveTo(0, i * ts); g.lineTo(s, i * ts);
      g.stroke();
    }
  }, 8, aniso);

  const makeSignTex = (text: string, sub: string, bg: string, fg: string, borderCol?: string) => {
    return canvasTex(256, (g, s) => {
      g.fillStyle = bg;
      g.fillRect(0, 0, s, s / 2);
      if (borderCol) {
        g.strokeStyle = borderCol;
        g.lineWidth = 6;
        g.strokeRect(3, 3, s - 6, s / 2 - 6);
      }
      g.fillStyle = fg;
      g.font = "bold 24px sans-serif";
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(text, s / 2, s / 4 - 8);
      if (sub) {
        g.font = "bold 13px sans-serif";
        g.fillText(sub, s / 2, s / 4 + 16);
      }
    }, 1, aniso);
  };

  const signPharmacy = makeSignTex("ECZANE", "+ 24 SAAT AÇIK +", "#0a3a22", "#48df80", "#48df80");
  const signMarket = makeSignTex("SÜPERMARKET", "İNDİRİM · GIDA · İKMAL", "#7a1a10", "#eec060", "#eec060");
  const signMetro = makeSignTex("METRO", "M2 HATTI — GİRİŞ KAPALI", "#183055", "#6aa0e8", "#ffffff");
  const signBiohazard = makeSignTex("KARANTİNA", "☣ DİKKAT: ENFEKSİYON BÖLGESİ ☣", "#a57c00", "#111111", "#111111");
  const signCafe = makeSignTex("KAFE & FIRIN", "TAZE KAHVE · YAĞMALANMIŞ", "#382a20", "#d4b490", "#d4b490");
  const signBank = makeSignTex("BANKA", "KREDİ & KASA BÖLÜMÜ", "#182230", "#b8d0ee", "#90a8c8");

  disposables.push(asphaltTex, asphaltBump, concreteTex, concreteBump, brickTex, brickBump, plazaPaverTex, signPharmacy, signMarket, signMetro, signBiohazard, signCafe, signBank);

  const puddleRoughness = quality === "ultra" ? 0.04 : quality === "high" ? 0.08 : 0.2;

  // Calibrated PBR materials with controlled emissive and distinct surface responses
  const M = {
    asphalt: mat({ map: asphaltTex, bumpMap: isHigh ? asphaltBump : null, bumpScale: 0.035, color: "#848a94", roughness: 0.88, metalness: 0.08 }),
    puddle: mat({
      color: "#0c1016",
      roughness: puddleRoughness,
      metalness: 0.8,
      transparent: true,
      opacity: 0.85,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    }),
    sidewalk: mat({ map: concreteTex, bumpMap: isHigh ? concreteBump : null, bumpScale: 0.04, color: "#868a92", roughness: 0.82 }),
    curb: mat({ color: "#4c5058", roughness: 0.75 }),
    plaza: mat({ map: plazaPaverTex, color: "#747a84", roughness: 0.75 }),
    brick: mat({ map: brickTex, bumpMap: isHigh ? brickBump : null, bumpScale: 0.05, color: "#844234", roughness: 0.88 }),
    concreteDark: mat({ map: concreteTex, color: "#444850", roughness: 0.9 }),
    trim: mat({ color: "#181a20", roughness: 0.7, metalness: 0.35 }),
    facades: [
      mat({ map: brickTex, bumpMap: isHigh ? brickBump : null, bumpScale: 0.04, color: "#804032", roughness: 0.88 }),
      mat({ map: concreteTex, color: "#383e4a", roughness: 0.85 }),
      mat({ map: concreteTex, color: "#505662", roughness: 0.82 }),
      mat({ map: concreteTex, color: "#252932", roughness: 0.85 }),
      mat({ map: brickTex, bumpMap: isHigh ? brickBump : null, bumpScale: 0.04, color: "#6a362a", roughness: 0.9 }),
    ],
    winDark: mat({ color: "#06090e", roughness: 0.15, metalness: 0.7 }),
    winLit: mat({ color: "#ffb855", emissive: "#cc7722", emissiveIntensity: 0.75 }),
    shopInterior: mat({ color: "#ffc870", emissive: "#d47818", emissiveIntensity: 0.7 }),
    shutter: mat({ color: "#40454e", roughness: 0.6, metalness: 0.5 }),
    roof: mat({ color: "#1a1d22", roughness: 0.95 }),
    metal: mat({ color: "#424850", roughness: 0.45, metalness: 0.75 }),
    metalBlack: mat({ color: "#16181d", roughness: 0.5, metalness: 0.8 }),
    metalRust: mat({ color: "#743e24", roughness: 0.92, metalness: 0.3 }),
    metalOlive: mat({ color: "#3a4232", roughness: 0.7, metalness: 0.4 }),
    sandbag: mat({ color: "#867e64", roughness: 0.95 }),
    glass: mat({ color: "#0a0e14", roughness: 0.1, metalness: 0.85, transparent: true, opacity: 0.7 }),
    carPaint: [
      mat({ color: "#16181e", roughness: 0.35, metalness: 0.5 }), // Police black
      mat({ color: "#e8eaee", roughness: 0.4, metalness: 0.3 }),  // White
      mat({ color: "#d8a61e", roughness: 0.38, metalness: 0.4 }), // Taxi yellow
      mat({ color: "#702020", roughness: 0.42, metalness: 0.4 }), // Rust maroon
      mat({ color: "#223854", roughness: 0.4, metalness: 0.45 }), // Dark blue
    ],
    tire: mat({ color: "#111214", roughness: 0.9 }),
    rim: mat({ color: "#8a9098", metalness: 0.85, roughness: 0.3 }),
    headlight: mat({ color: "#f0e6c8", emissive: "#ecd8a0", emissiveIntensity: 0.8 }),
    taillight: mat({ color: "#b81414", emissive: "#a81010", emissiveIntensity: 0.75 }),
    sirenBlue: mat({ color: "#1858cc", emissive: "#1555cc", emissiveIntensity: 0.85 }),
    sirenRed: mat({ color: "#cc1818", emissive: "#c01515", emissiveIntensity: 0.85 }),
    yellowStripe: mat({ color: "#c89615", roughness: 0.6 }),
    whiteStripe: mat({ color: "#d8d6ce", roughness: 0.6 }),
    dumpsterGreen: mat({ color: "#263e2a", roughness: 0.7, metalness: 0.4 }),
    woodPallet: mat({ color: "#745436", roughness: 0.95 }),
    barrelRed: mat({ color: "#822018", roughness: 0.6, metalness: 0.4 }),
    barrelBlue: mat({ color: "#223e62", roughness: 0.6, metalness: 0.4 }),
    bulbWarm: mat({ color: "#ffd080", emissive: "#d4882a", emissiveIntensity: 0.85 }),
    beaconRed: mat({ color: "#cc1818", emissive: "#c01515", emissiveIntensity: 0.9 }),
    contactDecal: mat({ color: "#000000", transparent: true, opacity: 0.45, depthWrite: false }),
    chrome: mat({ color: "#c0c6d0", metalness: 0.95, roughness: 0.15 }),
    licensePlate: mat({ color: "#e8dc90", roughness: 0.5 }),
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

  const C = (r: number, h: number, m: THREE.Material, x: number, y: number, z: number, ry = 0, parent?: THREE.Object3D) => {
    const mesh = new THREE.Mesh(cyl, m);
    mesh.scale.set(r * 2, h, r * 2);
    mesh.position.set(x, y, z);
    mesh.rotation.y = ry;
    return add(mesh, parent);
  };

  // Base ground (asphalt)
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(BOUND * 2, BOUND * 2), M.asphalt);
  disposables.push(ground.geometry);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = shadows;
  group.add(ground);
  blockers.push(ground);

  // Central Quarantine Plaza slab
  const plazaSize = 28;
  const plaza = new THREE.Mesh(new THREE.PlaneGeometry(plazaSize, plazaSize), M.plaza);
  disposables.push(plaza.geometry);
  plaza.rotation.x = -Math.PI / 2;
  plaza.position.set(0, 0.02, 0);
  plaza.receiveShadow = shadows;
  group.add(plaza);

  // Sidewalk curbs around plaza
  B(plazaSize + 0.6, 0.12, 0.4, M.curb, 0, 0.06, -plazaSize / 2 - 0.2);
  B(plazaSize + 0.6, 0.12, 0.4, M.curb, 0, 0.06, plazaSize / 2 + 0.2);
  B(0.4, 0.12, plazaSize + 0.6, M.curb, -plazaSize / 2 - 0.2, 0.06, 0);
  B(0.4, 0.12, plazaSize + 0.6, M.curb, plazaSize / 2 + 0.2, 0.06, 0);

  // Road network & Markings
  const streetsZ = [-36, 36];
  for (const sz of streetsZ) {
    for (let x = -BOUND + 4; x <= BOUND - 4; x += 4.5) {
      if (Math.abs(x) < 14) continue;
      B(2.2, 0.02, 0.14, M.yellowStripe, x, 0.015, sz - 0.12).castShadow = false;
      B(2.2, 0.02, 0.14, M.yellowStripe, x, 0.015, sz + 0.12).castShadow = false;
    }
  }
  for (const sx of [-7.5, 7.5]) {
    for (let z = -BOUND + 4; z <= BOUND - 4; z += 5) {
      if (Math.abs(z) < 16) continue;
      B(0.18, 0.02, 2.5, M.whiteStripe, sx, 0.015, z).castShadow = false;
    }
  }
  for (const cz of [-16, 16]) {
    for (let x = -6.5; x <= 6.5; x += 1.3) {
      B(0.65, 0.02, 3.2, M.whiteStripe, x, 0.016, cz).castShadow = false;
    }
  }
  for (const cx of [-16, 16]) {
    for (let z = -6.5; z <= 6.5; z += 1.3) {
      B(3.2, 0.02, 0.65, M.whiteStripe, cx, 0.016, z).castShadow = false;
    }
  }

  // Drainage grates & manholes
  const addManhole = (x: number, z: number) => {
    C(0.65, 0.04, M.trim, x, 0.02, z).castShadow = false;
    C(0.5, 0.045, M.metalBlack, x, 0.022, z).castShadow = false;
  };
  const addDrainGrate = (x: number, z: number, ry: number) => {
    B(0.8, 0.04, 1.4, M.metalBlack, x, 0.02, z, ry).castShadow = false;
    for (let i = -0.5; i <= 0.5; i += 0.25) {
      B(0.04, 0.045, 1.2, M.metalRust, x + (ry === 0 ? i : 0), 0.022, z + (ry === 0 ? 0 : i), ry).castShadow = false;
    }
  };
  addManhole(-11, -8);
  addManhole(11, 10);
  addManhole(0, -36);
  addManhole(0, 36);
  addDrainGrate(-14.2, -4, 0);
  addDrainGrate(14.2, 6, 0);
  addDrainGrate(-4, -14.2, Math.PI / 2);
  addDrainGrate(6, 14.2, Math.PI / 2);

  // Organic Puddles
  const addPuddle = (x: number, z: number, sx: number, sz: number) => {
    const pMesh = new THREE.Mesh(new THREE.PlaneGeometry(sx, sz), M.puddle);
    pMesh.rotation.x = -Math.PI / 2;
    pMesh.position.set(x, 0.025, z);
    pMesh.receiveShadow = false;
    group.add(pMesh);
  };
  addPuddle(-11, -7.5, 3.2, 2.2);
  addPuddle(10.5, 9.5, 2.8, 3.4);
  addPuddle(-4, 13.5, 2.5, 1.8);
  addPuddle(8, -13, 3.5, 2.0);
  addPuddle(-8, -35.5, 4.0, 2.6);
  addPuddle(7.5, 36.5, 3.8, 2.4);

  // Instanced windows for buildings
  const darkWinM: THREE.Matrix4[] = [];
  const litWinM: THREE.Matrix4[] = [];
  const tmpObj = new THREE.Object3D();

  const pushWindow = (x: number, y: number, z: number, w: number, h: number, d: number, lit: boolean) => {
    tmpObj.position.set(x, y, z);
    tmpObj.scale.set(w, h, d);
    tmpObj.rotation.set(0, 0, 0);
    tmpObj.updateMatrix();
    (lit ? litWinM : darkWinM).push(tmpObj.matrix.clone());
  };

  // Animated Steam / Vapor Puffs rising from manholes
  const steamPuffs: { mesh: THREE.Mesh; baseY: number; phase: number; speed: number; x: number; z: number }[] = [];
  const steamGeo = new THREE.DodecahedronGeometry(0.35, 1);
  disposables.push(steamGeo);
  const steamMat = new THREE.MeshBasicMaterial({ color: "#8a96a6", transparent: true, opacity: 0.14, depthWrite: false });
  disposables.push(steamMat);

  const addSteamOrigin = (ox: number, oz: number) => {
    for (let i = 0; i < 4; i++) {
      const sm = new THREE.Mesh(steamGeo, steamMat);
      sm.position.set(ox, 0.3 + i * 0.45, oz);
      group.add(sm);
      steamPuffs.push({ mesh: sm, baseY: 0.3, phase: i * 1.5 + Math.random(), speed: 0.45 + Math.random() * 0.3, x: ox, z: oz });
    }
  };
  addSteamOrigin(-11, -8);
  addSteamOrigin(11, 10);
  addSteamOrigin(-14.2, -4);

  // -------------------------------------------------------------
  // 1. CENTRAL QUARANTINE CHECKPOINT (Haritanın Odak Noktası)
  // -------------------------------------------------------------
  const buildQuarantineCheckpoint = () => {
    const cpRoot = new THREE.Group();
    group.add(cpRoot);

    const cabX = -4.5, cabZ = -2.5;
    const cabin = B(4.2, 3.0, 3.2, M.metalOlive, cabX, 1.5, cabZ, 0, cpRoot);
    blockers.push(cabin);
    colliders.push(makeOBB(cabX, cabZ, 2.1, 1.6));
    B(4.6, 0.2, 3.6, M.trim, cabX, 3.05, cabZ, 0, cpRoot);
    B(0.1, 1.1, 1.8, M.glass, cabX + 2.12, 1.8, cabZ, 0, cpRoot);
    B(0.6, 0.8, 1.2, M.metal, cabX + 1.4, 0.8, cabZ, 0, cpRoot);
    B(0.08, 0.4, 0.5, M.winLit, cabX + 1.7, 1.35, cabZ, 0, cpRoot);

    // Tactical satellite dish on cabin roof for High/Ultra
    if (isHigh) {
      C(0.08, 0.8, M.metalBlack, cabX + 0.8, 3.5, cabZ - 0.6, 0, cpRoot);
      const dish = C(0.7, 0.12, M.metal, cabX + 0.8, 4.0, cabZ - 0.6, 0, cpRoot);
      dish.rotation.x = 0.5;
    }
    C(0.05, 3.5, M.metal, cabX - 1.2, 4.8, cabZ - 0.8, 0, cpRoot);
    B(0.2, 0.2, 0.2, M.beaconRed, cabX - 1.2, 6.6, cabZ - 0.8, 0, cpRoot);

    // Heavy Quarantine Signboard above entrance
    const signMat = mat({ map: signBiohazard, roughness: 0.7 });
    B(4.8, 1.2, 0.15, signMat, 0, 3.8, -4.5, 0, cpRoot);
    C(0.12, 4.4, M.metalBlack, -2.3, 2.2, -4.5, 0, cpRoot);
    C(0.12, 4.4, M.metalBlack, 2.3, 2.2, -4.5, 0, cpRoot);
    colliders.push(makeOBB(-2.3, -4.5, 0.25, 0.25));
    colliders.push(makeOBB(2.3, -4.5, 0.25, 0.25));

    // Floodlight on the checkpoint portal (calibrated warm light, no blowout)
    const spotX = 0, spotZ = -4.3;
    C(0.25, 0.4, M.trim, spotX, 4.5, spotZ, 0, cpRoot);
    B(0.4, 0.3, 0.4, M.bulbWarm, spotX, 4.35, spotZ + 0.2, 0, cpRoot);
    const flood = new THREE.PointLight("#ffdf90", 14, 18, 1.8);
    flood.position.set(spotX, 4.2, spotZ + 0.4);
    flood.userData["baseIntensity"] = 14;
    group.add(flood);
    lampLights.push(flood);

    // Controlled red warning beacon
    const redBeacon = new THREE.PointLight("#cc1818", 8, 10, 2);
    redBeacon.position.set(-2.3, 4.6, -4.5);
    redBeacon.userData["baseIntensity"] = 8;
    redBeacon.userData["pulse"] = true;
    group.add(redBeacon);
    lampLights.push(redBeacon);

    // Concrete Jersey barriers
    const addJersey = (x: number, z: number, ry: number) => {
      const jb = new THREE.Group();
      jb.position.set(x, 0, z);
      jb.rotation.y = ry;
      cpRoot.add(jb);
      const b1 = B(2.8, 0.45, 0.8, M.concreteDark, 0, 0.225, 0, 0, jb);
      const b2 = B(2.8, 0.55, 0.35, M.concreteDark, 0, 0.725, 0, 0, jb);
      B(0.45, 0.5, 0.37, M.beaconRed, -0.8, 0.725, 0, 0, jb);
      B(0.45, 0.5, 0.37, M.whiteStripe, 0, 0.725, 0, 0, jb);
      B(0.45, 0.5, 0.37, M.beaconRed, 0.8, 0.725, 0, 0, jb);
      blockers.push(b1, b2);
      colliders.push(makeOBB(x, z, 1.4, 0.42, ry));
    };

    addJersey(-3.6, -4.5, 0);
    addJersey(3.6, -4.5, 0);
    addJersey(-5.8, -1.5, Math.PI / 2);
    addJersey(5.2, -1.5, Math.PI / 2);
    addJersey(5.2, 2.5, Math.PI / 2);

    // Sandbag revetments
    const addSandbagStack = (x: number, z: number, ry: number) => {
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      g.rotation.y = ry;
      cpRoot.add(g);
      B(1.6, 0.32, 0.7, M.sandbag, 0, 0.16, 0, 0, g);
      B(1.4, 0.3, 0.65, M.sandbag, 0, 0.45, 0, 0, g);
      B(1.2, 0.28, 0.6, M.sandbag, 0, 0.72, 0, 0, g);
      colliders.push(makeOBB(x, z, 0.85, 0.4, ry));
    };
    addSandbagStack(-1.8, -1.2, 0.3);
    addSandbagStack(-1.6, 1.0, -0.2);

    // Overturned emergency gurney / stretcher
    const gurn = new THREE.Group();
    gurn.position.set(2.0, 0, 2.2);
    gurn.rotation.y = 0.8;
    gurn.rotation.z = 0.25;
    cpRoot.add(gurn);
    B(0.9, 0.1, 2.2, M.metal, 0, 0.35, 0, 0, gurn);
    B(0.08, 0.6, 0.08, M.metal, -0.35, 0.3, 0.9, 0, gurn);
    B(0.08, 0.6, 0.08, M.metal, 0.35, 0.3, 0.9, 0, gurn);
    B(0.08, 0.6, 0.08, M.metal, -0.35, 0.3, -0.9, 0, gurn);
    B(0.08, 0.6, 0.08, M.metal, 0.35, 0.3, -0.9, 0, gurn);
    colliders.push(makeOBB(2.0, 2.2, 0.6, 1.2, 0.8));

    // Medical supply crates
    B(0.9, 0.7, 0.8, M.metalOlive, 3.2, 0.35, 0.5, 0.2, cpRoot);
    B(0.7, 0.5, 0.6, M.metalOlive, 3.4, 0.85, 0.6, -0.1, cpRoot);
    colliders.push(makeOBB(3.3, 0.55, 0.6, 0.6, 0.2));
  };
  buildQuarantineCheckpoint();

  // -------------------------------------------------------------
  // 2. DETAILED VEHICLES WITH HIGH/ULTRA GEOMETRIC ACCENTS
  // -------------------------------------------------------------
  const buildCar = (x: number, z: number, ry: number, type: "police" | "taxi" | "van" | "sedan", colorIdx = 0) => {
    const cg = new THREE.Group();
    cg.position.set(x, 0, z);
    cg.rotation.y = ry;
    group.add(cg);

    const isVan = type === "van";
    const bodyW = isVan ? 2.3 : 2.05;
    const bodyH = isVan ? 1.6 : 0.7;
    const bodyL = isVan ? 5.2 : 4.5;
    const paint = type === "police" ? M.carPaint[0]! : type === "taxi" ? M.carPaint[2]! : M.carPaint[colorIdx % M.carPaint.length]!;

    // Chassis body
    const body = B(bodyW, bodyH, bodyL, paint, 0, bodyH / 2 + 0.3, 0, 0, cg);
    blockers.push(body);
    colliders.push(makeOBB(x, z, bodyW / 2 + 0.1, bodyL / 2 + 0.1, ry));

    if (!isVan) {
      const cabW = bodyW - 0.2;
      const cabH = 0.65;
      const cabL = 2.4;
      const cab = B(cabW, cabH, cabL, paint, 0, bodyH + 0.3 + cabH / 2, -0.2, 0, cg);
      blockers.push(cab);
      B(cabW - 0.1, cabH - 0.1, 0.08, M.glass, 0, bodyH + 0.3 + cabH / 2, 1.05, 0, cg);
      B(cabW - 0.1, cabH - 0.1, 0.08, M.glass, 0, bodyH + 0.3 + cabH / 2, -1.45, 0, cg);
      B(0.08, cabH - 0.15, cabL - 0.4, M.glass, cabW / 2 + 0.02, bodyH + 0.3 + cabH / 2, -0.2, 0, cg);
      B(0.08, cabH - 0.15, cabL - 0.4, M.glass, -cabW / 2 - 0.02, bodyH + 0.3 + cabH / 2, -0.2, 0, cg);

      // High/Ultra 3D Vehicle Details: Side rearview mirrors & door handles
      if (isHigh) {
        // Left & right mirrors
        B(0.24, 0.15, 0.16, paint, cabW / 2 + 0.14, bodyH + 0.3 + 0.2, 0.9, 0, cg);
        B(0.02, 0.12, 0.13, M.chrome, cabW / 2 + 0.25, bodyH + 0.3 + 0.2, 0.9, 0, cg);
        B(0.24, 0.15, 0.16, paint, -cabW / 2 - 0.14, bodyH + 0.3 + 0.2, 0.9, 0, cg);
        B(0.02, 0.12, 0.13, M.chrome, -cabW / 2 - 0.25, bodyH + 0.3 + 0.2, 0.9, 0, cg);

        // Recessed door handles
        B(0.06, 0.05, 0.22, M.metalBlack, bodyW / 2 + 0.02, bodyH / 2 + 0.45, 0.3, 0, cg);
        B(0.06, 0.05, 0.22, M.metalBlack, -bodyW / 2 - 0.02, bodyH / 2 + 0.45, 0.3, 0, cg);
        B(0.06, 0.05, 0.22, M.metalBlack, bodyW / 2 + 0.02, bodyH / 2 + 0.45, -0.7, 0, cg);
        B(0.06, 0.05, 0.22, M.metalBlack, -bodyW / 2 - 0.02, bodyH / 2 + 0.45, -0.7, 0, cg);
      }
    } else {
      B(bodyW - 0.15, 0.8, 1.2, M.glass, 0, bodyH + 0.3, 1.5, 0, cg);
    }

    // Heavy front and rear bumpers
    B(bodyW + 0.1, 0.25, 0.25, M.trim, 0, 0.42, bodyL / 2 + 0.12, 0, cg);
    B(bodyW + 0.1, 0.25, 0.25, M.trim, 0, 0.42, -bodyL / 2 - 0.12, 0, cg);

    // Front grille and license plates
    B(bodyW * 0.55, 0.22, 0.06, M.metalBlack, 0, 0.65, bodyL / 2 + 0.04, 0, cg);
    B(0.65, 0.18, 0.04, M.licensePlate, 0, 0.42, bodyL / 2 + 0.26, 0, cg);
    B(0.65, 0.18, 0.04, M.licensePlate, 0, 0.42, -bodyL / 2 - 0.26, 0, cg);

    // Headlights and Taillights (controlled glow)
    B(0.4, 0.18, 0.05, M.headlight, bodyW / 2 - 0.35, 0.65, bodyL / 2 + 0.14, 0, cg);
    B(0.4, 0.18, 0.05, M.headlight, -bodyW / 2 + 0.35, 0.65, bodyL / 2 + 0.14, 0, cg);
    B(0.35, 0.18, 0.05, M.taillight, bodyW / 2 - 0.35, 0.65, -bodyL / 2 - 0.14, 0, cg);
    B(0.35, 0.18, 0.05, M.taillight, -bodyW / 2 + 0.35, 0.65, -bodyL / 2 - 0.14, 0, cg);

    // Dual chrome exhaust tailpipes
    if (isHigh) {
      C(0.06, 0.3, M.chrome, 0.55, 0.24, -bodyL / 2 - 0.12, 0, cg);
      C(0.06, 0.3, M.chrome, 0.72, 0.24, -bodyL / 2 - 0.12, 0, cg);
    }

    if (type === "police") {
      B(0.05, bodyH - 0.1, 2.0, M.carPaint[1]!, bodyW / 2 + 0.02, bodyH / 2 + 0.3, -0.1, 0, cg);
      B(0.05, bodyH - 0.1, 2.0, M.carPaint[1]!, -bodyW / 2 - 0.02, bodyH / 2 + 0.3, -0.1, 0, cg);
      // Push bumper (bull bar)
      B(1.5, 0.6, 0.1, M.metalBlack, 0, 0.55, bodyL / 2 + 0.28, 0, cg);
      // Low-glare emergency lightbar
      B(1.4, 0.12, 0.3, M.trim, 0, bodyH + 0.3 + 0.7, -0.1, 0, cg);
      B(0.6, 0.14, 0.24, M.sirenRed, -0.35, bodyH + 0.3 + 0.7, -0.1, 0, cg);
      B(0.6, 0.14, 0.24, M.sirenBlue, 0.35, bodyH + 0.3 + 0.7, -0.1, 0, cg);
    } else if (type === "taxi") {
      B(0.9, 0.2, 0.3, M.bulbWarm, 0, bodyH + 0.3 + 0.75, -0.1, 0, cg);
    }

    // 4 Wheels with lug nuts on High/Ultra
    const wheelR = 0.36;
    const wheelW = 0.26;
    const halfW = bodyW / 2 - 0.05;
    const axF = bodyL / 2 - 0.9;
    const axR = -bodyL / 2 + 1.0;
    for (const [wx, wz] of [[halfW, axF], [-halfW, axF], [halfW, axR], [-halfW, axR]] as const) {
      const tire = new THREE.Mesh(cyl, M.tire);
      tire.scale.set(wheelR * 2, wheelW, wheelR * 2);
      tire.rotation.z = Math.PI / 2;
      tire.position.set(wx, wheelR, wz);
      add(tire, cg);

      const rim = new THREE.Mesh(cyl, M.rim);
      rim.scale.set(wheelR * 1.1, wheelW + 0.02, wheelR * 1.1);
      rim.rotation.z = Math.PI / 2;
      rim.position.set(wx, wheelR, wz);
      add(rim, cg);

      // 5 Lug nut studs for High/Ultra
      if (isHigh) {
        const sign = wx > 0 ? 1 : -1;
        for (let a = 0; a < 5; a++) {
          const ang = (a / 5) * Math.PI * 2;
          const lx = wx + sign * (wheelW / 2 + 0.015);
          const ly = wheelR + Math.sin(ang) * 0.1;
          const lz = wz + Math.cos(ang) * 0.1;
          B(0.02, 0.03, 0.03, M.chrome, lx, ly, lz, 0, cg);
        }
      }
    }

    const cs = new THREE.Mesh(new THREE.PlaneGeometry(bodyW + 0.4, bodyL + 0.4), M.contactDecal);
    cs.rotation.x = -Math.PI / 2;
    cs.position.set(0, 0.02, 0);
    cg.add(cs);
  };

  buildCar(-9.5, -12, 0.25, "police");
  buildCar(10.5, -8, -0.18, "taxi");
  buildCar(-10.5, 12, 0.4, "sedan", 3);
  buildCar(10.5, 14, -0.3, "sedan", 4);
  buildCar(-22, -36, Math.PI / 2 + 0.1, "van");
  buildCar(24, 36, -Math.PI / 2 - 0.15, "sedan", 1);
  buildCar(-7.5, 42, 0.05, "taxi");
  buildCar(7.5, -42, -0.08, "police");

  // -------------------------------------------------------------
  // 3. URBAN ARCHITECTURE & RECESSED 3D FACADE DETAILS
  // -------------------------------------------------------------
  const addFireEscape = (cx: number, cy: number, cz: number, width: number, floors: number, facingZ: boolean, sign: 1 | -1) => {
    const feGroup = new THREE.Group();
    group.add(feGroup);
    for (let f = 1; f <= floors; f++) {
      const py = cy + f * 3.4;
      if (facingZ) {
        B(width, 0.1, 1.2, M.metalBlack, cx, py, cz + sign * 0.6, 0, feGroup);
        B(width, 0.9, 0.06, M.metalBlack, cx, py + 0.45, cz + sign * 1.2, 0, feGroup);
        B(0.06, 0.9, 1.2, M.metalBlack, cx - width / 2, py + 0.45, cz + sign * 0.6, 0, feGroup);
        B(0.06, 0.9, 1.2, M.metalBlack, cx + width / 2, py + 0.45, cz + sign * 0.6, 0, feGroup);
        const stair = B(0.6, 0.1, 3.6, M.metalBlack, cx + (f % 2 === 0 ? 0.6 : -0.6), py - 1.7, cz + sign * 0.6, 0, feGroup);
        stair.rotation.x = sign * 0.7;
      } else {
        B(1.2, 0.1, width, M.metalBlack, cx + sign * 0.6, py, cz, 0, feGroup);
        B(0.06, 0.9, width, M.metalBlack, cx + sign * 1.2, py + 0.45, cz, 0, feGroup);
        B(1.2, 0.9, 0.06, M.metalBlack, cx + sign * 0.6, py + 0.45, cz - width / 2, 0, feGroup);
        B(1.2, 0.9, 0.06, M.metalBlack, cx + sign * 0.6, py + 0.45, cz + width / 2, 0, feGroup);
      }
    }
  };

  const buildBuilding = (
    cx: number,
    cz: number,
    w: number,
    d: number,
    h: number,
    facadeMat: THREE.Material,
    shopType?: "pharmacy" | "market" | "metro" | "cafe" | "bank"
  ) => {
    const bGroup = new THREE.Group();
    group.add(bGroup);

    const mainBody = B(w, h, d, facadeMat, cx, h / 2, cz, 0, bGroup);
    blockers.push(mainBody);
    colliders.push(makeOBB(cx, cz, w / 2, d / 2));

    // Ground floor architectural trim / plinth
    B(w + 0.35, 1.4, d + 0.35, M.trim, cx, 0.7, cz, 0, bGroup);

    // Entrance doorways with intercom panel
    if (isHigh) {
      B(1.4, 2.2, 0.1, M.metalBlack, cx + w / 2 - 2, 1.1, cz + d / 2 + 0.05, 0, bGroup);
      B(0.2, 0.35, 0.05, M.trim, cx + w / 2 - 1.0, 1.4, cz + d / 2 + 0.08, 0, bGroup);
    }

    // Shopfront ground floor on the facing street
    if (shopType) {
      const facingNorth = cz > 0;
      const frontZ = cz + (facingNorth ? -d / 2 - 0.05 : d / 2 + 0.05);
      const signTexture =
        shopType === "pharmacy" ? signPharmacy :
        shopType === "market" ? signMarket :
        shopType === "metro" ? signMetro :
        shopType === "cafe" ? signCafe : signBank;

      const shopSignMat = mat({ map: signTexture, roughness: 0.6 });
      B(Math.min(w - 1.5, 9.5), 1.6, 0.35, shopSignMat, cx, 3.8, frontZ, 0, bGroup);

      const winSpan = Math.min(w - 2.5, 8.5);
      B(winSpan, 2.4, 0.1, M.glass, cx, 1.6, frontZ, 0, bGroup);
      B(winSpan - 0.2, 2.2, 0.05, M.shopInterior, cx, 1.6, frontZ - (facingNorth ? -0.15 : 0.15), 0, bGroup);
      B(2.2, 2.5, 0.12, M.shutter, cx + winSpan / 2 + 1.2, 1.6, frontZ, 0, bGroup);

      const awning = B(winSpan + 0.6, 0.15, 1.5, M.trim, cx, 2.9, frontZ + (facingNorth ? -0.7 : 0.7), 0, bGroup);
      awning.rotation.x = facingNorth ? -0.15 : 0.15;

      // Soft interior shoplight (controlled, non-blinding)
      const shopLight = new THREE.PointLight("#ffb040", 8, 11, 2);
      shopLight.position.set(cx, 2.8, frontZ + (facingNorth ? -1.5 : 1.5));
      shopLight.userData["baseIntensity"] = 8;
      group.add(shopLight);
      lampLights.push(shopLight);
    }

    // Windows across multiple floors with 3D recesses
    const floors = Math.floor((h - 4) / 3.4);
    for (let f = 1; f <= floors; f++) {
      const y = 3.6 + f * 3.4;
      if (y > h - 2) break;

      if (f % 2 === 0) {
        B(w + 0.3, 0.22, d + 0.3, M.trim, cx, y - 1.4, cz, 0, bGroup);
      }

      const cols = Math.max(2, Math.floor(w / 3.2));
      const colStep = (w - 2.0) / cols;
      for (let c = 0; c < cols; c++) {
        if (rand() < 0.05) continue;
        const off = -w / 2 + 1.0 + colStep * (c + 0.5);
        const isLit = rand() < 0.12;
        const winW = colStep * 0.55;

        // Front face (+Z)
        pushWindow(cx + off, y, cz + d / 2 + 0.02, winW, 1.8, 0.08, isLit);
        B(winW + 0.25, 0.14, 0.22, M.trim, cx + off, y - 0.95, cz + d / 2 + 0.1, 0, bGroup);
        B(winW + 0.25, 0.14, 0.22, M.trim, cx + off, y + 0.95, cz + d / 2 + 0.1, 0, bGroup);

        // Wall AC units for High/Ultra
        if (isHigh && rand() < 0.18) {
          B(0.8, 0.55, 0.45, M.metal, cx + off + 0.8, y - 0.6, cz + d / 2 + 0.26, 0, bGroup);
          B(0.04, 0.4, 0.35, M.trim, cx + off + 0.8, y - 0.8, cz + d / 2 + 0.2, 0, bGroup);
        }

        // Back face (-Z)
        pushWindow(cx + off, y, cz - d / 2 - 0.02, winW, 1.8, 0.08, rand() < 0.1);
        B(winW + 0.25, 0.14, 0.22, M.trim, cx + off, y - 0.95, cz - d / 2 - 0.1, 0, bGroup);
      }
    }

    if (floors >= 3 && rand() < 0.6) {
      const balY = 3.6 + 2 * 3.4;
      B(4.2, 0.2, 1.4, M.concreteDark, cx, balY - 1.0, cz + d / 2 + 0.7, 0, bGroup);
      B(4.2, 0.9, 0.08, M.metalBlack, cx, balY - 0.55, cz + d / 2 + 1.4, 0, bGroup);
      B(0.08, 0.9, 1.4, M.metalBlack, cx - 2.1, balY - 0.55, cz + d / 2 + 0.7, 0, bGroup);
      B(0.08, 0.9, 1.4, M.metalBlack, cx + 2.1, balY - 0.55, cz + d / 2 + 0.7, 0, bGroup);
    }

    if (h >= 16 && rand() < 0.7) {
      addFireEscape(cx + w / 2, 2.5, cz, 3.2, Math.min(floors, 4), false, 1);
    }

    // Parapets and rooftop units
    const pt = 0.35;
    B(w, 1.0, pt, M.roof, cx, h + 0.5, cz - d / 2 + pt / 2, 0, bGroup);
    B(w, 1.0, pt, M.roof, cx, h + 0.5, cz + d / 2 - pt / 2, 0, bGroup);
    B(pt, 1.0, d, M.roof, cx - w / 2 + pt / 2, h + 0.5, cz, 0, bGroup);
    B(pt, 1.0, d, M.roof, cx + w / 2 - pt / 2, h + 0.5, cz, 0, bGroup);

    const hvacCount = 1 + Math.floor(rand() * 3);
    for (let i = 0; i < hvacCount; i++) {
      const hw = 1.6 + rand() * 1.8;
      const hh = 1.2 + rand() * 1.4;
      const hd = 1.4 + rand() * 1.6;
      B(hw, hh, hd, M.metal, cx + (rand() - 0.5) * (w - 6), h + hh / 2 + 0.1, cz + (rand() - 0.5) * (d - 6), 0, bGroup);
    }

    if (h >= 18 && rand() < 0.65) {
      const tx = cx + (rand() - 0.5) * (w - 7);
      const tz = cz + (rand() - 0.5) * (d - 7);
      C(0.12, 3.0, M.metalBlack, tx - 1.2, h + 1.5, tz - 1.2, 0, bGroup);
      C(0.12, 3.0, M.metalBlack, tx + 1.2, h + 1.5, tz - 1.2, 0, bGroup);
      C(0.12, 3.0, M.metalBlack, tx - 1.2, h + 1.5, tz + 1.2, 0, bGroup);
      C(0.12, 3.0, M.metalBlack, tx + 1.2, h + 1.5, tz + 1.2, 0, bGroup);
      C(1.6, 2.8, M.woodPallet, tx, h + 4.4, tz, 0, bGroup);
      C(1.7, 0.8, M.metalRust, tx, h + 6.0, tz, 0, bGroup);
    }

    if (rand() < 0.6) {
      const ax = cx + (rand() - 0.5) * (w - 4);
      const az = cz + (rand() - 0.5) * (d - 4);
      C(0.08, 6.0, M.metal, ax, h + 3.0, az, 0, bGroup);
      B(0.28, 0.28, 0.28, M.beaconRed, ax, h + 6.1, az, 0, bGroup);
    }
  };

  const B_SIZE = 20;
  buildBuilding(-36, -36, B_SIZE - 2, B_SIZE - 2, 28, M.facades[0]!, "pharmacy");
  buildBuilding(-36, -18, B_SIZE - 2, 12, 20, M.facades[1]!, "cafe");

  buildBuilding(36, -36, B_SIZE - 2, B_SIZE - 2, 32, M.facades[2]!, "market");
  buildBuilding(36, -18, B_SIZE - 2, 12, 22, M.facades[3]!, "bank");

  buildBuilding(-36, 36, B_SIZE - 2, B_SIZE - 2, 26, M.facades[4]!, "metro");
  buildBuilding(-36, 18, B_SIZE - 2, 12, 18, M.facades[0]!);

  buildBuilding(36, 36, B_SIZE - 2, B_SIZE - 2, 30, M.facades[1]!, "pharmacy");
  buildBuilding(36, 18, B_SIZE - 2, 12, 24, M.facades[2]!, "cafe");

  buildBuilding(-55, 0, 10, 36, 34, M.facades[3]!);
  buildBuilding(55, 0, 10, 36, 36, M.facades[4]!);
  buildBuilding(0, -55, 36, 10, 30, M.facades[1]!);
  buildBuilding(0, 55, 36, 10, 32, M.facades[2]!);

  const instWindows = (matrices: THREE.Matrix4[], windowMat: THREE.Material) => {
    if (matrices.length === 0) return;
    const im = new THREE.InstancedMesh(box, windowMat, matrices.length);
    matrices.forEach((m, i) => im.setMatrixAt(i, m));
    im.instanceMatrix.needsUpdate = true;
    im.receiveShadow = false;
    group.add(im);
  };
  instWindows(darkWinM, M.winDark);
  instWindows(litWinM, M.winLit);

  // -------------------------------------------------------------
  // 4. STREET PROPS: DUMPSTERS, PALLETS & BARRELS
  // -------------------------------------------------------------
  const addDumpster = (x: number, z: number, ry: number) => {
    const dg = new THREE.Group();
    dg.position.set(x, 0, z);
    dg.rotation.y = ry;
    group.add(dg);
    const tub = B(2.4, 1.4, 1.4, M.dumpsterGreen, 0, 0.7, 0, 0, dg);
    blockers.push(tub);
    colliders.push(makeOBB(x, z, 1.25, 0.75, ry));
    B(1.2, 0.08, 1.45, M.metalBlack, -0.6, 1.44, 0, 0, dg);
    const lid2 = B(1.2, 0.08, 1.45, M.metalBlack, 0.6, 1.7, 0, 0, dg);
    lid2.rotation.z = 0.4;
    B(0.8, 0.2, 0.6, M.whiteStripe, 1.2, 0.1, 0.8, 0.3, dg);
    B(0.6, 0.15, 0.5, M.whiteStripe, -1.0, 0.08, 1.0, -0.4, dg);
  };
  addDumpster(-25, -13, 0.1);
  addDumpster(25, 13, -0.2);
  addDumpster(-25, 30, Math.PI / 2);
  addDumpster(25, -30, -Math.PI / 2);

  const addPalletStack = (x: number, z: number, count: number) => {
    for (let i = 0; i < count; i++) {
      B(1.4, 0.16, 1.2, M.woodPallet, x, 0.08 + i * 0.17, z, i * 0.08);
    }
    colliders.push(makeOBB(x, z, 0.75, 0.65));
  };
  addPalletStack(-16, -11, 4);
  addPalletStack(16, 11, 3);
  addPalletStack(-15, 28, 5);

  const addOilDrum = (x: number, z: number, colorMat: THREE.Material, tipped = false) => {
    const d = new THREE.Group();
    d.position.set(x, 0, z);
    group.add(d);
    if (!tipped) {
      C(0.35, 1.0, colorMat, 0, 0.5, 0, 0, d);
      C(0.36, 0.06, M.trim, 0, 0.3, 0, 0, d);
      C(0.36, 0.06, M.trim, 0, 0.7, 0, 0, d);
      colliders.push(makeOBB(x, z, 0.4, 0.4));
    } else {
      const drum = C(0.35, 1.0, colorMat, 0, 0.35, 0, 0, d);
      drum.rotation.z = Math.PI / 2;
      colliders.push(makeOBB(x, z, 0.55, 0.4));
    }
  };
  addOilDrum(-15.5, -9.5, M.barrelRed);
  addOilDrum(-14.7, -9.8, M.barrelBlue);
  addOilDrum(15.5, 9.5, M.barrelRed, true);
  addOilDrum(14.8, 9.2, M.barrelBlue);

  // -------------------------------------------------------------
  // 5. CAST IRON STREET LAMPS (Calibrated Warm Lighting)
  // -------------------------------------------------------------
  const buildStreetLamp = (x: number, z: number, armAngle: number, activeLight: boolean) => {
    const lg = new THREE.Group();
    lg.position.set(x, 0, z);
    group.add(lg);

    C(0.3, 0.6, M.trim, 0, 0.3, 0, 0, lg);
    C(0.14, 5.4, M.metalBlack, 0, 3.2, 0, 0, lg);

    const ax = Math.sin(armAngle);
    const az = Math.cos(armAngle);
    const armLen = 1.6;
    B(0.1, 0.1, armLen, M.metalBlack, ax * (armLen / 2), 6.0, az * (armLen / 2), armAngle, lg);

    const fixX = ax * armLen;
    const fixZ = az * armLen;
    B(0.5, 0.22, 0.7, M.trim, fixX, 5.95, fixZ, armAngle, lg);
    B(0.38, 0.08, 0.5, M.bulbWarm, fixX, 5.82, fixZ, armAngle, lg).castShadow = false;

    colliders.push(makeOBB(x, z, 0.35, 0.35));

    if (activeLight) {
      // Natural sodium vapor glow without blinding intensity
      const pl = new THREE.PointLight("#ffb048", 13, 17, 1.8);
      pl.position.set(x + fixX, 5.4, z + fixZ);
      pl.userData["baseIntensity"] = 13;
      group.add(pl);
      lampLights.push(pl);
    }
  };

  buildStreetLamp(-14, -14, Math.PI / 4, true);
  buildStreetLamp(14, 14, (-3 * Math.PI) / 4, true);
  buildStreetLamp(-14, 14, (3 * Math.PI) / 4, true);
  buildStreetLamp(14, -14, -Math.PI / 4, true);

  buildStreetLamp(-14, -36, Math.PI / 2, true);
  buildStreetLamp(14, -36, -Math.PI / 2, true);
  buildStreetLamp(-14, 36, Math.PI / 2, true);
  buildStreetLamp(14, 36, -Math.PI / 2, true);

  buildStreetLamp(-36, -14, 0, true);
  buildStreetLamp(36, -14, 0, true);
  buildStreetLamp(-36, 14, Math.PI, true);
  buildStreetLamp(36, 14, Math.PI, true);

  // Perimeter concrete security fence
  const wallH = 5.2;
  for (const s of [-1, 1]) {
    B(BOUND * 2 + 2, wallH, 1.2, M.concreteDark, 0, wallH / 2, s * (BOUND + 0.6));
    B(1.2, wallH, BOUND * 2 + 2, M.concreteDark, s * (BOUND + 0.6), wallH / 2, 0);
    for (let i = -BOUND; i <= BOUND; i += 8) {
      B(1.6, wallH + 0.8, 1.6, M.trim, i, (wallH + 0.8) / 2, s * (BOUND + 0.4));
      B(1.6, wallH + 0.8, 1.6, M.trim, s * (BOUND + 0.4), (wallH + 0.8) / 2, i);
    }
  }

  // Tactical Zombie Spawn Points
  const spawnPoints: THREE.Vector2[] = [];
  for (const z of [-50, -42, 42, 50]) {
    spawnPoints.push(new THREE.Vector2(-4, z), new THREE.Vector2(4, z));
  }
  for (const x of [-50, -42, 42, 50]) {
    spawnPoints.push(new THREE.Vector2(x, -36), new THREE.Vector2(x, 36));
  }
  spawnPoints.push(new THREE.Vector2(-24, -20), new THREE.Vector2(24, -20));
  spawnPoints.push(new THREE.Vector2(-24, 20), new THREE.Vector2(24, 20));

  const update = (dt: number, time: number) => {
    for (let i = 0; i < steamPuffs.length; i++) {
      const sp = steamPuffs[i];
      if (!sp) continue;
      const progress = (time * sp.speed + sp.phase) % 2.5;
      sp.mesh.position.y = sp.baseY + progress * 1.2;
      sp.mesh.position.x = sp.x + Math.sin(time + i) * 0.25;
      const scale = 0.5 + progress * 0.8;
      sp.mesh.scale.set(scale, scale, scale);
      (sp.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.14 * (1 - progress / 2.5));
    }
  };

  return {
    group,
    colliders,
    blockers,
    spawnPoints,
    lampLights,
    playerSpawn: { x: 0, z: 8 },
    fogColor: "#222a36",
    fogDensity: 0.024,
    bound: BOUND,
    update,
    dispose: () => disposables.forEach((d) => d.dispose()),
  };
}
