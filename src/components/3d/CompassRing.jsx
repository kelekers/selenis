import { useMemo } from 'react';
import { Html, Line } from '@react-three/drei';
import { celestialToCartesian } from '../../utils/shadowMath';

const CARDINALS = [
  { label: '0° U', accent: true },
  { label: '90° T', accent: false },
  { label: '180° S', accent: false },
  { label: '270° B', accent: false },
];

export function CompassRing({ radius = 10.2, basis }) {
  const ringPoints = useMemo(() => {
    const pts = [];
    const steps = 96;
    for (let i = 0; i <= steps; i += 1) {
      const theta = (i / steps) * Math.PI * 2;
      pts.push([Math.sin(theta) * radius, 0.05, -Math.cos(theta) * radius]);
    }
    return pts;
  }, [radius]);

  return (
    <group name="azimuth-compass-ring">
      <Line
        points={ringPoints}
        color="rgba(148, 163, 184, 0.28)"
        lineWidth={1}
        dashed
        dashSize={0.4}
        gapSize={0.3}
      />

      {CARDINALS.map((item, index) => (
        <Html key={item.label} position={celestialToCartesian(index * 90, 0.8, radius * 1.06, basis)} center distanceFactor={28}>
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
