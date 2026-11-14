import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Stars } from '@react-three/drei';
import { LunarTerrain } from './LunarTerrain';
import { SunLighting } from './SunLighting';
import { SiteMarkers } from './SiteMarkers';
import { CompassRing } from './CompassRing';
import { describeTerrainStatus } from '../../utils/terrainMath';
import { isValidSkyVector } from '../../utils/shadowMath';
import { OVERVIEW_POS, cameraGoal, shouldReframe, tileScale } from '../../utils/cameraMath';

const BADGE_TONES = {
  synthetic: 'border-amber-400/40 bg-amber-500/15 text-amber-200',
  warning: 'border-yellow-400/40 bg-yellow-500/15 text-yellow-100',
  error: 'border-red-400/50 bg-red-500/20 text-red-100',
  info: 'border-white/15 bg-[#0b101b]/80 text-slate-300',
};

/** Short notes on what the lighting/Earth line in the 3D view does and does not represent. */
function describeSkyNotes(ephemerisPoint) {
  const sun = ephemerisPoint?.sun_vector;
  const notes = [];
  if (!isValidSkyVector(sun)) {
    notes.push('Arah Matahari tidak tersedia — cahaya netral, tanpa bayangan');
  } else {
    notes.push('Bayangan = pratinjau WebGL lokal, bukan horizon mask');
    if (sun.elevation_deg <= 0) notes.push('Matahari di bawah bidang horizontal lokal');
  }
  if (!isValidSkyVector(ephemerisPoint?.earth_vector)) notes.push('Arah Bumi tidak tersedia');
  return notes;
}

/** DOM label stating where the terrain came from (fixture / team asset / fallback / error). */
function TerrainStatusBadge({ status, skyNotes = [] }) {
  const { tone, title, detail } = describeTerrainStatus(status);
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="terrain-status"
      className={`pointer-events-none absolute right-4 bottom-28 max-w-xs rounded-lg border px-3 py-2 font-mono text-[10px] leading-snug backdrop-blur-md ${BADGE_TONES[tone]}`}
    >
      <div className="font-bold tracking-wider">{title}</div>
      {detail && <div className="mt-0.5 opacity-80">{detail}</div>}
      {skyNotes.map((note) => (
        <div key={note} data-testid="sky-note" className="mt-0.5 text-slate-300/90">
          {note}
        </div>
      ))}
    </div>
  );
}

/**
 * Smoothly frames the camera. Re-frames on every explicit command (nonce changes, i.e. a button
 * press — also when the same view is pressed again = reset) and, in 'site' view only, when the
 * selected site or terrain sampler changes. In 'overview', selecting a site does not move the camera.
 * Any user orbit/zoom ('start' event) cancels an ongoing transition.
 */
function CameraController({ controlsRef, activeSite, cameraCommand, sampleHeightAtUV, planeSize, planeDepth }) {
  const isTransitioning = useRef(false);
  const lastNonce = useRef(null);
  const desiredTarget = useRef(new THREE.Vector3(0, 0, 0));
  const desiredPos = useRef(new THREE.Vector3(...OVERVIEW_POS));
  const view = cameraCommand?.view ?? 'overview';
  const nonce = cameraCommand?.nonce ?? 0;

  useEffect(() => {
    const prev = lastNonce.current;
    lastNonce.current = nonce;
    if (!shouldReframe(prev, nonce, view)) return;
    const goal = cameraGoal(view, activeSite, sampleHeightAtUV, planeSize, planeDepth);
    desiredTarget.current.set(...goal.target);
    desiredPos.current.set(...goal.position);
    isTransitioning.current = true;
  }, [nonce, view, activeSite, sampleHeightAtUV, planeSize, planeDepth]);

  useFrame(({ camera }, delta) => {
    const controls = controlsRef.current;
    if (!controls || !isTransitioning.current) return;

    const alpha = Math.min(1, delta * 4.5);
    controls.target.lerp(desiredTarget.current, alpha);
    camera.position.lerp(desiredPos.current, alpha);
    controls.update();

    if (
      camera.position.distanceTo(desiredPos.current) < 0.05 &&
      controls.target.distanceTo(desiredTarget.current) < 0.05
    ) {
      isTransitioning.current = false;
    }
  });

  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return undefined;
    const stopTransition = () => {
      isTransitioning.current = false;
    };
    controls.addEventListener('start', stopTransition);
    return () => controls.removeEventListener('start', stopTransition);
  }, [controlsRef]);

  return null;
}

export function LunarScene({
  telemetry,
  sites,
  activeSite,
  selectedSiteId,
  onSelectSite,
  activeEphemeris,
  activeVisibility,
  cameraCommand,
}) {
  const [sampleHeightAtUV, setSampleHeightAtUV] = useState(null);
  const controlsRef = useRef(null);
  const [terrainStatus, setTerrainStatus] = useState(null);
  const planeSize = telemetry?.terrain_metadata?.area_width_km ?? 20;
  const planeDepth = telemetry?.terrain_metadata?.area_height_km ?? planeSize;

  return (
    <div className="fixed inset-0 h-full w-full bg-[#05070b]">
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ position: [0, 13, 17], fov: 42, near: 0.1, far: 250 }}
      >
        <color attach="background" args={['#05070b']} />
        <Stars radius={90} depth={40} count={2500} factor={3} fade speed={0.4} />

        <SunLighting
          sunVector={activeEphemeris?.sun_vector}
          planeWidth={planeSize}
          planeDepth={planeDepth}
        />

        <LunarTerrain
          metadata={telemetry?.terrain_metadata}
          onSamplerReady={setSampleHeightAtUV}
          onStatusChange={setTerrainStatus}
        />

        <CompassRing radius={planeSize * 0.51} />

        <SiteMarkers
          sites={sites}
          selectedSiteId={selectedSiteId}
          onSelectSite={onSelectSite}
          sampleHeightAtUV={sampleHeightAtUV}
          earthVector={activeEphemeris?.earth_vector}
          isDteActive={activeVisibility?.is_dte_active}
          planeSize={planeSize}
          planeDepth={planeDepth}
        />

        <CameraController
          controlsRef={controlsRef}
          activeSite={activeSite}
          cameraCommand={cameraCommand}
          sampleHeightAtUV={sampleHeightAtUV}
          planeSize={planeSize}
          planeDepth={planeDepth}
        />

        <OrbitControls
          ref={controlsRef}
          makeDefault
          enableDamping
          dampingFactor={0.06}
          minDistance={2.2}
          maxDistance={38 * tileScale(planeSize, planeDepth)}
          maxPolarAngle={Math.PI / 2 - 0.04}
        />
      </Canvas>
      <TerrainStatusBadge status={terrainStatus} skyNotes={describeSkyNotes(activeEphemeris)} />
    </div>
  );
}