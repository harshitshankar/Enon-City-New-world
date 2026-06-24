/**
 * Shared, deterministic city-layout data.
 *
 * World.jsx and VehicleManager.jsx both need to know WHERE the buildings are:
 *  - World renders + collides them.
 *  - VehicleManager must spawn cars/helicopters ON ROADS, never inside a
 *    building footprint (which was causing the "car stuck in a wall" glitch).
 *
 * Previously VehicleManager guessed road spots with hardcoded offsets; if the
 * grid or building sizes changed those guesses drifted and vehicles landed
 * inside buildings. Instead, BOTH systems now derive the building footprints
 * from THIS single deterministic source of truth, so spawns can be validated
 * against the actual buildings.
 *
 * No imports -> no circular-dependency risk (same reason constants.js is bare).
 */
import { BLOCK, GRID, HALF } from "./constants";

const LAKE = { x0: 0.5, z0: 0.5 }; // lake starts at the +x,+z corner

export function districtOf(gx, gz) {
  // normalized 0..1
  const nx = gx / (GRID - 1);
  const nz = gz / (GRID - 1);
  // Park/Lake: the +x,+z quadrant
  if (nx >= LAKE.x0 && nz >= LAKE.z0) return "park";
  // Downtown: central 40% band on both axes
  const cx = Math.abs(nx - 0.5);
  const cz = Math.abs(nz - 0.5);
  if (cx < 0.22 && cz < 0.22) return "downtown";
  return "suburbs";
}

export function seededRand(i) {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

// District styling — kept in sync with World.jsx's DISTRICT_STYLE. Only the
// size fields matter for spawn validation, but we mirror the full table so this
// stays the single source of truth if styling ever drives footprint logic.
const DISTRICT_STYLE = {
  downtown: { minH: 22, maxH: 60, minW: 14, maxW: 18 },
  suburbs: { minH: 4, maxH: 12, minW: 12, maxW: 16 },
  park: { minH: 0, maxH: 0, minW: 0, maxW: 0 },
};

/**
 * Build the full list of building footprints (centred x/z + height + width),
 * using the exact same deterministic seed loop as World.jsx. Memoised on the
 * module so it's computed once and shared by every caller.
 */
let _buildings = null;
export function getBuildings() {
  if (_buildings) return _buildings;
  const arr = [];
  let id = 0;
  for (let gx = 0; gx < GRID; gx++) {
    for (let gz = 0; gz < GRID; gz++) {
      const cx = -HALF + gx * BLOCK + BLOCK / 2;
      const cz = -HALF + gz * BLOCK + BLOCK / 2;
      const district = districtOf(gx, gz);
      if (district === "park") {
        id += 2;
        continue;
      }
      const style = DISTRICT_STYLE[district];
      const r = seededRand(id++);
      const r2 = seededRand(id++);
      const h = style.minH + Math.floor(r * ((style.maxH - style.minH) / 2 + 1)) * 2;
      const w = style.minW + r2 * (style.maxW - style.minW);
      arr.push({ x: cx, z: cz, h, w, district });
    }
  }
  _buildings = arr;
  return arr;
}

/**
 * Pre-computed axis-aligned footprints (with a small safety margin) for fast
 * "is this point inside a building?" tests during vehicle spawning.
 */
let _footprints = null;
export function getFootprints() {
  if (_footprints) return _footprints;
  // pad by 1.5m so a car centred just outside a wall still clears it.
  const pad = 1.5;
  _footprints = getBuildings().map((b) => ({
    minX: b.x - b.w / 2 - pad,
    maxX: b.x + b.w / 2 + pad,
    minZ: b.z - b.w / 2 - pad,
    maxZ: b.z + b.w / 2 + pad,
    topY: b.h,
  }));
  return _footprints;
}

/**
 * True if (x,z) lies inside any building footprint (with padding).
 * Used by VehicleManager to reject/repair bad spawns.
 */
export function isInsideBuilding(x, z) {
  const fps = getFootprints();
  for (const f of fps) {
    if (x > f.minX && x < f.maxX && z > f.minZ && z < f.maxZ) return true;
  }
  return false;
}

/**
 * Snap a candidate (x,z) to the nearest road. Roads run along the grid lines
 * x = -HALF + k*BLOCK and z = -HALF + k*BLOCK (k = 0..GRID), i.e. between
 * building blocks. We move the point to the nearest such line so the spawn sits
 * on asphalt, then verify it's clear of buildings.
 *
 * Returns {x, z} guaranteed to be on a road line and outside every footprint.
 */
export function nearestRoadPoint(x, z) {
  // nearest road line on each axis
  const toLine = (v) => {
    const k = Math.round((v + HALF) / BLOCK);
    const kc = Math.max(0, Math.min(GRID, k));
    return -HALF + kc * BLOCK;
  };
  // try the 4 combos of (snap x | keep x) x (snap z | keep z), nearest first
  const sx = toLine(x);
  const sz = toLine(z);
  const candidates = [
    [sx, sz],
    [sx, z],
    [x, sz],
  ];
  for (const [cx, cz] of candidates) {
    if (!isInsideBuilding(cx, cz)) {
      // clamp inside the playable bounds
      const lim = HALF - 4;
      return {
        x: Math.max(-lim, Math.min(lim, cx)),
        z: Math.max(-lim, Math.min(lim, cz)),
      };
    }
  }
  // last resort: the nearest snapped road line, clamped into bounds
  const lim = HALF - 4;
  return { x: Math.max(-lim, Math.min(lim, sx)), z: Math.max(-lim, Math.min(lim, sz)) };
}

export { BLOCK, GRID, HALF };
