import { Component, Suspense, lazy, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { bigBodyRadiusKm, earthPhase, skyObjectLabel, skyPoint } from '../../../utils/skyPlacement';
import { createSunTexture } from './SkySun';
import { SkyLabel } from './SkyLabel';

// Realistic USDZ models load in their own chunk (USD loader ≈ 170 kB), after the scene is up.
const BodyModel = lazy(() => import('./SkyModels'));

/** Shows the procedural body if a model cannot be fetched or parsed (no crash, no blank sky). */
class ModelBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/** Procedural stand-ins, shown while the model loads or if it fails. */
const EarthSphere = ({ radius }) => (
  <mesh name="big-earth-sphere">
    <sphereGeometry args={[radius, 96, 48]} />
    <meshStandardMaterial color="#3b74d9" roughness={0.75} metalness={0} />
  </mesh>
);
const SunSphere = ({ radius }) => (
  <mesh name="big-sun-sphere">
    <sphereGeometry args={[radius, 48, 24]} />
    <meshBasicMaterial color="#fff1c2" toneMapped={false} />
  </mesh>
);

function Body({ kind, radius, Fallback }) {
  const fallback = <Fallback radius={radius} />;
  return (
    <ModelBoundary fallback={fallback}>
      <Suspense fallback={fallback}>
        <BodyModel kind={kind} radius={radius} />
      </Suspense>
    </ModelBoundary>
  );
}

/**
 * BIG Sun and Earth in the local view, seen from the active site: realistic models (procedural
 * spheres until they load) on the TRUE directions (team ephemeris, rotated into the tile grid),
 * beyond the tile (Sun farther than the Earth). The Earth is lit by the scene's Sun light, so its
 * day/night side (phase) is real for the selected time; the continents' orientation is not (Earth's
 * rotation is not in the data). Distances are not to scale; sizes are true or uniformly enlarged.
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
        <group name="big-sun" position={sunPos} userData={{ radiusKm: sunR }}>
          <Body kind="sun" radius={sunR} Fallback={SunSphere} />
          {texture && (
            <sprite scale={[sunR * 7, sunR * 7, 1]}>
              <spriteMaterial map={texture} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
            </sprite>
          )}
          <SkyLabel position={[0, 0, 0]} tone="sun" testId="big-sun-label">
            {skyObjectLabel('sun', sunLocal, visibility?.is_sun_visible)}
          </SkyLabel>
        </group>
      )}

      {earthPos && earthR && (
        <group name="big-earth" position={earthPos} userData={{ radiusKm: earthR }}>
          <Body kind="earth" radius={earthR} Fallback={EarthSphere} />
          {/* Thin halo: keeps the whole disk visible on the night side. */}
          <mesh>
            <sphereGeometry args={[earthR * 1.045, 64, 32]} />
            <meshBasicMaterial color="#7dd3fc" transparent opacity={0.12} side={THREE.BackSide} depthWrite={false} />
          </mesh>
          <SkyLabel
            position={[0, 0, 0]}
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
