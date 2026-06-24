import { useRef, useMemo } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useGameStore, worldState } from "../../store/useGameStore";

/**
 * DayNightCycle
 * Drives a directional "sun/moon" around the sky and blends sky/fog/ambient
 * colors through dawn -> day -> dusk -> night. A full cycle takes CYCLE seconds.
 * All color math reuses cached objects to avoid GC.
 *
 * The sky is a large inward-facing sphere with a vertical gradient shader
 * (zenith -> horizon -> ground haze), giving a believable "blue sky by day,
 * fiery sunset, starlit night" look instead of a flat background color.
 */
const CYCLE = 180; // seconds for a full day (a touch slower = nicer to watch)

// Key colors for blending (zenith, horizon, fog, sun light, ambient)
const KEYS = [
  // t,    zenith,     horizon,    fog,        sun,        si,   amb,        ai
  { t: 0.0, z: "#070b24", h: "#1a1450", fog: "#241a55", sun: "#8a96de", si: 0.7, amb: "#5a5a96", ai: 0.62 }, // deep night
  { t: 0.16, z: "#1b2a6e", h: "#ff7a5c", fog: "#ff9a72", sun: "#ffd2a8", si: 1.3, amb: "#ffb8c0", ai: 0.8 }, // dawn (warm)
  { t: 0.28, z: "#2f7fe0", h: "#bfe0ff", fog: "#d6ecff", sun: "#fff4e0", si: 1.7, amb: "#dcebff", ai: 0.92 }, // morning blue
  { t: 0.42, z: "#1f78e6", h: "#a9d6ff", fog: "#cfe6ff", sun: "#ffffff", si: 1.95, amb: "#e6f1ff", ai: 0.98 }, // bright midday blue
  { t: 0.55, z: "#2f86e8", h: "#bcd9ff", fog: "#d2e6ff", sun: "#fff4e6", si: 1.85, amb: "#dce9ff", ai: 0.94 }, // afternoon
  { t: 0.7, z: "#3a4fb0", h: "#ff8a4a", fog: "#ff9a5c", sun: "#ffc28a", si: 1.55, amb: "#ffbc9e", ai: 0.88 }, // golden hour
  { t: 0.8, z: "#2a2150", h: "#ff5a8a", fog: "#ff7080", sun: "#ff9a78", si: 1.2, amb: "#ff9ab0", ai: 0.78 }, // sunset (pink/orange)
  { t: 0.9, z: "#160f3a", h: "#52306e", fog: "#6a3e7e", sun: "#b88ce0", si: 0.9, amb: "#9a78c0", ai: 0.66 }, // twilight
  { t: 1.0, z: "#070b24", h: "#1a1450", fog: "#241a55", sun: "#8a96de", si: 0.7, amb: "#5a5a96", ai: 0.62 }, // back to night
];

const skyVert = /* glsl */ `
varying vec3 vWorldPos;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const skyFrag = /* glsl */ `
uniform vec3 topColor;
uniform vec3 horizonColor;
uniform vec3 bottomColor;
uniform vec3 sunDir;
uniform vec3 sunColor;
uniform float sunIntensity;
varying vec3 vWorldPos;
void main() {
  vec3 dir = normalize(vWorldPos);
  float h = dir.y; // -1..1
  // Blend bottom -> horizon -> top with smoothstops.
  vec3 col;
  if (h > 0.0) {
    float k = pow(clamp(h, 0.0, 1.0), 0.55);
    col = mix(horizonColor, topColor, k);
  } else {
    float k = pow(clamp(-h, 0.0, 1.0), 0.7);
    col = mix(horizonColor, bottomColor, k);
  }
  // Sun glow (a soft halo around the sun direction).
  float d = max(dot(dir, normalize(sunDir)), 0.0);
  float halo = pow(d, 8.0) * 0.5 + pow(d, 200.0) * 1.2;
  col += sunColor * halo * sunIntensity;
  gl_FragColor = vec4(col, 1.0);
}
`;

export default function DayNightCycle() {
  const { scene } = useThree();
  const sunRef = useRef();
  const moonRef = useRef();
  const sunMeshRef = useRef();
  const moonMeshRef = useRef();
  const ambRef = useRef();
  const hemiRef = useRef();
  const skyMatRef = useRef();

  const c = useMemo(
    () => ({
      top: new THREE.Color(),
      horizon: new THREE.Color(),
      bottom: new THREE.Color(),
      fog: new THREE.Color(),
      sun: new THREE.Color(),
      amb: new THREE.Color(),
      a: new THREE.Color(),
      b: new THREE.Color(),
      sunDir: new THREE.Vector3(),
    }),
    []
  );
  const time = useRef(0.42); // start mid-morning (bright blue sky)
  const sunTarget = useMemo(() => new THREE.Object3D(), []);

  // Sky shader uniforms (updated each frame).
  const skyUniforms = useMemo(
    () => ({
      topColor: { value: new THREE.Color("#1f78e6") },
      horizonColor: { value: new THREE.Color("#bcd9ff") },
      bottomColor: { value: new THREE.Color("#3a2a55") },
      sunDir: { value: new THREE.Vector3(0, 1, 0) },
      sunColor: { value: new THREE.Color("#fff4e0") },
      sunIntensity: { value: 1.0 },
    }),
    []
  );

  useFrame((_, rawDelta) => {
    const ts = useGameStore.getState().timeScale;
    time.current = (time.current + (rawDelta * ts) / CYCLE) % 1;
    const t = time.current;

    // find segment
    let i = 0;
    while (i < KEYS.length - 1 && t > KEYS[i + 1].t) i++;
    const a = KEYS[i];
    const b = KEYS[Math.min(i + 1, KEYS.length - 1)];
    const span = b.t - a.t || 1;
    const k = THREE.MathUtils.clamp((t - a.t) / span, 0, 1);

    // blend colors
    c.top.copy(c.a.set(a.z)).lerp(c.b.set(b.z), k);
    c.horizon.copy(c.a.set(a.h)).lerp(c.b.set(b.h), k);
    c.fog.copy(c.a.set(a.fog)).lerp(c.b.set(b.fog), k);
    c.sun.copy(c.a.set(a.sun)).lerp(c.b.set(b.sun), k);
    c.amb.copy(c.a.set(a.amb)).lerp(c.b.set(b.amb), k);
    const si = THREE.MathUtils.lerp(a.si, b.si, k);
    const ai = THREE.MathUtils.lerp(a.ai, b.ai, k);

    // Fog still uses the horizon color so distant geometry melts into the sky.
    if (scene.fog) {
      scene.fog.color.copy(c.horizon);
    }
    // No flat scene.background — the gradient sky dome covers it.

    // Follow the player so shadows stay crisp across the whole map.
    const fx = worldState.playerPos.x;
    const fz = worldState.playerPos.z;

    // Sun orbit: angle goes around as t advances. Sun up during day.
    const ang = t * Math.PI * 2 - Math.PI / 2;
    const sx = Math.cos(ang) * 120;
    const sy = Math.sin(ang) * 90;
    const sz = -60;
    // direction from origin toward the sun (normalized)
    c.sunDir.set(sx, sy, sz).normalize();

    // Publish a darkness factor (0 bright day .. 1 deep night) for light-decal
    // systems. Smoothed around the horizon so reflections fade in/out gently.
    worldState.darkness = THREE.MathUtils.clamp(-sy / 45, 0, 1);

    if (sunRef.current) {
      // Keep the light close to the player so the tight shadow frustum always
      // covers the visible area (crisper shadows, less GPU work).
      const dir = 1 / Math.max(1, Math.hypot(sx, sy, sz));
      sunRef.current.position.set(fx + sx * dir * 70, Math.max(35, sy), fz + sz * dir * 70);
      sunTarget.position.set(fx, 0, fz);
      sunTarget.updateMatrixWorld();
      sunRef.current.intensity = Math.max(0, sy > -5 ? si : 0.05);
      sunRef.current.color.copy(c.sun);
      sunRef.current.visible = sy > -10;
    }
    if (sunMeshRef.current) {
      sunMeshRef.current.position.set(fx + sx, sy, fz + sz);
      sunMeshRef.current.visible = sy > -2;
    }
    // Moon opposite the sun
    if (moonRef.current) {
      moonRef.current.position.set(fx - sx, -sy, fz - sz);
      moonRef.current.intensity = sy < 5 ? 0.5 : 0;
      moonRef.current.visible = sy < 10;
    }
    if (moonMeshRef.current) {
      moonMeshRef.current.position.set(fx - sx, -sy, fz - sz);
      moonMeshRef.current.visible = -sy > -2;
    }

    if (ambRef.current) {
      ambRef.current.intensity = ai;
      ambRef.current.color.copy(c.amb);
    }
    if (hemiRef.current) {
      hemiRef.current.intensity = ai * 0.8;
      hemiRef.current.color.copy(c.horizon);
    }

    // Update gradient sky dome.
    if (skyMatRef.current) {
      skyUniforms.topColor.value.copy(c.top);
      skyUniforms.horizonColor.value.copy(c.horizon);
      skyUniforms.bottomColor.value.lerpColors(c.horizon, c.fog, 0.6);
      skyUniforms.sunColor.value.copy(c.sun);
      skyUniforms.sunIntensity.value = sy > 0 ? 1.0 : 0.25;
      skyUniforms.sunDir.value.copy(c.sunDir);
      // keep the sky dome centred on the player so it never feels parallaxed
      skyMatRef.current.position?.set?.(fx, 0, fz);
    }
  });

  const isMobile = useGameStore((s) => s.isMobile);

  return (
    <group>
      <ambientLight ref={ambRef} intensity={0.5} />
      <hemisphereLight ref={hemiRef} intensity={0.5} groundColor="#1a0a30" />

      <primitive object={sunTarget} />
      <directionalLight
        ref={sunRef}
        castShadow
        intensity={1.5}
        target={sunTarget}
        position={[60, 80, -60]}
        shadow-mapSize-width={isMobile ? 1024 : 1536}
        shadow-mapSize-height={isMobile ? 1024 : 1536}
        shadow-camera-near={1}
        shadow-camera-far={200}
        shadow-camera-left={-55}
        shadow-camera-right={55}
        shadow-camera-top={55}
        shadow-camera-bottom={-55}
        shadow-bias={-0.0004}
      />
      <directionalLight ref={moonRef} intensity={0.4} color="#9ab0ff" />

      {/* Gradient sky dome (renders behind everything). */}
      <mesh ref={skyMatRef} frustumCulled={false} renderOrder={-1}>
        <sphereGeometry args={[400, 32, 16]} />
        <shaderMaterial
          side={THREE.BackSide}
          depthWrite={false}
          uniforms={skyUniforms}
          vertexShader={skyVert}
          fragmentShader={skyFrag}
          fog={false}
        />
      </mesh>

      {/* sun disc */}
      <mesh ref={sunMeshRef}>
        <sphereGeometry args={[8, 16, 16]} />
        <meshBasicMaterial color="#fff2c0" toneMapped={false} />
      </mesh>
      {/* moon disc */}
      <mesh ref={moonMeshRef}>
        <sphereGeometry args={[6, 16, 16]} />
        <meshBasicMaterial color="#dfe8ff" toneMapped={false} />
      </mesh>
    </group>
  );
}
