import { Compass, Globe, Layers, SlidersHorizontal } from 'lucide-react';

export function TopTelemetryBar({
  dataMode,
  regionName,
  activeSite,
  uiMode,
  onToggleUiMode,
  isHudOpen,
  onToggleHud,
  onOpenContrast,
}) {
  const coords = activeSite?.coordinates;

  return (
    <header className="pointer-events-none fixed inset-x-0 top-0 z-20 flex flex-wrap items-start justify-between gap-3 p-4">
      {/* Identitas Proyek & Lokasi Aktif */}
      <div className="pointer-events-auto flex items-center gap-3 rounded-xl border border-white/15 bg-[#0b101b]/80 px-4 py-2.5 shadow-lg backdrop-blur-md">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-amber-400/30 bg-amber-500/15 text-amber-400">
          <Compass className="h-5 w-5" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-bold tracking-widest text-amber-400">
              SELENIS
            </span>
            <span
              className={`rounded-full px-2 py-0.5 font-mono text-[10px] font-medium ${
                dataMode === 'ready'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/30'
                  : 'bg-sky-500/20 text-sky-300 border border-sky-400/30'
              }`}
            >
              {dataMode === 'ready' ? 'NASA DATA LIVE' : 'SCAFFOLD PREVIEW'}
            </span>
          </div>
          <h1 className="text-sm font-semibold text-slate-100">
            {regionName || 'Lunar South Pole Navigator'}
          </h1>
          {coords && (
            <p className="font-mono text-[11px] text-slate-400">
              {coords.latitude_deg.toFixed(4)}°S, {coords.longitude_deg.toFixed(4)}°E · Elev{' '}
              {coords.elevation_m.toFixed(0)} m
            </p>
          )}
        </div>
      </div>

      {/* Kontrol Mode & Utilitas */}
      <div className="pointer-events-auto flex flex-wrap items-center gap-2">
        {/* Sakelar Planner Mode vs Explorer Mode */}
        <div className="flex rounded-xl border border-white/15 bg-[#0b101b]/80 p-1 backdrop-blur-md">
          <button
            type="button"
            onClick={() => onToggleUiMode('planner')}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
              uiMode === 'planner'
                ? 'bg-amber-500 text-slate-950 shadow-sm'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Planner
          </button>
          <button
            type="button"
            onClick={() => onToggleUiMode('explorer')}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
              uiMode === 'explorer'
                ? 'bg-sky-400 text-slate-950 shadow-sm'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            <Compass className="h-3.5 w-3.5" />
            Explorer
          </button>
        </div>

        {/* Tombol Kontras Bulan vs Bumi */}
        <button
          type="button"
          onClick={onOpenContrast}
          className="flex items-center gap-1.5 rounded-xl border border-white/15 bg-[#0b101b]/80 px-3.5 py-2.5 text-xs font-medium text-slate-200 backdrop-blur-md transition hover:border-amber-400/40 hover:text-amber-200"
        >
          <Globe className="h-3.5 w-3.5 text-sky-400" />
          Bulan vs Bumi
        </button>

        {/* Tombol Sembunyikan/Tampilkan Panel HUD */}
        <button
          type="button"
          onClick={onToggleHud}
          className="flex items-center gap-1.5 rounded-xl border border-white/15 bg-[#0b101b]/80 px-3 py-2.5 text-xs font-medium text-slate-300 backdrop-blur-md transition hover:border-white/30 hover:text-white"
          title="Sembunyikan atau tampilkan panel analisis"
        >
          <Layers className="h-3.5 w-3.5" />
          {isHudOpen ? 'Sembunyikan HUD' : 'Tampilkan HUD'}
        </button>
      </div>
    </header>
  );
}