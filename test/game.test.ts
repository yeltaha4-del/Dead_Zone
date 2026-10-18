import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { Engine } from "../src/game/engine";
import { Library, buildViewModel, buildZombie } from "../src/game/models";
import { HudStore } from "../src/game/store";
import { makeOBB, resolveCircle, circleBlocked, NavGrid, avoidObstacles } from "../src/game/physics";
import { WEAPONS, ZOMBIES, wavePlan, PLAYER, MAPS, MAP_ORDER, QUALITY_PRESETS, type Quality } from "../src/game/config";
import { buildWorld, buildMap, BOUND } from "../src/game/world";
import { FACTORY_BOUND, buildFactoryWorld } from "../src/game/factory";
import { buildCityWorld } from "../src/game/city";

// These tests execute production simulation and Three.js raycasts without a GPU.
// Browser pointer lock and WebGL drawing still need an interactive browser test.
const noop = () => {};
const storage = new Map();
const win: any = { devicePixelRatio: 1, localStorage: { getItem: (k: string) => storage.get(k), setItem: (k: string, v: string) => storage.set(k, v) } };
const doc: any = { pointerLockElement: null, exitPointerLock() { this.pointerLockElement = null; }, createElement() { return { width: 0, height: 0, getContext: () => new Proxy({}, { get: () => noop }) }; } };
Object.assign(globalThis, { window: win, document: doc });
const engines: any[] = [];
afterEach(() => { for (const e of engines.splice(0)) { for (const t of e.timeouts) clearTimeout(t); e.L?.dispose(); e.parts?.material?.dispose(); e.world?.dispose(); } });

function harness(): any {
  const e: any = Object.create(Engine.prototype);
  const L = new Library();
  const world = { group: new THREE.Group(), colliders: [], blockers: [], spawnPoints: [new THREE.Vector2(-40, 0), new THREE.Vector2(40, 0)], lampLights: [], dispose: noop, bound: BOUND };
  Object.assign(e, {
    L, world, currentMap: "city", mapBound: BOUND,
    renderer: { shadowMap: { enabled: false }, setPixelRatio: noop, setSize: noop },
    container: { clientWidth: 800, clientHeight: 600 },
    moon: { castShadow: false, shadow: { mapSize: { set: noop } } },
    scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(72, 1, 0.05, 220),
    resize: noop,
    settings: { quality: "low", sound: false, sensitivity: 1 }, best: { wave: 0, score: 0 }, sfx: new Proxy({}, { get: () => noop }),
    disposed: false, timeouts: new Set(), keys: new Set(), mouseDown: false, mouseRightDown: false, ads: 0, triggerUsed: false, locked: true, fallback: false, resumeBlock: 0, resumePhase: "combat",
    pos: new THREE.Vector3(0, 0, 8), vy: 0, hv: new THREE.Vector2(), grounded: true, yaw: 0, pitch: 0, recoil: 0, bob: 0, shake: 0, dmgFlash: 0, bloom: 0, hitT: 0, headT: 0,
    hp: 100, armor: 0, gold: 0, score: 0, kills: 0, heads: 0, wave: 1, dmgLevel: 0, weapon: "rifle", cool: 0, reloadT: 0, switchT: 0, flashT: 0,
    ammo: Object.fromEntries(Object.entries(WEAPONS).map(([k, w]) => [k, { mag: w.mag, reserve: w.reserve }])),
    zombies: [], toSpawn: ["walker"], spawnT: 10000, countdown: 0, clearT: -1, navT: 0, emitT: 0, groanT: 10000, pickups: [], sentries: [], targets: [], targetsDirty: true,
    ray: new THREE.Raycaster(), views: { pistol: buildViewModel(L, "pistol"), shotgun: buildViewModel(L, "shotgun"), rifle: buildViewModel(L, "rifle") },
    parts: new THREE.InstancedMesh(L.box, new THREE.MeshStandardMaterial(), 180), pPos: new Float32Array(540), pVel: new Float32Array(540), pLife: new Float32Array(180), pNext: 0,
    tracers: [], booms: [], noticeId: 0, flashlight: new THREE.SpotLight(), muzzleLight: new THREE.PointLight(), els: {}, tmp: new THREE.Vector3(), tmp2: new THREE.Vector3(), p2: { x: 0, z: 0 }, avoidP2: { x: 0, z: 0 },
  });
  e.camera.rotation.order = "YXZ";
  // Synthetic input boundary: the browser's lock events are not exercised here.
  e.clearInput = () => { e.keys.clear(); e.mouseDown = false; e.mouseRightDown = false; };
  e.onLock = () => { e.locked = doc.pointerLockElement === e.canvas; e.emit(); };
  e.nav = new NavGrid(world.colliders, BOUND); e.nav.update(e.pos.x, e.pos.z);
  e.canvas = { requestPointerLock() { doc.pointerLockElement = e.canvas; e.onLock(); return Promise.resolve(); } };
  e.store = new HudStore(e.snapshot("combat"));
  engines.push(e);
  return e;
}

function zombie(e: any, kind = "walker", x = 0, z = 0, hp = 1000): any {
  const def = ZOMBIES[kind as keyof typeof ZOMBIES];
  const rig = buildZombie(e.L, kind as any, false); rig.root.position.set(x, 0, z); rig.root.scale.setScalar(def.scale); e.scene.add(rig.root);
  const out = { kind, rig, hp, maxHp: hp, speed: 0, vx: 0, vz: 0, cd: 1000, phase: 0, hitT: 0, state: "alive", deathT: 0, fuse: -1, stuckT: 0, lastDist: 1e9, noLoot: false };
  e.zombies.push(out); e.targetsDirty = true; return out;
}
function wall(e: any, z = 4) { const w = new THREE.Mesh(new THREE.BoxGeometry(6, 4, 0.5), new THREE.MeshBasicMaterial()); w.position.set(0, 2, z); e.scene.add(w); w.updateMatrixWorld(true); e.world.blockers.push(w); return w; }
function tick(e: any, seconds: number) { for (let t = 0; t < seconds; t += 0.02) e.step(0.02); }
function fire(e: any) { e.cool = 0; e.switchT = 0; e.recoil = 0; e.fire(); }

test("wave plans retain all enemies and introduce all four kinds", () => {
  assert.equal(wavePlan(1).length, 6);
  assert.ok(wavePlan(2).includes("runner"));
  assert.ok(wavePlan(3).includes("tank"));
  for (const kind of Object.keys(ZOMBIES)) assert.ok(wavePlan(4).includes(kind as any));
  for (let w = 1; w <= 50; w++) { const a = wavePlan(w); assert.equal(a.length, w === 1 ? 6 : 5 + 3 * w); assert.ok(a.every((x) => x in ZOMBIES)); }
});

test("rotated collisions resolve overlaps and flow-field routes around a wall", () => {
  const c = makeOBB(0, 0, 1, 5, 0.3), p = { x: 0, z: 0 };
  resolveCircle(p, 0.4, [c], 12); assert.equal(circleBlocked(p.x, p.z, 0.399, [c], 12), false);
  const cols = [makeOBB(0, 0, 1, 5)], nav = new NavGrid(cols, 12); nav.update(8, 0);
  const cur = { x: -8, z: 0 }, dir = { x: 0, z: 0 };
  assert.ok(nav.distAt(cur.x, cur.z) > 0);
  for (let i = 0; i < 2000 && Math.hypot(cur.x - 8, cur.z) > 1; i++) { if (!nav.dirFrom(cur.x, cur.z, dir)) break; cur.x += dir.x * 0.06; cur.z += dir.z * 0.06; resolveCircle(cur, 0.4, cols, 12); }
  assert.ok(Math.hypot(cur.x - 8, cur.z) < 2);
});

test("procedural city has clear spawn points reachable from the player", () => {
  const w = buildWorld(false), nav = new NavGrid(w.colliders, BOUND); nav.update(0, 8);
  assert.equal(circleBlocked(0, 8, PLAYER.radius, w.colliders, BOUND), false);
  assert.ok(w.spawnPoints.filter((p) => nav.distAt(p.x, p.y) >= 0 && !circleBlocked(p.x, p.y, 0.7, w.colliders, BOUND)).length >= 8);
  assert.ok(w.blockers.length > 20); w.dispose();
});

test("movement, sprint, jump and wall collision use real simulation", () => {
  const e = harness(); e.world.colliders.push(makeOBB(0, 2, 3, 0.5));
  e.keys.add("KeyW"); e.keys.add("ShiftLeft"); tick(e, 2);
  assert.ok(e.pos.z >= 2.89); assert.ok(e.pos.z < 3.1);
  e.keys.clear(); e.keys.add("Space"); tick(e, 0.15); e.keys.clear(); assert.ok(e.pos.y > 0.3);
  tick(e, 1); assert.equal(e.grounded, true); assert.equal(e.pos.y, 0);
});

test("all weapons spend their own ammo; reload transfers reserve; paused fire is blocked", () => {
  const e = harness(); for (const id of Object.keys(WEAPONS)) { e.equip(id); fire(e); assert.equal(e.ammo[id].mag, WEAPONS[id as keyof typeof WEAPONS].mag - 1); }
  e.equip("pistol"); e.ammo.pistol.mag = 4; e.ammo.pistol.reserve = 5; e.startReload(); tick(e, 1.3);
  assert.equal(e.ammo.pistol.mag, 9); assert.equal(e.ammo.pistol.reserve, 0);
  e.store.set({ phase: "paused" }); const n = e.ammo.pistol.mag; fire(e); e.hurt(50); tick(e, 2);
  assert.equal(e.ammo.pistol.mag, n); assert.equal(e.hp, 100);
});

test("real raycasts apply doubled head damage and environment occlusion", () => {
  const e = harness(), z = zombie(e); const rnd = Math.random; Math.random = () => 0.5;
  try { fire(e); assert.equal(z.hp, 1000 - WEAPONS.rifle.damage * 2); assert.ok(e.headT > 0); const hp = z.hp; wall(e); e.targetsDirty = true; fire(e); assert.equal(z.hp, hp);
    const b = harness(), body = zombie(b); b.pitch = -Math.atan2(0.45, 8); fire(b); assert.equal(body.hp, 1000 - WEAPONS.rifle.damage);
  }
  finally { Math.random = rnd; }
});

test("shotgun fires eight raycast pellets", () => {
  const e = harness(), z = zombie(e); e.equip("shotgun"); const rnd = Math.random; Math.random = () => 0.5;
  try { fire(e); assert.equal(z.hp, 1000 - WEAPONS.shotgun.damage * 8 * 2); } finally { Math.random = rnd; }
});

test("pistol is semi-automatic, rifle repeats, and reload blocks firing", () => {
  const e = harness(); e.equip("pistol"); e.switchT = 0; e.cool = 0; e.mouseDown = true; tick(e, 0.8);
  assert.equal(e.ammo.pistol.mag, 11);
  e.mouseDown = false; e.equip("rifle"); e.switchT = 0; e.cool = 0; e.mouseDown = true; tick(e, 0.8);
  assert.ok(e.ammo.rifle.mag <= 22); e.mouseDown = false; e.startReload(); const n = e.ammo.rifle.mag; fire(e); assert.equal(e.ammo.rifle.mag, n);
});

test("explosions damage nearby zombies synchronously and armor absorbs damage", () => {
  const e = harness(); e.pos.set(0, 0, 3); e.armor = 50; const x = zombie(e, "exploder", 0, 0, 1), w = zombie(e, "walker", 1.5, 0, 100);
  e.damageZombie(x, 5, false); assert.equal(x.state, "dying"); assert.equal(w.state, "dying"); assert.equal(e.hp, 100); assert.ok(e.armor < 50); assert.equal(e.kills, 2);
});

test("gold and ammo loot are physical pickups with proximity rewards", () => {
  const e = harness(); e.ammo.rifle.reserve = 0; e.dropLoot(0, 8, 6, true); tick(e, 0.3);
  assert.equal(e.gold, 6); assert.equal(e.ammo.rifle.reserve, 30); assert.equal(e.pickups.length, 0);
});

test("melee attacks respect walls and their attack cooldown", () => {
  const e = harness(), z = zombie(e, "walker", 0, 6.7); z.cd = 0; wall(e, 7.3);
  e.updateEntities(0.02); assert.equal(e.hp, 100);
  e.world.blockers = []; e.updateEntities(0.02); assert.equal(e.hp, 90);
  e.updateEntities(0.02); assert.equal(e.hp, 90);
});

test("market enforces affordability, caps, valid sentry placement and real sentry fire", () => {
  const e = harness(); e.store.set({ phase: "market" }); e.gold = 100;
  assert.equal(e.buy("armor"), null); assert.equal(e.armor, 50); assert.equal(e.gold, 0);
  assert.equal(e.buy("armor"), "Yetersiz altın"); assert.equal(e.armor, 50);
  e.gold = 1000; assert.equal(e.buy("sentry"), null); assert.equal(e.sentries.length, 1); assert.equal(e.gold, 750);
  e.store.set({ phase: "combat" }); const z = zombie(e); tick(e, 1.5); assert.ok(z.hp < 1000);
  wall(e, 3); e.sentries[0].cd = 0; const before = z.hp; tick(e, 0.5); assert.equal(z.hp, before);
  e.store.set({ phase: "market" }); e.world.colliders = [makeOBB(0, 4, 10, 10)]; const gold = e.gold; assert.ok(e.buy("sentry")); assert.equal(e.gold, gold);
  e.sentries.push(e.sentries[0], e.sentries[0]); assert.equal(e.buy("sentry"), "En fazla 3 taret"); assert.equal(e.gold, gold);
  e.dmgLevel = 5; assert.equal(e.buy("damage"), "Maksimum seviye"); assert.equal(e.gold, gold);
});

test("wave clear, next wave, death and restart reset the run", () => {
  const e = harness(); e.toSpawn = []; tick(e, 1.8); assert.equal(e.phase, "market"); assert.equal(e.gold, 20); assert.equal(e.store.get().marketAfterWave, true);
  e.nextWave(); assert.equal(e.wave, 2); assert.equal(e.toSpawn.length, 11); tick(e, 3.1); assert.equal(e.phase, "combat"); assert.ok(e.zombies.length >= 3); assert.equal(e.store.get().remaining, 11);
  e.hp = 1; e.hurt(20); assert.equal(e.phase, "gameover"); e.pLife[0] = 1; e.start();
  assert.equal(e.wave, 1); assert.equal(e.hp, 100); assert.equal(e.gold, 0); assert.equal(e.kills, 0); assert.equal(e.zombies.length, 0); assert.equal(e.ammo.rifle.mag, 30); assert.equal(e.pLife[0], 0);
});

test("ADS right click smooth aim, movement slowdown, and reload cancellation", () => {
  const e = harness();
  assert.equal(e.ads, 0);
  e.mouseRightDown = true;
  tick(e, 0.3);
  assert.ok(e.ads > 0.95);
  // movement speed is slowed during ADS
  e.keys.add("KeyW");
  const posBefore = e.pos.z;
  tick(e, 0.2);
  const adsTravel = Math.abs(e.pos.z - posBefore);
  e.keys.clear();
  e.mouseRightDown = false;
  tick(e, 0.3);
  assert.equal(e.ads, 0);
  e.keys.add("KeyW");
  const posBeforeHip = e.pos.z;
  tick(e, 0.2);
  const hipTravel = Math.abs(e.pos.z - posBeforeHip);
  assert.ok(adsTravel < hipTravel);
  // reloading cancels right click ADS
  e.keys.clear();
  e.mouseRightDown = true;
  tick(e, 0.3);
  assert.ok(e.ads > 0.95);
  e.equip("pistol");
  e.ammo.pistol.mag = 1;
  e.startReload();
  assert.equal(e.mouseRightDown, false);
  tick(e, 0.3);
  assert.equal(e.ads, 0);
});

test("obstacle avoidance feelers detect impending collisions and steer laterally", () => {
  const col = makeOBB(0, 5, 2, 0.5); // Wall at z=5
  const out = { x: 0, z: 0 };
  // Moving directly towards the wall from (0, 3.8) with lookahead 1.6
  const avoided = avoidObstacles(0, 3.8, 0, 1, 0.4, [col], 20, out, 1.6);
  assert.equal(avoided, true);
  // Steers sideways away from heading into the wall
  assert.ok(Math.abs(out.x) > 0.5);
});

test("zombie swarm psychology resolves overlaps and prevents zombies from passing through each other", () => {
  const e = harness();
  // Place two zombies overlapping at (0, 0) and (0.1, 0)
  const z1 = zombie(e, "walker", 0, 0);
  const z2 = zombie(e, "walker", 0.1, 0);
  const r1 = ZOMBIES.walker.radius;
  const r2 = ZOMBIES.walker.radius;
  const minDist = r1 + r2;

  // Run update
  e.updateEntities(0.02);

  const p1 = z1.rig.root.position;
  const p2 = z2.rig.root.position;
  const dist = Math.hypot(p2.x - p1.x, p2.z - p1.z);

  // Hard circle-circle collision must push them apart so dist >= minDist (no overlapping)
  assert.ok(dist >= minDist - 0.001);
});

test("map configurations provide valid city and factory metadata", () => {
  assert.ok(MAP_ORDER.includes("city"));
  assert.ok(MAP_ORDER.includes("factory"));
  for (const id of MAP_ORDER) {
    const m = MAPS[id];
    assert.ok(m.name.length > 0);
    assert.ok(m.tagline.length > 0);
    assert.ok(m.desc.length > 0);
    assert.ok(m.fogColor.startsWith("#"));
    assert.ok(m.fogDensity > 0);
  }
});

test("procedural factory world has clear spawn points and player spawn within factory bounds", () => {
  const fw = buildFactoryWorld(false);
  assert.ok(fw.colliders.length > 10);
  assert.ok(fw.blockers.length > 10);
  assert.ok(fw.spawnPoints.length >= 10);
  assert.equal(fw.bound, FACTORY_BOUND);

  // Player spawn must be walkable and within bounds
  const ps = fw.playerSpawn ?? { x: 0, z: 8 };
  assert.ok(Math.abs(ps.x) < FACTORY_BOUND);
  assert.ok(Math.abs(ps.z) < FACTORY_BOUND);
  assert.equal(circleBlocked(ps.x, ps.z, PLAYER.radius, fw.colliders, FACTORY_BOUND), false);

  // Spawn points must be inside factory bounds and mostly unblocked
  for (const sp of fw.spawnPoints) {
    assert.ok(Math.abs(sp.x) < FACTORY_BOUND);
    assert.ok(Math.abs(sp.y) < FACTORY_BOUND);
  }

  // NavGrid can route around factory structures to player
  const nav = new NavGrid(fw.colliders, FACTORY_BOUND);
  nav.update(ps.x, ps.z);
  const reachableSpawns = fw.spawnPoints.filter((sp) => nav.distAt(sp.x, sp.y) >= 0);
  assert.ok(reachableSpawns.length >= 8);

  fw.dispose();
});

test("engine can switch maps between city and factory cleanly and updates store", () => {
  const e = harness();
  assert.equal(e.currentMap, "city");
  assert.equal(e.store.get().map, "city");

  // Select factory map
  e.setMap("factory");
  assert.equal(e.currentMap, "factory");
  assert.equal(e.mapBound, FACTORY_BOUND);
  assert.equal(e.store.get().map, "factory");

  // Start with factory
  e.start("factory");
  assert.equal(e.currentMap, "factory");
  assert.equal(e.store.get().phase, "countdown");
  assert.equal(e.store.get().wave, 1);

  // Can switch back to city cleanly
  e.setMap("city");
  assert.equal(e.currentMap, "city");
  assert.equal(e.mapBound, BOUND);
  assert.equal(e.store.get().map, "city");
});

test("quality presets configure low, medium, high, and ultra with expected rendering parameters", () => {
  const qualities: Quality[] = ["low", "medium", "high", "ultra"];
  for (const q of qualities) {
    const p = QUALITY_PRESETS[q];
    assert.ok(p, `Preset ${q} exists`);
    assert.equal(p.id, q);
    assert.ok(p.pixelRatioCap >= 1.0);
    assert.ok(p.texResolution >= 256);
  }

  // Verify High and Ultra specific targets
  assert.equal(QUALITY_PRESETS.high.shadowMapSize, 2048);
  assert.equal(QUALITY_PRESETS.high.texResolution, 1024);
  assert.equal(QUALITY_PRESETS.high.postProcessing, true);
  assert.equal(QUALITY_PRESETS.high.bloom, false);
  assert.equal(QUALITY_PRESETS.high.fxaa, true);

  assert.equal(QUALITY_PRESETS.ultra.shadowMapSize, 4096);
  assert.equal(QUALITY_PRESETS.ultra.texResolution, 2048);
  assert.equal(QUALITY_PRESETS.ultra.postProcessing, true);
  assert.equal(QUALITY_PRESETS.ultra.bloom, false);
  assert.equal(QUALITY_PRESETS.ultra.fxaa, true);
  assert.equal(QUALITY_PRESETS.ultra.wetReflections, "enhanced");
});

test("updating graphic settings preserves player position, hp, score, wave, and ammo", () => {
  const e = harness();
  e.start("city");
  e.pos.set(12.5, 0, -4.2);
  e.hp = 77;
  e.armor = 40;
  e.gold = 350;
  e.score = 2400;
  e.wave = 3;
  e.ammo.rifle.mag = 18;
  e.ammo.rifle.reserve = 92;

  // Switch to high quality
  e.updateSettings({ quality: "high" });
  assert.equal(e.store.get().settings.quality, "high");
  assert.equal(e.pos.x, 12.5);
  assert.equal(e.pos.z, -4.2);
  assert.equal(e.hp, 77);
  assert.equal(e.armor, 40);
  assert.equal(e.gold, 350);
  assert.equal(e.score, 2400);
  assert.equal(e.wave, 3);
  assert.equal(e.ammo.rifle.mag, 18);
  assert.equal(e.ammo.rifle.reserve, 92);

  // Switch to ultra quality
  e.updateSettings({ quality: "ultra" });
  assert.equal(e.store.get().settings.quality, "ultra");
  assert.equal(e.pos.x, 12.5);
  assert.equal(e.pos.z, -4.2);
  assert.equal(e.hp, 77);
});

test("Ölümcül Şehir world features quarantine checkpoint, vehicles, shopfronts, and update cycle", () => {
  const city = buildCityWorld(true, "ultra");
  assert.ok(city.colliders.length > 30, "City has robust collider volume");
  assert.ok(city.blockers.length > 15, "City has bullet occlusion blockers");
  assert.ok(city.lampLights.length >= 6, "City has active street lighting");
  assert.ok(typeof city.update === "function", "City has dynamic update hook");

  // Verify dynamic steam and street updates execute without error
  city.update(0.016, 1.0);
  city.update(0.016, 2.5);

  city.dispose();
});


