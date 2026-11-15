import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { Line } from '@react-three/drei';
import { cleanHorizonMask } from '../../../utils/shadowMath';
import { horizonRingPoints, horizontalCirclePoints, skyPoint } from '../../../utils/skyPlacement';
import { SkyLabel } from './SkyLabel';
import { SKY_RENDER_ORDER } from './SkySun';

const CARDINALS = [
  { az: 0, letter: 'N', deg: '0°', label: '0° N' },
  { az: 90, letter: 'E', deg: '90°', label: '90° E' },
  { az: 180, letter: 'S', deg: '180°', label: '180° S' },
  { az: 270, letter: 'W', deg: '270°', label: '270° W' },
];

/** Lower edge of the "terrain" band: below the lowest horizon sample and the Earth's lowest pass. */
function bandFloorDeg(mask) {
  const lowest = Math.min(...cleanHorizonMask(mask).map((m) => m.horizon_elevation_deg));
  return Math.max(-89, Math.min(-10, lowest - 2));
}

/**
 * Band between the silhouette (top) and a floor elevation (bottom): the 3D counterpart of the
 * filled terrain polygon in the 360° panorama. null when the ring is unavailable.
 */
function buildBand(ring, mask, northOffset, center, radiusKm) {
  if (!ring) return null;
  const floor = bandFloorDeg(mask);
  const n = ring.length; // 361, last = first
  const step = 360 / (n - 1);
  const pos = new Float32Array(n * 2 * 3);
  for (let k = 0; k < n; k += 1) {
    const bottom = skyPoint({ azimuth_deg: (k % (n - 1)) * step + northOffset, elevation_deg: floor }, center, radiusKm);
    pos.set(ring[k], k * 6);
    pos.set(bottom, k * 6 + 3);
  }
  const index = [];
  for (let k = 0; k < n - 1; k += 1) {
    const t0 = 2 * k, b0 = t0 + 1, t1 = t0 + 2, b1 = t0 + 3;
    index.push(t0, b0, t1, b0, b1, t1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geometry.setIndex(index);
  return geometry;
}

/**
 * The active site's horizon_mask_360 drawn around the dome centre at TRUE elevation angles — the
 * same silhouette as the 360° panorama, so a Sun/Earth icon above the line is above the horizon
 * mask. Includes the 0° horizontal circle (like the panorama's 0° line). Cardinal labels are only
 * shown in the lander POV (the compass ring covers the overview). Nothing is drawn without a mask.
 */
export function SkyHorizonRing({
  mask,
  northOffset,
  center,
  radiusKm,
  mode = 'overview',
  showCompass = true,
}) {
  const [cx, cy, cz] = center ?? [];
  const { ring, zero, band } = useMemo(() => {
    const c = [cx, cy, cz];
    const r = horizonRingPoints(mask, northOffset, c, radiusKm);
    return {
      ring: r,
      zero: horizontalCirclePoints(c, radiusKm),
      band: buildBand(r, mask, northOffset, c, radiusKm),
    };
  }, [mask, northOffset, cx, cy, cz, radiusKm]);
  useEffect(() => () => band?.dispose(), [band]);

  if (!ring || !zero) return null;
  return (
    <group name="sky-horizon">
      {band && (
        <mesh name="sky-horizon-band" geometry={band} renderOrder={SKY_RENDER_ORDER - 3}>
          <meshBasicMaterial color="#475569" transparent opacity={0.28} side={THREE.DoubleSide} depthTest={false} depthWrite={false} />
        </mesh>
      )}
      <Line
        name="sky-horizon-zero"
        points={zero}
        color="#ffffff"
        lineWidth={1}
        dashed
        dashSize={0.15}
        gapSize={0.12}
        transparent
        opacity={0.3}
        depthTest={false}
        depthWrite={false}
        renderOrder={SKY_RENDER_ORDER - 2}
      />
      <Line
        name="sky-horizon-ring"
        points={ring}
        color="#cbd5e1"
        lineWidth={1.5}
        transparent
        opacity={0.9}
        depthTest={false}
        depthWrite={false}
        renderOrder={SKY_RENDER_ORDER - 2}
      />
      {mode === 'pov' &&
        showCompass &&
        CARDINALS.map(({ az, letter, deg, label }) => (
          <SkyLabel
            key={label}
            position={skyPoint({ azimuth_deg: az + northOffset, elevation_deg: 0 }, [cx, cy, cz], radiusKm)}
            testId={`sky-cardinal-${az}`}
          >
            <span className="inline-flex items-baseline gap-1.5 font-jakarta text-white">
              <span className="inline-block origin-bottom scale-x-[0.82] scale-y-[1.75] text-[20px] font-extrabold tracking-wider text-white">
                {letter}
              </span>
              <span className="text-[11px] font-semibold tracking-widest text-white/85 tabular-nums">
                {deg}
              </span>
            </span>
          </SkyLabel>
        ))}
    </group>
  );
}
