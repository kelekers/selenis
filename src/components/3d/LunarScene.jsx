import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Stars } from '@react-three/drei';
import { LunarTerrain } from './LunarTerrain';
import { SunLighting } from './SunLighting';
import { SiteMarkers } from './SiteMarkers';
import { CompassRing } from './CompassRing';
import { describeTerrainStatus, uvToWorldXZ } from '../../utils/terrainMath';
import { isValidSkyVector } from '../../utils/shadowMath';

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

function CameraController({ controlsRef, activeSite, cameraView, sampleHeightAtUV, planeSize, planeDepth }) {
  const isTransitioning = useRef(false);
  const desiredTarget = useRef(new THREE.Vector3(0, 0, 0));
  const desiredPos = useRef(new THREE.Vector3(0, 13, 17));

  useEffect(() => {
    const uv = activeSite?.coordinates?.uv;
    const siteXZ = uvToWorldXZ(uv, planeSize, planeDepth);

    // Invalid/missing site UV → stay on the overview instead of guessing the tile centre.
    if (cameraView === 'site' && siteXZ) {
      const [sx, sz] = siteXZ;
      const sy = sampleHeightAtUV?.(uv.u, uv.v) ?? 0;
      desiredTarget.current.set(sx, sy + 0.2, sz);
      desiredPos.current.set(sx + 3.2, sy + 3.6, sz + 4.8);
    } else {
      desiredTarget.current.set(0, 0, 0);
      desiredPos.current.set(0, 13, 17);
    }
    isTransitioning.current = true;
  }, [activeSite, cameraView, sampleHeightAtUV, planeSize, planeDepth]);

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
  cameraView,
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
          cameraView={cameraView}
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
          maxDistance={38}
          maxPolarAngle={Math.PI / 2 - 0.04}
        />
      </Canvas>
      <TerrainStatusBadge status={terrainStatus} skyNotes={describeSkyNotes(activeEphemeris)} />
    </div>
  );
}