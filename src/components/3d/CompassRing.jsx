import { useMemo } from 'react';
import { Html, Line } from '@react-three/drei';

// Labels sit just outside the ring (ratio of the original 10.8 / 10.2 layout for a 20 km tile).
const LABEL_RADIUS_FACTOR = 1.06;
const CARDINALS = [
  { label: '0° U', dir: [0, -1], accent: true },
  { label: '90° T', dir: [1, 0], accent: false },
  { label: '180° S', dir: [0, 1], accent: false },
  { label: '270° B', dir: [-1, 0], accent: false },
];

export function CompassRing({ radius = 10.2 }) {
  const ringPoints = useMemo(() => {
    const pts = [];
    const steps = 96;
    for (let i = 0; i <= steps; i += 1) {
      const theta = (i / steps) * Math.PI * 2;
      pts.push([Math.sin(theta) * radius, 0.05, -Math.cos(theta) * radius]);
    }
    return pts;
  }, [radius]);
  const labelRadius = radius * LABEL_RADIUS_FACTOR;

  return (
    <group name="azimuth-compass-ring">
      {/* THREE.Color ignores the alpha of an rgba() string → use opacity on the line material. */}
      <Line
        points={ringPoints}
        color="#94a3b8"
        transparent
        opacity={0.28}
        lineWidth={1}
        dashed
        dashSize={0.4}
        gapSize={0.3}
      />

      {CARDINALS.map((item) => (
        <Html
          key={item.label}
          position={[item.dir[0] * labelRadius, 0.15, item.dir[1] * labelRadius]}
          center
          distanceFactor={16}
          // z-index ≤ 4: under the 3D panel/badge (z 6–7) and the HUD (drei's default is above all).
          zIndexRange={[4, 0]}
        >
          <span
            className={`pointer-events-none rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-wider whitespace-nowrap ${
              item.accent
                ? 'border border-amber-400/40 bg-amber-500/20 text-amber-300'
                : 'bg-[#0b101b]/75 text-slate-400'
            }`}
          >
            {item.label}
          </span>
        </Html>
      ))}
    </group>
  );
}
