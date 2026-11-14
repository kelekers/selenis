import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { bigBodyRadiusKm, earthPhase, skyObjectLabel, skyPoint } from '../../../utils/skyPlacement';
import { createSunTexture } from './SkySun';
import { SkyLabel } from './SkyLabel';

/**
 * BIG Sun and Earth in the local view, seen from the active site: large spheres on the TRUE
 * directions (team ephemeris, rotated into the tile grid), placed beyond the tile (Sun farther
 * than the Earth). The Earth is lit by the scene's Sun light, so its day/night sides (phase) are
 * real for the selected time. Distances are not to scale; sizes are true or uniformly enlarged.
 * Status text uses the same tri-state flags as the 360° panorama.
 */
export function SkyBodies({ center, sunGrid, earthGrid, sunLocal, earthLocal, visibility, distances, sizeMode = 'enlarged' }) {
  const texture = useMemo(() => createSunTexture(), []);
  useEffect(() => () => texture?.dispose(), [texture]);
  if (!center || !distances) return null;

  const sunPos = skyPoint(sunGrid, center, distances.sun);
  const earthPos = skyPoint(earthGrid, center, distances.earth);
  const sunR = bigBodyRadiusKm('sun', distances.sun, sizeMode);
  const earthR = bigBodyRadiusKm('earth', distances.earth, sizeMode);
  const phase = earthPhase(sunLocal, earthLocal);

  return (
    <group name="sky-bodies">
      {sunPos && sunR && (
        <group name="big-sun-group">
          <mesh name="big-sun" position={sunPos}>
            <sphereGeometry args={[sunR, 48, 24]} />
            <meshBasicMaterial color="#fff1c2" toneMapped={false} />
          </mesh>
          {texture && (
            <sprite position={sunPos} scale={[sunR * 7, sunR * 7, 1]}>
              <spriteMaterial map={texture} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
            </sprite>
          )}
          <SkyLabel position={sunPos} tone="sun" testId="big-sun-label">
            {skyObjectLabel('sun', sunLocal, visibility?.is_sun_visible)}
          </SkyLabel>
        </group>
      )}

      {earthPos && earthR && (
        <group name="big-earth-group">
          <mesh name="big-earth" position={earthPos}>
            <sphereGeometry args={[earthR, 96, 48]} />
            <meshStandardMaterial color="#3b74d9" roughness={0.75} metalness={0} />
          </mesh>
          {/* Thin halo: keeps the whole disk visible on the night side. */}
          <mesh position={earthPos}>
            <sphereGeometry args={[earthR * 1.045, 64, 32]} />
            <meshBasicMaterial color="#7dd3fc" transparent opacity={0.16} side={THREE.BackSide} depthWrite={false} />
          </mesh>
          <SkyLabel
            position={earthPos}
            tone="earth"
            testId="big-earth-label"
            detail={phase ? `${Math.round(phase.illuminatedFraction * 100)}% terang` : undefined}
          >
            {skyObjectLabel('earth', earthLocal, visibility?.is_dte_active)}
          </SkyLabel>
        </group>
      )}
    </group>
  );
}
