import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, PerformanceMonitor, Stars } from '@react-three/drei';
import { SceneErrorBoundary, SceneFallbackPanel } from './SceneFallback';
import { detectWebGL2, maxRenderDpr, stepDpr } from '../../utils/renderQuality';
import { LunarTerrain } from './LunarTerrain';
import { SunLighting } from './SunLighting';
import { SiteMarkers } from './SiteMarkers';
import { CompassRing } from './CompassRing';
import { describeTerrainStatus } from '../../utils/terrainMath';
import { isValidSkyVector } from '../../utils/shadowMath';
import { OVERVIEW_POS, cameraGoal, shouldReframe, tileScale } from '../../utils/cameraMath';
import { northOffsetForSite, vectorInGrid } from '../../utils/sceneFrame';

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
  else notes.push('Warna garis Bumi = pratinjau horizon mask, bukan status DTE');
  notes.push('Orientasi benda langit memakai basis proyeksi lokasi jika tersedia; bayangan tetap pratinjau bidang lokal.');
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
      className={`pointer-events-none absolute right-4 bottom-44 max-w-xs rounded-lg lg:bottom-28 border px-3 py-2 font-mono text-[10px] leading-snug backdrop-blur-md ${BADGE_TONES[tone]}`}
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

// `?debug=1` exposes renderer counters for QA/profiling scripts (read-only use intended).
const DEBUG_ENABLED =
  typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('debug');

function DebugProbe() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  useEffect(() => {
    if (!DEBUG_ENABLED) return undefined;
    // Read-only handles for browser QA (independent checks of rendered light/line directions).
    window.__SELENIS_SCENE__ = scene;
    window.__SELENIS_CAMERA__ = camera;
    window.__SELENIS_DEBUG__ = () => ({
      dpr: gl.getPixelRatio(),
      drawingBuffer: `${gl.domElement.width}x${gl.domElement.height}`,
      calls: gl.info.render.calls,
      triangles: gl.info.render.triangles,
      geometries: gl.info.memory.geometries,
      textures: gl.info.memory.textures,
      programs: gl.info.programs?.length ?? null,
      shadowAutoUpdate: gl.shadowMap.autoUpdate,
    });
    window.__SELENIS_GL__ = gl;
    return () => {
      delete window.__SELENIS_DEBUG__;
      delete window.__SELENIS_GL__;
      delete window.__SELENIS_SCENE__;
      delete window.__SELENIS_CAMERA__;
    };
  }, [gl, scene, camera]);
  return null;
}

/** Centered, non-blocking status text (loading / context lost). */
function SceneNotice({ children, tone = 'info' }) {
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
      <div
        role="status"
        data-testid="scene-notice"
        className={`rounded-lg border px-3 py-2 font-mono text-[11px] backdrop-blur-md ${
          tone === 'warning'
            ? 'border-yellow-400/40 bg-yellow-500/15 text-yellow-100'
            : 'border-white/15 bg-[#0b101b]/80 text-slate-300'
        }`}
      >
        {children}
      </div>
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
  const northOffset = telemetry?.terrain_metadata?.heightmap_texture ? northOffsetForSite(activeSite) : 0;
  const [sampleHeightAtUV, setSampleHeightAtUV] = useState(null);
  const controlsRef = useRef(null);
  const [terrainStatus, setTerrainStatus] = useState(null);
  const planeSize = telemetry?.terrain_metadata?.area_width_km ?? 20;
  const planeDepth = telemetry?.terrain_metadata?.area_height_km ?? planeSize;

  // WebGL 2 is required by three r187; probe once, before creating the R3F canvas.
  const [webgl] = useState(() => detectWebGL2());
  // Mount the canvas two frames later so the HUD and the loading notice paint before WebGL
  // initialisation and first-frame shader compilation (no measurable FCP change in our A/B on
  // Iris Xe; kept because it guarantees a visible loading state).
  const [canvasArmed, setCanvasArmed] = useState(false);
  useEffect(() => {
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setCanvasArmed(true));
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, []);

  // Adaptive resolution: start at device DPR (capped at 2), step down/up by 0.5 on measured FPS.
  const [maxDpr] = useState(() => maxRenderDpr(globalThis.window?.devicePixelRatio));
  const [dpr, setDpr] = useState(maxDpr);

  // WebGL context loss: three keeps the scene and re-uploads on restore; we only inform the user.
  const [contextLost, setContextLost] = useState(false);
  const [sceneFailed, setSceneFailed] = useState(false);
  const contextCleanup = useRef(null);
  useEffect(() => () => contextCleanup.current?.(), []);
  const handleCreated = ({ gl }) => {
    contextCleanup.current?.();
    const canvas = gl.domElement;
    const onLost = () => setContextLost(true);
    const onRestored = () => {
      gl.shadowMap.needsUpdate = true; // shadow map texture is lost with the context
      setContextLost(false);
    };
    canvas.addEventListener('webglcontextlost', onLost);
    canvas.addEventListener('webglcontextrestored', onRestored);
    contextCleanup.current = () => {
      canvas.removeEventListener('webglcontextlost', onLost);
      canvas.removeEventListener('webglcontextrestored', onRestored);
    };
  };

  if (!webgl.supported) {
    return (
      <div className="fixed inset-0 h-full w-full bg-[#05070b]">
        <SceneFallbackPanel title="WEBGL 2 TIDAK TERSEDIA" detail={webgl.reason} />
      </div>
    );
  }

  const isLoading = !canvasArmed || !terrainStatus || terrainStatus.state === 'loading';
  // After a render failure only the fallback panel may speak: no loading notice, no terrain badge.

  return (
    <div className="fixed inset-0 h-full w-full bg-[#05070b]">
      <SceneErrorBoundary onError={() => setSceneFailed(true)} onReset={() => setSceneFailed(false)}>
        {canvasArmed && (
          <Canvas
            shadows
            dpr={dpr}
            camera={{ position: OVERVIEW_POS, fov: 42, near: 0.1, far: 250 }}
            onCreated={handleCreated}
          >
            <PerformanceMonitor
              flipflops={3}
              onDecline={() => setDpr((d) => stepDpr(d, -1, maxDpr))}
              onIncline={() => setDpr((d) => stepDpr(d, +1, maxDpr))}
              onFallback={() => setDpr(1)}
            />
            <DebugProbe />
            <color attach="background" args={['#05070b']} />
            <Stars radius={90} depth={40} count={2500} factor={3} fade speed={0.4} />

            <SunLighting
              sunVector={vectorInGrid(activeEphemeris?.sun_vector, northOffset)}
              planeWidth={planeSize}
              planeDepth={planeDepth}
              shadowKey={terrainStatus}
            />

            <LunarTerrain
              metadata={telemetry?.terrain_metadata}
              onSamplerReady={setSampleHeightAtUV}
              onStatusChange={setTerrainStatus}
            />

            {northOffset !== null && <group rotation={[0, -northOffset * Math.PI / 180, 0]}><CompassRing radius={Math.max(planeSize, planeDepth) * 0.51} /></group>}

            <SiteMarkers
              sites={sites}
              selectedSiteId={selectedSiteId}
              onSelectSite={onSelectSite}
              sampleHeightAtUV={sampleHeightAtUV}
              earthVector={vectorInGrid(activeEphemeris?.earth_vector, northOffset)}
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
        )}
      </SceneErrorBoundary>
      {isLoading && !contextLost && !sceneFailed && <SceneNotice>Menyiapkan tampilan 3D…</SceneNotice>}
      {contextLost && (
        <SceneNotice tone="warning">Konteks WebGL hilang — menunggu pemulihan dari browser…</SceneNotice>
      )}
      {!sceneFailed && (
        <TerrainStatusBadge status={terrainStatus} skyNotes={describeSkyNotes(activeEphemeris)} />
      )}
    </div>
  );
}
