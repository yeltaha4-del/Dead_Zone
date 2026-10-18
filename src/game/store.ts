import type { Phase, Quality, WeaponId } from "./config";

export interface Settings {
  sensitivity: number;
  sound: boolean;
  quality: Quality;
}

export interface Notice {
  id: number;
  text: string;
  tone: "gold" | "ammo" | "info" | "warn";
}

export interface HudState {
  phase: Phase;
  wave: number;
  remaining: number;
  gold: number;
  score: number;
  kills: number;
  headshots: number;
  hp: number;
  armor: number;
  weapon: WeaponId;
  ammo: Record<WeaponId, { mag: number; reserve: number }>;
  reloading: boolean;
  countdown: number;
  banner: string;
  bannerId: number;
  notices: Notice[];
  flashlight: boolean;
  damageLevel: number;
  sentries: number;
  marketAfterWave: boolean;
  best: { wave: number; score: number };
  settings: Settings;
  lockFallback: boolean;
}

const KEY = "deadzone3d.v1";

export function loadSaved(): { best: { wave: number; score: number }; settings: Settings } {
  const def = { best: { wave: 0, score: 0 }, settings: { sensitivity: 1, sound: true, quality: "medium" as Quality } };
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return def;
    const p = JSON.parse(raw);
    return {
      best: { wave: Number(p?.best?.wave) || 0, score: Number(p?.best?.score) || 0 },
      settings: {
        sensitivity: Math.min(3, Math.max(0.2, Number(p?.settings?.sensitivity) || 1)),
        sound: p?.settings?.sound !== false,
        quality: p?.settings?.quality === "low" ? "low" : "medium",
      },
    };
  } catch {
    return def;
  }
}

export function persist(best: HudState["best"], settings: Settings) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ best, settings }));
  } catch {
    /* storage unavailable: ignore */
  }
}

type Listener = () => void;

export class HudStore {
  private state: HudState;
  private listeners = new Set<Listener>();
  constructor(initial: HudState) {
    this.state = initial;
  }
  get = () => this.state;
  subscribe = (l: Listener) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };
  set(patch: Partial<HudState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l());
  }
}
