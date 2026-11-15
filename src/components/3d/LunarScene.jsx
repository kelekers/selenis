import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, PerformanceMonitor, Stars } from '@react-three/drei';
import { SceneErrorBoundary, SceneFallbackPanel } from './SceneFallback';
import { detectWebGL2, maxRenderDpr, stepDpr } from '../../utils/renderQuality';
import { LunarTerrain } from './LunarTerrain';
import { SurroundingTerrain, HorizonBlockers } from './SurroundingTerrain';
import { SunLighting } from './SunLighting';
import { SiteMarkers } from './SiteMarkers';
import { CompassRing } from './CompassRing';
import { describeTerrainStatus } from '../../utils/terrainMath';
import { azElToUnitVector, isValidSkyVector } from '../../utils/shadowMath';
import { OVERVIEW_POS, cameraGoal, shouldReframe, tileScale } from '../../utils/cameraMath';
import { northOffsetForSite, vectorInGrid } from '../../utils/sceneFrame';
import { MARKER_DIMENSIONS_KM, markerScale } from '../../utils/markerLayout';
import {
  BIG_BODY_ENLARGEMENT,
  bigBodyDistanceKm,
  lookTowardPose,
  skyDomeCenter,
  skyDomeRadiusKm,
  skyPoint,
} from '../../utils/skyPlacement';
import { SkyLayer } from './sky/SkyLayer';
import { SkyBodies } from './sky/SkyBodies';
import { SkyCompass, SkyCompassTracker } from './sky/SkyCompass';
import { DEFAULT_SKY_LAYERS, SkyControls } from './sky/SkyControls';
import { earthAxesScene, earthModelBasis } from '../../utils/earthOrientation';

const BADGE_TONES = {
  synthetic: 'border-amber-400/40 bg-amber-500/15 text-amber-200',
  warning: 'border-yellow-400/40 bg-yellow-500/15 text-yellow-100',
  error: 'border-red-400/50 bg-red-500/20 text-red-100',
  info: 'border-white/15 bg-[#0b101b]/80 text-slate-300',
};

/**
 * What the sky display does and does not represent, for the vectors actually drawn (grid-rotated;
 * null = not drawn). `main` is one short line shown at all times; `more` folds under "Catatan".
 */
function describeSkyNotes(sun, earth, visibility, skyMode = 'big', sizeMode = 'enlarged', earthRotationFromData = false) {
  const hasSun = isValidSkyVector(sun);
  const hasEarth = isValidSkyVector(earth);
  const main = [];
  if (!hasSun) main.push('Arah Matahari tidak tersedia.');
  if (!hasEarth) main.push('Arah Bumi tidak tersedia.');
  if (hasSun || hasEarth) {
    main.push(
      skyMode === 'big' && sizeMode === 'true'
        ? 'Arah dan ukuran sudut nyata, jarak tidak berskala.'
        : 'Arah dari data, ukuran dan jarak tidak berskala.'
    );
  }
  const source = visibility?.basis === 'pipeline-local-dem' ? 'data tim' : 'pratinjau browser';
  const more = [
    // Measured on Site01: the mask horizon is set by relief ~200–300 m away, finer than the
    // 62.5 m / 9.7 m mesh, so ground shading at the site can disagree with the Sun status.
    hasSun && 'Terang-gelap medan hanya pratinjau; status Matahari ada di panorama.',
    hasEarth && `Warna garis Bumi mengikuti ${source}, sama dengan panorama.`,
    hasEarth && 'Garis Bumi menunjukkan garis pandang, bukan kualitas sinyal.',
    skyMode === 'big' &&
      sizeMode !== 'true' &&
      `Ukuran Matahari dan Bumi diperbesar ${BIG_BODY_ENLARGEMENT.toLocaleString('id-ID')}×.`,
    skyMode === 'big' &&
      (earthRotationFromData
        ? 'Model Bumi dan Matahari: NASA. Rotasi dan kemiringan Bumi dari data Horizons.'
        : 'Model Bumi dan Matahari: NASA. Posisi benua ilustratif, rotasi Bumi belum ada di data.'),
  ].filter(Boolean);
  return { main, more };
}

/** DOM label stating where the terrain came from (fixture / team asset / fallback / error). */
function TerrainStatusBadge({ status, skyNotes = { main: [], more: [] } }) {
  const { tone, title, detail } = describeTerrainStatus(status);
  // The team DEM loaded normally: no terrain text (user request). Loading, fixture, fallback,
  // error and visual-only heightmaps keep their warning title.
  const quiet = status?.state === 'ready' && status?.source === 'asset' && status?.mode === 'metric-8bit';
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="terrain-status"
      className={`pointer-events-none max-w-[17rem] space-y-1 rounded-lg border px-3 py-2 text-[11px] leading-snug backdrop-blur-md ${
        BADGE_TONES[quiet ? 'info' : tone]
      }`}
    >
      {!quiet && (
        <div>
          <div className="font-semibold">{title}</div>
          {detail && <div className="opacity-80">{detail}</div>}
        </div>
      )}
      {skyNotes.main.map((note) => (
        <div key={note} data-testid="sky-note" className="text-slate-300">
          {note}
        </div>
      ))}
      {skyNotes.more.length > 0 && (
        <details className="pointer-events-auto text-slate-400">
          <summary className="cursor-pointer select-none hover:text-slate-200">Catatan</summary>
          <ul className="mt-1 space-y-0.5">
            {skyNotes.more.map((note) => (
              <li key={note} data-testid="sky-note-more">
                {note}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

// `?debug=1` exposes renderer counters for QA/profiling scripts (read-only use intended).
const DEBUG_ENABLED =
  typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('debug');

export function DebugProbe() {
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
function CameraController({ controlsRef, activeSite, cameraCommand, lookCommand, sampleHeightAtUV, planeSize, planeDepth, contextSize }) {
  const isTransitioning = useRef(false);
  const lastNonce = useRef(null);
  const lastSpan = useRef(null);
  const desiredTarget = useRef(new THREE.Vector3(0, 0, 0));
  const desiredPos = useRef(new THREE.Vector3(...OVERVIEW_POS));
  const view = cameraCommand?.view ?? 'overview';
  const nonce = cameraCommand?.nonce ?? 0;

  useEffect(() => {
    const prev = lastNonce.current;
    lastNonce.current = nonce;
    const span = view === 'context' ? contextSize : planeSize;
    const resized = lastSpan.current !== span;
    lastSpan.current = span;
    if (!shouldReframe(prev, nonce, view) && !resized) return;
    const goal = cameraGoal(view, activeSite, sampleHeightAtUV, span, view === 'context' ? contextSize : planeDepth);
    desiredTarget.current.set(...goal.target);
    desiredPos.current.set(...goal.position);
    isTransitioning.current = true;
  }, [nonce, view, activeSite, sampleHeightAtUV, planeSize, planeDepth, contextSize]);

  // "Lihat Bumi / Lihat Matahari" from the sky panel: pose computed at click time.
  const lastLook = useRef(lookCommand?.nonce ?? 0);
  useEffect(() => {
    if (!lookCommand?.pose || lookCommand.nonce === lastLook.current) return;
    lastLook.current = lookCommand.nonce;
    desiredTarget.current.set(...lookCommand.pose.target);
    desiredPos.current.set(...lookCommand.pose.position);
    isTransitioning.current = true;
  }, [lookCommand]);

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
  // Active site's full timeline (local azimuths) + current index, for the sky tracks.
  ephemerisTimeline,
  timeIndex,
  cameraCommand,
}) {
  const northOffset = telemetry?.terrain_metadata?.heightmap_texture ? northOffsetForSite(activeSite) : 0;
  // Sky directions in tile-grid azimuth (local north rotated by the site basis); null = not drawn.
  const sunInGrid = vectorInGrid(activeEphemeris?.sun_vector, northOffset);
  const earthInGrid = vectorInGrid(activeEphemeris?.earth_vector, northOffset);
  const [sampleHeightAtUV, setSampleHeightAtUV] = useState(null);
  const controlsRef = useRef(null);
  const [terrainStatus, setTerrainStatus] = useState(null);
  const [contextStatus, setContextStatus] = useState(null);
  const [showBlockers, setShowBlockers] = useState(false);
  const [terrainLayer, setTerrainLayer] = useState('relief');
  const [colorStatus, setColorStatus] = useState(null);
  const roughness = telemetry?.terrain_metadata?.roughness_analysis;
  const colorTextureUrl = terrainLayer === 'roughness' ? roughness?.visual_texture : null;
  const planeSize = telemetry?.terrain_metadata?.area_width_km ?? 20;
  const planeDepth = telemetry?.terrain_metadata?.area_height_km ?? planeSize;
  const hasContext = Boolean(telemetry?.terrain_metadata?.context_dataset_url);
  const contextSize = contextStatus?.state === 'ready' ? 40 : planeSize;
  // Sky dome around the active site, centred on the marker head so icons sit at the end of the
  // marker's direction lines (same direction, parallel origin).
  const skyRadius = skyDomeRadiusKm(planeSize, planeDepth);
  const headLift = MARKER_DIMENSIONS_KM.headHeight * markerScale(sites, planeSize, planeDepth);
  const skyCenter = skyDomeCenter(activeSite, sampleHeightAtUV, planeSize, planeDepth, headLift);
  const skyAvailable = Boolean(skyCenter && skyRadius && Number.isFinite(northOffset));
  // DOM nodes of the sky compass, written per frame by the in-canvas tracker.
  const compassApiRef = useRef(null);

  // Sky display (3D panel, per viewer, not persisted): 'big' = large Sun/Earth bodies beyond the
  // tile (default), 'small' = small icons on the dome + tracks + horizon ring.
  const [skyMode, setSkyMode] = useState('big');
  const [sizeMode, setSizeMode] = useState('enlarged');
  const [layers, setLayers] = useState(DEFAULT_SKY_LAYERS);
  const toggleLayer = (key) => setLayers((prev) => ({ ...prev, [key]: !prev[key] }));
  const [panelOpen, setPanelOpen] = useState(false);
  const bigDistances = {
    earth: bigBodyDistanceKm('earth', planeSize, planeDepth),
    sun: bigBodyDistanceKm('sun', planeSize, planeDepth),
  };
  const objectDistance = (body) => (skyMode === 'big' ? bigDistances[body] : skyRadius);
  // Earth orientation (rotation + axis tilt) from Horizons fields, when the data provides them.
  const earthBasis = earthModelBasis(
    earthAxesScene(activeEphemeris?.earth_vector, activeSite?.coordinates?.latitude_deg, northOffset)
  );
  const [lookCommand, setLookCommand] = useState({ nonce: 0, pose: null });
  const requestLook = (body) => {
    const v = body === 'sun' ? sunInGrid : earthInGrid;
    const pose = v && lookTowardPose(skyCenter, azElToUnitVector(v.azimuth_deg, v.elevation_deg));
    if (pose) setLookCommand((prev) => ({ nonce: prev.nonce + 1, pose }));
  };

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
        {/* shadows="percentage" = PCFShadowMap. three r187 removed PCFSoftShadowMap (R3F 8's default
            for `shadows`) and already fell back to PCF with a console warning: image unchanged. */}
        {canvasArmed && (
          <Canvas
            shadows="percentage"
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

            <LunarTerrain
              colorTextureUrl={colorTextureUrl}
              onColorStatus={setColorStatus}
              metadata={telemetry?.terrain_metadata}
              onSamplerReady={setSampleHeightAtUV}
              onStatusChange={setTerrainStatus}
            />
            {hasContext && <SurroundingTerrain primary={telemetry.terrain_metadata}
              sampler={sampleHeightAtUV} onStatus={setContextStatus} />}
            {showBlockers && activeSite && <HorizonBlockers site={activeSite}
              metadata={telemetry.terrain_metadata} sampler={sampleHeightAtUV} />}

            <group name="local-view">
              <Stars radius={90} depth={40} count={2500} factor={3} fade speed={0.4} />

              <SunLighting
                sunVector={sunInGrid}
                planeWidth={contextSize}
                planeDepth={Math.max(planeDepth, contextSize)}
                shadowKey={contextStatus?.state === 'ready' ? contextStatus : terrainStatus}
              />

              {northOffset !== null && <group rotation={[0, -northOffset * Math.PI / 180, 0]}><CompassRing radius={Math.max(planeSize, planeDepth) * 0.51} /></group>}

              <SiteMarkers
                sites={sites}
                selectedSiteId={selectedSiteId}
                onSelectSite={onSelectSite}
                sampleHeightAtUV={sampleHeightAtUV}
                sunVector={sunInGrid}
                isSunVisible={activeVisibility?.is_sun_visible}
                earthVector={earthInGrid}
                isDteActive={activeVisibility?.is_dte_active}
                planeSize={planeSize}
                planeDepth={planeDepth}
                sunLineLengthKm={objectDistance('sun') ?? undefined}
                earthLineLengthKm={objectDistance('earth') ?? undefined}
                showSunLine={skyMode === 'small' && layers.lines}
                showEarthLine={skyMode === 'big' ? layers.earthLine : layers.lines}
              />

              {skyMode === 'small' ? (
                <SkyLayer
                  center={skyCenter}
                  radiusKm={skyRadius}
                  northOffset={northOffset}
                  ephemerisPoint={activeEphemeris}
                  visibility={activeVisibility}
                  horizonMask={activeSite?.horizon_mask_360}
                  timeline={ephemerisTimeline}
                  timeIndex={timeIndex}
                  layers={layers}
                />
              ) : (
                skyAvailable && (
                  <SkyBodies
                    center={skyCenter}
                    sunGrid={sunInGrid}
                    earthGrid={earthInGrid}
                    sunLocal={activeEphemeris?.sun_vector}
                    earthLocal={activeEphemeris?.earth_vector}
                    visibility={activeVisibility}
                    distances={bigDistances}
                    sizeMode={sizeMode}
                    earthBasis={earthBasis}
                  />
                )
              )}

              {skyAvailable && (
                <SkyCompassTracker
                  apiRef={compassApiRef}
                  northOffset={northOffset}
                  sunPoint={skyPoint(sunInGrid, skyCenter, objectDistance('sun'))}
                  earthPoint={skyPoint(earthInGrid, skyCenter, objectDistance('earth'))}
                  sunLocal={activeEphemeris?.sun_vector}
                  earthLocal={activeEphemeris?.earth_vector}
                />
              )}

              <CameraController
                controlsRef={controlsRef}
                activeSite={activeSite}
                cameraCommand={cameraCommand}
                lookCommand={lookCommand}
                sampleHeightAtUV={sampleHeightAtUV}
                planeSize={planeSize}
                planeDepth={planeDepth}
                contextSize={contextSize}
              />

              <OrbitControls
                ref={controlsRef}
                makeDefault
                enableDamping
                dampingFactor={0.06}
                minDistance={2.2}
                maxDistance={38 * tileScale(contextSize, planeDepth)}
                maxPolarAngle={Math.PI / 2 - 0.04}
              />
            </group>
          </Canvas>
        )}
      </SceneErrorBoundary>
      {isLoading && !contextLost && !sceneFailed && <SceneNotice>Menyiapkan tampilan 3D…</SceneNotice>}
      {contextLost && (
        <SceneNotice tone="warning">Konteks WebGL hilang — menunggu pemulihan dari browser…</SceneNotice>
      )}
      {!sceneFailed && canvasArmed && (
        // Sky panel: bottom-left above the timeline on desktop; on phones/tablets below the header,
        // using the same top offsets as the HUD panels (App.jsx: top-60 / sm:top-44).
        // z-[7]: above the 3D labels (z ≤ 5) and the badge stack (z-6) — an opened panel wins on
        // small screens — but below the HUD (z-10+).
        <div className="pointer-events-none absolute top-60 left-4 z-[7] sm:top-44 lg:top-auto lg:bottom-28">
          <SkyControls
            skyMode={skyMode}
            onSkyMode={setSkyMode}
            sizeMode={sizeMode}
            onSizeMode={setSizeMode}
            layers={layers}
            onToggleLayer={toggleLayer}
            onLook={requestLook}
            expanded={panelOpen}
            onToggleExpanded={() => setPanelOpen((open) => !open)}
          />
        </div>
      )}
      {!sceneFailed && (
        // Bottom-right stack (above the mobile/desktop timeline): sky compass, then the badge.
        <div
          data-testid="scene-overlay-stack"
          className="pointer-events-none absolute right-4 bottom-44 z-[6] flex flex-col items-end gap-2 lg:bottom-28"
        >
          {layers.compass && skyAvailable && canvasArmed && (
            <SkyCompass
              apiRef={compassApiRef}
              sunLocal={activeEphemeris?.sun_vector}
              earthLocal={activeEphemeris?.earth_vector}
              isSunVisible={activeVisibility?.is_sun_visible}
              isDteActive={activeVisibility?.is_dte_active}
            />
          )}
          <TerrainStatusBadge
            status={terrainStatus}
            skyNotes={describeSkyNotes(sunInGrid, earthInGrid, activeVisibility, skyMode, sizeMode, Boolean(earthBasis))}
          />
          {roughness && <section className="pointer-events-auto max-w-[17rem] rounded-lg border border-white/15 bg-[#0b101b]/90 p-2 text-[11px] text-slate-300">
            {hasContext && <p data-testid="context-status" className="mb-1">
              {contextStatus?.state === 'ready' ? 'Visual 40 × 40 km · sumber 5 m, mesh 62,5 m.'
                : contextStatus?.state === 'error' ? 'Konteks luas gagal dimuat; medan asli tetap tersedia.' : 'Memuat konteks 40 × 40 km…'}
              {' '}Analisis dan roughness: {planeSize} × {planeDepth} km.
            </p>}
            <button type="button" data-testid="roughness-toggle" aria-pressed={terrainLayer === 'roughness'}
              onClick={() => setTerrainLayer((layer) => layer === 'relief' ? 'roughness' : 'relief')}
              className="min-h-11 rounded border border-white/20 px-3 hover:bg-white/10">
              {terrainLayer === 'relief' ? 'Lihat roughness RMS' : 'Kembali ke relief'}
            </button>
            <button type="button" data-testid="blockers-toggle" aria-pressed={showBlockers}
              onClick={() => setShowBlockers((shown) => !shown)}
              className="ml-1 min-h-11 rounded border border-white/20 px-2 hover:bg-white/10">Penentu horizon</button>
            {showBlockers && <p className="mt-1">Titik kuning: maksimum tiap arah sampel horizon, diangkat 25 m agar terbaca. Penghalang di luar DEM analisis belum dinilai.</p>}
            {terrainLayer === 'roughness' && <p className="mt-1">RMS bidang lokal · blok 100 × 100 m.<br />Biru 0 m → hijau → merah ≥5 m; bukan safety.</p>}
            {colorTextureUrl && colorStatus?.url === colorTextureUrl && colorStatus.state === 'error' && <p role="status">Overlay gagal dimuat; relief tetap tersedia.</p>}
          </section>}
        </div>
      )}
    </div>
  );
}
