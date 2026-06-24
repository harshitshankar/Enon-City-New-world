import { useMemo } from "react";
import Car from "./Car";
import Helicopter from "./Helicopter";
import { HALF, BLOCK } from "../world/World";
import { HELIPADS } from "../world/Plaza";
// Building-aware spawn helpers: a single deterministic source of truth shared
// with World.jsx so we validate spawns against the REAL footprints.
import {
  getBuildings,
  isInsideBuilding,
  nearestRoadPoint,
} from "../world/cityLayout";

/**
 * Validate + repair a ground spawn so it NEVER sits inside a building. If the
 * candidate (x,z) overlaps a footprint, snap it to the nearest road line.
 * Returns a NEW array so the caller never mutates its input.
 */
function safeGroundSpawn([x, y, z]) {
  if (!isInsideBuilding(x, z)) return [x, y, z];
  const p = nearestRoadPoint(x, z);
  return [p.x, y, p.z];
}

/**
 * Find a real downtown building's rooftop to park the rooftop helicopter on,
 * instead of guessing a fixed height that may float in mid-air or clip a wall.
 * Picks the tallest downtown footprint so the heli sits on a solid roof.
 */
function pickRooftopSpawn() {
  const buildings = getBuildings();
  let best = null;
  for (const b of buildings) {
    if (b.district !== "downtown") continue;
    if (!best || b.h > best.h) best = b;
  }
  if (best) {
    // sit 1m above the roof so the skids rest on it, centred on the building
    return [best.x, best.h + 1, best.z];
  }
  // fallback: well above the plaza
  return [0, 30, 0];
}

/**
 * Spawns parked/hijackable cars on the road grid plus a few AI traffic cars
 * that loop along waypoint tracks, and a couple of helicopters at helipads.
 *
 * Every spawn is validated against the REAL building footprints (shared with
 * World) and snapped to the nearest road if it overlaps a building, so cars and
 * helicopters never spawn stuck inside a wall. This was the "vehicle spawns
 * inside a building" glitch.
 */
export default function VehicleManager() {
  const cars = useMemo(() => {
    const arr = [];
    const colors = ["#c0392b", "#2980b9", "#27ae60", "#8e44ad", "#e67e22", "#16a085"];

    // Candidate parked spots near the player spawn (6,2,6). These are on road
    // lines but get re-validated against footprints in case the grid shifted.
    const parkedRaw = [
      [6, 1.2, BLOCK],
      [6 + BLOCK, 1.2, 6],
      [6 - BLOCK, 1.2, 6],
      [6, 1.2, -BLOCK],
      [6 + BLOCK, 1.2, BLOCK],
      [6 - BLOCK, 1.2, -BLOCK],
    ];
    parkedRaw.forEach((p, i) =>
      arr.push({
        id: `car-park-${i}`,
        position: safeGroundSpawn(p),
        color: colors[i % colors.length],
        aiPath: null,
      })
    );

    // AI traffic loops the outer ring road. Validate each corner; if a corner
    // landed on a building, nudge it onto the nearest road.
    const r = HALF - BLOCK * 0.5;
    const ringRaw = [
      [r, r],
      [r, -r],
      [-r, -r],
      [-r, r],
    ];
    const ring = ringRaw.map(([x, z]) => {
      const p = nearestRoadPoint(x, z);
      return [p.x, p.z];
    });
    for (let i = 0; i < 4; i++) {
      const start = ring[i];
      arr.push({
        id: `car-ai-${i}`,
        position: [start[0], 1.2, start[1]],
        color: colors[(i + 2) % colors.length],
        aiPath: ring,
      });
    }
    return arr;
  }, []);

  // Helicopters: one on a real downtown rooftop (verified solid) + five spread
  // across the dedicated helipad plaza (flat concrete, no buildings).
  const helis = useMemo(() => {
    const arr = [{ id: "heli-roof", position: pickRooftopSpawn() }];
    HELIPADS.slice(0, 5).forEach((p, i) => {
      arr.push({ id: `heli-pad-${i}`, position: [p.x, 6, p.z] });
    });
    return arr;
  }, []);

  return (
    <group>
      {cars.map((c) => (
        <Car key={c.id} {...c} />
      ))}
      {helis.map((h) => (
        <Helicopter key={h.id} id={h.id} position={h.position} />
      ))}
    </group>
  );
}
