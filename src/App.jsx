import { useState } from 'react';
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

  return (
    <div className="relative h-screen w-screen overflow-hidden select-none">
      {/* Lapisan Kanvas 3D Utama */}
      <LunarScene
        telemetry={telemetry}
        sites={sites}
        selectedSiteId={selectedSiteId}
        onSelectSite={setSelectedSiteId}
        activeEphemeris={activeEphemeris}
        activeVisibility={activeVisibility}
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
        <aside className="pointer-events-none fixed inset-x-0 top-24 z-10 flex flex-col justify-between gap-3 px-4 lg:flex-row lg:items-start">
          <div className="pointer-events-auto w-full max-w-sm">
            <MicroShiftDeltaCard
              sites={sites}
              selectedSiteId={selectedSiteId}
              onSelectSite={setSelectedSiteId}
              activeSite={activeSite}
              uiMode={uiMode}
            />
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