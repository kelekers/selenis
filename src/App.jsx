import { useCallback, useEffect, useRef, useState } from 'react';
import { useEphemerisData } from './hooks/useEphemerisData';
import { LunarScene } from './components/3d/LunarScene';
import { SouthHemisphereScene } from './components/3d/SouthHemisphereScene';
import { DEFAULT_SKY_LAYERS } from './components/3d/sky/SkyControls';
import { LeftSidebar } from './components/hud/LeftSidebar';
import { RightSidebar } from './components/hud/RightSidebar';
import { RightFloatingTools } from './components/hud/RightFloatingTools';
import { TutorialModal } from './components/hud/TutorialModal';
import { BottomSandboxBar } from './components/hud/BottomSandboxBar';
import { LandingPage } from './components/LandingPage';
import { DataReport } from './DataReport';
import { formatRegionLabel, stepIndex } from './utils/hudModel';

const NO_REGIONS = [];
const TUTORIAL_STORAGE_KEY = 'selenis:tutorial-seen:v1';
const PLAYBACK_SPEEDS = [1, 2, 5, 10, 100, 1000];

export function App() {
  const [hasLaunched, setHasLaunched] = useState(() => {
    if (typeof window === 'undefined') return false;
    const params = new URLSearchParams(window.location.search);
    return params.get('debug') === '1' || params.get('view') === 'navigator';
  });

  const {
    dataMode,
    dataError,
    regions,
    activeRegion,
    selectedRegionId,
    setSelectedRegionId,
    regionError,
    telemetry,
    ephemeris,
    sites,
    activeSite,
    selectedSiteId,
    setSelectedSiteId,
    timeIndex,
    setTimeIndex,
    epochOffsetHours,
    setEpochOffsetHours,
    jumpToDateUtc,
    totalSteps,
    activeEphemeris,
    activeVisibility,
    isPlaying,
    setIsPlaying,
    playbackSpeed,
    setPlaybackSpeed,
    setTerrainSampler,
    addSite,
    moveSite,
    renameSite,
    removeSite,
    resetSites,
    hasCustomSiteChanges,
  } = useEphemerisData();

  // Main Left Sidebar tab: 'navigate' | 'view' | 'read'
  const [activeMainTab, setActiveMainTab] = useState('navigate');
  const [isLeftCollapsed, setIsLeftCollapsed] = useState(false);
  const [isRightCollapsed, setIsRightCollapsed] = useState(false);

  const [uiMode, setUiMode] = useState('planner');
  const [placementMode, setPlacementMode] = useState(null);
  const [floatingPanel, setFloatingPanel] = useState(null);
  const [isTutorialOpen, setIsTutorialOpen] = useState(() => {
    try {
      if (typeof window === 'undefined') return false;
      const params = new URLSearchParams(window.location.search);
      if (params.get('debug') === '1') return false;
      return window.localStorage.getItem(TUTORIAL_STORAGE_KEY) !== '1';
    } catch {
      return false;
    }
  });

  const handleCloseTutorial = useCallback(() => {
    setIsTutorialOpen(false);
    try {
      window.localStorage?.setItem(TUTORIAL_STORAGE_KEY, '1');
    } catch {
      // ignore storage errors
    }
  }, []);
  const [surfaceMode, setSurfaceMode] = useState(() =>
    new URLSearchParams(globalThis.window?.location?.search).get('surface') === 'hemisphere'
      ? 'hemisphere'
      : 'local'
  );

  const [isHudOpen, setIsHudOpen] = useState(
    () => globalThis.window?.matchMedia?.('(min-width: 1024px)').matches ?? true
  );

  // Shared ref for the live 3D compass dial in the top-right of RightSidebar
  const compassApiRef = useRef(null);

  // Camera state
  const [cameraCommand, setCameraCommand] = useState({ view: 'context', nonce: 0 });
  const cameraView = cameraCommand.view;
  const requestCameraView = useCallback((view) => {
    setSurfaceMode('local');
    setCameraCommand((prev) => ({ view, nonce: prev.nonce + 1 }));
  }, []);

  // External Sky & Terrain configurations shared between RightSidebar / BottomSandboxBar and LunarScene
  const [skyConfig, setSkyConfig] = useState({
    skyMode: 'big',
    sizeMode: 'enlarged',
    layers: { ...DEFAULT_SKY_LAYERS },
  });
  const [terrainConfig, setTerrainConfig] = useState({
    terrainLayer: 'relief',
    showBlockers: false,
  });
  const [externalLookRequest, setExternalLookRequest] = useState({ body: null, nonce: 0 });

  const handleLookSkyBody = useCallback((body) => {
    setSurfaceMode('local');
    setExternalLookRequest((prev) => ({ body, nonce: prev.nonce + 1 }));
  }, []);

  const handleSelectMainTab = useCallback(
    (tabId) => {
      setActiveMainTab(tabId);
      if (tabId === 'view') {
        setSurfaceMode('local');
        setSkyConfig((prev) => ({ ...prev, skyMode: 'small' }));
        setCameraCommand((prev) => ({ view: 'pov', nonce: prev.nonce + 1 }));
      } else if (tabId === 'navigate' && cameraCommand.view === 'pov') {
        setSkyConfig((prev) => ({ ...prev, skyMode: 'big' }));
        setCameraCommand((prev) => ({ view: 'site', nonce: prev.nonce + 1 }));
      }
    },
    [cameraCommand.view]
  );

  const handleScrollReportSection = useCallback((sectionId) => {
    if (!sectionId || typeof document === 'undefined') return;
    const el = document.getElementById(sectionId);
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  // Global Keyboard Shortcuts for rapid navigation & simulation control
  useEffect(() => {
    if (!hasLaunched || typeof window === 'undefined') return undefined;
    const handleKeyDown = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = e.target?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target?.isContentEditable) {
        return;
      }

      if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        setIsPlaying((prev) => !prev);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (totalSteps > 0) setTimeIndex((idx) => stepIndex(idx, totalSteps, -1));
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (totalSteps > 0) setTimeIndex((idx) => stepIndex(idx, totalSteps, +1));
      } else if (e.key === 's' || e.key === 'S') {
        e.preventDefault();
        setPlaybackSpeed((curr) => {
          const i = PLAYBACK_SPEEDS.indexOf(curr);
          return PLAYBACK_SPEEDS[(i + 1) % PLAYBACK_SPEEDS.length] ?? 1;
        });
      } else if (e.key === '1') {
        handleSelectMainTab('navigate');
      } else if (e.key === '2') {
        handleSelectMainTab('view');
      } else if (e.key === '3') {
        handleSelectMainTab('read');
      } else if (e.key === 'm' || e.key === 'M') {
        setUiMode((prev) => (prev === 'planner' ? 'explorer' : 'planner'));
      } else if (e.key === 'r' || e.key === 'R') {
        setFloatingPanel((prev) => (prev === 'regions' ? null : 'regions'));
      } else if (e.key === 'f' || e.key === 'F') {
        setFloatingPanel((prev) => (prev === 'sites' ? null : 'sites'));
      } else if (e.key === 'c' || e.key === 'C') {
        setSkyConfig((prev) => {
          const nextCompass = prev?.layers?.compass === false;
          if (nextCompass) {
            requestCameraView(activeMainTab === 'view' ? 'pov' : 'site');
          }
          return {
            ...prev,
            layers: { ...(prev?.layers ?? {}), compass: nextCompass },
          };
        });
      } else if (e.key === 'h' || e.key === 'H') {
        setIsHudOpen((prev) => !prev);
      } else if (e.key === '?' || e.key === '/') {
        e.preventDefault();
        setIsTutorialOpen((prev) => !prev);
      } else if (e.key === 'Escape') {
        setFloatingPanel(null);
        setPlacementMode(null);
        if (isTutorialOpen) handleCloseTutorial();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    hasLaunched,
    totalSteps,
    setIsPlaying,
    setTimeIndex,
    setPlaybackSpeed,
    handleSelectMainTab,
    requestCameraView,
    activeMainTab,
    isTutorialOpen,
    handleCloseTutorial,
  ]);

  if (!hasLaunched) {
    return <LandingPage onLaunch={() => setHasLaunched(true)} />;
  }

  return (
    <div className="font-jakarta relative flex h-screen w-screen flex-col overflow-hidden bg-[#05070b] select-none">
      {/* Main Upper Workspace: Left Sidebar + Center Viewport + Right Sidebar */}
      <div className="relative flex min-h-0 flex-1 overflow-hidden pb-13">
        {/* LEFT SIDEBAR: 3 Main Tabs (Navigate, View, Read) + Planner/Explorer Mode Toggle */}
        {isHudOpen && (
          <LeftSidebar
            activeTab={activeMainTab}
            onSelectTab={handleSelectMainTab}
            uiMode={uiMode}
            onToggleUiMode={setUiMode}
            collapsed={isLeftCollapsed}
            onToggleCollapse={() => setIsLeftCollapsed((prev) => !prev)}
            dataMode={dataMode}
            dataError={dataError}
            regionName={
              surfaceMode === 'hemisphere' ? 'Lunar Southern Hemisphere' : activeRegion.name
            }
            regionError={regionError}
            onBackToLanding={() => setHasLaunched(false)}
            onOpenTutorial={() => setIsTutorialOpen(true)}
          />
        )}

        {/* CENTER MAIN VIEWPORT: 3D Canvas (Navigate / View) or Scientific Summary (Read) */}
        <main
          aria-label="Selenis Main Viewport"
          className="relative min-w-0 flex-1 overflow-hidden bg-[#05070b]"
        >
          {activeMainTab === 'read' && (
            <div
              data-testid="read-summary-view"
              className="data-report absolute inset-0 z-10 overflow-y-auto bg-[#090a0f] px-6 py-6 select-text sm:px-10"
            >
              <DataReport telemetryUrl={activeRegion.telemetry_url} uiMode={uiMode} />

              {/* Embedded Lunar vs Earth Contrast Section for Read Tab */}
              <section
                id="contrast-section"
                className="font-jakarta mx-auto mb-12 max-w-[54rem] rounded bg-[#14161b] p-6"
              >
                <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
                  <h2 className="!m-0 flex items-center gap-2 text-base font-semibold text-white">
                    <span
                      className="material-symbols-outlined text-[18px] text-[#d1d5db]"
                      aria-hidden="true"
                    >
                      compare
                    </span>
                    4. Extreme Environment Comparison: Lunar South Pole vs. Earth
                  </h2>
                  <span className="text-xs font-medium text-[#8e939e]">1.54° Axial Tilt</span>
                </div>
                <p className="mt-3 text-xs leading-relaxed text-[#9ca3af]">
                  The Moon&apos;s 1.54° axial tilt relative to the ecliptic creates lighting and
                  Direct-to-Earth (DTE) geometry starkly different from Earth:
                </p>
                <div className="mt-4 overflow-hidden rounded bg-[#1a1d24]">
                  <table className="w-full border-collapse text-left text-xs">
                    <thead>
                      <tr className="border-b border-white/[0.06] bg-white/[0.02] text-white">
                        <th className="p-3 font-semibold">Physical Parameter</th>
                        <th className="p-3 font-semibold text-white">Lunar South Pole</th>
                        <th className="p-3 font-semibold text-[#9ca3af]">Earth (Reference)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.06] text-[#b4b8c2]">
                      <tr>
                        <td className="p-3 font-medium text-white">Solar Elevation Angle</td>
                        <td className="p-3">1.5° – 5° (grazing the horizon continuously)</td>
                        <td className="p-3 text-[#8e939e]">Up to 75° – 90° overhead</td>
                      </tr>
                      <tr>
                        <td className="p-3 font-medium text-white">Day & Night Cycle</td>
                        <td className="p-3">~29.5 Earth days (1 lunar synodic month)</td>
                        <td className="p-3 text-[#8e939e]">24 hours (12 hrs day, 12 hrs night)</td>
                      </tr>
                      <tr>
                        <td className="p-3 font-medium text-white">Atmosphere & Scattering</td>
                        <td className="p-3">Hard vacuum; pitch-black cryogenic shadows</td>
                        <td className="p-3 text-[#8e939e]">Atmospheric scattering & twilight</td>
                      </tr>
                      <tr>
                        <td className="p-3 font-medium text-white">Earth Position in Sky</td>
                        <td className="p-3">Figure-8 libration wobble near the horizon</td>
                        <td className="p-3 text-[#8e939e]">Moon rises and sets daily</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          )}

          {/* 3D Canvas Layer */}
          {dataMode === 'loading' ? (
            <div
              className="flex h-full w-full items-center justify-center bg-[#05070b] text-sm text-slate-300"
              role="status"
            >
              Loading {formatRegionLabel(activeRegion.name)}…
            </div>
          ) : surfaceMode === 'hemisphere' && activeMainTab !== 'view' ? (
            <SouthHemisphereScene
              activeSite={dataMode === 'ready' ? activeSite : null}
              activeEphemeris={dataMode === 'ready' ? activeEphemeris : null}
              regionName={activeRegion.name}
              regions={dataMode === 'ready' ? regions : NO_REGIONS}
              selectedRegionId={selectedRegionId}
              onOpenDetail={(regionId) => {
                setSelectedRegionId(regionId);
                setActiveMainTab('navigate');
                requestCameraView('site');
              }}
            />
          ) : (
            <LunarScene
              telemetry={telemetry}
              sites={sites}
              activeSite={activeSite}
              selectedSiteId={selectedSiteId}
              onSelectSite={setSelectedSiteId}
              activeEphemeris={activeEphemeris}
              activeVisibility={activeVisibility}
              ephemerisTimeline={ephemeris?.timeline}
              timeIndex={timeIndex}
              cameraCommand={cameraCommand}
              onTerrainSampler={setTerrainSampler}
              placementMode={placementMode}
              onCancelPlacement={() => setPlacementMode(null)}
              onPickTerrainCoordinate={({ uv }) => {
                if (placementMode === 'add') {
                  addSite({ uv });
                  setPlacementMode(null);
                } else if (placementMode === 'move' && activeSite) {
                  moveSite(activeSite.site_id, { uv });
                }
              }}
              externalLookRequest={externalLookRequest}
              externalSkyConfig={skyConfig}
              onExternalSkyConfigChange={setSkyConfig}
              externalTerrainConfig={terrainConfig}
              onExternalTerrainConfigChange={setTerrainConfig}
              externalCompassApiRef={compassApiRef}
              uiMode={uiMode}
            />
          )}

          {/* FLOATING REGION & SITE CONTROLS ON THE RIGHT OF THE 3D VIEWPORT */}
          {activeMainTab !== 'read' && dataMode !== 'loading' && (
            <RightFloatingTools
              openPanel={floatingPanel}
              onTogglePanel={setFloatingPanel}
              uiMode={uiMode}
              regions={regions}
              selectedRegionId={selectedRegionId}
              surfaceMode={surfaceMode}
              onRegionChange={(id) => {
                setSurfaceMode('local');
                setPlacementMode(null);
                setSelectedRegionId(id);
                setFloatingPanel(null);
              }}
              onToggleSurface={() => {
                if (surfaceMode === 'hemisphere') {
                  requestCameraView('context');
                } else {
                  setSurfaceMode('hemisphere');
                }
                setFloatingPanel(null);
              }}
              sites={sites}
              selectedSiteId={selectedSiteId}
              onSelectSite={(siteId) => {
                setSelectedSiteId(siteId);
              }}
              activeSite={activeSite}
              onAddSite={addSite}
              placementMode={placementMode}
              onPlacementModeChange={(mode) => {
                setPlacementMode(mode);
                if (mode) setFloatingPanel(null);
              }}
              onResetSites={resetSites}
              hasCustomSiteChanges={hasCustomSiteChanges}
            />
          )}
        </main>

        {/* RIGHT SIDEBAR: Context Tools & Site Inspector */}
        {isHudOpen && dataMode !== 'loading' && (
          <RightSidebar
            activeMainTab={activeMainTab}
            collapsed={isRightCollapsed}
            onToggleCollapse={() => setIsRightCollapsed((prev) => !prev)}
            sites={sites}
            selectedSiteId={selectedSiteId}
            onSelectSite={setSelectedSiteId}
            activeSite={activeSite}
            uiMode={uiMode}
            regionName={telemetry?.terrain_metadata?.region_name}
            terrainMetadata={telemetry?.terrain_metadata}
            ephemerisTimeline={ephemeris?.timeline}
            activeEphemeris={activeEphemeris}
            activeVisibility={activeVisibility}
            totalSteps={totalSteps}
            onAddSite={addSite}
            onMoveSite={moveSite}
            onRenameSite={renameSite}
            onRemoveSite={removeSite}
            onResetSites={resetSites}
            hasCustomSiteChanges={hasCustomSiteChanges}
            placementMode={placementMode}
            onPlacementModeChange={setPlacementMode}
            cameraView={cameraView}
            onRequestCameraView={requestCameraView}
            onLookSkyBody={handleLookSkyBody}
            skyConfig={skyConfig}
            onChangeSkyConfig={setSkyConfig}
            terrainConfig={terrainConfig}
            onChangeTerrainConfig={setTerrainConfig}
            onScrollReportSection={handleScrollReportSection}
            compassApiRef={compassApiRef}
          />
        )}
      </div>

      {/* BOTTOM BAR & EXPANDABLE DRAWER (Full-Width Timeline Scrubber & 100-Year Planner) */}
      <BottomSandboxBar
        timeIndex={timeIndex}
        totalSteps={dataMode === 'loading' ? 0 : totalSteps}
        onChangeTimeIndex={setTimeIndex}
        epochOffsetHours={epochOffsetHours}
        onChangeEpochOffsetHours={setEpochOffsetHours}
        onJumpToDateUtc={jumpToDateUtc}
        ephemerisTimeline={ephemeris?.timeline}
        isPlaying={isPlaying}
        onTogglePlay={() => setIsPlaying((prev) => !prev)}
        playbackSpeed={playbackSpeed}
        onChangePlaybackSpeed={setPlaybackSpeed}
        activeEphemeris={dataMode === 'loading' ? null : activeEphemeris}
        regions={regions}
        selectedRegionId={selectedRegionId}
        surfaceMode={surfaceMode}
        onRegionChange={(id) => {
          setSurfaceMode('local');
          setPlacementMode(null);
          setSelectedRegionId(id);
        }}
        onToggleSurface={() =>
          surfaceMode === 'hemisphere' ? requestCameraView('context') : setSurfaceMode('hemisphere')
        }
        sites={sites}
        selectedSiteId={selectedSiteId}
        onSelectSite={setSelectedSiteId}
        activeSite={activeSite}
        onAddSite={addSite}
        placementMode={placementMode}
        onPlacementModeChange={setPlacementMode}
        onResetSites={resetSites}
        hasCustomSiteChanges={hasCustomSiteChanges}
        isHudOpen={isHudOpen}
        onToggleHud={() => setIsHudOpen((prev) => !prev)}
      />

      {/* INTERACTIVE FIRST-TIME TUTORIAL & KEYBOARD SHORTCUTS MODAL */}
      <TutorialModal
        isOpen={isTutorialOpen}
        onClose={handleCloseTutorial}
        uiMode={uiMode}
        onSelectUiMode={setUiMode}
      />
    </div>
  );
}
