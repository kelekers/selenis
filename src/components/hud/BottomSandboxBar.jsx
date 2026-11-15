import React, { useState } from 'react';
import {
  ChevronUp,
  Clock,
  Compass,
  Crosshair,
  Eye,
  Globe,
  Layers,
  MapPin,
  Maximize2,
  Move,
  Pause,
  Play,
  Plus,
  PlusCircle,
  RotateCcw,
  SkipBack,
  SkipForward,
  SlidersHorizontal,
  Sparkles,
  X,
} from 'lucide-react';
import {
  formatAngleShort,
  formatPercent,
  formatUtcLabel,
  stepIndex,
} from '../../utils/hudModel';
import { metricsForSite } from '../../utils/timeline';
import { MAX_SITES, SITE_LETTERS } from '../../utils/siteCalculations';

const SYNODIC_MONTH_DAYS = 29.5;

export function BottomSandboxBar({
  timeIndex,
  totalSteps,
  onChangeTimeIndex,
  isPlaying,
  onTogglePlay,
  playbackSpeed = 1,
  onChangePlaybackSpeed,
  activeEphemeris,
  regions = [],
  selectedRegionId,
  surfaceMode,
  onRegionChange,
  onToggleSurface,
  sites = [],
  selectedSiteId,
  onSelectSite,
  activeSite,
  onAddSite,
  placementMode,
  onPlacementModeChange,
  onResetSites,
  hasCustomSiteChanges,
  cameraView,
  onRequestCameraView,
  hasContextDataset,
  terrainConfig,
  onChangeTerrainConfig,
  uiMode,
  onToggleUiMode,
  onOpenContrast,
  isHudOpen,
  onToggleHud,
}) {
  // Active bottom drawer: null | 'regions' | 'sites' | 'camera'
  const [openDrawer, setOpenDrawer] = useState(null);

  const toggleDrawer = (drawerKey) => {
    setOpenDrawer((prev) => (prev === drawerKey ? null : drawerKey));
  };

  const formattedUtc = formatUtcLabel(activeEphemeris?.timestamp_utc) ?? 'Waktu tidak tersedia';
  const hasTimeline = totalSteps > 0;
  const progressPct =
    totalSteps > 1 ? Math.max(0, Math.min(100, (timeIndex / (totalSteps - 1)) * 100)) : 0;

  // Synodic day calculation (1 step = 1 hour)
  const synodicDayCurrent = hasTimeline
    ? (((timeIndex + 1) / 24) % SYNODIC_MONTH_DAYS).toFixed(1)
    : '0.0';

  const stepPrev = () => {
    if (!hasTimeline) return;
    onChangeTimeIndex(stepIndex(timeIndex, totalSteps, -1));
  };

  const stepNext = () => {
    if (!hasTimeline) return;
    onChangeTimeIndex(stepIndex(timeIndex, totalSteps, +1));
  };

  const cycleSpeed = () => {
    if (!onChangePlaybackSpeed) return;
    const speeds = [1, 2, 4];
    const next = speeds[(speeds.indexOf(playbackSpeed) + 1) % speeds.length] ?? 1;
    onChangePlaybackSpeed(next);
  };

  const visibleSites = sites.slice(0, MAX_SITES);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex flex-col select-none">
      {/* =====================================================================
          EXPANDABLE DRAWER ABOVE BOTTOM BAR (Universe Sandbox 2 Style)
         ===================================================================== */}
      {openDrawer && (
        <div
          data-testid={`sandbox-drawer-${openDrawer}`}
          className="pointer-events-auto mx-auto w-full max-w-5xl border-x border-t border-white/15 bg-[#0e1015]/95 shadow-2xl backdrop-blur-xl"
        >
          {/* Drawer Header Bar */}
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-2">
            <div className="flex items-center gap-3 text-xs font-medium text-slate-300">
              {openDrawer === 'regions' && (
                <>
                  <Globe className="h-4 w-4 text-amber-400" />
                  <span>Pilih Kawasan Medan Bulan & Overview Hemisfer Selatan</span>
                </>
              )}
              {openDrawer === 'sites' && (
                <>
                  <PlusCircle className="h-4 w-4 text-sky-400" />
                  <span>Kelola Titik Pendaratan (Site A–D) & Tambah/Pindah Lokasi</span>
                </>
              )}
              {openDrawer === 'camera' && (
                <>
                  <Eye className="h-4 w-4 text-emerald-400" />
                  <span>Sudut Pandang Kamera 3D & Lapisan Visual Medan</span>
                </>
              )}
            </div>
            <button
              type="button"
              onClick={() => setOpenDrawer(null)}
              aria-label="Tutup drawer bawah"
              className="rounded p-1 text-slate-400 transition hover:bg-white/10 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Drawer Content Grid */}
          <div className="max-h-56 overflow-y-auto p-4">
            {openDrawer === 'regions' && (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 md:grid-cols-5">
                {/* South Hemisphere Globe Card */}
                <button
                  type="button"
                  data-testid="surface-toggle"
                  onClick={() => {
                    if (surfaceMode !== 'hemisphere') onToggleSurface?.();
                  }}
                  className={`group flex flex-col items-center rounded-xl border p-3 text-center transition ${
                    surfaceMode === 'hemisphere'
                      ? 'border-amber-400 bg-amber-500/15'
                      : 'border-white/10 bg-white/[0.03] hover:border-white/25 hover:bg-white/[0.06]'
                  }`}
                >
                  <div
                    className="mb-2 flex h-14 w-14 items-center justify-center rounded-full shadow-inner transition-transform group-hover:scale-105"
                    style={{
                      background:
                        'radial-gradient(circle at 35% 30%, #cbd5e1 0%, #64748b 45%, #1e293b 80%, #090d16 100%)',
                    }}
                  >
                    <Globe className="h-6 w-6 text-white/80" />
                  </div>
                  <span className="text-xs font-semibold text-white">Hemisfer Selatan</span>
                  <span className="mt-0.5 text-[10px] text-slate-400">0°–90° LS Globe</span>
                </button>

                {/* Individual DEM Region Cards */}
                {regions.map((reg, idx) => {
                  const isSelected = surfaceMode !== 'hemisphere' && reg.id === selectedRegionId;
                  const gradients = [
                    'radial-gradient(circle at 35% 30%, #f59e0b 0%, #78350f 55%, #1c1917 95%)',
                    'radial-gradient(circle at 35% 30%, #38bdf8 0%, #1e3a8a 55%, #0f172a 95%)',
                    'radial-gradient(circle at 35% 30%, #a78bfa 0%, #4c1d95 55%, #1e1b4b 95%)',
                  ];
                  return (
                    <button
                      key={reg.id}
                      type="button"
                      onClick={() => {
                        onRegionChange?.(reg.id);
                      }}
                      className={`group flex flex-col items-center rounded-xl border p-3 text-center transition ${
                        isSelected
                          ? 'border-amber-400 bg-amber-500/15'
                          : 'border-white/10 bg-white/[0.03] hover:border-white/25 hover:bg-white/[0.06]'
                      }`}
                    >
                      <div
                        className="mb-2 flex h-14 w-14 items-center justify-center rounded-full font-mono text-xs font-bold text-white shadow-inner transition-transform group-hover:scale-105"
                        style={{ background: gradients[idx % gradients.length] }}
                      >
                        {reg.id.replace('SITE', 'S')}
                      </div>
                      <span className="line-clamp-1 text-xs font-semibold text-white">
                        {reg.name}
                      </span>
                      <span className="mt-0.5 text-[10px] text-slate-400">DEM Lokal 5 m</span>
                    </button>
                  );
                })}
              </div>
            )}

            {openDrawer === 'sites' && (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-6">
                {visibleSites.filter(Boolean).map((site, idx) => {
                  const letter = SITE_LETTERS[idx] ?? String(idx + 1);
                  const isSel = site.site_id === selectedSiteId;
                  const m = metricsForSite(site) ?? {};
                  return (
                    <button
                      key={site.site_id}
                      type="button"
                      onClick={() => onSelectSite?.(site.site_id)}
                      className={`flex flex-col items-center rounded-xl border p-3 text-center transition ${
                        isSel
                          ? 'border-amber-400 bg-amber-500/15'
                          : 'border-white/10 bg-white/[0.03] hover:border-white/25'
                      }`}
                    >
                      <div
                        className={`mb-2 flex h-12 w-12 items-center justify-center rounded-full border font-mono text-base font-bold ${
                          isSel
                            ? 'border-amber-300 bg-amber-500/30 text-amber-200'
                            : 'border-white/20 bg-white/5 text-slate-200'
                        }`}
                      >
                        {letter}
                      </div>
                      <span className="line-clamp-1 text-xs font-semibold text-white">
                        Site {letter}
                      </span>
                      <span className="mt-0.5 font-mono text-[10px] text-amber-300">
                        Surya {formatPercent(m.solar_illumination_pct)}
                      </span>
                      <span className="font-mono text-[9.5px] text-slate-400">
                        Slope {formatAngleShort(m.max_slope_deg)}
                      </span>
                    </button>
                  );
                })}

                {/* Add Site Action Card */}
                {onAddSite && (
                  <button
                    type="button"
                    disabled={visibleSites.length >= MAX_SITES}
                    onClick={() => {
                      onPlacementModeChange?.(placementMode === 'add' ? null : 'add');
                    }}
                    className={`flex flex-col items-center justify-center rounded-xl border border-dashed p-3 text-center transition ${
                      placementMode === 'add'
                        ? 'border-sky-400 bg-sky-500/20 text-sky-200'
                        : visibleSites.length >= MAX_SITES
                          ? 'cursor-not-allowed border-white/10 opacity-40'
                          : 'border-sky-400/40 bg-sky-500/5 text-sky-300 hover:bg-sky-500/15'
                    }`}
                  >
                    <Plus className="mb-1.5 h-8 w-8" />
                    <span className="text-xs font-semibold">Tambah Site</span>
                    <span className="mt-0.5 text-[10px] text-slate-400">Klik di Medan 3D</span>
                  </button>
                )}

                {/* Move Active Site Card */}
                <button
                  type="button"
                  disabled={!activeSite}
                  onClick={() => {
                    onPlacementModeChange?.(placementMode === 'move' ? null : 'move');
                  }}
                  className={`flex flex-col items-center justify-center rounded-xl border p-3 text-center transition ${
                    placementMode === 'move'
                      ? 'border-amber-400 bg-amber-500/20 text-amber-200'
                      : 'border-white/15 bg-white/[0.03] text-slate-200 hover:border-amber-400/40'
                  }`}
                >
                  <Move className="mb-1.5 h-7 w-7 text-amber-300" />
                  <span className="text-xs font-semibold">Pindah Site</span>
                  <span className="mt-0.5 text-[10px] text-slate-400">Geser Titik Aktif</span>
                </button>

                {hasCustomSiteChanges && onResetSites && (
                  <button
                    type="button"
                    onClick={() => {
                      onPlacementModeChange?.(null);
                      onResetSites();
                    }}
                    className="flex flex-col items-center justify-center rounded-xl border border-white/15 bg-white/[0.03] p-3 text-center text-slate-300 hover:border-rose-400/40 hover:text-rose-200"
                  >
                    <RotateCcw className="mb-1.5 h-7 w-7" />
                    <span className="text-xs font-semibold">Reset Site</span>
                    <span className="mt-0.5 text-[10px] text-slate-400">Data Awal</span>
                  </button>
                )}
              </div>
            )}

            {openDrawer === 'camera' && (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-6">
                {hasContextDataset && (
                  <button
                    type="button"
                    data-testid="context-view"
                    onClick={() => onRequestCameraView?.('context')}
                    className={`flex flex-col items-center justify-center rounded-xl border p-3 text-center transition ${
                      cameraView === 'context' && surfaceMode !== 'hemisphere'
                        ? 'border-amber-400 bg-amber-500/15 text-amber-200'
                        : 'border-white/10 bg-white/[0.03] text-slate-300 hover:border-white/25'
                    }`}
                  >
                    <Compass className="mb-1.5 h-6 w-6 text-amber-400" />
                    <span className="text-xs font-semibold">Area Luas</span>
                    <span className="mt-0.5 text-[10px] text-slate-400">Konteks 40×40 km</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => onRequestCameraView?.('overview')}
                  className={`flex flex-col items-center justify-center rounded-xl border p-3 text-center transition ${
                    cameraView === 'overview' && surfaceMode !== 'hemisphere'
                      ? 'border-amber-400 bg-amber-500/15 text-amber-200'
                      : 'border-white/10 bg-white/[0.03] text-slate-300 hover:border-white/25'
                  }`}
                >
                  <Maximize2 className="mb-1.5 h-6 w-6 text-sky-400" />
                  <span className="text-xs font-semibold">Peta Kawah</span>
                  <span className="mt-0.5 text-[10px] text-slate-400">Seluruh DEM Lokal</span>
                </button>

                <button
                  type="button"
                  onClick={() => onRequestCameraView?.('site')}
                  disabled={!activeSite}
                  className={`flex flex-col items-center justify-center rounded-xl border p-3 text-center transition ${
                    cameraView === 'site' && surfaceMode !== 'hemisphere'
                      ? 'border-amber-400 bg-amber-500/15 text-amber-200'
                      : 'border-white/10 bg-white/[0.03] text-slate-300 hover:border-white/25'
                  }`}
                >
                  <Crosshair className="mb-1.5 h-6 w-6 text-emerald-400" />
                  <span className="text-xs font-semibold">Fokus Site</span>
                  <span className="mt-0.5 text-[10px] text-slate-400">Dekat Lokasi Aktif</span>
                </button>

                <button
                  type="button"
                  onClick={() => onRequestCameraView?.('pov')}
                  disabled={!activeSite}
                  className={`flex flex-col items-center justify-center rounded-xl border p-3 text-center transition ${
                    cameraView === 'pov' && surfaceMode !== 'hemisphere'
                      ? 'border-amber-400 bg-amber-500/15 text-amber-200'
                      : 'border-white/10 bg-white/[0.03] text-slate-300 hover:border-white/25'
                  }`}
                >
                  <Eye className="mb-1.5 h-6 w-6 text-purple-400" />
                  <span className="text-xs font-semibold">360° Lander POV</span>
                  <span className="mt-0.5 text-[10px] text-slate-400">Sudut Pandang +2m</span>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    onChangeTerrainConfig?.((prev) => ({
                      ...prev,
                      terrainLayer: prev.terrainLayer === 'relief' ? 'roughness' : 'relief',
                    }))
                  }
                  className={`flex flex-col items-center justify-center rounded-xl border p-3 text-center transition ${
                    terrainConfig?.terrainLayer === 'roughness'
                      ? 'border-amber-400 bg-amber-500/15 text-amber-200'
                      : 'border-white/10 bg-white/[0.03] text-slate-300 hover:border-white/25'
                  }`}
                >
                  <Layers className="mb-1.5 h-6 w-6 text-amber-300" />
                  <span className="text-xs font-semibold">Roughness RMS</span>
                  <span className="mt-0.5 text-[10px] text-slate-400">Peta Kekasaran</span>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    onChangeTerrainConfig?.((prev) => ({
                      ...prev,
                      showBlockers: !prev.showBlockers,
                    }))
                  }
                  className={`flex flex-col items-center justify-center rounded-xl border p-3 text-center transition ${
                    terrainConfig?.showBlockers
                      ? 'border-amber-400 bg-amber-500/15 text-amber-200'
                      : 'border-white/10 bg-white/[0.03] text-slate-300 hover:border-white/25'
                  }`}
                >
                  <MapPin className="mb-1.5 h-6 w-6 text-yellow-300" />
                  <span className="text-xs font-semibold">Penentu Horizon</span>
                  <span className="mt-0.5 text-[10px] text-slate-400">Titik Punggungan</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* =====================================================================
          MAIN DOCKED BOTTOM BAR (Universe Sandbox 2 + Reference Image 1)
         ===================================================================== */}
      <footer
        aria-label="Kontrol Simulasi & Utilitas Bawah"
        data-testid="bottom-sandbox-bar"
        className="pointer-events-auto flex h-13 w-full items-center justify-between gap-3 border-t border-white/10 bg-[#0b0c0f]/95 px-3 text-slate-200 backdrop-blur-md"
      >
        {/* LEFT SECTION: Play/Pause, UTC Timestamp, Speed, Timeline Slider + Synodic Day */}
        <div className="flex min-w-0 flex-1 items-center gap-2.5 sm:gap-3.5">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={stepPrev}
              disabled={!hasTimeline}
              aria-label="Mundur satu langkah waktu"
              title="Mundur 1 jam"
              className="rounded p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-white disabled:opacity-40"
            >
              <SkipBack className="h-3.5 w-3.5" />
            </button>

            <button
              type="button"
              onClick={onTogglePlay}
              disabled={!hasTimeline}
              aria-pressed={isPlaying}
              aria-label={isPlaying ? 'Pause simulasi' : 'Mulai simulasi'}
              title={isPlaying ? 'Pause simulasi' : 'Jalankan simulasi'}
              className="flex h-8 w-8 items-center justify-center rounded-md bg-white/10 text-white transition hover:bg-amber-500 hover:text-slate-950 disabled:opacity-40"
            >
              {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </button>

            <button
              type="button"
              onClick={stepNext}
              disabled={!hasTimeline}
              aria-label="Maju satu langkah waktu"
              title="Maju 1 jam"
              className="rounded p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-white disabled:opacity-40"
            >
              <SkipForward className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Timestamp UTC (Matches Image 1 & 2 left timestamp) */}
          <span
            data-testid="active-utc"
            className="hidden shrink-0 font-mono text-[11.5px] font-medium text-slate-300 md:inline-block"
          >
            {formattedUtc}
          </span>

          {/* Speed / Step Rate Indicator (Matches Image 1 & 2 clock + rate) */}
          <button
            type="button"
            onClick={cycleSpeed}
            title="Kecepatan pemutaran simulasi (klik untuk ubah)"
            className="hidden shrink-0 items-center gap-1.5 rounded px-2 py-1 font-mono text-[11.5px] text-slate-300 transition hover:bg-white/10 sm:flex"
          >
            <Clock className="h-3.5 w-3.5 text-slate-400" />
            <span>{(playbackSpeed * 22.4).toFixed(1)}</span>
          </button>

          {/* Yellow/Amber Scrubber Bar + Synodic Day Label (Matches Image 1) */}
          <div className="flex min-w-[140px] max-w-md flex-1 items-center gap-3 rounded-md bg-[#121621] px-3 py-1.5">
            <div className="relative flex flex-1 items-center">
              <div className="pointer-events-none h-2 w-full overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-[#f59e0b]"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <input
                type="range"
                min={0}
                max={Math.max(0, totalSteps - 1)}
                value={timeIndex}
                onChange={(e) => onChangeTimeIndex(Number(e.target.value))}
                disabled={!hasTimeline}
                aria-label="Mission timeline hour scrubber"
                aria-valuetext={formattedUtc}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              />
              {/* Glowing Thumb */}
              <div
                aria-hidden="true"
                className="pointer-events-none absolute h-3.5 w-3.5 -translate-x-1/2 rounded-full border-2 border-amber-300 bg-white shadow-[0_0_10px_rgba(245,158,11,0.9)]"
                style={{ left: `${progressPct}%` }}
              />
            </div>

            <span className="shrink-0 font-mono text-[11px] font-medium text-[#7b93c9]">
              Synodic Day {synodicDayCurrent} / {SYNODIC_MONTH_DAYS}
            </span>
          </div>
        </div>

        {/* CENTER SECTION: Universe Sandbox 2 Style Tool Buttons (Regions, Add/Sites, View/Camera) */}
        <div className="flex items-center gap-1 sm:gap-2">
          {[
            { id: 'regions', label: 'region', Icon: Globe, title: 'Pilih Kawasan & Hemisfer' },
            { id: 'sites', label: 'add / site', Icon: PlusCircle, title: 'Pilih atau Tambah Site' },
            { id: 'camera', label: 'view', Icon: Eye, title: 'Kamera & Lapisan Medan' },
          ].map(({ id, label, Icon, title }) => {
            const isOpen = openDrawer === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => toggleDrawer(id)}
                title={title}
                data-testid={`sandbox-btn-${id}`}
                aria-expanded={isOpen}
                className={`flex h-11 min-w-[54px] flex-col items-center justify-center gap-0.5 border-b-2 px-2.5 text-[10px] transition ${
                  isOpen
                    ? 'border-white bg-white/10 text-white'
                    : 'border-transparent text-slate-400 hover:bg-white/5 hover:text-slate-200'
                }`}
              >
                <Icon className="h-4 w-4" />
                <span className="flex items-center gap-0.5 tracking-tight">
                  {label}
                  <ChevronUp
                    className={`h-2.5 w-2.5 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                  />
                </span>
              </button>
            );
          })}
        </div>

        {/* RIGHT SECTION: Universe Sandbox 2 Style Utility Buttons (Planner/Explorer, Contrast, HUD) */}
        <div className="flex items-center gap-1 sm:gap-1.5">
          <button
            type="button"
            onClick={() => onToggleUiMode?.(uiMode === 'planner' ? 'explorer' : 'planner')}
            title={`Mode aktif: ${uiMode === 'planner' ? 'Planner' : 'Explorer'} (klik untuk ganti)`}
            className="flex h-11 min-w-[52px] flex-col items-center justify-center gap-0.5 rounded px-2 text-[10px] text-slate-300 transition hover:bg-white/10 hover:text-white"
          >
            <SlidersHorizontal
              className={`h-4 w-4 ${uiMode === 'planner' ? 'text-amber-400' : 'text-sky-400'}`}
            />
            <span>{uiMode}</span>
          </button>

          <button
            type="button"
            onClick={onOpenContrast}
            title="Perbandingan Kutub Selatan Bulan vs Bumi"
            className="flex h-11 min-w-[52px] flex-col items-center justify-center gap-0.5 rounded px-2 text-[10px] text-slate-300 transition hover:bg-white/10 hover:text-white"
          >
            <Sparkles className="h-4 w-4 text-sky-400" />
            <span>contrast</span>
          </button>

          <button
            type="button"
            onClick={onToggleHud}
            aria-expanded={isHudOpen}
            title={isHudOpen ? 'Sembunyikan sidebar' : 'Tampilkan sidebar'}
            className={`flex h-11 min-w-[48px] flex-col items-center justify-center gap-0.5 rounded px-2 text-[10px] transition ${
              isHudOpen
                ? 'text-slate-300 hover:bg-white/10 hover:text-white'
                : 'bg-amber-500/20 text-amber-300'
            }`}
          >
            <Layers className="h-4 w-4" />
            <span>hud</span>
          </button>
        </div>
      </footer>
    </div>
  );
}
