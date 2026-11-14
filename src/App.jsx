import { useEphemerisData } from './hooks/useEphemerisData';
import { LunarScene } from './components/3d/LunarScene';

export function App() {
  const {
    dataMode,
    telemetry,
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

  return (
    <div className="relative h-screen w-screen overflow-hidden select-none">
      <LunarScene
        telemetry={telemetry}
        sites={sites}
        selectedSiteId={selectedSiteId}
        onSelectSite={setSelectedSiteId}
        activeEphemeris={activeEphemeris}
        activeVisibility={activeVisibility}
      />

      {/* Bar Uji Cepat Sprint 1 */}
      <div className="pointer-events-none fixed inset-x-0 top-4 z-10 flex justify-between px-6">
        <div className="pointer-events-auto rounded-xl border border-white/15 bg-[#0d121c]/80 px-4 py-2.5 backdrop-blur-md">
          <p className="text-[11px] tracking-widest text-amber-400 uppercase">
            SELENIS · {dataMode === 'ready' ? 'NASA DATA LIVE' : 'PREVIEW MODE'}
          </p>
          <h1 className="text-base font-semibold text-slate-100">{activeSite?.name}</h1>
        </div>

        <div className="pointer-events-auto flex gap-2">
          {sites.map((site, idx) => (
            <button
              key={site.site_id}
              type="button"
              onClick={() => setSelectedSiteId(site.site_id)}
              className={`rounded-lg border px-3 py-2 text-xs font-medium transition ${
                site.site_id === selectedSiteId
                  ? 'border-amber-400 bg-amber-500/20 text-amber-200'
                  : 'border-white/15 bg-[#0d121c]/80 text-slate-300 hover:border-white/30'
              }`}
            >
              Site {idx === 0 ? 'A' : 'B'}
            </button>
          ))}
        </div>
      </div>

      {/* Slider Linimasa Uji Bayangan */}
      <div className="pointer-events-none fixed inset-x-0 bottom-5 z-10 flex justify-center px-6">
        <div className="pointer-events-auto flex w-full max-w-2xl items-center gap-4 rounded-xl border border-white/15 bg-[#0d121c]/85 px-4 py-3 backdrop-blur-md">
          <button
            type="button"
            onClick={() => setIsPlaying((p) => !p)}
            className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-amber-400"
          >
            {isPlaying ? 'Pause' : 'Play'}
          </button>

          <input
            type="range"
            min={0}
            max={Math.max(0, totalSteps - 1)}
            value={timeIndex}
            onChange={(e) => setTimeIndex(Number(e.target.value))}
            className="h-1.5 flex-1 cursor-pointer accent-amber-400"
          />

          <div className="text-right font-mono text-xs text-slate-300">
            <div>{activeEphemeris?.timestamp_utc?.replace('T', ' ').slice(0, 16)} UTC</div>
            <div className="text-[11px] text-amber-300">
              Sun {activeEphemeris?.sun_vector?.elevation_deg}° · DTE{' '}
              {activeVisibility?.is_dte_active ? 'ACTIVE' : 'BLOCKED'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}