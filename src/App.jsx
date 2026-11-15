import { useCallback, useState } from 'react';
import { Globe, Moon } from 'lucide-react';
import { useEphemerisData } from './hooks/useEphemerisData';
import { LunarScene } from './components/3d/LunarScene';
import { SouthHemisphereScene } from './components/3d/SouthHemisphereScene';
import { DEFAULT_SKY_LAYERS } from './components/3d/sky/SkyControls';
import { LeftSidebar } from './components/hud/LeftSidebar';
import { RightSidebar } from './components/hud/RightSidebar';
import { BottomSandboxBar } from './components/hud/BottomSandboxBar';
import { ContrastPanel } from './components/hud/ContrastPanel';
import { LandingPage } from './components/LandingPage';
import { DataReport } from './DataReport';

const NO_REGIONS = [];

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
    removeSite,
    resetSites,
    hasCustomSiteChanges,
  } = useEphemerisData();

  // Main Left Sidebar tab: 'navigate' | 'view' | 'read'
  const [activeMainTab, setActiveMainTab] = useState('navigate');
  const [isLeftCollapsed, setIsLeftCollapsed] = useState(false);

  const [uiMode, setUiMode] = useState('planner');
  const [placementMode, setPlacementMode] = useState(null);
  const [surfaceMode, setSurfaceMode] = useState(() =>
    new URLSearchParams(globalThis.window?.location?.search).get('surface') === 'hemisphere'
      ? 'hemisphere'
      : 'local'
  );

  const [isHudOpen, setIsHudOpen] = useState(
    () => globalThis.window?.matchMedia?.('(min-width: 1024px)').matches ?? true
  );
  const [isContrastOpen, setIsContrastOpen] = useState(false);

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

  if (!hasLaunched) {
    return <LandingPage onLaunch={() => setHasLaunched(true)} />;
  }

  return (
    <div className="relative flex h-screen w-screen flex-col overflow-hidden bg-[#05070b] select-none">
      {/* Main Upper Workspace: Left Sidebar + Center Viewport + Right Sidebar */}
      <div className="relative flex min-h-0 flex-1 overflow-hidden pb-13">
        {/* LEFT SIDEBAR: 3 Main Tabs (Navigate, View, Read) */}
        {isHudOpen && (
          <LeftSidebar
            activeTab={activeMainTab}
            onSelectTab={handleSelectMainTab}
            collapsed={isLeftCollapsed}
            onToggleCollapse={() => setIsLeftCollapsed((prev) => !prev)}
            dataMode={dataMode}
            dataError={dataError}
            regionName={
              surfaceMode === 'hemisphere' ? 'Belahan selatan Bulan' : activeRegion.name
            }
            regionError={regionError}
            onBackToLanding={() => setHasLaunched(false)}
          />
        )}

        {/* CENTER MAIN VIEWPORT: 3D Canvas (Navigate / View) or Scientific Summary (Read) */}
        <main
          aria-label="Area Utama Selenis"
          className="relative min-w-0 flex-1 overflow-hidden bg-[#05070b]"
        >
          {activeMainTab === 'read' && (
            <div
              data-testid="read-summary-view"
              className="data-report absolute inset-0 z-10 overflow-y-auto bg-[#0b0e16] px-6 py-6 select-text sm:px-10"
            >
              <DataReport telemetryUrl={activeRegion.telemetry_url} />

              {/* Embedded Lunar vs Earth Contrast Section for Read Tab */}
              <section
                id="contrast-section"
                className="mx-auto mb-12 max-w-[52rem] rounded-2xl border border-white/10 bg-white/[0.02] p-6"
              >
                <h2 className="!mt-0 flex items-center gap-2 text-lg font-semibold text-amber-300">
                  <Moon className="h-5 w-5" />
                  Kontras Lingkungan: Kutub Selatan Bulan vs. Bumi
                </h2>
                <p className="mt-2 text-sm text-slate-300">
                  Kemiringan sumbu rotasi Bulan yang hanya 1,54° terhadap ekliptika menciptakan
                  geometri pencahayaan dan visibilitas Bumi yang sangat berbeda dibanding Bumi:
                </p>
                <div className="mt-4 overflow-hidden rounded-xl border border-white/10">
                  <table className="w-full border-collapse text-left text-xs sm:text-sm">
                    <thead>
                      <tr className="border-b border-white/10 bg-white/[0.04] text-slate-200">
                        <th className="p-3 font-semibold">Parameter Fisik</th>
                        <th className="p-3 font-semibold text-amber-300">Kutub Selatan Bulan</th>
                        <th className="p-3 font-semibold text-sky-300">
                          <span className="inline-flex items-center gap-1">
                            <Globe className="h-3.5 w-3.5" /> Bumi (Referensi)
                          </span>
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/10 text-slate-300">
                      <tr>
                        <td className="p-3 font-medium text-white">Sudut Elevasi Matahari</td>
                        <td className="p-3">1,5° – 5° (menyapu cakrawala sepanjang waktu)</td>
                        <td className="p-3 text-slate-400">Hingga 75° – 90° di atas kepala</td>
                      </tr>
                      <tr>
                        <td className="p-3 font-medium text-white">Siklus Siang & Malam</td>
                        <td className="p-3">~29,5 hari Bumi (1 hari sinodis Bulan)</td>
                        <td className="p-3 text-slate-400">24 jam (12 jam siang, 12 jam malam)</td>
                      </tr>
                      <tr>
                        <td className="p-3 font-medium text-white">Atmosfer & Hamburan Cahaya</td>
                        <td className="p-3">Vakum; bayangan kawah gelap gulita & dingin ekstrem</td>
                        <td className="p-3 text-slate-400">Atmosfer menghamburkan cahaya (senja)</td>
                      </tr>
                      <tr>
                        <td className="p-3 font-medium text-white">Posisi Bumi di Langit</td>
                        <td className="p-3">Bergoyang pola angka-8 (Librasi) dekat horizon</td>
                        <td className="p-3 text-slate-400">Bulan terbit dan terbenam setiap hari</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          )}

          {/* 3D Canvas Layer (kept mounted or rendered when in Navigate/View) */}
          {dataMode === 'loading' ? (
            <div
              className="flex h-full w-full items-center justify-center bg-[#05070b] text-sm text-slate-300"
              role="status"
            >
              Memuat kawasan {activeRegion.name}…
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
            />
          )}
        </main>

        {/* RIGHT SIDEBAR: Context Tools & Site Inspector */}
        {isHudOpen && dataMode !== 'loading' && (
          <RightSidebar
            activeMainTab={activeMainTab}
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
            onOpenContrast={() => setIsContrastOpen(true)}
            onScrollReportSection={handleScrollReportSection}
          />
        )}
      </div>

      {/* BOTTOM BAR & EXPANDABLE DRAWER (Universe Sandbox 2 Reference) */}
      <BottomSandboxBar
        timeIndex={timeIndex}
        totalSteps={dataMode === 'loading' ? 0 : totalSteps}
        onChangeTimeIndex={setTimeIndex}
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
        cameraView={cameraView}
        onRequestCameraView={requestCameraView}
        hasContextDataset={Boolean(telemetry?.terrain_metadata?.context_dataset_url)}
        terrainConfig={terrainConfig}
        onChangeTerrainConfig={setTerrainConfig}
        uiMode={uiMode}
        onToggleUiMode={setUiMode}
        onOpenContrast={() => setIsContrastOpen(true)}
        isHudOpen={isHudOpen}
        onToggleHud={() => setIsHudOpen((prev) => !prev)}
      />

      {/* Modal Perbandingan Bulan vs Bumi */}
      <ContrastPanel
        isOpen={isContrastOpen}
        onClose={() => setIsContrastOpen(false)}
        activeSite={activeSite}
      />
    </div>
  );
}
