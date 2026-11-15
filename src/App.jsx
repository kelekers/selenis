import { useCallback, useState } from 'react';
import { Crosshair, Maximize2 } from 'lucide-react';
import { useEphemerisData } from './hooks/useEphemerisData';
import { LunarScene } from './components/3d/LunarScene';
import { SouthHemisphereScene } from './components/3d/SouthHemisphereScene';
import { TopTelemetryBar } from './components/hud/TopTelemetryBar';
import { HorizonPanoramaChart } from './components/hud/HorizonPanoramaChart';
import { MicroShiftDeltaCard } from './components/hud/MicroShiftDeltaCard';
import { TimelineScrubber } from './components/hud/TimelineScrubber';
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
  } = useEphemerisData();

  const [uiMode, setUiMode] = useState('planner');
  const [surfaceMode, setSurfaceMode] = useState(
    () => new URLSearchParams(globalThis.window?.location?.search).get('surface') === 'hemisphere' ? 'hemisphere' : 'local'
  );
  // On narrow screens the HUD panels would cover the whole 3D view (measured at 390×844),
  // so they start collapsed there; "Tampilkan HUD" opens them.
  const [isHudOpen, setIsHudOpen] = useState(
    () => globalThis.window?.matchMedia?.('(min-width: 1024px)').matches ?? true
  );
  const [isContrastOpen, setIsContrastOpen] = useState(false);
  const [showDataReport, setShowDataReport] = useState(false);
  // Camera requests carry a nonce so pressing the same view again (e.g. "Peta Kawah" after
  // orbiting) still re-frames the camera = explicit camera reset (PRD FR-05).
  const [cameraCommand, setCameraCommand] = useState({ view: 'context', nonce: 0 });
  const cameraView = cameraCommand.view;
  const requestCameraView = useCallback(
    (view) => {
      setSurfaceMode('local');
      setCameraCommand((prev) => ({ view, nonce: prev.nonce + 1 }));
    },
    []
  );

  if (!hasLaunched) {
    return <LandingPage onLaunch={() => setHasLaunched(true)} />;
  }

  return (
    <div className="relative h-screen w-screen overflow-hidden select-none">
      <button type="button" onClick={() => setShowDataReport(!showDataReport)}
        className="fixed bottom-2 right-2 z-50 rounded-lg bg-slate-800 px-3 py-2 text-xs text-white">
        {showDataReport ? 'Tutup laporan data' : 'Laporan data ilmiah'}
      </button>
      {showDataReport && <div className="data-report fixed inset-0 z-40 overflow-auto bg-[#101722] p-6 select-text">
        <DataReport telemetryUrl={activeRegion.telemetry_url} />
      </div>}
      {/* Lapisan Kanvas 3D Utama */}
      {dataMode === 'loading' ? <div className="fixed inset-0 flex items-center justify-center bg-[#05070b] text-sm text-slate-300" role="status">Memuat kawasan {activeRegion.name}…</div>
        : surfaceMode === 'hemisphere' ? <SouthHemisphereScene
        activeSite={dataMode === 'ready' ? activeSite : null}
        activeEphemeris={dataMode === 'ready' ? activeEphemeris : null}
        regionName={activeRegion.name}
        regions={dataMode === 'ready' ? regions : NO_REGIONS}
        selectedRegionId={selectedRegionId}
        onOpenDetail={(regionId) => {
          setSelectedRegionId(regionId);
          setShowDataReport(false);
          requestCameraView('site');
        }}
      /> : <LunarScene
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
      />}

      {/* Bar Telemetri Atas */}
      <TopTelemetryBar
        dataMode={dataMode}
        dataError={dataError}
        regionName={surfaceMode === 'hemisphere' ? 'Belahan selatan Bulan' : activeRegion.name}
        surfaceMode={surfaceMode}
        regions={regions}
        selectedRegionId={selectedRegionId}
        regionError={regionError}
        onRegionChange={(id) => { setSurfaceMode('local'); setShowDataReport(false); setSelectedRegionId(id); }}
        onToggleSurface={() => surfaceMode === 'hemisphere' ? requestCameraView('context') : setSurfaceMode('hemisphere')}
        activeSite={dataMode === 'loading' ? null : activeSite}
        uiMode={uiMode}
        onToggleUiMode={setUiMode}
        isHudOpen={isHudOpen}
        onToggleHud={() => setIsHudOpen((prev) => !prev)}
        onOpenContrast={() => setIsContrastOpen(true)}
      />

      {/* Panel Analisis Samping (Kiri & Kanan) */}
      {isHudOpen && dataMode !== 'loading' && (
        <aside className="pointer-events-none fixed inset-x-0 top-60 bottom-44 z-10 sm:top-44 lg:top-24 lg:bottom-28 flex flex-col justify-between gap-3 overflow-y-auto px-4 lg:flex-row lg:items-start lg:overflow-visible">
          <div className="pointer-events-auto flex w-full max-w-sm flex-col gap-2.5">
            <MicroShiftDeltaCard
              sites={sites}
              selectedSiteId={selectedSiteId}
              onSelectSite={setSelectedSiteId}
              activeSite={activeSite}
              uiMode={uiMode}
              regionName={telemetry?.terrain_metadata?.region_name}
            />

            {/* Kontrol Sudut Pandang Kamera 3D */}
            <div className="flex gap-2 rounded-xl border border-white/15 bg-[#0b101b]/80 p-1.5 backdrop-blur-md">
              {telemetry?.terrain_metadata?.context_dataset_url && <button type="button"
                data-testid="context-view" onClick={() => requestCameraView('context')}
                aria-pressed={cameraView === 'context'}
                className={`min-h-11 flex-1 rounded-lg px-2 text-xs ${cameraView === 'context' ? 'bg-amber-500/25 text-amber-200' : 'text-slate-400 hover:text-slate-200'}`}>
                Area luas
              </button>}
              <button
                type="button"
                onClick={() => requestCameraView('overview')}
                aria-pressed={cameraView === 'overview'}
                title="Kembali ke tampilan seluruh kawah (reset kamera)"
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-medium transition ${
                  cameraView === 'overview'
                    ? 'bg-white/15 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Maximize2 className="h-3.5 w-3.5" />
                Peta Kawah
              </button>
              <button
                type="button"
                onClick={() => requestCameraView('site')}
                aria-pressed={cameraView === 'site'}
                disabled={!activeSite}
                title="Arahkan kamera ke site terpilih"
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-medium transition ${
                  cameraView === 'site'
                    ? 'bg-amber-500/25 text-amber-200 border border-amber-400/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Crosshair className="h-3.5 w-3.5" />
                Fokus Site
              </button>
            </div>
          </div>

          <div className="pointer-events-auto w-full max-w-sm">
            <HorizonPanoramaChart
              activeSite={activeSite}
              ephemerisTimeline={ephemeris?.timeline}
              activeEphemeris={activeEphemeris}
              activeVisibility={activeVisibility}
              uiMode={uiMode}
            />
          </div>
        </aside>
      )}

      {/* Kontrol Linimasa Bawah */}
      <TimelineScrubber
        timeIndex={timeIndex}
        totalSteps={dataMode === 'loading' ? 0 : totalSteps}
        onChangeTimeIndex={setTimeIndex}
        isPlaying={isPlaying}
        onTogglePlay={() => setIsPlaying((prev) => !prev)}
        activeEphemeris={dataMode === 'loading' ? null : activeEphemeris}
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
