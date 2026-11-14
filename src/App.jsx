import { useCallback, useState } from 'react';
import { Crosshair, Maximize2 } from 'lucide-react';
import { useEphemerisData } from './hooks/useEphemerisData';
import { LunarScene } from './components/3d/LunarScene';
import { TopTelemetryBar } from './components/hud/TopTelemetryBar';
import { HorizonPanoramaChart } from './components/hud/HorizonPanoramaChart';
import { MicroShiftDeltaCard } from './components/hud/MicroShiftDeltaCard';
import { TimelineScrubber } from './components/hud/TimelineScrubber';
import { ContrastPanel } from './components/hud/ContrastPanel';

export function App() {
  const {
    dataMode,
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
  const [isHudOpen, setIsHudOpen] = useState(true);
  const [isContrastOpen, setIsContrastOpen] = useState(false);
  // Camera requests carry a nonce so pressing the same view again (e.g. "Peta Kawah" after
  // orbiting) still re-frames the camera = explicit camera reset (PRD FR-05).
  const [cameraCommand, setCameraCommand] = useState({ view: 'overview', nonce: 0 });
  const cameraView = cameraCommand.view;
  const requestCameraView = useCallback(
    (view) => setCameraCommand((prev) => ({ view, nonce: prev.nonce + 1 })),
    []
  );

  return (
    <div className="relative h-screen w-screen overflow-hidden select-none">
      {/* Lapisan Kanvas 3D Utama */}
      <LunarScene
        telemetry={telemetry}
        sites={sites}
        activeSite={activeSite}
        selectedSiteId={selectedSiteId}
        onSelectSite={setSelectedSiteId}
        activeEphemeris={activeEphemeris}
        activeVisibility={activeVisibility}
        cameraCommand={cameraCommand}
      />

      {/* Bar Telemetri Atas */}
      <TopTelemetryBar
        dataMode={dataMode}
        regionName={telemetry?.terrain_metadata?.region_name}
        activeSite={activeSite}
        uiMode={uiMode}
        onToggleUiMode={setUiMode}
        isHudOpen={isHudOpen}
        onToggleHud={() => setIsHudOpen((prev) => !prev)}
        onOpenContrast={() => setIsContrastOpen(true)}
      />

      {/* Panel Analisis Samping (Kiri & Kanan) */}
      {isHudOpen && (
        <aside className="pointer-events-none fixed inset-x-0 top-24 bottom-28 z-10 flex flex-col justify-between gap-3 overflow-y-auto px-4 lg:flex-row lg:items-start lg:overflow-visible">
          <div className="pointer-events-auto flex w-full max-w-sm flex-col gap-2.5">
            <MicroShiftDeltaCard
              sites={sites}
              selectedSiteId={selectedSiteId}
              onSelectSite={setSelectedSiteId}
              activeSite={activeSite}
              uiMode={uiMode}
            />

            {/* Kontrol Sudut Pandang Kamera 3D */}
            <div className="flex gap-2 rounded-xl border border-white/15 bg-[#0b101b]/80 p-1.5 backdrop-blur-md">
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
        totalSteps={totalSteps}
        onChangeTimeIndex={setTimeIndex}
        isPlaying={isPlaying}
        onTogglePlay={() => setIsPlaying((prev) => !prev)}
        activeEphemeris={activeEphemeris}
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