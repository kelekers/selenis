import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, PerformanceMonitor } from '@react-three/drei';
import { SceneErrorBoundary, SceneFallbackPanel } from './SceneFallback';
import { detectWebGL2, maxRenderDpr, stepDpr } from '../../utils/renderQuality';
import { LunarTerrain } from './LunarTerrain';
import { SurroundingTerrain, HorizonBlockers } from './SurroundingTerrain';
import { SunLighting } from './SunLighting';
import { SiteMarkers } from './SiteMarkers';
import { CompassRing } from './CompassRing';
import { SpaceBackground } from './SpaceBackground';
import { azElToUnitVector } from '../../utils/shadowMath';
import { OVERVIEW_POS, cameraGoal, shouldReframe, tileScale } from '../../utils/cameraMath';
import { northOffsetForSite, vectorInGrid } from '../../utils/sceneFrame';
import { MARKER_DIMENSIONS_KM, markerScale } from '../../utils/markerLayout';
import { formatLatitude, formatLongitude, formatMeters, isClickNotDrag } from '../../utils/hudModel';
import {
  buildCombinedTerrainSampler,
  getPlacementUvBounds,
  sampleElevationMetersAtUV,
  uvToLatLon,
} from '../../utils/siteCalculations';
import {
  bigBodyDistanceKm,
  lookTowardPose,
  skyDomeCenter,
  skyDomeRadiusKm,
  skyPoint,
} from '../../utils/skyPlacement';
import { SkyLayer } from './sky/SkyLayer';
import { SkyBodies } from './sky/SkyBodies';
import { SkyCompassTracker } from './sky/SkyCompass';
import { DEFAULT_SKY_LAYERS, SkyControls } from './sky/SkyControls';
import { earthAxesScene, earthModelBasis } from '../../utils/earthOrientation';

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
  onTerrainSampler,
  placementMode = null,
  onCancelPlacement,
  onPickTerrainCoordinate,
  externalLookRequest = null,
  externalSkyConfig = null,
  onExternalSkyConfigChange,
  externalTerrainConfig = null,
  onExternalTerrainConfigChange,
  externalCompassApiRef = null,
}) {
  const northOffset = telemetry?.terrain_metadata?.heightmap_texture ? northOffsetForSite(activeSite) : 0;
  // Sky directions in tile-grid azimuth (local north rotated by the site basis); null = not drawn.
  const sunInGrid = vectorInGrid(activeEphemeris?.sun_vector, northOffset);
  const earthInGrid = vectorInGrid(activeEphemeris?.earth_vector, northOffset);
  const [primarySampler, setPrimarySampler] = useState(null);
  const [contextSampler, setContextSampler] = useState(null);
  const [hoverPlacement, setHoverPlacement] = useState(null);
  const activeHoverPlacement = placementMode ? hoverPlacement : null;
  const controlsRef = useRef(null);
  const [terrainStatus, setTerrainStatus] = useState(null);
  const [contextStatus, setContextStatus] = useState(null);
  const [internalShowBlockers, setInternalShowBlockers] = useState(false);
  const [internalTerrainLayer, setInternalTerrainLayer] = useState('relief');
  const showBlockers = externalTerrainConfig?.showBlockers ?? internalShowBlockers;
  const terrainLayer = externalTerrainConfig?.terrainLayer ?? internalTerrainLayer;
  const setShowBlockers = (updater) => {
    const next = typeof updater === 'function' ? updater(showBlockers) : updater;
    setInternalShowBlockers(next);
    onExternalTerrainConfigChange?.((prev) => ({ ...prev, showBlockers: next }));
  };
  const setTerrainLayer = (updater) => {
    const next = typeof updater === 'function' ? updater(terrainLayer) : updater;
    setInternalTerrainLayer(next);
    onExternalTerrainConfigChange?.((prev) => ({ ...prev, terrainLayer: next }));
  };
  const [colorStatus, setColorStatus] = useState(null);
  const roughness = telemetry?.terrain_metadata?.roughness_analysis;
  const colorTextureUrl = terrainLayer === 'roughness' ? roughness?.visual_texture : null;
  const planeSize = telemetry?.terrain_metadata?.area_width_km ?? 20;
  const planeDepth = telemetry?.terrain_metadata?.area_height_km ?? planeSize;
  const hasContext = Boolean(telemetry?.terrain_metadata?.context_dataset_url);
  const contextSize = contextStatus?.state === 'ready' ? 40 : planeSize;

  const sampleHeightAtUV = useMemo(
    () => buildCombinedTerrainSampler(primarySampler, contextSampler, planeSize, planeDepth),
    [primarySampler, contextSampler, planeSize, planeDepth]
  );

  useEffect(() => {
    onTerrainSampler?.(sampleHeightAtUV);
  }, [sampleHeightAtUV, onTerrainSampler]);

  const placementUvBounds = useMemo(
    () => getPlacementUvBounds(telemetry?.terrain_metadata),
    [telemetry?.terrain_metadata]
  );

  const handleTerrainPointerMove = placementMode
    ? (e) => {
        e.stopPropagation();
        const u = Math.max(
          placementUvBounds.minU,
          Math.min(placementUvBounds.maxU, e.point.x / planeSize + 0.5)
        );
        const v = Math.max(
          placementUvBounds.minV,
          Math.min(placementUvBounds.maxV, e.point.z / planeDepth + 0.5)
        );
        const ll = uvToLatLon({ u, v }, telemetry?.terrain_metadata, sites);
        const elevM = sampleElevationMetersAtUV(
          { u, v },
          sampleHeightAtUV,
          telemetry?.terrain_metadata,
          sites
        );
        setHoverPlacement({
          x: e.point.x,
          y: e.point.y,
          z: e.point.z,
          uv: { u, v, extended: true },
          latLon: ll,
          elevationM: elevM,
        });
      }
    : undefined;

  const handleTerrainPointerOut = placementMode ? () => setHoverPlacement(null) : undefined;

  const handleTerrainClick = placementMode
    ? (e) => {
        e.stopPropagation();
        if (!isClickNotDrag(e.delta)) return;
        const u = Math.max(
          placementUvBounds.minU,
          Math.min(placementUvBounds.maxU, e.point.x / planeSize + 0.5)
        );
        const v = Math.max(
          placementUvBounds.minV,
          Math.min(placementUvBounds.maxV, e.point.z / planeDepth + 0.5)
        );
        onPickTerrainCoordinate?.({ uv: { u, v, extended: true } });
      }
    : undefined;
  // Sky dome around the active site, centred on the marker head so icons sit at the end of the
  // marker's direction lines (same direction, parallel origin).
  const skyRadius = skyDomeRadiusKm(planeSize, planeDepth);
  const headLift = MARKER_DIMENSIONS_KM.headHeight * markerScale(sites, planeSize, planeDepth);
  const skyCenter = skyDomeCenter(activeSite, sampleHeightAtUV, planeSize, planeDepth, headLift);
  const skyAvailable = Boolean(skyCenter && skyRadius && Number.isFinite(northOffset));
  // DOM nodes of the sky compass, written per frame by the in-canvas tracker.
  const internalCompassApiRef = useRef(null);
  const compassApiRef = externalCompassApiRef ?? internalCompassApiRef;

  // Sky display (3D panel, per viewer, not persisted): 'big' = large Sun/Earth bodies beyond the
  // tile (default), 'small' = small icons on the dome + tracks + horizon ring.
  const [internalSkyMode, setInternalSkyMode] = useState('big');
  const [internalSizeMode, setInternalSizeMode] = useState('enlarged');
  const [internalLayers, setInternalLayers] = useState(DEFAULT_SKY_LAYERS);
  const skyMode = externalSkyConfig?.skyMode ?? internalSkyMode;
  const sizeMode = externalSkyConfig?.sizeMode ?? internalSizeMode;
  const layers = externalSkyConfig?.layers ?? internalLayers;
  const setSkyMode = (next) => {
    setInternalSkyMode(next);
    onExternalSkyConfigChange?.((prev) => ({ ...prev, skyMode: next }));
  };
  const setSizeMode = (next) => {
    setInternalSizeMode(next);
    onExternalSkyConfigChange?.((prev) => ({ ...prev, sizeMode: next }));
  };
  const toggleLayer = (key) => {
    const nextLayers = { ...layers, [key]: !layers[key] };
    setInternalLayers(nextLayers);
    onExternalSkyConfigChange?.((prev) => ({ ...prev, layers: nextLayers }));
  };
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

  // Trigger camera look when requested externally (e.g. from RightSidebar)
  const lastExternalLookNonce = useRef(0);
  useEffect(() => {
    if (!externalLookRequest?.body || externalLookRequest.nonce === lastExternalLookNonce.current) {
      return;
    }
    lastExternalLookNonce.current = externalLookRequest.nonce;
    const v = externalLookRequest.body === 'sun' ? sunInGrid : earthInGrid;
    const pose = v && lookTowardPose(skyCenter, azElToUnitVector(v.azimuth_deg, v.elevation_deg));
    if (pose) setLookCommand((prev) => ({ nonce: prev.nonce + 1, pose }));
  }, [externalLookRequest, sunInGrid, earthInGrid, skyCenter]);

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
      <div className="relative h-full w-full bg-[#05070b]">
        <SceneFallbackPanel title="WEBGL 2 TIDAK TERSEDIA" detail={webgl.reason} />
      </div>
    );
  }

  const isLoading = !canvasArmed || !terrainStatus || terrainStatus.state === 'loading';
  // After a render failure only the fallback panel may speak: no loading notice, no terrain badge.

  return (
    <div className="relative h-full w-full bg-[#05070b]">
      <SceneErrorBoundary onError={() => setSceneFailed(true)} onReset={() => setSceneFailed(false)}>
        {/* shadows="percentage" = PCFShadowMap. three r187 removed PCFSoftShadowMap (R3F 8's default
            for `shadows`) and already fell back to PCF with a console warning: image unchanged. */}
        {canvasArmed && (
          <Canvas
            shadows="percentage"
            dpr={dpr}
            camera={{ position: OVERVIEW_POS, fov: 42, near: 0.1, far: 2500 }}
            onCreated={handleCreated}
          >
            <PerformanceMonitor
              flipflops={3}
              onDecline={() => setDpr((d) => stepDpr(d, -1, maxDpr))}
              onIncline={() => setDpr((d) => stepDpr(d, +1, maxDpr))}
              onFallback={() => setDpr(1)}
            />
            <DebugProbe />
            <color attach="background" args={['#03050a']} />

            <LunarTerrain
              colorTextureUrl={colorTextureUrl}
              onColorStatus={setColorStatus}
              metadata={telemetry?.terrain_metadata}
              onSamplerReady={setPrimarySampler}
              onStatusChange={setTerrainStatus}
              onTerrainPointerMove={handleTerrainPointerMove}
              onTerrainPointerOut={handleTerrainPointerOut}
              onTerrainClick={handleTerrainClick}
            />
            {hasContext && (
              <SurroundingTerrain
                primary={telemetry.terrain_metadata}
                sampler={primarySampler}
                onStatus={setContextStatus}
                onContextSamplerReady={setContextSampler}
                onTerrainPointerMove={handleTerrainPointerMove}
                onTerrainPointerOut={handleTerrainPointerOut}
                onTerrainClick={handleTerrainClick}
              />
            )}
            {showBlockers && activeSite && (
              <HorizonBlockers
                site={activeSite}
                metadata={telemetry.terrain_metadata}
                sampler={sampleHeightAtUV}
              />
            )}

            <group name="local-view">
              <SpaceBackground radius={400} starCount={4200} fullSphere={true} />

              {placementMode && activeHoverPlacement && (
                <group
                  name="terrain-placement-cursor"
                  position={[activeHoverPlacement.x, activeHoverPlacement.y, activeHoverPlacement.z]}
                >
                  <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
                    <ringGeometry args={[0.18, 0.28, 32]} />
                    <meshBasicMaterial
                      color={placementMode === 'add' ? '#38bdf8' : '#f59e0b'}
                      transparent
                      opacity={0.9}
                    />
                  </mesh>
                  <mesh position={[0, 0.22, 0]}>
                    <cylinderGeometry args={[0.025, 0.025, 0.44, 12]} />
                    <meshBasicMaterial
                      color={placementMode === 'add' ? '#38bdf8' : '#f59e0b'}
                      transparent
                      opacity={0.75}
                    />
                  </mesh>
                </group>
              )}

              <SunLighting
                sunVector={sunInGrid}
                planeWidth={contextSize}
                planeDepth={Math.max(planeDepth, contextSize)}
                shadowKey={contextStatus?.state === 'ready' ? contextStatus : terrainStatus}
              />

              {northOffset !== null && (
                <group rotation={[0, -northOffset * Math.PI / 180, 0]}>
                  <CompassRing radius={Math.max(contextSize, planeSize, planeDepth) * 0.51} />
                </group>
              )}

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
                placementMode={Boolean(placementMode)}
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
                minDistance={cameraCommand?.view === 'pov' ? 0.15 : 2.2}
                maxDistance={38 * tileScale(contextSize, planeDepth)}
                maxPolarAngle={Math.PI / 2 - 0.04}
              />
            </group>
          </Canvas>
        )}
      </SceneErrorBoundary>
      {isLoading && !contextLost && !sceneFailed && <SceneNotice>Preparing 3D scene…</SceneNotice>}
      {contextLost && (
        <SceneNotice tone="warning">WebGL context lost — waiting for browser recovery…</SceneNotice>
      )}
      {!sceneFailed && placementMode && (
        <div
          role="status"
          data-testid="placement-mode-banner"
          className="font-jakarta pointer-events-auto absolute top-4 left-1/2 z-[15] flex -translate-x-1/2 flex-wrap items-center gap-2.5 rounded bg-[#0c0d10]/95 px-3.5 py-2 text-xs text-slate-100 shadow-xl backdrop-blur-md"
        >
          <span className="font-semibold text-white">
            {placementMode === 'add'
              ? 'Add Site Mode: Click on the 3D terrain to place a new site'
              : `Move Site Mode: Click on the 3D terrain to relocate ${activeSite?.name ?? 'site'}`}
          </span>
          {activeHoverPlacement?.latLon && (
            <span className="rounded-sm bg-[#1a1d24] px-2 py-0.5 font-jakarta text-[11px] tabular-nums text-slate-200">
              {formatLatitude(activeHoverPlacement.latLon.latitude_deg)},{' '}
              {formatLongitude(activeHoverPlacement.latLon.longitude_deg)} · Elev{' '}
              {formatMeters(activeHoverPlacement.elevationM)}
            </span>
          )}
          <button
            type="button"
            onClick={onCancelPlacement}
            className="rounded-sm bg-[#252830] px-2.5 py-0.5 text-[11px] font-medium text-white hover:bg-[#2f333d]"
          >
            Done
          </button>
        </div>
      )}
      {!sceneFailed && canvasArmed && (
        <div className="pointer-events-none absolute bottom-4 left-4 z-[7] flex flex-col items-start gap-1.5">
          {/* Same width (w-64) as SkyControls directly below */}
          {roughness && (
            <div
              data-testid="viewer-terrain-tools"
              className="font-jakarta pointer-events-auto grid w-64 max-w-[calc(100vw-2rem)] grid-cols-2 gap-1 rounded bg-[#0c0d10]/95 p-1 shadow-xl backdrop-blur-md"
            >
              <button
                type="button"
                data-testid="roughness-toggle"
                aria-pressed={terrainLayer === 'roughness'}
                onClick={() =>
                  setTerrainLayer((layer) => (layer === 'relief' ? 'roughness' : 'relief'))
                }
                title={
                  terrainLayer === 'relief'
                    ? 'Show RMS Surface Roughness Overlay (100×100 m blocks)'
                    : 'Return to DEM Relief View'
                }
                className={`flex h-8 w-full items-center justify-center gap-1.5 rounded-sm px-2 text-[11.5px] font-medium transition ${
                  terrainLayer === 'roughness'
                    ? 'bg-[#252830] text-white'
                    : 'bg-transparent text-[#8e939e] hover:bg-[#181b21] hover:text-white'
                }`}
              >
                <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
                  gradient
                </span>
                <span>Roughness</span>
              </button>

              <button
                type="button"
                data-testid="blockers-toggle"
                aria-pressed={showBlockers}
                onClick={() => setShowBlockers((shown) => !shown)}
                title="Toggle 360° Horizon Ridge Blockers"
                className={`flex h-8 w-full items-center justify-center gap-1.5 rounded-sm px-2 text-[11.5px] font-medium transition ${
                  showBlockers
                    ? 'bg-[#252830] text-white'
                    : 'bg-transparent text-[#8e939e] hover:bg-[#181b21] hover:text-white'
                }`}
              >
                <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
                  landscape
                </span>
                <span>Horizon Ridge</span>
              </button>
            </div>
          )}

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
    </div>
  );
}
