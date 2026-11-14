import { useMemo } from 'react';
import { celestialToCartesian } from '../../utils/shadowMath';

export function SunLighting({ sunVector }) {
  const azimuthDeg = sunVector?.azimuth_deg ?? 140;
  const elevationDeg = sunVector?.elevation_deg ?? 2.2;

  const sunPosition = useMemo(
    () => celestialToCartesian(azimuthDeg, elevationDeg, 42),
    [azimuthDeg, elevationDeg]
  );

  return (
    <>
      {/* Cahaya pantulan lemah (Earthshine) agar kawah PSR tidak hitam pekat tanpa kontur */}
      <hemisphereLight args={['#94a3b8', '#090d16', 0.08]} />

      {/* Cahaya utama Matahari dengan sudut grazing rendah */}
      <directionalLight
        position={sunPosition}
        intensity={2.8}
        color="#fff7ed"
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-near={5}
        shadow-camera-far={95}
        shadow-camera-left={-14}
        shadow-camera-right={14}
        shadow-camera-top={14}
        shadow-camera-bottom={-14}
        shadow-bias={-0.0004}
        shadow-normalBias={0.025}
      />
    </>
  );
}