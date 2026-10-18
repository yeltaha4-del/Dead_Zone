import * as THREE from "three";
import type { OBB } from "./physics";
import { buildFactoryWorld, FACTORY_BOUND } from "./factory";
import { buildCityWorld, BOUND } from "./city";
import type { MapId, Quality } from "./config";

export { BOUND, buildCityWorld };
export { FACTORY_BOUND, buildFactoryWorld };

export interface World {
  group: THREE.Group;
  colliders: OBB[];
  blockers: THREE.Mesh[];
  spawnPoints: THREE.Vector2[];
  lampLights: THREE.PointLight[];
  playerSpawn?: { x: number; z: number };
  fogColor?: string;
  fogDensity?: number;
  bound?: number;
  update?: (dt: number, time: number) => void;
  dispose: () => void;
}

export function buildMap(mapId: MapId = "city", shadows = false, quality: Quality = "medium"): World {
  if (mapId === "factory") return buildFactoryWorld(shadows);
  return buildCityWorld(shadows, quality);
}

export function buildWorld(mapIdOrShadows: MapId | boolean = "city", maybeShadows = false, quality: Quality = "medium"): World {
  if (typeof mapIdOrShadows === "boolean") {
    return buildCityWorld(mapIdOrShadows, quality);
  }
  return buildMap(mapIdOrShadows, maybeShadows, quality);
}
