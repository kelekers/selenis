import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import { celestialToCartesian } from '../../utils/shadowMath';

// Max |height| of the fixture terrain is ~3.2 km; margin keeps rims inside the shadow frustum.
const RELIEF_MARGIN_KM = 4;

/**
 * Sun as a directional light for a LOCAL, GEOMETRIC shadow preview. It is not the source of
 * illumination truth (no long-range horizon, no solar-disk penumbra, flat tangent plane).
 * When the Sun vector is missing/invalid no direction is invented: a weak, shadowless,
 * neutral fill is used instead and the scene labels the Sun as unavailable.
 */
export function SunLighting({ sunVector, planeWidth = 20, planeDepth = planeWidth, shadowKey, basis }) {
  const lightRef = useRef(null);
  // Imperative renderer access via the store getter (renderer flags are not React state).
  const getState = useThree((s) => s.get);
  const direction = useMemo(
    () => celestialToCartesian(sunVector?.azimuth_deg, sunVector?.elevation_deg, 1, basis),
    [sunVector?.azimuth_deg, sunVector?.elevation_deg, basis]
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

  // The shadow map only depends on the light and the terrain (markers do not cast shadows), not
  // on the camera, so re-render it on change instead of every frame. Measured: per-frame
  // triangles 263,910 → 132,838 at 1440×900 (Iris Xe, Chrome; p95 frame 33 → 17 ms at DPR 2).
  useEffect(() => {
    const { shadowMap } = getState().gl;
    const prev = shadowMap.autoUpdate;
    shadowMap.autoUpdate = false;
    return () => {
      shadowMap.autoUpdate = prev;
    };
  }, [getState]);
  useEffect(() => {
    getState().gl.shadowMap.needsUpdate = true;
  }, [getState, direction, halfExtent, distance, shadowKey]);

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
