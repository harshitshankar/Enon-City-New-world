import { useMemo, useRef, useLayoutEffect } from "react";
import { useFrame } from "@react-three/fiber";
import { RigidBody, CuboidCollider } from "@react-three/rapier";
import * as THREE from "three";
import { worldState } from "../../store/useGameStore";

/**
 * World
 * Procedural low-poly city laid out on a grid, now ~3x bigger (GRID 7 -> 12)
 * with THREE distinct districts so there are different places to visit/drive:
 *
 *   - DOWNTOWN  (centre)    tall neon skyscrapers, wide FLAT rooftops you can
 *                           land a helicopter on.
 *   - SUBURBS   (outer ring) short houses + green lots.
 *   - PARK/LAKE (one quadrant) grass, trees, a lake you can fly over but not
 *                           drive into (shore walls).
 *
 * BLOCK is the distance between road centres; each cell holds one building lot.
 * Instanced meshes keep draw calls low even at 12x12 = 144 blocks.
 */

export const BLOCK = 28; // distance between road centres
export const GRID = 12; // GRID x GRID blocks (was 7 -> now ~3x area)
export const ROAD_W = 9; // road width
export const HALF = (GRID * BLOCK) / 2; // = 168

// Exported so other systems (NPCs/vehicles) can align with the road grid.
export const cityConfig = { BLOCK, GRID, ROAD_W, HALF };

/* ---------- districts ---------- */
// District layout by normalized grid coordinate (0..1 across the map):
//   - The PARK/LAKE occupies the +x,+z corner quadrant.
//   - DOWNTOWN is the central band.
//   - SUBURBS is everything else (outer ring).
const LAKE = { x0: 0.5, z0: 0.5 }; // lake starts at the +x,+z corner
function districtOf(gx, gz) {
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

function seededRand(i) {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/* District styling tables */
const DISTRICT_STYLE = {
  downtown: {
    minH: 22, maxH: 60,
    minW: 14, maxW: 18,
    palette: ["#2c1840", "#3a1c3e", "#241a44", "#42203a"],
    windows: true,
  },
  suburbs: {
    minH: 4, maxH: 12,
    minW: 12, maxW: 16,
    palette: ["#4a3b5a", "#3f4a5a", "#5a4a4a", "#455a4a"],
    windows: true,
  },
  park: {
    // no buildings in the park — handled separately (trees instead)
    minH: 0, maxH: 0, minW: 0, maxW: 0,
    palette: ["#2a4a30"],
    windows: false,
  },
};

export default function World() {
  /* ---------------- Building data (district-aware) ---------------- */
  const buildings = useMemo(() => {
    const arr = [];
    let id = 0;
    for (let gx = 0; gx < GRID; gx++) {
      for (let gz = 0; gz < GRID; gz++) {
        const cx = -HALF + gx * BLOCK + BLOCK / 2;
        const cz = -HALF + gz * BLOCK + BLOCK / 2;
        const district = districtOf(gx, gz);
        const style = DISTRICT_STYLE[district];
        // Park district: no building — skip (trees fill it instead).
        if (district === "park") {
          id += 2;
          continue;
        }
        const r = seededRand(id++);
        const r2 = seededRand(id++);
        const h = style.minH + Math.floor(r * ((style.maxH - style.minH) / 2 + 1)) * 2;
        const w = style.minW + r2 * (style.maxW - style.minW);
        arr.push({ x: cx, z: cz, h, w, district });
      }
    }
    return arr;
  }, []);

  /* ---------------- Publish landable rooftops for the helicopter ----------------
   * The helicopter reads window.__buildingTops each frame to know where it can
   * land. Each entry is an axis-aligned footprint + its flat top-Y. */
  useLayoutEffect(() => {
    window.__buildingTops = buildings.map((b) => ({
      minX: b.x - b.w / 2,
      maxX: b.x + b.w / 2,
      minZ: b.z - b.w / 2,
      maxZ: b.z + b.w / 2,
      topY: b.h,
    }));
  }, [buildings]);

  /* ---------------- Park trees ---------------- */
  const trees = useMemo(() => {
    const t = [];
    for (let gx = 0; gx < GRID; gx++) {
      for (let gz = 0; gz < GRID; gz++) {
        if (districtOf(gx, gz) !== "park") continue;
        const cx = -HALF + gx * BLOCK + BLOCK / 2;
        const cz = -HALF + gz * BLOCK + BLOCK / 2;
        // a handful of trees per park block, jittered, avoiding the very centre
        const n = 5;
        for (let k = 0; k < n; k++) {
          const r = seededRand(gx * 53 + gz * 19 + k * 7 + 1);
          const r2 = seededRand(gx * 71 + gz * 31 + k * 11 + 3);
          const tx = cx + (r - 0.5) * (BLOCK - 6);
          const tz = cz + (r2 - 0.5) * (BLOCK - 6);
          const s = 0.8 + seededRand(k + gx) * 0.9;
          t.push({ x: tx, z: tz, s });
        }
      }
    }
    return t;
  }, []);

  return (
    <group>
      <Ground />
      <Lake />
      <Roads />
      <Sidewalks />
      <Buildings buildings={buildings} />
      <Trees trees={trees} />
      <StreetLights />
      <WorldBounds />
    </group>
  );
}

/* ============================================================= */
/*  GROUND — district-tinted segments + physics floor            */
/* ============================================================= */
function Ground() {
  // Three large tinted ground segments (downtown/suburbs grey-green, park green)
  // over one big physics floor. Cheap: a few planes, one collider.
  return (
    <RigidBody type="fixed" colliders={false} friction={1}>
      {/* base floor covers the whole map */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[GRID * BLOCK + 80, GRID * BLOCK + 80]} />
        <meshStandardMaterial color="#2a2140" roughness={0.95} />
      </mesh>
      {/* downtown + suburbs tint (everything except the park quadrant) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} receiveShadow>
        <planeGeometry args={[GRID * BLOCK, GRID * BLOCK]} />
        <meshStandardMaterial color="#2f2645" roughness={0.95} />
      </mesh>
      {/* park quadrant green tint */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[HALF / 2 + 1, 0.03, HALF / 2 + 1]} receiveShadow>
        <planeGeometry args={[HALF + 2, HALF + 2]} />
        <meshStandardMaterial color="#27502f" roughness={0.95} />
      </mesh>
      <CuboidCollider
        args={[(GRID * BLOCK + 80) / 2, 0.5, (GRID * BLOCK + 80) / 2]}
        position={[0, -0.5, 0]}
      />
    </RigidBody>
  );
}

/* ============================================================= */
/*  LAKE — translucent water in the park quadrant + shore walls  */
/* ============================================================= */
function Lake() {
  // A lake in the inner part of the park quadrant. Shore colliders keep cars
  // out but the helicopter can fly over it.
  const lx = HALF / 2 + 10;
  const lz = HALF / 2 + 10;
  const lw = HALF - 24;
  const lh = HALF - 24;
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[lx, 0.06, lz]}>
        <planeGeometry args={[lw, lh]} />
        <meshStandardMaterial
          color="#1f6fb0"
          emissive="#2a8fd0"
          emissiveIntensity={0.25}
          transparent
          opacity={0.82}
          roughness={0.2}
          metalness={0.3}
        />
      </mesh>
      {/* invisible shore walls so cars can't drive in */}
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[lw / 2, 1.5, 1]} position={[lx, 1.5, lz - lh / 2]} sensor />
        <CuboidCollider args={[lw / 2, 1.5, 1]} position={[lx, 1.5, lz + lh / 2]} sensor />
        <CuboidCollider args={[1, 1.5, lh / 2]} position={[lx - lw / 2, 1.5, lz]} sensor />
        <CuboidCollider args={[1, 1.5, lh / 2]} position={[lx + lw / 2, 1.5, lz]} sensor />
      </RigidBody>
    </group>
  );
}

/* ============================================================= */
/*  ROADS (instanced)                                            */
/* ============================================================= */
function Roads() {
  const meshRef = useRef();
  const tiles = useMemo(() => {
    const t = [];
    for (let i = 0; i <= GRID; i++) {
      const c = -HALF + i * BLOCK;
      t.push({ x: 0, z: c, sx: GRID * BLOCK + ROAD_W, sz: ROAD_W });
      t.push({ x: c, z: 0, sx: ROAD_W, sz: GRID * BLOCK + ROAD_W });
    }
    return t;
  }, []);

  const dummy = useMemo(() => new THREE.Object3D(), []);
  useLayoutEffect(() => {
    const m = meshRef.current;
    if (!m) return;
    tiles.forEach((t, i) => {
      dummy.position.set(t.x, 0.04, t.z);
      dummy.scale.set(t.sx, 1, t.sz);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
  }, [tiles, dummy]);

  return (
    <>
      <instancedMesh
        ref={meshRef}
        args={[undefined, undefined, tiles.length]}
        receiveShadow
      >
        <boxGeometry args={[1, 0.08, 1]} />
        <meshStandardMaterial color="#1b1622" roughness={0.85} />
      </instancedMesh>
      <RoadMarkings />
    </>
  );
}

/* ============================================================= */
/*  ROAD MARKINGS — white dashed center lines                     */
/* ============================================================= */
function RoadMarkings() {
  const dashRef = useRef();
  const dummy = useMemo(() => new THREE.Object3D(), []);

  const dashes = useMemo(() => {
    const d = [];
    const dashLen = 2.2;
    const gap = 2.2;
    const step = dashLen + gap;
    const span = GRID * BLOCK;
    const count = Math.floor(span / step);
    const start = -span / 2 + step / 2;
    for (let i = 0; i <= GRID; i++) {
      const c = -HALF + i * BLOCK;
      for (let j = 0; j < count; j++) {
        const p = start + j * step;
        d.push({ x: p, z: c, rot: 0, len: dashLen });
        d.push({ x: c, z: p, rot: Math.PI / 2, len: dashLen });
      }
    }
    return d;
  }, []);

  useLayoutEffect(() => {
    const m = dashRef.current;
    if (!m) return;
    dashes.forEach((dd, i) => {
      dummy.position.set(dd.x, 0.095, dd.z);
      dummy.rotation.set(0, dd.rot, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
  }, [dashes, dummy]);

  return (
    <instancedMesh ref={dashRef} args={[undefined, undefined, dashes.length]}>
      <boxGeometry args={[0.28, 0.02, 2.2]} />
      <meshStandardMaterial
        color="#f5f0e0"
        emissive="#cfc8b0"
        emissiveIntensity={0.15}
        roughness={0.6}
      />
    </instancedMesh>
  );
}

/* ============================================================= */
/*  SIDEWALKS (instanced)                                         */
/* ============================================================= */
function Sidewalks() {
  const meshRef = useRef();
  const tiles = useMemo(() => {
    const t = [];
    for (let gx = 0; gx < GRID; gx++) {
      for (let gz = 0; gz < GRID; gz++) {
        if (districtOf(gx, gz) === "park") continue; // park has grass, no sidewalk
        const cx = -HALF + gx * BLOCK + BLOCK / 2;
        const cz = -HALF + gz * BLOCK + BLOCK / 2;
        t.push({ x: cx, z: cz, s: BLOCK - ROAD_W + 1 });
      }
    }
    return t;
  }, []);

  const dummy = useMemo(() => new THREE.Object3D(), []);
  useLayoutEffect(() => {
    const m = meshRef.current;
    if (!m) return;
    tiles.forEach((t, i) => {
      dummy.position.set(t.x, 0.12, t.z);
      dummy.scale.set(t.s, 1, t.s);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
  }, [tiles, dummy]);

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, tiles.length]}
      receiveShadow
    >
      <boxGeometry args={[1, 0.18, 1]} />
      <meshStandardMaterial color="#4a4458" roughness={0.9} />
    </instancedMesh>
  );
}

/* ============================================================= */
/*  BUILDINGS — instanced bodies + windows (distance-culled)     */
/* ============================================================= */
function Buildings({ buildings }) {
  const bodyRef = useRef();
  const winRef = useRef();
  const dummy = useMemo(() => new THREE.Object3D(), []);

  // Pre-compute window instances only for downtown/suburbs buildings.
  const windows = useMemo(() => {
    const w = [];
    buildings.forEach((b) => {
      if (!DISTRICT_STYLE[b.district].windows) return;
      const cols = 4;
      const rows = Math.max(2, Math.floor(b.h / 4));
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (seededRand(b.x * 13 + b.z * 7 + r * 31 + c * 17) > 0.55) continue;
          const yy = 2 + r * (b.h / rows);
          const xoff = (c - (cols - 1) / 2) * (b.w / cols) * 0.7;
          w.push({ x: b.x + xoff, y: yy, z: b.z + b.w / 2 + 0.05, face: 0 });
          w.push({ x: b.x + xoff, y: yy, z: b.z - b.w / 2 - 0.05, face: 0 });
          w.push({ x: b.x + b.w / 2 + 0.05, y: yy, z: b.z + xoff, face: 1 });
          w.push({ x: b.x - b.w / 2 - 0.05, y: yy, z: b.z + xoff, face: 1 });
        }
      }
    });
    return w;
  }, [buildings]);

  // Per-district palettes (resolved to THREE.Color once).
  const palettes = useMemo(() => {
    const out = {};
    for (const k of Object.keys(DISTRICT_STYLE)) {
      out[k] = DISTRICT_STYLE[k].palette.map((c) => new THREE.Color(c));
    }
    return out;
  }, []);

  useLayoutEffect(() => {
    const bm = bodyRef.current;
    if (bm) {
      buildings.forEach((b, i) => {
        const pal = palettes[b.district];
        dummy.position.set(b.x, b.h / 2, b.z);
        dummy.scale.set(b.w, b.h, b.w);
        dummy.updateMatrix();
        bm.setMatrixAt(i, dummy.matrix);
        bm.setColorAt(i, pal[i % pal.length]);
      });
      bm.instanceMatrix.needsUpdate = true;
      if (bm.instanceColor) bm.instanceColor.needsUpdate = true;
    }
    const wm = winRef.current;
    if (wm) {
      const warm = new THREE.Color("#ffcf6e");
      const neon = new THREE.Color("#7be0ff");
      const cache = [];
      windows.forEach((w, i) => {
        dummy.position.set(w.x, w.y, w.z);
        if (w.face === 1) dummy.rotation.set(0, Math.PI / 2, 0);
        else dummy.rotation.set(0, 0, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        wm.setMatrixAt(i, dummy.matrix);
        // cache the visible matrix so the cull pass can restore it cheaply
        cache.push(dummy.matrix.clone());
        wm.setColorAt(i, seededRand(i) > 0.82 ? neon : warm);
      });
      realMatrices.current = cache;
      wm.instanceMatrix.needsUpdate = true;
      if (wm.instanceColor) wm.instanceColor.needsUpdate = true;
    }
  }, [buildings, windows, dummy, palettes]);

  // WINDOW CULLING: windows are the O(GRID²·height) cost on a 3x bigger map.
  // Every few frames, hide windows far from the player (scale to ~0) and
  // restore near ones from a cached matrix array. Bounds GPU work per frame.
  const hidden = useMemo(() => {
    const o = new THREE.Object3D();
    o.position.set(0, -999, 0);
    o.scale.set(0.0001, 0.0001, 0.0001);
    o.updateMatrix();
    return o.matrix.clone();
  }, []);
  // Cache of each window's real (visible) matrix, built once on first layout.
  const realMatrices = useRef([]);
  const cullAcc = useRef(0);
  useFrame(() => {
    const wm = winRef.current;
    if (!wm || !windows.length) return;
    // build the visible-matrix cache lazily after the layout effect ran
    if (realMatrices.current.length !== windows.length) return;
    cullAcc.current += 1;
    if (cullAcc.current < 6) return; // ~10 culls/sec
    cullAcc.current = 0;
    const px = worldState.playerPos.x;
    const pz = worldState.playerPos.z;
    const R2 = 150 * 150;
    for (let i = 0; i < windows.length; i++) {
      const w = windows[i];
      const far = (w.x - px) ** 2 + (w.z - pz) ** 2 > R2;
      wm.setMatrixAt(i, far ? hidden : realMatrices.current[i]);
    }
    wm.instanceMatrix.needsUpdate = true;
  });

  return (
    <group>
      <RigidBody type="fixed" colliders={false}>
        <instancedMesh
          ref={bodyRef}
          args={[undefined, undefined, buildings.length]}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial roughness={0.85} flatShading />
        </instancedMesh>
        {buildings.map((b, i) => (
          <CuboidCollider
            key={i}
            args={[b.w / 2, b.h / 2, b.w / 2]}
            position={[b.x, b.h / 2, b.z]}
          />
        ))}
      </RigidBody>

      <instancedMesh
        ref={winRef}
        args={[undefined, undefined, windows.length]}
        frustumCulled={false}
      >
        <boxGeometry args={[1.1, 1.4, 0.1]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
    </group>
  );
}

/* ============================================================= */
/*  TREES (instanced) — low-poly cones in the park district       */
/* ============================================================= */
function Trees({ trees }) {
  const trunkRef = useRef();
  const leafRef = useRef();
  const dummy = useMemo(() => new THREE.Object3D(), []);

  useLayoutEffect(() => {
    const tm = trunkRef.current;
    const lm = leafRef.current;
    trees.forEach((t, i) => {
      // trunk
      dummy.position.set(t.x, 1.0 * t.s, t.z);
      dummy.scale.set(t.s, t.s, t.s);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      tm?.setMatrixAt(i, dummy.matrix);
      // leaves
      dummy.position.set(t.x, 3.2 * t.s, t.z);
      dummy.updateMatrix();
      lm?.setMatrixAt(i, dummy.matrix);
    });
    if (tm) tm.instanceMatrix.needsUpdate = true;
    if (lm) lm.instanceMatrix.needsUpdate = true;
  }, [trees, dummy]);

  if (!trees.length) return null;

  return (
    <group>
      <instancedMesh ref={trunkRef} args={[undefined, undefined, trees.length]} castShadow>
        <cylinderGeometry args={[0.25, 0.35, 2.4, 6]} />
        <meshStandardMaterial color="#5a3a22" flatShading />
      </instancedMesh>
      <instancedMesh ref={leafRef} args={[undefined, undefined, trees.length]} castShadow>
        <coneGeometry args={[1.8, 4, 7]} />
        <meshStandardMaterial color="#2f7d3a" flatShading />
      </instancedMesh>
    </group>
  );
}

/* ============================================================= */
/*  STREET LIGHTS (instanced poles + emissive caps)              */
/* ============================================================= */
function StreetLights() {
  const poleRef = useRef();
  const capRef = useRef();
  const dummy = useMemo(() => new THREE.Object3D(), []);

  const lights = useMemo(() => {
    const l = [];
    for (let i = 0; i <= GRID; i++) {
      for (let gx = 0; gx < GRID; gx++) {
        const c = -HALF + i * BLOCK;
        const x = -HALF + gx * BLOCK + BLOCK / 2;
        l.push({ x, z: c + ROAD_W / 2 + 1 });
        l.push({ x: c + ROAD_W / 2 + 1, z: x });
      }
    }
    return l;
  }, []);

  useLayoutEffect(() => {
    const pm = poleRef.current;
    const cm = capRef.current;
    lights.forEach((p, i) => {
      dummy.position.set(p.x, 3, p.z);
      dummy.scale.set(1, 1, 1);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      pm?.setMatrixAt(i, dummy.matrix);

      dummy.position.set(p.x, 6.1, p.z);
      dummy.updateMatrix();
      cm?.setMatrixAt(i, dummy.matrix);
    });
    if (pm) pm.instanceMatrix.needsUpdate = true;
    if (cm) cm.instanceMatrix.needsUpdate = true;
  }, [lights, dummy]);

  return (
    <group>
      <instancedMesh
        ref={poleRef}
        args={[undefined, undefined, lights.length]}
        castShadow
      >
        <cylinderGeometry args={[0.12, 0.16, 6, 5]} />
        <meshStandardMaterial color="#1a1024" />
      </instancedMesh>
      <instancedMesh ref={capRef} args={[undefined, undefined, lights.length]}>
        <sphereGeometry args={[0.4, 6, 6]} />
        <meshBasicMaterial color="#ffd98a" toneMapped={false} />
      </instancedMesh>
    </group>
  );
}

/* ============================================================= */
/*  WORLD BOUNDS — invisible walls                                */
/* ============================================================= */
function WorldBounds() {
  const ext = HALF + 6;
  const wallH = 80; // taller so helicopters can't fly out
  return (
    <RigidBody type="fixed" colliders={false}>
      <CuboidCollider args={[ext, wallH, 1]} position={[0, wallH, ext]} />
      <CuboidCollider args={[ext, wallH, 1]} position={[0, wallH, -ext]} />
      <CuboidCollider args={[1, wallH, ext]} position={[ext, wallH, 0]} />
      <CuboidCollider args={[1, wallH, ext]} position={[-ext, wallH, 0]} />
    </RigidBody>
  );
}
