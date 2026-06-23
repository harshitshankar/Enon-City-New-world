/**
 * Tiny global event bus + shared mutable pools used to communicate between
 * decoupled R3F systems WITHOUT triggering React re-renders.
 *
 * Combat systems spawn projectiles/explosions by pushing request objects into
 * these queues; the corresponding manager components drain them inside useFrame.
 */

const listeners = new Map();

export function on(event, cb) {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event).add(cb);
  return () => listeners.get(event)?.delete(cb);
}

export function emit(event, payload) {
  const set = listeners.get(event);
  if (set) for (const cb of set) cb(payload);
}

/* ---- spawn request queues (drained by managers each frame) ---- */
export const spawnQueue = {
  projectiles: [], // { type, pos:[x,y,z], dir:[x,y,z], speed, owner }
  explosions: [], // { pos:[x,y,z], scale }
};

export function requestProjectile(req) {
  spawnQueue.projectiles.push(req);
}
export function requestExplosion(req) {
  spawnQueue.explosions.push(req);
}
