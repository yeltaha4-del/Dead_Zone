import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { FXAAShader } from "three/examples/jsm/shaders/FXAAShader.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import {
  EXPLOSION, LIMITS, MAPS, MAP_ORDER, PLAYER, PRICES, SENTRY, WEAPONS, WEAPON_ORDER, ZOMBIES,
  QUALITY_PRESETS, damageUpgradePrice, wavePlan, waveHpScale, waveSpeedScale,
  type MapId, type Phase, type WeaponId, type ZombieKind, type QualityPreset
} from "./config";
import { Sfx } from "./audio";
import { Library, buildSentry, buildViewModel, buildZombie, type ViewModel, type ZombieRig } from "./models";
import { NavGrid, circleBlocked, resolveCircle, avoidObstacles, type P2 } from "./physics";
import { HudStore, loadSaved, persist, type Settings, type HudState } from "./store";
import { BOUND, buildWorld, buildMap, type World } from "./world";

interface Zombie { kind: ZombieKind; rig: ZombieRig; hp: number; maxHp: number; speed: number; vx: number; vz: number; cd: number; phase: number; hitT: number; state: "alive" | "dying"; deathT: number; fuse: number; stuckT: number; lastDist: number; noLoot: boolean }
interface Pickup { obj: THREE.Object3D; gold: number; ammo: boolean; life: number }
interface Sentry { root: THREE.Group; head: THREE.Group; flash: THREE.Mesh; cd: number; flashT: number }
type Ammo = Record<WeaponId, { mag: number; reserve: number }>;

const ADS_OFFSETS: Record<WeaponId, { x: number; y: number; z: number }> = {
  pistol: { x: 0.0, y: -0.068, z: -0.36 },
  shotgun: { x: 0.0, y: -0.055, z: -0.40 },
  rifle: { x: 0.0, y: -0.096, z: -0.42 },
};

const PMAX = 180;
export type BuyItem = "health" | "armor" | "ammoCurrent" | "ammoAll" | "damage" | "sentry";

export class Engine {
  store: HudStore;
  private renderer: THREE.WebGLRenderer;
  private composer: EffectComposer | null = null;
  private bloomPass: UnrealBloomPass | null = null;
  private fxaaPass: ShaderPass | null = null;
  private worldPass: RenderPass | null = null;
  private viewPass: RenderPass | null = null;
  private outputPass: OutputPass | null = null;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private vScene = new THREE.Scene();
  private vCam: THREE.PerspectiveCamera;
  private world!: World;
  private nav!: NavGrid;
  private currentMap: MapId = "city";
  private mapBound = BOUND;
  private L = new Library();
  private sfx = new Sfx();
  private raf = 0;
  private last = performance.now();
  private keys = new Set<string>();
  private mouseDown = false;
  private mouseRightDown = false;
  private ads = 0;
  private triggerUsed = false;
  private locked = false;
  private fallback = false;
  private resumeBlock = 0;
  private resumePhase: Phase = "combat";
  private pos = new THREE.Vector3(0, 0, 8);
  private vy = 0;
  private hv = new THREE.Vector2();
  private grounded = true;
  private yaw = 0;
  private pitch = 0;
  private recoil = 0;
  private bob = 0;
  private shake = 0;
  private dmgFlash = 0;
  private bloom = 0;
  private hitT = 0;
  private headT = 0;
  private hp = 100; private armor = 0; private gold = 0; private score = 0; private kills = 0; private heads = 0;
  private wave = 0; private dmgLevel = 0;
  private weapon: WeaponId = "rifle";
  private ammo!: Ammo;
  private cool = 0; private reloadT = 0; private switchT = 0; private flashT = 0;
  private zombies: Zombie[] = [];
  private toSpawn: ZombieKind[] = [];
  private spawnT = 0; private countdown = 0; private clearT = -1; private navT = 0; private emitT = 0; private groanT = 3;
  private pickups: Pickup[] = [];
  private sentries: Sentry[] = [];
  private targets: THREE.Object3D[] = [];
  private targetsDirty = true;
  private ray = new THREE.Raycaster();
  private views: Record<WeaponId, ViewModel>;
  private vmRoot = new THREE.Group();
  private muzzleLight = new THREE.PointLight("#ffb050", 0, 10, 2);
  private flashlight = new THREE.SpotLight("#fff2d8", 40, 45, 0.42, 0.5, 1.4);
  private moon: THREE.DirectionalLight;
  private parts: THREE.InstancedMesh;
  private pPos = new Float32Array(PMAX * 3); private pVel = new Float32Array(PMAX * 3); private pLife = new Float32Array(PMAX); private pNext = 0;
  private tracers: { line: THREE.Line; t: number }[] = [];
  private booms: { m: THREE.Mesh; t: number }[] = [];
  private noticeId = 0;
  private disposed = false;
  private timeouts = new Set<ReturnType<typeof setTimeout>>();
  private settings: Settings;
  private best: { wave: number; score: number };
  private els: { cross?: HTMLElement | null; hit?: HTMLElement | null; vig?: HTMLElement | null } = {};
  private canvas: HTMLCanvasElement;
  private tmp = new THREE.Vector3(); private tmp2 = new THREE.Vector3(); private p2 = { x: 0, z: 0 }; private avoidP2: P2 = { x: 0, z: 0 };

  constructor(private container: HTMLElement) {
    const saved = loadSaved();
    this.settings = saved.settings;
    this.best = saved.best;
    this.sfx.enabled = this.settings.sound;
    const preset = QUALITY_PRESETS[this.settings.quality] || QUALITY_PRESETS.medium;
    this.renderer = new THREE.WebGLRenderer({ antialias: preset.fxaa || preset.shadows, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, preset.pixelRatioCap));
    this.renderer.shadowMap.enabled = preset.shadows;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.autoClear = false;
    this.canvas = this.renderer.domElement;
    container.appendChild(this.canvas);

    const fog = new THREE.Color("#222a36");
    this.scene.background = fog;
    this.scene.fog = new THREE.FogExp2(fog, 0.024);
    this.camera = new THREE.PerspectiveCamera(72, 1, 0.05, 220);
    this.camera.rotation.order = "YXZ";
    this.vCam = new THREE.PerspectiveCamera(60, 1, 0.01, 10);
    this.scene.add(this.camera);
    this.scene.add(new THREE.HemisphereLight("#8aa0c4", "#2c313a", 1.15));
    this.moon = new THREE.DirectionalLight("#a2b8e4", 1.25);
    this.moon.position.set(30, 60, 20);
    this.moon.castShadow = preset.shadows;
    this.moon.shadow.mapSize.set(preset.shadowMapSize, preset.shadowMapSize);
    Object.assign(this.moon.shadow.camera, { left: -70, right: 70, top: 70, bottom: -70, near: 1, far: 160 });
    this.moon.shadow.bias = -0.0003;
    this.moon.shadow.normalBias = 0.02;
    this.scene.add(this.moon);
    this.world = buildMap(this.currentMap, preset.shadows, this.settings.quality);
    this.mapBound = this.world.bound ?? BOUND;
    this.scene.add(this.world.group);
    this.world.lampLights.forEach((l) => (l.visible = preset.shadows));
    this.nav = new NavGrid(this.world.colliders, this.mapBound);
    this.setupPostProcessing();
    this.camera.add(this.flashlight, this.flashlight.target, this.muzzleLight);
    this.flashlight.position.set(0.2, -0.1, 0);
    this.flashlight.target.position.set(0, 0, -10);
    this.muzzleLight.position.set(0.2, -0.1, -1);
    this.flashlight.visible = true;
    // viewmodel scene
    this.vScene.add(new THREE.AmbientLight("#8090b0", 1.2));
    const vl = new THREE.DirectionalLight("#ffe6c0", 1.6);
    vl.position.set(1, 2, 1);
    this.vScene.add(vl, this.vmRoot);
    this.views = { pistol: buildViewModel(this.L, "pistol"), shotgun: buildViewModel(this.L, "shotgun"), rifle: buildViewModel(this.L, "rifle") };
    for (const v of Object.values(this.views)) {
      this.vmRoot.add(v.group);
      const f = this.L.b(this.L.flash, 0.12, 0.12, 0.2, 0, 0, -0.08, v.muzzle, false);
      f.name = "flash";
      f.visible = false;
    }
    this.parts = new THREE.InstancedMesh(this.L.box, new THREE.MeshStandardMaterial({ roughness: 0.6 }), PMAX);
    this.parts.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const c = new THREE.Color("#a01010");
    for (let i = 0; i < PMAX; i++) { this.parts.setColorAt(i, c); this.parts.setMatrixAt(i, new THREE.Matrix4().makeScale(0, 0, 0)); }
    this.parts.frustumCulled = false;
    this.scene.add(this.parts);
    for (let i = 0; i < 14; i++) {
      const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
      const line = new THREE.Line(g, new THREE.LineBasicMaterial({ color: "#ffd080", transparent: true }));
      line.visible = false; line.frustumCulled = false;
      this.scene.add(line);
      this.tracers.push({ line, t: 0 });
    }
    for (let i = 0; i < 3; i++) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), this.L.boom);
      m.visible = false;
      this.scene.add(m);
      this.booms.push({ m, t: 0 });
    }
    this.resetRun();
    this.store = new HudStore(this.snapshot("menu"));
    this.resize();
    window.addEventListener("resize", this.resize);
    window.addEventListener("keydown", this.onKey);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
    window.addEventListener("mouseup", this.onUp);
    document.addEventListener("mousemove", this.onMove);
    document.addEventListener("pointerlockchange", this.onLock);
    this.canvas.addEventListener("mousedown", this.onDown);
    this.canvas.addEventListener("contextmenu", this.onContextMenu);
    window.addEventListener("contextmenu", this.onContextMenu);
    this.raf = requestAnimationFrame(this.loop);
    (window as unknown as { __game: Engine }).__game = this;
  }

  bindElements(e: Engine["els"]) { this.els = e; }

  private snapshot(phase: Phase): HudState {
    return {
      phase, wave: this.wave, remaining: this.toSpawn.length + this.zombies.filter((z) => z.state === "alive").length,
      gold: this.gold, score: this.score, kills: this.kills, headshots: this.heads, hp: Math.ceil(this.hp), armor: Math.ceil(this.armor),
      weapon: this.weapon, ammo: { pistol: { ...this.ammo.pistol }, shotgun: { ...this.ammo.shotgun }, rifle: { ...this.ammo.rifle } },
      reloading: this.reloadT > 0, countdown: Math.ceil(this.countdown), banner: "", bannerId: 0, notices: [], flashlight: this.flashlight.visible,
      damageLevel: this.dmgLevel, sentries: this.sentries.length, marketAfterWave: false, best: { ...this.best }, settings: { ...this.settings }, lockFallback: this.fallback,
      map: this.currentMap,
    };
  }
  private emit(extra: Partial<ReturnType<Engine["snapshot"]>> = {}) {
    const s = this.snapshot(this.store.get().phase);
    const cur = this.store.get();
    this.store.set({ ...s, banner: cur.banner, bannerId: cur.bannerId, notices: cur.notices, marketAfterWave: cur.marketAfterWave, ...extra });
  }
  private banner(text: string) { this.store.set({ banner: text, bannerId: this.store.get().bannerId + 1 }); }
  private notice(text: string, tone: "gold" | "ammo" | "info" | "warn") {
    const id = ++this.noticeId;
    this.store.set({ notices: [...this.store.get().notices.slice(-3), { id, text, tone }] });
    this.later(() => this.store.set({ notices: this.store.get().notices.filter((n) => n.id !== id) }), 2200);
  }
  private later(fn: () => void, ms: number) {
    const id = setTimeout(() => { this.timeouts.delete(id); if (!this.disposed) fn(); }, ms);
    this.timeouts.add(id);
  }
  private get phase() { return this.store?.get().phase ?? "menu"; }
  private setPhase(p: Phase, extra: object = {}) {
    this.clearInput();
    this.ads = 0;
    if (this.camera && this.camera.fov !== 72) {
      this.camera.fov = 72;
      this.camera.updateProjectionMatrix();
    }
    this.emit({ phase: p, ...extra });
  }
  private get simulating() { return !this.disposed && (this.phase === "combat" || this.phase === "countdown") && this.locked; }

  // ---------- lifecycle / control ----------
  private resetRun() {
    for (const id of this.timeouts) clearTimeout(id);
    this.timeouts.clear();
    this.clearInput();
    for (const z of this.zombies) this.scene.remove(z.rig.root);
    for (const p of this.pickups) this.scene.remove(p.obj);
    for (const s of this.sentries) this.scene.remove(s.root);
    this.zombies = []; this.pickups = []; this.sentries = []; this.toSpawn = []; this.targetsDirty = true;
    const spawn = this.world?.playerSpawn ?? { x: 0, z: 8 };
    this.pos.set(spawn.x, 0, spawn.z); this.vy = 0; this.hv.set(0, 0); this.yaw = 0; this.pitch = 0;
    this.mouseRightDown = false; this.ads = 0;
    if (this.camera && this.camera.fov !== 72) { this.camera.fov = 72; this.camera.updateProjectionMatrix(); }
    this.grounded = true; this.fallback = false; this.recoil = 0; this.bob = 0; this.bloom = 0;
    this.hitT = 0; this.headT = 0; this.flashT = 0; this.spawnT = 0; this.navT = 0; this.emitT = 0; this.groanT = 3;
    this.resumePhase = "countdown"; this.switchT = 0; this.targets = []; this.noticeId = 0;
    this.flashlight.visible = true;
    this.hp = 100; this.armor = 0; this.gold = 0; this.score = 0; this.kills = 0; this.heads = 0; this.wave = 0; this.dmgLevel = 0;
    this.ammo = { pistol: { mag: 12, reserve: 72 }, shotgun: { mag: 8, reserve: 40 }, rifle: { mag: 30, reserve: 150 } };
    this.equip("rifle"); this.reloadT = 0; this.cool = 0; this.clearT = -1; this.dmgFlash = 0; this.shake = 0;
    this.pLife.fill(0);
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < PMAX; i++) this.parts.setMatrixAt(i, zero);
    this.parts.instanceMatrix.needsUpdate = true;
    for (const t of this.tracers) { t.t = 0; t.line.visible = false; }
    for (const b of this.booms) { b.t = 0; b.m.visible = false; }
  }
  private requestLock() {
    this.sfx.unlock();
    try {
      const r = this.canvas.requestPointerLock() as unknown as Promise<void> | undefined;
      if (r && typeof r.catch === "function") r.catch(() => this.useFallback());
    } catch { this.useFallback(); }
    this.later(() => { if (!this.locked && (this.phase === "combat" || this.phase === "countdown")) this.useFallback(); }, 600);
  }
  private useFallback() {
    if (this.locked || this.disposed || (this.phase !== "combat" && this.phase !== "countdown")) return;
    this.resumePhase = this.phase;
    this.fallback = false;
    this.setPhase("paused", { lockFallback: true });
  }
  start(mapId?: MapId) {
    if (mapId && mapId !== this.currentMap) {
      this.setMap(mapId);
    }
    this.resetRun();
    this.wave = 1; this.countdown = 3; this.toSpawn = wavePlan(1);
    this.setPhase("countdown", { marketAfterWave: false, notices: [], banner: "", lockFallback: false });
    this.banner("DALGA 1");
    this.requestLock();
  }
  selectMap(id: MapId) {
    if (this.currentMap === id && this.world) return;
    this.setMap(id);
  }
  private setupPostProcessing() {
    this.disposePostProcessing();
    const preset = QUALITY_PRESETS[this.settings.quality] || QUALITY_PRESETS.medium;
    if (!preset.postProcessing) return;
    try {
      const w = this.container?.clientWidth || (typeof window !== "undefined" ? window.innerWidth : 800) || 800;
      const h = this.container?.clientHeight || (typeof window !== "undefined" ? window.innerHeight : 600) || 600;
      const pr = Math.min((typeof window !== "undefined" ? window.devicePixelRatio : 1) || 1, preset.pixelRatioCap);

      this.composer = new EffectComposer(this.renderer);
      this.composer.setSize(w, h);

      this.worldPass = new RenderPass(this.scene, this.camera);
      this.composer.addPass(this.worldPass);

      this.viewPass = new RenderPass(this.vScene, this.vCam);
      this.viewPass.clear = false;
      this.viewPass.clearDepth = true;
      this.composer.addPass(this.viewPass);

      this.outputPass = new OutputPass();
      this.composer.addPass(this.outputPass);

      if (preset.fxaa) {
        this.fxaaPass = new ShaderPass(FXAAShader);
        const res = this.fxaaPass.material.uniforms["resolution"];
        if (res && res.value) res.value.set(1 / (w * pr), 1 / (h * pr));
        this.fxaaPass.renderToScreen = true;
        this.composer.addPass(this.fxaaPass);
      }
    } catch {
      this.composer = null;
    }
  }

  private disposePostProcessing() {
    if (this.composer) {
      try {
        const passes = [...this.composer.passes];
        for (const p of passes) {
          if (p && typeof (p as any).dispose === "function") {
            (p as any).dispose();
          }
        }
      } catch {
        /* ignore */
      }
      this.composer = null;
    }
    this.worldPass = null;
    this.viewPass = null;
    this.bloomPass = null;
    this.fxaaPass = null;
    this.outputPass = null;
  }

  setMap(id: MapId) {
    this.currentMap = id;
    const preset = QUALITY_PRESETS[this.settings.quality] || QUALITY_PRESETS.medium;
    if (this.world) {
      this.scene.remove(this.world.group);
      this.world.dispose();
    }
    this.world = buildMap(id, preset.shadows, this.settings.quality);
    this.scene.add(this.world.group);
    this.mapBound = this.world.bound ?? BOUND;
    this.world.lampLights.forEach((l) => (l.visible = preset.shadows));
    this.nav = new NavGrid(this.world.colliders, this.mapBound);
    const mapDef = MAPS[id];
    const fogCol = new THREE.Color(this.world.fogColor ?? mapDef?.fogColor ?? "#2b3546");
    this.scene.background = fogCol;
    this.scene.fog = new THREE.FogExp2(fogCol, this.world.fogDensity ?? mapDef?.fogDensity ?? 0.024);
    const spawn = this.world.playerSpawn ?? { x: 0, z: 8 };
    this.pos.set(spawn.x, 0, spawn.z);
    this.targetsDirty = true;
    this.emit();
  }
  resume() {
    if (this.phase !== "paused") return;
    this.setPhase(this.resumePhase, { lockFallback: false });
    this.resumeBlock = performance.now() + 250;
    this.requestLock();
  }
  openMarket() {
    if (this.phase !== "combat" && this.phase !== "countdown") return;
    this.resumePhase = this.phase;
    this.setPhase("market", { marketAfterWave: false });
    if (document.pointerLockElement) document.exitPointerLock();
  }
  closeMarket() {
    if (this.phase !== "market") return;
    if (this.store.get().marketAfterWave) return this.nextWave();
    this.fallback = false;
    this.setPhase("paused");
  }
  nextWave() {
    this.wave += 1; this.countdown = 3; this.toSpawn = wavePlan(this.wave); this.clearT = -1;
    this.resumePhase = "countdown";
    this.setPhase("countdown", { marketAfterWave: false });
    this.banner(`DALGA ${this.wave}`);
    this.resumeBlock = performance.now() + 250;
    this.requestLock();
  }
  toMenu() { this.resetRun(); this.setPhase("menu", { notices: [], banner: "", marketAfterWave: false, lockFallback: false }); if (document.pointerLockElement) document.exitPointerLock(); }
  updateSettings(s: Partial<Settings>) {
    const prevQuality = this.settings.quality;
    this.settings = { ...this.settings, ...s };
    this.sfx.enabled = this.settings.sound;
    const preset = QUALITY_PRESETS[this.settings.quality] || QUALITY_PRESETS.medium;
    if (typeof this.renderer?.setPixelRatio === "function") {
      this.renderer.setPixelRatio(Math.min((typeof window !== "undefined" ? window.devicePixelRatio : 1) || 1, preset.pixelRatioCap));
    }
    if (this.renderer?.shadowMap) {
      this.renderer.shadowMap.enabled = preset.shadows;
    }
    if (this.moon) {
      this.moon.castShadow = preset.shadows;
      if (this.moon.shadow?.mapSize) {
        this.moon.shadow.mapSize.set(preset.shadowMapSize, preset.shadowMapSize);
      }
      if (this.moon.shadow?.map) {
        this.moon.shadow.map.dispose();
        (this.moon.shadow as any).map = null;
      }
    }
    if (this.world?.lampLights) {
      this.world.lampLights.forEach((l) => (l.visible = preset.shadows));
    }

    if (prevQuality !== this.settings.quality) {
      this.scene.environment = null;
      this.setupPostProcessing();
      this.scene.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.Material | undefined;
        if (m) m.needsUpdate = true;
      });
    }

    this.resize();
    persist(this.best, this.settings);
    this.emit();
  }

  buy(item: BuyItem): string | null {
    if (this.phase !== "market") return "Market kapalı";
    const w = WEAPONS[this.weapon];
    let price = 0; let apply: () => void = () => {};
    switch (item) {
      case "health": if (this.hp >= PLAYER.maxHp) return "Sağlık zaten dolu"; price = PRICES.health; apply = () => (this.hp = Math.min(PLAYER.maxHp, this.hp + 50)); break;
      case "armor": if (this.armor >= PLAYER.maxArmor) return "Zırh zaten dolu"; price = PRICES.armor; apply = () => (this.armor = Math.min(PLAYER.maxArmor, this.armor + 50)); break;
      case "ammoCurrent": if (this.ammo[this.weapon].reserve >= w.maxReserve) return "Yedek cephane dolu"; price = PRICES.ammoCurrent; apply = () => (this.ammo[this.weapon].reserve = w.maxReserve); break;
      case "ammoAll": if (WEAPON_ORDER.every((id) => this.ammo[id].reserve >= WEAPONS[id].maxReserve)) return "Tüm cephane dolu"; price = PRICES.ammoAll; apply = () => WEAPON_ORDER.forEach((id) => (this.ammo[id].reserve = WEAPONS[id].maxReserve)); break;
      case "damage": if (this.dmgLevel >= LIMITS.damageLevel) return "Maksimum seviye"; price = damageUpgradePrice(this.dmgLevel); apply = () => this.dmgLevel++; break;
      case "sentry": {
        if (this.sentries.length >= LIMITS.sentries) return "En fazla 3 taret";
        price = PRICES.sentry;
        const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
        let spot: { x: number; z: number } | null = null;
        for (const d of [2.4, 1.8, 3.2]) {
          const x = this.pos.x + fx * d, z = this.pos.z + fz * d;
          if (circleBlocked(x, z, 0.7, this.world.colliders, BOUND - 1.5)) continue;
          if (this.sentries.some((s) => Math.hypot(s.root.position.x - x, s.root.position.z - z) < 1.6)) continue;
          if (this.blocked(this.tmp.set(this.pos.x, 1, this.pos.z), this.tmp2.set(x, 1, z))) continue;
          spot = { x, z }; break;
        }
        if (!spot) return "Burada yer yok — açık bir alana bak";
        const sp = spot;
        apply = () => {
          const s = buildSentry(this.L, this.renderer.shadowMap.enabled);
          s.root.position.set(sp.x, 0, sp.z);
          this.scene.add(s.root);
          this.sentries.push({ ...s, cd: 0, flashT: 0 });
        };
        break;
      }
    }
    if (this.gold < price) { this.sfx.deny(); return "Yetersiz altın"; }
    this.gold -= price; apply(); this.sfx.buy(); this.emit(); return null;
  }

  // ---------- input ----------
  private clearInput = () => { this.keys.clear(); this.mouseDown = false; this.mouseRightDown = false; };
  private onBlur = () => {
    this.clearInput();
    if (this.phase === "combat" || this.phase === "countdown") {
      this.resumePhase = this.phase;
      this.setPhase("paused");
      if (document.pointerLockElement) document.exitPointerLock();
    }
  };
  private onKey = (e: KeyboardEvent) => {
    const k = e.code;
    if (["Space", "ArrowUp", "ArrowDown"].includes(k) && this.simulating) e.preventDefault();
    if (k === "Escape" && this.fallback && this.simulating) { this.fallback = false; this.resumePhase = this.phase; this.setPhase("paused"); return; }
    if ((k === "KeyB" || k === "KeyP") && this.simulating) return this.openMarket();
    if (!this.simulating) return;
    this.keys.add(k);
    if (e.repeat) return;
    if (k === "KeyR") this.startReload();
    if (k === "KeyF") { this.flashlight.visible = !this.flashlight.visible; this.emit(); }
    if (k === "Digit1") this.equip("pistol");
    if (k === "Digit2") this.equip("shotgun");
    if (k === "Digit3") this.equip("rifle");
  };
  private onKeyUp = (e: KeyboardEvent) => this.keys.delete(e.code);
  private onContextMenu = (e: MouseEvent) => { e.preventDefault(); };
  private onDown = (e: MouseEvent) => {
    if (!this.simulating || performance.now() < this.resumeBlock) return;
    if (e.button === 0) {
      this.mouseDown = true; this.triggerUsed = false;
    } else if (e.button === 2) {
      this.mouseRightDown = true;
    }
  };
  private onUp = (e?: MouseEvent) => {
    if (e && e.button !== undefined) {
      if (e.button === 0) this.mouseDown = false;
      if (e.button === 2) this.mouseRightDown = false;
    } else {
      this.mouseDown = false;
      this.mouseRightDown = false;
    }
  };
  private onMove = (e: MouseEvent) => {
    if (!this.simulating) return;
    const s = 0.0022 * this.settings.sensitivity * THREE.MathUtils.lerp(1, 0.72, this.ads ?? 0);
    this.yaw -= e.movementX * s;
    this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch - e.movementY * s));
  };
  private onLock = () => {
    this.locked = document.pointerLockElement === this.canvas;
    if (this.locked) { this.fallback = false; this.resumeBlock = performance.now() + 200; this.emit({ lockFallback: false }); }
    else if (this.phase === "combat" || this.phase === "countdown") { this.resumePhase = this.phase; this.setPhase("paused"); }
  };
  private resize = () => {
    const w = this.container.clientWidth || (typeof window !== "undefined" ? window.innerWidth : 800) || 800;
    const h = this.container.clientHeight || (typeof window !== "undefined" ? window.innerHeight : 600) || 600;
    const preset = QUALITY_PRESETS[this.settings.quality] || QUALITY_PRESETS.medium;
    const pr = Math.min((typeof window !== "undefined" ? window.devicePixelRatio : 1) || 1, preset.pixelRatioCap);
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, false);
    this.canvas.style.width = "100%"; this.canvas.style.height = "100%";
    this.camera.aspect = this.vCam.aspect = w / h;
    this.camera.updateProjectionMatrix(); this.vCam.updateProjectionMatrix();

    if (this.composer) {
      try {
        this.composer.setSize(w, h);
        if (this.bloomPass) this.bloomPass.setSize(w, h);
        if (this.fxaaPass) {
          const res = this.fxaaPass.material.uniforms["resolution"];
          if (res && res.value) res.value.set(1 / (w * pr), 1 / (h * pr));
        }
      } catch {
        /* ignore */
      }
    }
  };

  // ---------- weapons ----------
  private equip(id: WeaponId) {
    if (this.weapon === id && this.views?.[id]?.group.visible) return;
    this.mouseRightDown = false;
    this.weapon = id; this.reloadT = 0; this.switchT = 0.25; this.cool = Math.max(this.cool, 0.2);
    if (this.views) for (const k of WEAPON_ORDER) this.views[k].group.visible = k === id;
    if (this.store) this.emit();
  }
  private startReload() {
    const a = this.ammo[this.weapon], w = WEAPONS[this.weapon];
    if (this.reloadT > 0 || a.mag >= w.mag || a.reserve <= 0) return;
    this.mouseRightDown = false;
    this.reloadT = w.reload; this.sfx.reload(); this.emit();
  }
  private blocked(a: THREE.Vector3, b: THREE.Vector3) {
    const d = new THREE.Vector3().subVectors(b, a); const len = d.length();
    if (len < 0.001) return false;
    this.ray.set(a, d.normalize()); this.ray.far = len;
    const hit = this.ray.intersectObjects(this.world.blockers, false);
    return hit.some((h) => h.distance < len - 0.05);
  }
  private fire() {
    if (!this.simulating || this.phase !== "combat" || this.reloadT > 0 || this.switchT > 0 || this.cool > 0) return;
    const w = WEAPONS[this.weapon], a = this.ammo[this.weapon];
    if (a.mag <= 0) { this.sfx.empty(); this.cool = 0.25; this.triggerUsed = true; this.startReload(); return; }
    a.mag--; this.cool = w.fireInterval; this.flashT = 0.05; this.bloom = Math.min(60, this.bloom + w.bloom);
    this.camera.position.set(this.pos.x, this.pos.y + PLAYER.eye, this.pos.z);
    this.camera.rotation.set(this.pitch + this.recoil, this.yaw, 0);
    this.camera.updateMatrixWorld(true);
    for (const z of this.zombies) z.rig.root.updateMatrixWorld(true);
    this.sfx.shot(this.weapon);
    if (this.targetsDirty) { this.targets = [...this.world.blockers, ...this.zombies.filter((z) => z.state === "alive").flatMap((z) => z.rig.hitMeshes)]; this.targetsDirty = false; }
    const moving = this.hv.length() > 1;
    const adsSpreadMult = THREE.MathUtils.lerp(1, 0.45, this.ads ?? 0);
    const spread = (w.spread * (this.keys.has("ShiftLeft") && moving ? 2.2 : moving ? 1.5 : 1) * (this.grounded ? 1 : 2) + this.bloom * 0.0004) * adsSpreadMult;
    const origin = this.camera.getWorldPosition(new THREE.Vector3());
    const hitsByZ = new Map<Zombie, { dmg: number; head: boolean }>();
    for (let p = 0; p < w.pellets; p++) {
      const dir = new THREE.Vector3((Math.random() - 0.5) * 2 * spread, (Math.random() - 0.5) * 2 * spread, -1).normalize().applyQuaternion(this.camera.quaternion);
      this.ray.set(origin, dir); this.ray.far = 150;
      const hit = this.ray.intersectObjects(this.targets, false)[0];
      const end = hit ? hit.point : origin.clone().addScaledVector(dir, 150);
      if (p < 3) this.tracer(origin.clone().addScaledVector(dir, 1).add(new THREE.Vector3(0, -0.15, 0)), end);
      if (!hit) continue;
      const z = this.zombies.find((zz) => zz.rig.hitMeshes.includes(hit.object as THREE.Mesh));
      if (z) {
        const head = hit.object.userData["part"] === "head";
        const dmg = w.damage * (1 + LIMITS.damagePerLevel * this.dmgLevel) * (head ? 2 : 1);
        const prev = hitsByZ.get(z) ?? { dmg: 0, head: false };
        hitsByZ.set(z, { dmg: prev.dmg + dmg, head: prev.head || head });
        this.burst(hit.point, 5, "#a01010", 3);
      } else { this.burst(hit.point, 3, "#8a8a80", 2); }
    }
    for (const [z, h] of hitsByZ) {
      this.hitT = 0.15; if (h.head) this.headT = 0.3;
      this.sfx.hit(h.head);
      this.damageZombie(z, h.dmg, h.head);
    }
    if (hitsByZ.size === 0) this.sfx.impact();
    this.recoil += w.recoil * THREE.MathUtils.lerp(1, 0.75, this.ads ?? 0);
    this.emit();
  }
  private tracer(a: THREE.Vector3, b: THREE.Vector3) {
    const t = this.tracers.find((x) => x.t <= 0) ?? this.tracers[0];
    if (!t) return;
    const pos = t.line.geometry.attributes["position"] as THREE.BufferAttribute;
    pos.setXYZ(0, a.x, a.y, a.z); pos.setXYZ(1, b.x, b.y, b.z); pos.needsUpdate = true;
    t.t = 0.06; t.line.visible = true;
  }
  private burst(p: THREE.Vector3, n: number, color: string, speed: number) {
    const c = new THREE.Color(color);
    for (let i = 0; i < n; i++) {
      const k = this.pNext; this.pNext = (this.pNext + 1) % PMAX;
      this.pPos.set([p.x, p.y, p.z], k * 3);
      this.pVel.set([(Math.random() - 0.5) * speed * 2, Math.random() * speed * 1.4, (Math.random() - 0.5) * speed * 2], k * 3);
      this.pLife[k] = 0.8 + Math.random() * 0.8;
      this.parts.setColorAt(k, c);
    }
    if (this.parts.instanceColor) this.parts.instanceColor.needsUpdate = true;
  }

  private spawn(kind: ZombieKind) {
    const def = ZOMBIES[kind];
    const pts = this.world.spawnPoints.filter((s) => Math.hypot(s.x - this.pos.x, s.y - this.pos.z) > 18 && this.nav.distAt(s.x, s.y) >= 0 && !circleBlocked(s.x, s.y, def.radius, this.world.colliders, this.mapBound));
    const candidateList = pts.length > 0 ? pts : this.world.spawnPoints.filter((s) => !circleBlocked(s.x, s.y, def.radius, this.world.colliders, this.mapBound));
    const sp = candidateList[Math.floor(Math.random() * candidateList.length)];
    if (!sp) { this.toSpawn.unshift(kind); return; }
    const rig = buildZombie(this.L, kind, this.renderer.shadowMap.enabled);
    rig.root.scale.setScalar(def.scale);
    rig.root.position.set(sp.x, 0, sp.y);
    this.scene.add(rig.root);
    const hp = def.hp * waveHpScale(this.wave);
    this.zombies.push({ kind, rig, hp, maxHp: hp, speed: def.speed * waveSpeedScale(this.wave) * (0.9 + Math.random() * 0.2), vx: 0, vz: 0, cd: 0.5, phase: Math.random() * 6, hitT: 0, state: "alive", deathT: 0, fuse: -1, stuckT: 0, lastDist: 1e9, noLoot: false });
    this.targetsDirty = true;
  }
  private damageZombie(z: Zombie, dmg: number, head: boolean) {
    if (z.state !== "alive") return;
    z.hp -= dmg; z.hitT = 0.2;
    if (z.hp <= 0) this.killZombie(z, head);
  }
  private killZombie(z: Zombie, head: boolean) {
    if (z.state !== "alive") return;
    z.state = "dying"; z.deathT = 0; this.targetsDirty = true;
    const def = ZOMBIES[z.kind];
    const p = z.rig.root.position;
    this.burst(this.tmp.set(p.x, 1.2 * def.scale, p.z), 14, z.kind === "exploder" ? "#5cff2a" : "#a01010", 4);
    if (!z.noLoot) {
      this.kills++; if (head) this.heads++;
      this.score += def.score + (head ? 50 : 0);
      this.dropLoot(p.x, p.z, def.gold, Math.random() < 0.25);
    }
    if (z.kind === "exploder") this.explode(p.clone());
    const corpses = this.zombies.filter((x) => x.state === "dying");
    if (corpses.length > 10 && corpses[0]) { corpses[0].rig.root.visible = false; corpses[0].rig.root.position.y = -4; }
    this.emit();
  }
  private explode(at: THREE.Vector3) {
    this.sfx.explode();
    this.burst(this.tmp.set(at.x, 1, at.z), 30, "#ff8a20", 7);
    const b = this.booms.find((x) => x.t <= 0) ?? this.booms[0];
    if (b) { b.m.position.set(at.x, 1, at.z); b.t = 0.4; b.m.visible = true; }
    const d = Math.hypot(at.x - this.pos.x, at.z - this.pos.z);
    if (d < EXPLOSION.radius) { this.hurt(EXPLOSION.playerDamage * (1 - d / EXPLOSION.radius)); this.shake = 0.6; }
    for (const z of [...this.zombies]) {
      if (z.state !== "alive") continue;
      const dz = Math.hypot(z.rig.root.position.x - at.x, z.rig.root.position.z - at.z);
      if (dz < EXPLOSION.radius) this.damageZombie(z, EXPLOSION.zombieDamage * (1 - dz / EXPLOSION.radius), false);
    }
  }
  private dropLoot(x: number, z: number, gold: number, ammo: boolean) {
    const g = new THREE.Group();
    if (ammo) {
      this.L.b(this.L.ammoBox, 0.5, 0.3, 0.35, 0, 0, 0, g);
      this.L.b(this.L.ammoStripe, 0.52, 0.06, 0.37, 0, 0.05, 0, g, false);
    } else {
      for (let i = 0; i < 3; i++) { const c = this.L.mesh(this.L.coin, this.L.gold, 1, 1, 1, (i - 1) * 0.12, i * 0.07, 0, g, false); c.rotation.x = Math.PI / 2; }
    }
    g.position.set(x, 0.5, z);
    this.scene.add(g);
    this.pickups.push({ obj: g, gold: ammo ? 0 : gold, ammo, life: 40 });
    if (ammo) this.pickups.push(...[]);
    if (this.pickups.length > 40) { const old = this.pickups.shift()!; this.scene.remove(old.obj); }
    if (ammo) { const g2 = new THREE.Group(); for (let i = 0; i < 2; i++) { const c = this.L.mesh(this.L.coin, this.L.gold, 1, 1, 1, i * 0.15, 0, 0, g2, false); c.rotation.x = Math.PI / 2; } g2.position.set(x + 0.6, 0.5, z); this.scene.add(g2); this.pickups.push({ obj: g2, gold, ammo: false, life: 40 }); }
  }
  private hurt(dmg: number) {
    if (!this.simulating || this.hp <= 0) return;
    const a = Math.min(this.armor, dmg); this.armor -= a; this.hp -= dmg - a;
    this.dmgFlash = Math.min(1, this.dmgFlash + 0.5 + dmg / 60); this.shake = Math.max(this.shake, 0.25); this.sfx.hurt();
    if (this.hp <= 0) {
      this.hp = 0;
      this.best = { wave: Math.max(this.best.wave, this.wave), score: Math.max(this.best.score, this.score) };
      persist(this.best, this.settings);
      this.setPhase("gameover");
      if (document.pointerLockElement) document.exitPointerLock();
    }
    this.emit();
  }

  // ---------- simulation ----------
  private loop = (now: number) => {
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(0.1, (now - this.last) / 1000); this.last = now;
    if (this.simulating) { const n = Math.ceil(dt / 0.02); for (let i = 0; i < n && this.simulating; i++) this.step(dt / n); }
    else if (this.phase === "menu") { this.yaw = Math.sin(now * 0.00008) * 0.5 + 0.2; this.pitch = 0.05; }
    this.visuals(this.simulating ? dt : 0);
    if (this.composer && (this.settings.quality === "high" || this.settings.quality === "ultra")) {
      this.composer.render();
    } else {
      this.renderer.clear(); this.renderer.render(this.scene, this.camera);
      this.renderer.clearDepth(); this.renderer.render(this.vScene, this.vCam);
    }
  };

  private step(dt: number) {
    if (!this.simulating) return;
    // player
    let ix = 0, iz = 0;
    if (this.keys.has("KeyW")) iz -= 1; if (this.keys.has("KeyS")) iz += 1; if (this.keys.has("KeyA")) ix -= 1; if (this.keys.has("KeyD")) ix += 1;
    const l = Math.hypot(ix, iz) || 1; ix /= l; iz /= l;
    const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
    const sprint = (this.keys.has("ShiftLeft") || this.keys.has("ShiftRight")) && iz < 0;
    if (sprint && this.hv.length() > 2) {
      this.mouseRightDown = false;
    }
    const canAds = (this.mouseRightDown ?? false) && this.reloadT <= 0 && this.switchT <= 0 && (!sprint || this.hv.length() <= 2);
    const adsTarget = canAds ? 1 : 0;
    this.ads = (this.ads ?? 0) + (adsTarget - (this.ads ?? 0)) * (1 - Math.exp(-18 * dt));
    if (Math.abs(this.ads - adsTarget) < 0.01) this.ads = adsTarget;

    const adsMult = THREE.MathUtils.lerp(1, 0.65, this.ads ?? 0);
    const speed = (sprint ? PLAYER.sprint : PLAYER.walk) * adsMult;
    const wx = (ix * c + iz * s) * speed, wz = (-ix * s + iz * c) * speed;
    const k = 1 - Math.exp(-(this.grounded ? 14 : 3) * dt);
    this.hv.x += (wx - this.hv.x) * k; this.hv.y += (wz - this.hv.y) * k;
    this.p2.x = this.pos.x + this.hv.x * dt; this.p2.z = this.pos.z + this.hv.y * dt;
    resolveCircle(this.p2, PLAYER.radius, this.world.colliders, this.mapBound);
    this.pos.x = this.p2.x; this.pos.z = this.p2.z;
    if (this.keys.has("Space") && this.grounded) { this.vy = PLAYER.jump; this.grounded = false; }
    this.vy -= PLAYER.gravity * dt; this.pos.y += this.vy * dt;
    if (this.pos.y <= 0) { this.pos.y = 0; this.vy = 0; this.grounded = true; }
    if (this.grounded && this.hv.length() > 0.5) this.bob += dt * this.hv.length() * 1.6;
    if (sprint && this.hv.length() > 3) this.bloom = Math.max(this.bloom, 25);

    // weapon
    this.cool -= dt; this.switchT = Math.max(0, this.switchT - dt);
    if (this.reloadT > 0) {
      this.reloadT -= dt;
      if (this.reloadT <= 0) { const a = this.ammo[this.weapon], need = WEAPONS[this.weapon].mag - a.mag, take = Math.min(need, a.reserve); a.mag += take; a.reserve -= take; this.reloadT = 0; this.emit(); }
    } else if (this.phase === "combat" && this.mouseDown && this.cool <= 0 && this.switchT <= 0 && (WEAPONS[this.weapon].auto || !this.triggerUsed)) {
      this.triggerUsed = true; this.fire();
    }

    // wave
    if (this.phase === "countdown") {
      const before = Math.ceil(this.countdown); this.countdown -= dt;
      if (Math.ceil(this.countdown) !== before) this.emit();
      if (this.countdown <= 0) { this.sfx.wave(); this.spawnT = 0; this.setPhase("combat"); for (let i = 0; i < 3 && this.toSpawn.length; i++) this.spawn(this.toSpawn.shift()!); this.emit(); }
      return this.updateEntities(dt);
    }
    const maxActive = this.settings.quality === "low" ? 10 : 14;
    this.spawnT -= dt;
    if (this.toSpawn.length && this.spawnT <= 0 && this.zombies.filter((z) => z.state === "alive").length < maxActive) { this.spawn(this.toSpawn.shift()!); this.spawnT = Math.max(0.5, 1.4 - this.wave * 0.06); this.emit(); }
    this.updateEntities(dt);
    if (this.phase !== "combat") return;
    const alive = this.zombies.some((z) => z.state === "alive");
    if (!alive && !this.toSpawn.length) {
      if (this.clearT < 0) { this.clearT = 1.6; this.banner("DALGA TEMİZLENDİ"); const bonus = 20 * this.wave; this.gold += bonus; this.notice(`+${bonus} altın dalga bonusu`, "gold"); }
      this.clearT -= dt;
      if (this.clearT <= 0) { this.clearT = -1; this.resumePhase = "countdown"; this.setPhase("market", { marketAfterWave: true }); if (document.pointerLockElement) document.exitPointerLock(); }
    }
  }

  private updateEntities(dt: number) {
    this.navT -= dt;
    if (this.navT <= 0) { this.nav.update(this.pos.x, this.pos.z); this.navT = 0.35; }
    const px = this.pos.x, pz = this.pos.z;
    this.groanT -= dt;
    if (this.groanT < 0 && this.zombies.length) { this.sfx.groan(); this.groanT = 2 + Math.random() * 4; }
    for (const z of this.zombies) {
      const r = z.rig, p = r.root.position, def = ZOMBIES[z.kind];
      if (z.state === "dying") {
        z.deathT += dt;
        r.body.rotation.x = -Math.min(1, z.deathT * 2.5) * Math.PI / 2;
        r.body.position.y = Math.min(1, z.deathT * 2.5) * 0.2;
        if (z.deathT > 6) p.y -= dt * 0.5;
        continue;
      }
      const dx = px - p.x, dz = pz - p.z, dist = Math.hypot(dx, dz);
      let mx = dx / (dist || 1), mz = dz / (dist || 1);

      // Path navigation: use flow field if distant or direct path to player is obstructed
      const pathObstructed = dist > 2.8 || this.blocked(this.tmp.set(p.x, 1.2, p.z), this.tmp2.set(px, 1.2, pz));
      if (pathObstructed && this.nav.dirFrom(p.x, p.z, this.p2)) {
        mx = this.p2.x;
        mz = this.p2.z;
      }

      // Obstacle avoidance feelers (whisker steering around corners & barricades)
      if (avoidObstacles(p.x, p.z, mx, mz, def.radius, this.world.colliders, this.mapBound, this.avoidP2, 1.6)) {
        mx = mx * 0.35 + this.avoidP2.x * 0.65;
        mz = mz * 0.35 + this.avoidP2.z * 0.65;
        const ml = Math.hypot(mx, mz) || 1;
        mx /= ml;
        mz /= ml;
      }

      // Flocking & Swarm Psychology (Sürü Psikolojisi: Separation, Alignment, Cohesion, Flanking)
      let sepX = 0, sepZ = 0;
      let alignX = 0, alignZ = 0;
      let cohX = 0, cohZ = 0;
      let neighbors = 0;

      for (const o of this.zombies) {
        if (o === z || o.state !== "alive") continue;
        const op = o.rig.root.position;
        const ox = p.x - op.x, oz = p.z - op.z;
        const d = Math.hypot(ox, oz);
        const minSep = def.radius + ZOMBIES[o.kind].radius + 0.45;

        // Separation: repulsion when in personal space
        if (d < minSep && d > 0.001) {
          const factor = (minSep - d) / minSep;
          sepX += (ox / d) * factor;
          sepZ += (oz / d) * factor;
        }

        // Swarm cohesion & velocity alignment
        if (d < 4.5 && d > 0.001) {
          alignX += o.vx;
          alignZ += o.vz;
          cohX += op.x;
          cohZ += op.z;
          neighbors++;
        }
      }

      if (neighbors > 0) {
        alignX /= neighbors;
        alignZ /= neighbors;
        cohX = (cohX / neighbors) - p.x;
        cohZ = (cohZ / neighbors) - p.z;
      }

      // Flanking / Encirclement when approaching the player
      let flankX = 0, flankZ = 0;
      if (dist < 7 && dist > def.attackRange * def.scale) {
        const tx = -dz / (dist || 1);
        const tz = dx / (dist || 1);
        const side = Math.sin(z.phase * 0.7) > 0 ? 1 : -1;
        flankX = tx * side * 0.45 * Math.min(1, (7 - dist) / 4);
        flankZ = tz * side * 0.45 * Math.min(1, (7 - dist) / 4);
      }

      const reach = def.attackRange * def.scale * 0.8;
      const sp = dist < reach ? 0 : z.speed * (z.hitT > 0 ? 0.4 : 1) * (z.fuse >= 0 ? 0.3 : 1);
      const k = 1 - Math.exp(-8 * dt);

      const desiredVx = mx * sp + sepX * 3.8 + alignX * 0.2 + cohX * 0.15 + flankX * sp;
      const desiredVz = mz * sp + sepZ * 3.8 + alignZ * 0.2 + cohZ * 0.15 + flankZ * sp;

      z.vx += (desiredVx - z.vx) * k;
      z.vz += (desiredVz - z.vz) * k;
      this.p2.x = p.x + z.vx * dt; this.p2.z = p.z + z.vz * dt;
      resolveCircle(this.p2, def.radius, this.world.colliders, this.mapBound);
      p.x = this.p2.x; p.z = this.p2.z;
      const target = Math.atan2(dist < 6 ? dx : z.vx, dist < 6 ? dz : z.vz);
      let da = target - r.root.rotation.y; da = Math.atan2(Math.sin(da), Math.cos(da));
      r.root.rotation.y += da * Math.min(1, dt * 8);
      const mv = Math.hypot(z.vx, z.vz);
      z.phase += dt * mv * 2.6;
      const sw = Math.sin(z.phase) * Math.min(0.7, mv * 0.18);
      r.legL.rotation.x = sw; r.legR.rotation.x = -sw;
      r.armL.rotation.x = -1.35 + Math.sin(z.phase * 0.5) * 0.15 - sw * 0.2; r.armR.rotation.x = -1.35 - Math.sin(z.phase * 0.5) * 0.15 + sw * 0.2;
      r.body.rotation.z = Math.sin(z.phase) * 0.05;
      z.hitT -= dt;
      r.body.rotation.x = 0.12 + (z.hitT > 0 ? -z.hitT * 1.5 : 0);
      r.head.rotation.z = Math.sin(z.phase * 0.3) * 0.2;
      // attacks
      z.cd -= dt;
      if (z.kind === "exploder") {
        if (z.fuse < 0 && dist < def.attackRange) { z.fuse = EXPLOSION.fuse; }
        if (z.fuse >= 0) { z.fuse -= dt; r.body.scale.setScalar(1 + (EXPLOSION.fuse - z.fuse) * 0.6); if (z.fuse <= 0) { z.noLoot = true; this.kills++; this.killZombie(z, false); } }
      } else if (dist < def.attackRange * def.scale && z.cd <= 0 && Math.abs(this.pos.y) < 1.5 && !this.blocked(new THREE.Vector3(p.x, 1.2 * def.scale, p.z), new THREE.Vector3(this.pos.x, this.pos.y + 1.2, this.pos.z))) {
        z.cd = def.attackInterval; r.armL.rotation.x = r.armR.rotation.x = -2;
        this.hurt(def.damage);
        if (this.phase === "gameover") return;
      }
      if (this.phase === "gameover") return;
      // stuck recovery
      if (dist < z.lastDist - 0.5) { z.lastDist = dist; z.stuckT = 0; } else z.stuckT += dt;
      if (z.stuckT > 8 && dist > 15) {
        const pts = this.world.spawnPoints.filter((s) => Math.hypot(s.x - px, s.y - pz) > 24);
        const s = pts[Math.floor(Math.random() * pts.length)] ?? this.world.spawnPoints[0];
        if (s && !circleBlocked(s.x, s.y, def.radius, this.world.colliders, this.mapBound)) p.set(s.x, 0, s.y);
        z.stuckT = 0; z.lastDist = 1e9;
      }
    }

    // Hard circle-circle collision resolution: zombies physically cannot pass through or overlap each other
    for (let iter = 0; iter < 2; iter++) {
      for (let i = 0; i < this.zombies.length; i++) {
        const z1 = this.zombies[i]!;
        if (z1.state !== "alive") continue;
        const r1 = ZOMBIES[z1.kind].radius;
        const p1 = z1.rig.root.position;

        for (let j = i + 1; j < this.zombies.length; j++) {
          const z2 = this.zombies[j]!;
          if (z2.state !== "alive") continue;
          const r2 = ZOMBIES[z2.kind].radius;
          const p2 = z2.rig.root.position;

          const cx = p2.x - p1.x;
          const cz = p2.z - p1.z;
          const minDist = r1 + r2;
          const d2 = cx * cx + cz * cz;

          if (d2 < minDist * minDist && d2 > 0.000001) {
            const d = Math.sqrt(d2);
            const overlap = minDist - d;
            const nx = cx / d;
            const nz = cz / d;
            const w1 = z1.kind === "tank" ? 0.25 : z2.kind === "tank" ? 0.75 : 0.5;
            const w2 = 1 - w1;

            p1.x -= nx * overlap * w1;
            p1.z -= nz * overlap * w1;
            p2.x += nx * overlap * w2;
            p2.z += nz * overlap * w2;
          }
        }
      }
    }

    // Re-resolve positions against world colliders in case of push into a wall
    for (const z of this.zombies) {
      if (z.state !== "alive") continue;
      const p = z.rig.root.position;
      this.p2.x = p.x;
      this.p2.z = p.z;
      resolveCircle(this.p2, ZOMBIES[z.kind].radius, this.world.colliders, this.mapBound);
      p.x = this.p2.x;
      p.z = this.p2.z;
    }

    // remove sunk corpses
    for (let i = this.zombies.length - 1; i >= 0; i--) { const z = this.zombies[i]; if (z && z.state === "dying" && z.rig.root.position.y < -2.5) { this.scene.remove(z.rig.root); this.zombies.splice(i, 1); } }
    // pickups
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const pk = this.pickups[i]; if (!pk) continue;
      const o = pk.obj.position;
      pk.life -= dt;
      const d = Math.hypot(o.x - px, o.z - pz);
      if (d < 4) { o.x += (px - o.x) * dt * 4; o.z += (pz - o.z) * dt * 4; }
      if (d < 1.3) {
        if (pk.ammo) { const w = WEAPONS[this.weapon], a = this.ammo[this.weapon]; const add = Math.min(w.mag, w.maxReserve - a.reserve); a.reserve += Math.max(0, add); this.notice(`+${Math.max(0, add)} ${w.name} mermisi`, "ammo"); }
        else { this.gold += pk.gold; this.notice(`+${pk.gold} altın`, "gold"); }
        this.sfx.pickup(!pk.ammo);
        this.scene.remove(pk.obj); this.pickups.splice(i, 1); this.emit(); continue;
      }
      if (pk.life <= 0) { this.scene.remove(pk.obj); this.pickups.splice(i, 1); }
    }
    // sentries
    for (const s of this.sentries) {
      s.cd -= dt; s.flashT -= dt; s.flash.visible = s.flashT > 0;
      const sp = s.root.position;
      let best: Zombie | null = null, bd = SENTRY.range;
      for (const z of this.zombies) {
        if (z.state !== "alive") continue;
        const d = sp.distanceTo(z.rig.root.position);
        if (d < bd && !this.blocked(this.tmp.set(sp.x, 1.1, sp.z), new THREE.Vector3(z.rig.root.position.x, 1.1, z.rig.root.position.z))) { bd = d; best = z; }
      }
      if (!best) { s.head.rotation.y += dt * 0.6; continue; }
      const zp = best.rig.root.position;
      const target = Math.atan2(zp.x - sp.x, zp.z - sp.z);
      let da = target - s.head.rotation.y; da = Math.atan2(Math.sin(da), Math.cos(da));
      s.head.rotation.y += da * Math.min(1, dt * 10);
      if (Math.abs(da) < 0.15 && s.cd <= 0) {
        s.cd = SENTRY.interval; s.flashT = 0.05; this.sfx.sentry();
        const to = new THREE.Vector3(zp.x, 1.2 * ZOMBIES[best.kind].scale, zp.z);
        this.tracer(new THREE.Vector3(sp.x, 1.08, sp.z), to);
        this.burst(to, 3, "#a01010", 2);
        this.damageZombie(best, SENTRY.damage * (1 + LIMITS.damagePerLevel * this.dmgLevel), false);
      }
    }
  }

  private visuals(dt: number) {
    // particles
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), v = new THREE.Vector3();
    const axis = new THREE.Vector3(1, 1, 0).normalize();
    for (let i = 0; i < PMAX; i++) {
      const life = this.pLife[i]!;
      if (life <= 0) continue;
      const k = i * 3;
      let vx = this.pVel[k]!, vy = this.pVel[k + 1]!, vz = this.pVel[k + 2]!;
      let x = this.pPos[k]!, y = this.pPos[k + 1]!, z = this.pPos[k + 2]!;
      vy -= 14 * dt; x += vx * dt; y += vy * dt; z += vz * dt;
      if (y < 0.05) { y = 0.05; vy *= -0.25; vx *= 0.6; vz *= 0.6; }
      this.pVel.set([vx, vy, vz], k); this.pPos.set([x, y, z], k);
      this.pLife[i] = life - dt;
      const s = life > dt ? 0.09 * Math.min(1, (life - dt) * 2) : 0;
      m.compose(v.set(x, y, z), q.setFromAxisAngle(axis, life * 5), sc.set(s, s, s));
      this.parts.setMatrixAt(i, m);
    }
    this.parts.instanceMatrix.needsUpdate = true;
    for (const t of this.tracers) { t.t -= dt; t.line.visible = t.t > 0; }
    for (const b of this.booms) { b.t -= dt; b.m.visible = b.t > 0; if (b.t > 0) { b.m.scale.setScalar(EXPLOSION.radius * (1 - b.t / 0.4) + 0.5); } }
    for (const p of this.pickups) { p.obj.rotation.y += dt * 2.5; p.obj.position.y = 0.5 + Math.sin(performance.now() * 0.004 + p.obj.position.x) * 0.12; }
    // Atmospheric lamp/beacon flicker and pulse
    if (this.world?.lampLights) {
      const now = performance.now() * 0.001;
      for (let i = 0; i < this.world.lampLights.length; i++) {
        const l = this.world.lampLights[i];
        if (!l || !l.visible) continue;
        const base = (l.userData["baseIntensity"] as number | undefined) ?? l.intensity;
        if (l.userData["pulse"]) {
          // Warning beacon pulse: slow rhythmic sweep with bright flash
          const wave = Math.sin(now * 4.5 + i * 1.5);
          l.intensity = base * (0.35 + Math.max(0, wave) * 0.9);
        } else {
          // Industrial fluorescent / sodium lamp subtle flicker & rare micro-glitch
          const flicker = Math.sin(now * 4 + i * 2.1) * 0.06 + Math.sin(now * 13 + i * 3.7) * 0.04;
          const drop = (Math.sin(now * 17 + i * 5.3) > 0.97) ? -0.35 : 0;
          l.intensity = Math.max(0, base * (1 + flicker + drop));
        }
      }
    }
    if (this.world?.update) {
      this.world.update(dt, performance.now() * 0.001);
    }

    // camera
    this.recoil *= Math.exp(-10 * dt); this.shake *= Math.exp(-6 * dt); this.dmgFlash *= Math.exp(-2.2 * dt); this.bloom *= Math.exp(-7 * dt);
    this.hitT -= dt; this.headT -= dt; this.flashT -= dt;
    const currentAds = this.ads ?? 0;
    const targetFov = THREE.MathUtils.lerp(72, 60, currentAds);
    if (Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov = targetFov;
      this.camera.updateProjectionMatrix();
    }
    const bobFactor = 1 - currentAds * 0.75;
    const bobY = Math.sin(this.bob * 2) * 0.05 * Math.min(1, this.hv.length() / 4) * bobFactor;
    this.camera.position.set(this.pos.x + (Math.random() - 0.5) * this.shake * 0.2, this.pos.y + PLAYER.eye + bobY + (Math.random() - 0.5) * this.shake * 0.2, this.pos.z);
    this.camera.rotation.set(this.pitch + this.recoil, this.yaw, 0);
    this.muzzleLight.intensity = this.flashT > 0 ? 6 : 0;
    // viewmodel
    const vm = this.views[this.weapon];
    const rel = this.reloadT > 0 ? Math.sin((1 - this.reloadT / WEAPONS[this.weapon].reload) * Math.PI) : 0;
    const adsOffset = ADS_OFFSETS[this.weapon];

    const hipX = 0.24 + Math.sin(this.bob) * 0.012 * bobFactor;
    const hipY = -0.24 + Math.abs(Math.cos(this.bob)) * 0.01 * bobFactor - this.switchT * 0.8 - rel * 0.06;
    const hipZ = -0.5 + this.recoil * 2.5;

    const targetX = adsOffset.x + Math.sin(this.bob) * 0.003 * bobFactor;
    const targetY = adsOffset.y + Math.abs(Math.cos(this.bob)) * 0.003 * bobFactor - this.switchT * 0.8 - rel * 0.06;
    const targetZ = adsOffset.z + this.recoil * 1.4;

    const posX = THREE.MathUtils.lerp(hipX, targetX, currentAds);
    const posY = THREE.MathUtils.lerp(hipY, targetY, currentAds);
    const posZ = THREE.MathUtils.lerp(hipZ, targetZ, currentAds);
    vm.group.position.set(posX, posY, posZ);

    const rotX = (this.recoil * (4 - currentAds * 1.5)) - rel * 0.5;
    const rotY = 0.02 * (1 - currentAds);
    const rotZ = rel * 0.6;
    vm.group.rotation.set(rotX, rotY, rotZ);

    const fl = vm.muzzle.getObjectByName("flash"); if (fl) { fl.visible = this.flashT > 0; fl.rotation.z = Math.random() * 3; }
    // DOM effects
    const gap = 8 + this.bloom * 0.6 + Math.min(10, this.hv.length() * 1.2);
    this.els.cross?.style.setProperty("--gap", `${gap}px`);
    if (this.els.cross) {
      this.els.cross.style.opacity = String(Math.max(0, 1 - currentAds * 1.6));
    }
    if (this.els.hit) { this.els.hit.style.opacity = String(Math.max(0, this.hitT) * 7); this.els.hit.dataset["head"] = this.headT > 0 ? "1" : "0"; }
    if (this.els.vig) this.els.vig.style.opacity = String(Math.min(1, this.dmgFlash + (this.hp < 30 && this.phase === "combat" ? 0.35 : 0)));
  }

  dispose() {
    this.disposed = true;
    for (const id of this.timeouts) clearTimeout(id);
    this.timeouts.clear();
    cancelAnimationFrame(this.raf);
    window.removeEventListener("resize", this.resize);
    window.removeEventListener("keydown", this.onKey);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
    window.removeEventListener("mouseup", this.onUp);
    window.removeEventListener("contextmenu", this.onContextMenu);
    document.removeEventListener("mousemove", this.onMove);
    document.removeEventListener("pointerlockchange", this.onLock);
    this.canvas.removeEventListener("mousedown", this.onDown);
    this.canvas.removeEventListener("contextmenu", this.onContextMenu);
    if (document.pointerLockElement) document.exitPointerLock();
    this.disposePostProcessing();
    this.world.dispose(); this.L.dispose(); this.sfx.dispose();
    (this.parts.material as THREE.Material).dispose();
    this.tracers.forEach((t) => { t.line.geometry.dispose(); (t.line.material as THREE.Material).dispose(); });
    this.booms.forEach((b) => b.m.geometry.dispose());
    this.renderer.dispose();
    this.canvas.remove();
    const debug = window as unknown as { __game?: Engine };
    if (debug.__game === this) delete debug.__game;
  }
}
