/**
 * Shared, non-reactive registries that systems read inside useFrame.
 * Vehicles & NPCs register their live rigidbody refs + positions here so the
 * player interaction / targeting code can find the nearest one cheaply.
 */

export const vehicleRegistry = new Map(); // id -> { id, ref, getPos, occupied }
export const npcRegistry = new Map(); // id -> { id, ref, getPos, alive, type }

export function registerVehicle(id, data) {
  vehicleRegistry.set(id, data);
  return () => vehicleRegistry.delete(id);
}
export function registerNPC(id, data) {
  npcRegistry.set(id, data);
  return () => npcRegistry.delete(id);
}

const _tmp = { x: 0, y: 0, z: 0 };
/**
 * Find the nearest free (not occupied) vehicle to (px,pz).
 * Vehicles high above the player (e.g. a helicopter on a rooftop) are only
 * reachable if the player is actually close in 3D — we reject anything more
 * than `maxVDy` units above/below the player so you can't hijack a heli you're
 * standing under on the ground.
 */
export function nearestVehicle(px, pz, maxDist = 4.5, py = 1, maxVDy = 3) {
  let best = null;
  let bestD = maxDist * maxDist;
  for (const v of vehicleRegistry.values()) {
    if (v.occupied) continue;
    const p = v.getPos(_tmp);
    // vertical gate: can't reach a vehicle far above/below you
    if (Math.abs(p.y - py) > maxVDy) continue;
    const d = (p.x - px) ** 2 + (p.z - pz) ** 2;
    if (d < bestD) {
      bestD = d;
      best = v;
    }
  }
  return best;
}
