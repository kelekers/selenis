import { useMemo } from 'react';
import { Html, Line } from '@react-three/drei';
import { celestialToCartesian } from '../../utils/shadowMath';

// Labels sit just outside the ring (ratio of the original 10.8 / 10.2 layout for a 20 km tile).
const LABEL_RADIUS_FACTOR = 1.07;
const CARDINALS = [
  { letter: 'N', deg: '0°', accent: true },
  { letter: 'E', deg: '90°', accent: false },
  { letter: 'S', deg: '180°', accent: false },
  { letter: 'W', deg: '270°', accent: false },
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
  const labelRadius = radius * LABEL_RADIUS_FACTOR;

  return (
    <group name="azimuth-compass-ring">
      <Line
        points={ringPoints}
        color="#ffffff"
        transparent
        opacity={0.22}
        lineWidth={1}
        dashed
        dashSize={0.4}
        gapSize={0.3}
      />

      {CARDINALS.map((item, index) => (
        <Html
          key={item.letter}
          position={celestialToCartesian(index * 90, 1.4, labelRadius, basis)}
          center
          distanceFactor={28}
          zIndexRange={[4, 0]}
        >
          <div className="font-jakarta pointer-events-none flex flex-col items-center select-none">
            <span
              className="inline-block origin-bottom scale-x-[0.82] scale-y-[1.85] text-[38px] leading-none font-extrabold tracking-[0.14em] text-white"
              style={{
                textShadow:
                  '0 4px 16px rgba(0,0,0,0.98), 0 1px 3px rgba(0,0,0,0.95), 0 0 24px rgba(255,255,255,0.28)',
              }}
            >
              {item.letter}
            </span>
            <span
              className="mt-1.5 text-[11px] font-semibold tracking-[0.22em] text-white/90 tabular-nums"
              style={{ textShadow: '0 2px 8px rgba(0,0,0,0.98)' }}
            >
              {item.deg}
            </span>
          </div>
        </Html>
      ))}
    </group>
  );
}
