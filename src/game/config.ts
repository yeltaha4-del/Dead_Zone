export type WeaponId = "pistol" | "shotgun" | "rifle";
export type ZombieKind = "walker" | "runner" | "tank" | "exploder";
export type Quality = "low" | "medium" | "high" | "ultra";
export type Phase = "menu" | "countdown" | "combat" | "paused" | "market" | "gameover";
export type MapId = "city" | "factory";

export interface QualityPreset {
  id: Quality;
  name: string;
  shadows: boolean;
  shadowMapSize: number;
  pixelRatioCap: number;
  texResolution: number;
  postProcessing: boolean;
  bloom: boolean;
  bloomStrength: number;
  bloomRadius: number;
  bloomThreshold: number;
  fxaa: boolean;
  wetReflections: "basic" | "planar" | "enhanced";
  particles: number;
  puddleRoughness: number;
}

export const QUALITY_PRESETS: Record<Quality, QualityPreset> = {
  low: {
    id: "low",
    name: "Düşük",
    shadows: false,
    shadowMapSize: 1024,
    pixelRatioCap: 1.0,
    texResolution: 256,
    postProcessing: false,
    bloom: false,
    bloomStrength: 0,
    bloomRadius: 0,
    bloomThreshold: 1,
    fxaa: false,
    wetReflections: "basic",
    particles: 60,
    puddleRoughness: 0.35,
  },
  medium: {
    id: "medium",
    name: "Orta",
    shadows: true,
    shadowMapSize: 1024,
    pixelRatioCap: 1.25,
    texResolution: 512,
    postProcessing: false,
    bloom: false,
    bloomStrength: 0,
    bloomRadius: 0,
    bloomThreshold: 1,
    fxaa: false,
    wetReflections: "basic",
    particles: 120,
    puddleRoughness: 0.18,
  },
  high: {
    id: "high",
    name: "Yüksek",
    shadows: true,
    shadowMapSize: 2048,
    pixelRatioCap: 1.5,
    texResolution: 1024,
    postProcessing: true,
    bloom: false,
    bloomStrength: 0,
    bloomRadius: 0,
    bloomThreshold: 1.0,
    fxaa: true,
    wetReflections: "planar",
    particles: 180,
    puddleRoughness: 0.08,
  },
  ultra: {
    id: "ultra",
    name: "Ultra",
    shadows: true,
    shadowMapSize: 4096,
    pixelRatioCap: 2.0,
    texResolution: 2048,
    postProcessing: true,
    bloom: false,
    bloomStrength: 0,
    bloomRadius: 0,
    bloomThreshold: 1.0,
    fxaa: true,
    wetReflections: "enhanced",
    particles: 240,
    puddleRoughness: 0.03,
  },
};

export interface MapDef {
  id: MapId;
  name: string;
  tagline: string;
  desc: string;
  difficulty: string;
  fogColor: string;
  fogDensity: number;
}

export const MAPS: Record<MapId, MapDef> = {
  city: {
    id: "city",
    name: "Ölümcül Şehir",
    tagline: "Karanlık Sokaklar",
    desc: "Terk edilmiş gökdelenler, kavşaklar ve sokak barikatları ile dolu kentsel hayatta kalma alanı.",
    difficulty: "Dengeli",
    fogColor: "#2b3546",
    fogDensity: 0.024,
  },
  factory: {
    id: "factory",
    name: "Terk Edilmiş Fabrika",
    tagline: "Endüstriyel Harabe",
    desc: "Merkezi avlu, iki büyük üretim salonu, kargo deposu, boru hatları ve dar kaçış dehlizleri.",
    difficulty: "Taktiksel",
    fogColor: "#1a2028",
    fogDensity: 0.026,
  },
};

export const MAP_ORDER: MapId[] = ["city", "factory"];

export interface WeaponDef {
  id: WeaponId;
  name: string;
  slot: number;
  damage: number;
  pellets: number;
  spread: number;
  fireInterval: number;
  mag: number;
  reserve: number;
  maxReserve: number;
  reload: number;
  auto: boolean;
  recoil: number;
  bloom: number;
}

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  pistol: { id: "pistol", name: "TABANCA", slot: 1, damage: 34, pellets: 1, spread: 0.006, fireInterval: 0.2, mag: 12, reserve: 72, maxReserve: 96, reload: 1.2, auto: false, recoil: 0.025, bloom: 10 },
  shotgun: { id: "shotgun", name: "POMPALI", slot: 2, damage: 15, pellets: 8, spread: 0.065, fireInterval: 0.85, mag: 8, reserve: 40, maxReserve: 56, reload: 2.3, auto: false, recoil: 0.07, bloom: 22 },
  rifle: { id: "rifle", name: "PİYADE TÜFEĞİ", slot: 3, damage: 22, pellets: 1, spread: 0.014, fireInterval: 0.095, mag: 30, reserve: 150, maxReserve: 210, reload: 1.9, auto: true, recoil: 0.014, bloom: 5 },
};
export const WEAPON_ORDER: WeaponId[] = ["pistol", "shotgun", "rifle"];

export interface ZombieDef {
  kind: ZombieKind;
  name: string;
  hp: number;
  speed: number;
  damage: number;
  attackInterval: number;
  attackRange: number;
  scale: number;
  radius: number;
  gold: number;
  score: number;
}

export const ZOMBIES: Record<ZombieKind, ZombieDef> = {
  walker: { kind: "walker", name: "Yürüyen", hp: 100, speed: 2.1, damage: 10, attackInterval: 1.2, attackRange: 1.5, scale: 1, radius: 0.4, gold: 6, score: 100 },
  runner: { kind: "runner", name: "Koşucu", hp: 65, speed: 4.6, damage: 7, attackInterval: 0.8, attackRange: 1.4, scale: 0.95, radius: 0.38, gold: 9, score: 150 },
  tank: { kind: "tank", name: "Tank", hp: 480, speed: 1.45, damage: 26, attackInterval: 1.8, attackRange: 2.2, scale: 1.6, radius: 0.7, gold: 30, score: 450 },
  exploder: { kind: "exploder", name: "Patlayıcı", hp: 80, speed: 2.9, damage: 0, attackInterval: 0, attackRange: 2.2, scale: 1.05, radius: 0.45, gold: 14, score: 200 },
};

export const EXPLOSION = { radius: 5.5, playerDamage: 48, zombieDamage: 140, fuse: 0.55 };

export const PLAYER = { radius: 0.4, eye: 1.65, walk: 5.2, sprint: 8.4, jump: 6.6, gravity: 20, maxHp: 100, maxArmor: 100 };

export const PRICES = { health: 80, armor: 100, ammoCurrent: 60, ammoAll: 150, damageBase: 150, sentry: 250 };
export const LIMITS = { sentries: 3, damageLevel: 5, damagePerLevel: 0.15 };
export const SENTRY = { range: 24, interval: 0.28, damage: 16 };

export function wavePlan(wave: number): ZombieKind[] {
  const total = wave === 1 ? 6 : 5 + wave * 3;
  const out: ZombieKind[] = [];
  const runners = wave >= 2 ? Math.floor(total * Math.min(0.4, 0.2 + wave * 0.03)) : 0;
  const tanks = wave >= 3 ? 1 + Math.floor((wave - 3) / 2) : 0;
  const exploders = wave >= 4 ? 1 + Math.floor((wave - 4) * 0.7) : 0;
  for (let i = 0; i < runners; i++) out.push("runner");
  for (let i = 0; i < exploders; i++) out.push("exploder");
  for (let i = 0; i < tanks; i++) out.push("tank");
  while (out.length < total) out.push("walker");
  // shuffle, but keep the first three as walkers so a wave eases in
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const a = out[i];
    const b = out[j];
    if (a !== undefined && b !== undefined) { out[i] = b; out[j] = a; }
  }
  const firstWalkers = out.filter((k) => k === "walker").slice(0, 3);
  const rest = [...out];
  for (const w of firstWalkers) rest.splice(rest.indexOf(w), 1);
  return [...firstWalkers, ...rest];
}

export const waveHpScale = (wave: number) => 1 + 0.11 * (wave - 1);
export const waveSpeedScale = (wave: number) => 1 + Math.min(0.25, 0.03 * (wave - 1));
export const damageUpgradePrice = (level: number) => PRICES.damageBase * (level + 1);
