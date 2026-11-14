import { useLayoutEffect, useMemo, useRef } from 'react';
import { azElToUnitVector } from '../../utils/shadowMath';

// Max |height| of the fixture terrain is ~3.2 km; margin keeps rims inside the shadow frustum.
const RELIEF_MARGIN_KM = 4;

/**
 * Sun as a directional light for a LOCAL, GEOMETRIC shadow preview. It is not the source of
 * illumination truth (no long-range horizon, no solar-disk penumbra, flat tangent plane).
 * When the Sun vector is missing/invalid no direction is invented: a weak, shadowless,
 * neutral fill is used instead and the scene labels the Sun as unavailable.
 */
export function SunLighting({ sunVector, planeWidth = 20, planeDepth = planeWidth }) {
  const lightRef = useRef(null);
  const direction = useMemo(
    () => azElToUnitVector(sunVector?.azimuth_deg, sunVector?.elevation_deg),
    [sunVector?.azimuth_deg, sunVector?.elevation_deg]
  );

  // Orthographic shadow frustum sized from the tile diagonal (any light direction fits).
  const halfExtent = Math.hypot(planeWidth, planeDepth) / 2 + RELIEF_MARGIN_KM;
  const distance = halfExtent * 3;
  const position = direction
    ? [direction[0] * distance, direction[1] * distance, direction[2] * distance]
    : null;

  // R3F 8 does not call updateProjectionMatrix for pierced `shadow-camera-*` props, and three
  // only does it when the shadow map is first allocated → update explicitly on change.
  useLayoutEffect(() => {
    const cam = lightRef.current?.shadow?.camera;
    if (!cam) return;
    cam.left = -halfExtent;
    cam.right = halfExtent;
    cam.top = halfExtent;
    cam.bottom = -halfExtent;
    cam.near = Math.max(0.1, distance - halfExtent);
    cam.far = distance + halfExtent;
    cam.updateProjectionMatrix();
  }, [halfExtent, distance, direction]);

  return (
    <>
      {/* Cahaya pengisi lemah agar kontur kawah tetap terbaca (bukan model Earthshine fisik) */}
      <hemisphereLight args={['#94a3b8', '#090d16']} intensity={direction ? 0.08 : 0.6} />

      {direction && (
        <directionalLight
          ref={lightRef}
          position={position}
          intensity={2.8}
          color="#fff7ed"
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
          shadow-bias={-0.0004}
          shadow-normalBias={0.025}
        />
      )}
    </>
  );
}
