import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';

// Shared orthonormal basis for the tilted Milky Way galactic plane in scene coordinates
const GALACTIC_NORMAL = new THREE.Vector3(0.38, 0.76, -0.526).normalize();
const GALACTIC_U = new THREE.Vector3(-0.82, 0.51, 0.258).normalize();
const GALACTIC_V = new THREE.Vector3().crossVectors(GALACTIC_NORMAL, GALACTIC_U).normalize();

// Prominent distant galaxies / Magellanic clouds directions in unit sphere coordinates
const GALAXY_CENTERS = [
  // 0: Spiral Galaxy (Andromeda-like, tilted disk with bright warm core)
  new THREE.Vector3(-0.62, 0.52, -0.587).normalize(),
  // 1: Large Magellanic Cloud (LMC - luminous irregular barred galaxy in southern sky)
  new THREE.Vector3(0.54, 0.44, 0.717).normalize(),
  // 2: Small Magellanic Cloud (SMC - companion dwarf galaxy)
  new THREE.Vector3(0.36, 0.33, 0.872).normalize(),
  // 3: Distant Grand-Design Spiral Galaxy (Sculptor / Whirlpool style)
  new THREE.Vector3(0.71, 0.58, -0.398).normalize(),
];

// Spectral star color palette (O, B, A, F, G, K, M classes + nebula-tinted cluster stars)
const STAR_PALETTE = [
  [0.64, 0.78, 1.0],  // Class O/B: hot blue-white
  [0.78, 0.88, 1.0],  // Class B/A: ice blue-white
  [0.96, 0.98, 1.0],  // Class A: pure brilliant white
  [1.0, 0.97, 0.88],  // Class F: warm creamy white
  [1.0, 0.92, 0.74],  // Class G: solar yellow-gold
  [1.0, 0.81, 0.58],  // Class K: warm amber-orange
  [1.0, 0.68, 0.48],  // Class M: softrose-gold
  [0.82, 0.72, 1.0],  // Violet-tinted galactic cluster star
];

/** Deterministic PRNG (Mulberry32) so starfield is stable across renders and tests. */
function createRng(seed = 133742) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SKY_DOME_VERTEX_SHADER = /* glsl */ `
  varying vec3 vWorldDir;
  void main() {
    vWorldDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SKY_DOME_FRAGMENT_SHADER = /* glsl */ `
  varying vec3 vWorldDir;
  uniform vec3 uGalacticNormal;
  uniform vec3 uGalacticU;
  uniform vec3 uGalacticV;
  uniform vec3 uGalaxy0;
  uniform vec3 uGalaxy1;
  uniform vec3 uGalaxy2;
  uniform vec3 uGalaxy3;
  uniform float uIntensity;

  // Ultra-fast 3D hash-free trigonometric fBm noise (mobile/integrated GPU friendly)
  float triNoise(vec3 p) {
    vec3 s = sin(p * 1.73 + sin(p.zxy * 2.91 + sin(p.yzx * 4.17)));
    return dot(s, vec3(0.1666667)) + 0.5;
  }

  float fbm(vec3 p) {
    float v = 0.0;
    v += 0.52 * triNoise(p);
    v += 0.30 * triNoise(p * 2.13 + vec3(1.7, -2.3, 0.9));
    v += 0.18 * triNoise(p * 4.41 + vec3(-3.1, 1.1, 2.7));
    return v;
  }

  // Analytic spiral galaxy glow on the celestial sphere
  vec3 renderSpiralGalaxy(vec3 dir, vec3 center, vec3 axisA, vec3 axisB, float radius, vec3 coreCol, vec3 armCol) {
    vec3 diff = dir - center;
    float distSq = dot(diff, diff);
    if (distSq > radius * radius * 9.0) return vec3(0.0);

    // Project onto tilted galaxy plane
    float x = dot(diff, axisA) / radius;
    float y = dot(diff, axisB) / (radius * 0.48); // inclined elliptical disk
    float r = sqrt(x * x + y * y);
    if (r > 2.8) return vec3(0.0);

    float theta = atan(y, x);
    // Two logarithmic spiral arms + flocculent dust modulation
    float spiralPhase = theta * 2.0 - log(max(r, 0.04)) * 4.6;
    float arms = pow(max(0.0, 0.5 + 0.5 * cos(spiralPhase)), 2.2);
    float clumping = 0.65 + 0.35 * sin(theta * 5.0 + r * 8.0);

    float core = exp(-r * r * 7.5);
    float bulge = exp(-r * 2.4) * 0.65;
    float disk = exp(-r * 1.55) * (0.28 + 0.72 * arms * clumping) * smoothstep(0.05, 0.35, r);

    return coreCol * (core * 1.35 + bulge * 0.55) + armCol * disk * 0.85;
  }

  void main() {
    vec3 dir = normalize(vWorldDir);

    // Deep cosmic background gradient
    vec3 baseSpace = vec3(0.012, 0.018, 0.034);

    // Galactic coordinates: latSin = distance from Milky Way plane, lon = angle along plane
    float galLat = dot(dir, uGalacticNormal);
    float gu = dot(dir, uGalacticU);
    float gv = dot(dir, uGalacticV);

    // Multi-scale cosmic cloud structure
    float n1 = fbm(dir * 2.4);
    float n2 = fbm(dir * 5.2 + vec3(n1 * 1.4));
    float dust = fbm(dir * 7.8 - vec3(n2 * 1.6));

    // Milky Way band envelope (wider diffuse halo + narrow bright core ridge)
    float warpedLat = galLat + (n1 - 0.5) * 0.14;
    float outerBand = exp(-warpedLat * warpedLat * 11.0);
    float innerBand = exp(-warpedLat * warpedLat * 42.0);

    // Galactic core brightening toward +uGalacticU (Sagittarius / Carina direction)
    float coreProximity = smoothstep(-0.4, 0.95, gu) * exp(-warpedLat * warpedLat * 24.0);

    // Dark interstellar dust rift carving through the center of the Milky Way
    float dustRift = smoothstep(0.46, 0.72, dust) * exp(-warpedLat * warpedLat * 95.0);

    // Nebula color palette along the Milky Way
    vec3 nebulaBlue = vec3(0.09, 0.19, 0.38);
    vec3 nebulaViolet = vec3(0.24, 0.11, 0.36);
    vec3 nebulaCyan = vec3(0.07, 0.25, 0.34);
    vec3 galacticCoreGold = vec3(0.42, 0.30, 0.20);

    vec3 mwColor = mix(nebulaBlue, nebulaViolet, smoothstep(0.32, 0.68, n2));
    mwColor = mix(mwColor, nebulaCyan, smoothstep(0.55, 0.82, n1) * 0.55);
    mwColor += galacticCoreGold * (coreProximity * 0.75 + innerBand * 0.35);

    float mwStrength = (outerBand * (0.28 + 0.45 * n1) + innerBand * (0.35 + 0.45 * n2));
    mwStrength *= (1.0 - 0.62 * dustRift);

    vec3 col = baseSpace + mwColor * mwStrength * 0.58;

    // Subtle emission nebula knots (Rosette / Carina magenta-cyan wisps)
    float emission = smoothstep(0.62, 0.86, n2) * outerBand;
    col += vec3(0.28, 0.10, 0.26) * emission * 0.25;

    // 1. Andromeda-like Spiral Galaxy
    vec3 g0A = normalize(cross(uGalaxy0, vec3(0.2, 1.0, 0.1)));
    vec3 g0B = normalize(cross(uGalaxy0, g0A));
    col += renderSpiralGalaxy(
      dir, uGalaxy0, g0A, g0B, 0.085,
      vec3(0.95, 0.82, 0.62),
      vec3(0.38, 0.58, 0.92)
    ) * 0.65;

    // 2. Large Magellanic Cloud (LMC) soft barred irregular glow
    float dLmc = length(dir - uGalaxy1);
    if (dLmc < 0.24) {
      float lmcGlow = exp(-dLmc * dLmc * 75.0) * (0.65 + 0.55 * n2);
      col += mix(vec3(0.22, 0.36, 0.64), vec3(0.52, 0.28, 0.48), n1) * lmcGlow * 0.45;
    }

    // 3. Small Magellanic Cloud (SMC)
    float dSmc = length(dir - uGalaxy2);
    if (dSmc < 0.16) {
      float smcGlow = exp(-dSmc * dSmc * 140.0) * (0.6 + 0.5 * n1);
      col += vec3(0.24, 0.40, 0.68) * smcGlow * 0.38;
    }

    // 4. Distant Grand-Design Spiral Galaxy
    vec3 g3A = normalize(cross(uGalaxy3, vec3(-0.4, 0.8, 0.3)));
    vec3 g3B = normalize(cross(uGalaxy3, g3A));
    col += renderSpiralGalaxy(
      dir, uGalaxy3, g3A, g3B, 0.062,
      vec3(0.98, 0.86, 0.70),
      vec3(0.46, 0.52, 0.95)
    ) * 0.55;

    col *= uIntensity;
    gl_FragColor = vec4(col, 1.0);
  }
`;

const STARFIELD_VERTEX_SHADER = /* glsl */ `
  attribute float aSize;
  attribute float aPhase;
  attribute vec3 aColor;

  varying vec3 vColor;
  varying float vTwinkle;
  varying float vBright;

  uniform float uTime;
  uniform float uPixelRatio;

  void main() {
    vColor = aColor;
    float twinkle = 0.82 + 0.18 * sin(uTime * 1.9 + aPhase);
    vTwinkle = twinkle;
    vBright = step(2.6, aSize);

    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    gl_PointSize = clamp(aSize * uPixelRatio * twinkle, 1.1, 11.0);
  }
`;

const STARFIELD_FRAGMENT_SHADER = /* glsl */ `
  varying vec3 vColor;
  varying float vTwinkle;
  varying float vBright;

  void main() {
    vec2 uv = gl_PointCoord - vec2(0.5);
    float d = length(uv) * 2.0;
    if (d > 1.0) discard;

    // Crisp airy-disk core + soft exponential halo
    float core = exp(-d * d * 11.0);
    float halo = exp(-d * d * 3.2) * 0.42;

    // Subtle 4-point diffraction cross on the brightest magnitude-1 stars
    float spikes = 0.0;
    if (vBright > 0.5) {
      float sx = exp(-abs(uv.y) * 26.0) * exp(-abs(uv.x) * 4.5);
      float sy = exp(-abs(uv.x) * 26.0) * exp(-abs(uv.y) * 4.5);
      spikes = (sx + sy) * 0.35;
    }

    float alpha = clamp((core + halo + spikes) * vTwinkle, 0.0, 1.0);
    vec3 finalColor = mix(vColor, vec3(1.0), core * 0.45 + spikes * 0.5);
    gl_FragColor = vec4(finalColor, alpha);
  }
`;

/**
 * Generates a lightweight, deterministic 3D starfield & galaxy-cluster BufferGeometry.
 */
function buildStarfieldGeometry(radius, count, fullSphere) {
  const rng = createRng(90210);
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const phases = new Float32Array(count);

  const tmpDir = new THREE.Vector3();
  const minY = fullSphere ? -1.0 : -0.18;

  for (let i = 0; i < count; i += 1) {
    const mode = rng();
    if (mode < 0.52) {
      // 52% concentrated along the Milky Way Galactic Band
      const lon = rng() * Math.PI * 2;
      // Box-Muller-like tight spread around galactic equator
      const spread = (rng() + rng() + rng() - 1.5) * 0.22;
      const cosLat = Math.sqrt(Math.max(0.01, 1 - spread * spread));
      const gu = cosLat * Math.cos(lon);
      const gv = cosLat * Math.sin(lon);
      tmpDir
        .copy(GALACTIC_U)
        .multiplyScalar(gu)
        .addScaledVector(GALACTIC_V, gv)
        .addScaledVector(GALACTIC_NORMAL, spread)
        .normalize();
      if (!fullSphere && tmpDir.y < minY) {
        tmpDir.negate();
      }
    } else if (mode < 0.64) {
      // 12% clustered inside the 4 distant galaxies / Magellanic Clouds
      const gIdx = i % GALAXY_CENTERS.length;
      const gCenter = GALAXY_CENTERS[gIdx];
      const spreadRadius = gIdx === 1 ? 0.095 : gIdx === 2 ? 0.065 : 0.055;
      const r = Math.pow(rng(), 0.7) * spreadRadius;
      const theta = rng() * Math.PI * 2;
      const ox = r * Math.cos(theta);
      const oy = r * Math.sin(theta) * 0.55;
      const oz = (rng() - 0.5) * r * 0.35;
      tmpDir.set(gCenter.x + ox, gCenter.y + oy, gCenter.z + oz).normalize();
    } else {
      // 36% isotropic background stars across the sky dome
      const u = rng();
      const v = rng();
      const theta = 2 * Math.PI * u;
      const z = fullSphere ? 2 * v - 1 : minY + v * (1 - minY);
      const r = Math.sqrt(Math.max(0, 1 - z * z));
      tmpDir.set(r * Math.cos(theta), z, r * Math.sin(theta));
    }

    const rShell = radius * (0.86 + 0.12 * rng());
    positions[i * 3] = tmpDir.x * rShell;
    positions[i * 3 + 1] = tmpDir.y * rShell;
    positions[i * 3 + 2] = tmpDir.z * rShell;

    // Pick spectral color and brightness
    const paletteEntry = STAR_PALETTE[Math.floor(rng() * STAR_PALETTE.length)];
    const brightness = 0.65 + 0.35 * rng();
    colors[i * 3] = paletteEntry[0] * brightness;
    colors[i * 3 + 1] = paletteEntry[1] * brightness;
    colors[i * 3 + 2] = paletteEntry[2] * brightness;

    // Power-law star size distribution (many faint stars, few brilliant beacon stars)
    const magRoll = rng();
    sizes[i] = magRoll > 0.965 ? 2.8 + rng() * 1.4 : magRoll > 0.82 ? 1.7 + rng() * 0.9 : 0.85 + rng() * 0.85;
    phases[i] = rng() * Math.PI * 2;
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geom.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
  geom.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  geom.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
  return geom;
}

/**
 * Lightweight, high-beauty 3D Space & Milky Way Galaxy Background.
 * Uses only 2 draw calls (1 BackSide sky dome shader + 1 multi-spectral starfield Points cloud)
 * and zero network texture downloads.
 */
export function SpaceBackground({
  radius = 120,
  starCount = 3800,
  intensity = 1.0,
  fullSphere = true,
  animate = true,
  showDome = true,
  followCamera = true,
}) {
  const groupRef = useRef(null);
  const starMaterialRef = useRef(null);

  const domeUniforms = useMemo(
    () => ({
      uGalacticNormal: { value: GALACTIC_NORMAL },
      uGalacticU: { value: GALACTIC_U },
      uGalacticV: { value: GALACTIC_V },
      uGalaxy0: { value: GALAXY_CENTERS[0] },
      uGalaxy1: { value: GALAXY_CENTERS[1] },
      uGalaxy2: { value: GALAXY_CENTERS[2] },
      uGalaxy3: { value: GALAXY_CENTERS[3] },
      uIntensity: { value: intensity },
    }),
    [intensity]
  );

  const starUniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uPixelRatio: {
        value: Math.min(2, globalThis.window?.devicePixelRatio ?? 1.5),
      },
    }),
    []
  );

  const starGeometry = useMemo(
    () => buildStarfieldGeometry(radius * 0.94, starCount, fullSphere),
    [radius, starCount, fullSphere]
  );

  useEffect(() => () => starGeometry.dispose(), [starGeometry]);

  useFrame(({ clock, camera }) => {
    if (followCamera && groupRef.current && camera) {
      groupRef.current.position.copy(camera.position);
    }
    if (!animate || !starMaterialRef.current) return;
    starMaterialRef.current.uniforms.uTime.value = clock.getElapsedTime();
  });

  return (
    <group ref={groupRef} name="space-galaxy-background">
      {/* 1. Deep-Space Milky Way & Distant Spiral Galaxies Sky Dome */}
      {showDome && (
        <mesh name="galactic-sky-dome" renderOrder={-100} frustumCulled={false}>
          <sphereGeometry args={[radius, 32, 24]} />
          <shaderMaterial
            vertexShader={SKY_DOME_VERTEX_SHADER}
            fragmentShader={SKY_DOME_FRAGMENT_SHADER}
            uniforms={domeUniforms}
            side={THREE.BackSide}
            depthWrite={false}
            depthTest={true}
          />
        </mesh>
      )}

      {/* 2. Multi-Spectral Starfield & Resolved Galaxy Star Clusters */}
      <points name="galactic-starfield" geometry={starGeometry} renderOrder={-99} frustumCulled={false}>
        <shaderMaterial
          ref={starMaterialRef}
          vertexShader={STARFIELD_VERTEX_SHADER}
          fragmentShader={STARFIELD_FRAGMENT_SHADER}
          uniforms={starUniforms}
          transparent
          depthWrite={false}
          depthTest={true}
          blending={THREE.AdditiveBlending}
        />
      </points>
    </group>
  );
}
