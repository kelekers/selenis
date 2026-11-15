import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRightLeft,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  Compass,
  Crosshair,
  Eye,
  Globe,
  Layers,
  MapPin,
  Maximize2,
  Move,
  Plus,
  Radio,
  RotateCcw,
  Sparkles,
  Sun,
  Trash2,
} from 'lucide-react';
import { metricsForSite } from '../../utils/timeline';
import {
  NO_VALUE,
  formatAngleShort,
  formatLatitude,
  formatLongitude,
  formatMeters,
  formatPercent,
  greatCircleDistanceM,
  visibilityLabel,
} from '../../utils/hudModel';
import {
  MAX_SITES,
  SITE_LETTERS,
  getPlacementUvBounds,
  getTileCoordinateRange,
  latLonToUv,
  uvToLatLon,
} from '../../utils/siteCalculations';
import { isValidSkyVector } from '../../utils/shadowMath';
import { HorizonPanoramaChart } from './HorizonPanoramaChart';

function deltaPoints(a, b) {
  return Number.isFinite(a) && Number.isFinite(b) ? Number((a - b).toFixed(1)) : null;
}
const signed = (v) => (v > 0 ? `+${v}` : `${v}`);
const hours = (v) => (Number.isFinite(v) ? `${v} jam` : NO_VALUE);

/** Icon for the circular orange compass/focus button in the top-right of the right sidebar */
function NorthArrowIcon({ className = 'h-5 w-5' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <path d="M12 3.5L18.5 19.5L12 15.8L5.5 19.5L12 3.5Z" fill="#f59e0b" />
    </svg>
  );
}

/** Metric row styled after Reference Image 1 (Label + square indicator + dark value box) */
function MetricValueRow({ label, value, subvalue, indicatorColor = 'bg-slate-200', testId }) {
  return (
    <div className="flex items-center justify-between gap-2.5 py-1">
      <span className="text-[12px] font-normal text-slate-300">{label}</span>
      <div className="flex items-center gap-2">
        <span className={`h-3 w-3 shrink-0 rounded-[2px] ${indicatorColor}`} aria-hidden="true" />
        <div
          data-testid={testId}
          className="min-w-[152px] rounded bg-[#1c1d22] px-2.5 py-1.5 text-right font-mono text-[11.5px] font-medium text-slate-100 shadow-inner"
        >
          <div>{value}</div>
          {subvalue && <div className="text-[9.5px] text-slate-400">{subvalue}</div>}
        </div>
      </div>
    </div>
  );
}

const NAVIGATE_SUBTABS = [
  { id: 'summary', label: 'Summary', Icon: Layers },
  { id: 'solar', label: 'Solar', Icon: Sun },
  { id: 'earth', label: 'Earth DTE', Icon: Radio },
  { id: 'horizon', label: 'Horizon', Icon: Eye },
];

export function RightSidebar({
  activeMainTab,
  sites = [],
  selectedSiteId,
  onSelectSite,
  activeSite,
  uiMode,
  regionName = 'Site01',
  terrainMetadata,
  ephemerisTimeline,
  activeEphemeris,
  activeVisibility,
  totalSteps = 0,
  onAddSite,
  onMoveSite,
  onRemoveSite,
  onResetSites,
  hasCustomSiteChanges = false,
  placementMode = null,
  onPlacementModeChange,
  cameraView,
  onRequestCameraView,
  onLookSkyBody,
  skyConfig,
  onChangeSkyConfig,
  terrainConfig,
  onChangeTerrainConfig,
  onOpenContrast,
  onScrollReportSection,
}) {
  const [navigateSubTab, setNavigateSubTab] = useState('summary');
  const [siteDropdownOpen, setSiteDropdownOpen] = useState(false);

  const visibleSites = sites.slice(0, MAX_SITES);
  const activeIndex = Math.max(
    0,
    visibleSites.findIndex((s) => s?.site_id === (activeSite?.site_id ?? selectedSiteId))
  );
  const activeLetter = SITE_LETTERS[activeIndex] ?? 'A';
  const activeMetrics = metricsForSite(activeSite);

  // Comparison pair for Micro-Shift Delta
  const primarySite = visibleSites.length > 2 && activeSite ? activeSite : visibleSites[0];
  const secondarySite =
    visibleSites.length > 2 && activeSite && activeSite.site_id !== visibleSites[0]?.site_id
      ? visibleSites[0]
      : visibleSites[1];

  const primaryLetter =
    SITE_LETTERS[visibleSites.findIndex((s) => s?.site_id === primarySite?.site_id)] ?? 'A';
  const secondaryLetter =
    SITE_LETTERS[visibleSites.findIndex((s) => s?.site_id === secondarySite?.site_id)] ?? 'B';

  const metricsA = metricsForSite(primarySite);
  const metricsB = metricsForSite(secondarySite);
  const solarDelta = deltaPoints(
    metricsA?.solar_illumination_pct,
    metricsB?.solar_illumination_pct
  );
  const dteDelta = deltaPoints(metricsA?.dte_availability_pct, metricsB?.dte_availability_pct);
  const separationM = greatCircleDistanceM(primarySite?.coordinates, secondarySite?.coordinates);
  const separationLabel = separationM === null ? NO_VALUE : `≈${formatMeters(separationM)}`;

  // Coordinates & Grazing angle
  const coords = activeSite?.coordinates;
  const coordsFormatted = coords
    ? `${formatLatitude(coords.latitude_deg, 2)}, ${formatLongitude(coords.longitude_deg, 2)}`
    : NO_VALUE;
  const coordsFull = coords
    ? `${formatLatitude(coords.latitude_deg)}, ${formatLongitude(coords.longitude_deg)}`
    : NO_VALUE;

  const sunVec = isValidSkyVector(activeEphemeris?.sun_vector) ? activeEphemeris.sun_vector : null;
  const earthVec = isValidSkyVector(activeEphemeris?.earth_vector)
    ? activeEphemeris.earth_vector
    : null;
  const isSunVisible = activeVisibility?.is_sun_visible ?? null;
  const isDteActive = activeVisibility?.is_dte_active ?? null;
  const sunVisLabel = visibilityLabel('sun', isSunVisible);
  const earthVisLabel = visibilityLabel('earth', isDteActive);

  // Determine status pill below "Site A" box (matching Image 1's green "optimal" or amber "caution")
  const isOptimal =
    activeMetrics?.safety_rating === 'OPTIMAL' ||
    (Number.isFinite(activeMetrics?.solar_illumination_pct) &&
      activeMetrics.solar_illumination_pct >= 70 &&
      (!Number.isFinite(activeMetrics?.max_slope_deg) || activeMetrics.max_slope_deg <= 10));

  // Custom coordinate form state
  const tileRange = useMemo(
    () => getTileCoordinateRange(terrainMetadata, sites),
    [terrainMetadata, sites]
  );
  const uvBounds = useMemo(() => getPlacementUvBounds(terrainMetadata), [terrainMetadata]);

  const [formName, setFormName] = useState('');
  const [formLat, setFormLat] = useState('');
  const [formLon, setFormLon] = useState('');
  const [formU, setFormU] = useState('0.5000');
  const [formV, setFormV] = useState('0.5000');
  const [coordNotice, setCoordNotice] = useState(null);

  const syncFormFromSite = (site) => {
    if (!site) return;
    setFormName(site.name ?? '');
    setFormLat(
      Number.isFinite(site.coordinates?.latitude_deg)
        ? String(Number(site.coordinates.latitude_deg.toFixed(5)))
        : ''
    );
    setFormLon(
      Number.isFinite(site.coordinates?.longitude_deg)
        ? String(Number(site.coordinates.longitude_deg.toFixed(5)))
        : ''
    );
    setFormU(
      Number.isFinite(site.coordinates?.uv?.u) ? site.coordinates.uv.u.toFixed(4) : '0.5000'
    );
    setFormV(
      Number.isFinite(site.coordinates?.uv?.v) ? site.coordinates.uv.v.toFixed(4) : '0.5000'
    );
    setCoordNotice(null);
  };

  const openAddMode = () => {
    if (visibleSites.length >= MAX_SITES) return;
    if (placementMode === 'add') {
      onPlacementModeChange?.(null);
      return;
    }
    const nextLetter = SITE_LETTERS[visibleSites.length] ?? 'C';
    const baseUv = activeSite?.coordinates?.uv ?? { u: 0.5, v: 0.5 };
    const defaultUv = {
      u: Number(
        Math.max(
          0.08,
          Math.min(0.92, baseUv.u + (visibleSites.length % 2 === 0 ? -0.05 : 0.05))
        ).toFixed(4)
      ),
      v: Number(Math.max(0.08, Math.min(0.92, baseUv.v + 0.05)).toFixed(4)),
    };
    const defaultLatLon = uvToLatLon(defaultUv, terrainMetadata, visibleSites);
    const regionShort = regionName?.split('/')[0]?.trim() || 'Site';
    setFormName(`${regionShort} Site ${nextLetter}`);
    setFormU(defaultUv.u.toFixed(4));
    setFormV(defaultUv.v.toFixed(4));
    setFormLat(defaultLatLon ? String(Number(defaultLatLon.latitude_deg.toFixed(5))) : '-89.4600');
    setFormLon(
      defaultLatLon ? String(Number(defaultLatLon.longitude_deg.toFixed(5))) : '-137.4000'
    );
    setCoordNotice(null);
    onPlacementModeChange?.('add');
  };

  const openMoveMode = () => {
    if (!activeSite) return;
    if (placementMode === 'move') {
      onPlacementModeChange?.(null);
      return;
    }
    syncFormFromSite(activeSite);
    onPlacementModeChange?.('move');
  };

  const handleLatLonChange = (nextLatStr, nextLonStr) => {
    setFormLat(nextLatStr);
    setFormLon(nextLonStr);
    const latNum = Number(nextLatStr);
    const lonNum = Number(nextLonStr);
    if (Number.isFinite(latNum) && Number.isFinite(lonNum) && latNum >= -90 && latNum <= 0) {
      const projected = latLonToUv(latNum, lonNum, terrainMetadata, visibleSites);
      if (projected) {
        setFormU(projected.u.toFixed(4));
        setFormV(projected.v.toFixed(4));
        setCoordNotice(
          projected.inBounds
            ? null
            : 'Koordinat berada di tepi/luar batas DEM lokal; disesuaikan ke batas terdekat tile.'
        );
      }
    }
  };

  const handleUvChange = (nextUStr, nextVStr) => {
    setFormU(nextUStr);
    setFormV(nextVStr);
    const uNum = Number(nextUStr);
    const vNum = Number(nextVStr);
    if (Number.isFinite(uNum) && Number.isFinite(vNum)) {
      const clampedU = Math.max(uvBounds.minU, Math.min(uvBounds.maxU, uNum));
      const clampedV = Math.max(uvBounds.minV, Math.min(uvBounds.maxV, vNum));
      const ll = uvToLatLon({ u: clampedU, v: clampedV }, terrainMetadata, visibleSites);
      if (ll) {
        setFormLat(String(Number(ll.latitude_deg.toFixed(5))));
        setFormLon(String(Number(ll.longitude_deg.toFixed(5))));
        setCoordNotice(null);
      }
    }
  };

  const handleSubmitCoordinates = (e) => {
    e.preventDefault();
    const uNum = Math.max(uvBounds.minU, Math.min(uvBounds.maxU, Number(formU)));
    const vNum = Math.max(uvBounds.minV, Math.min(uvBounds.maxV, Number(formV)));
    const latNum = Number(formLat);
    const lonNum = Number(formLon);
    if (!Number.isFinite(uNum) || !Number.isFinite(vNum)) return;

    const payload = {
      name: formName.trim() || undefined,
      uv: { u: uNum, v: vNum, extended: true },
      latitude_deg: Number.isFinite(latNum) ? latNum : undefined,
      longitude_deg: Number.isFinite(lonNum) ? lonNum : undefined,
    };

    if (placementMode === 'add') {
      onAddSite?.(payload);
      onPlacementModeChange?.(null);
    } else if (placementMode === 'move' && activeSite) {
      onMoveSite?.(activeSite.site_id, payload);
    }
  };

  const solarPct = activeMetrics?.solar_illumination_pct;
  const dtePct = activeMetrics?.dte_availability_pct;

  return (
    <aside
      aria-label="Panel Inspektor & Tools Kanan"
      data-testid="right-sidebar"
      className="pointer-events-auto relative z-20 flex h-full w-80 shrink-0 flex-col border-l border-white/10 bg-[#111214]/95 text-slate-100 select-none sm:w-[340px]"
    >
      {/* Top Site Header (Site A Box + Optimal Badge + Orange Compass Button) */}
      <div className="border-b border-white/10 px-4 pt-4 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="relative min-w-0 flex-1">
            <button
              type="button"
              onClick={() => setSiteDropdownOpen((prev) => !prev)}
              data-testid="site-selector-header"
              className="flex w-full items-center justify-between rounded-md border border-[#5a67a6]/80 bg-[#13151d] px-3.5 py-1.5 text-left transition hover:border-[#7886c7]"
            >
              <div className="min-w-0">
                <div className="text-[22px] font-semibold leading-tight tracking-tight text-white">
                  Site {activeLetter}
                </div>
                <div className="truncate text-[10.5px] text-slate-400">
                  {activeSite?.name ?? `Landing Site ${activeLetter}`}
                </div>
              </div>
              <ChevronDown
                className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${
                  siteDropdownOpen ? 'rotate-180' : ''
                }`}
              />
            </button>

            {/* Quick Site Switcher Dropdown */}
            {siteDropdownOpen && (
              <div className="absolute inset-x-0 top-full z-30 mt-1.5 overflow-hidden rounded-lg border border-white/15 bg-[#161821] p-1.5 shadow-2xl">
                {visibleSites.filter(Boolean).map((site, idx) => {
                  const letter = SITE_LETTERS[idx] ?? String(idx + 1);
                  const isSel = site.site_id === selectedSiteId;
                  const m = metricsForSite(site) ?? {};
                  const canDelete = visibleSites.length > 2 && idx >= 2 && Boolean(onRemoveSite);
                  return (
                    <div
                      key={site.site_id}
                      className={`flex items-center justify-between rounded-md px-2.5 py-1.5 text-xs transition ${
                        isSel
                          ? 'bg-amber-500/20 text-amber-200'
                          : 'text-slate-200 hover:bg-white/[0.06]'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          onSelectSite(site.site_id);
                          setSiteDropdownOpen(false);
                          if (placementMode === 'move') syncFormFromSite(site);
                        }}
                        className="flex flex-1 items-center justify-between pr-2 text-left"
                      >
                        <span className="font-semibold">
                          Site {letter}{' '}
                          <span className="font-normal text-slate-400">· {site.name}</span>
                        </span>
                        <span className="font-mono text-[10px] text-amber-300">
                          {formatPercent(m.solar_illumination_pct)}
                        </span>
                      </button>
                      {canDelete && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onRemoveSite(site.site_id);
                          }}
                          title={`Hapus Site ${letter}`}
                          className="rounded p-1 text-slate-400 hover:bg-rose-500/20 hover:text-rose-300"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  );
                })}
                {onAddSite && visibleSites.length < MAX_SITES && (
                  <button
                    type="button"
                    onClick={() => {
                      setSiteDropdownOpen(false);
                      openAddMode();
                    }}
                    className="mt-1 flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-sky-400/40 bg-sky-500/10 py-1.5 text-[11px] font-medium text-sky-300 hover:bg-sky-500/20"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Tambah Site Baru ({visibleSites.length}/{MAX_SITES})
                  </button>
                )}
              </div>
            )}

            {/* Optimal / Screening Status Row below Site A Box */}
            <div className="mt-2 flex items-center justify-between px-1">
              <div className="flex items-center gap-1.5">
                {isOptimal ? (
                  <>
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    <span className="text-xs font-medium text-emerald-400">optimal</span>
                  </>
                ) : (
                  <>
                    <AlertTriangle className="h-4 w-4 text-amber-400" />
                    <span className="text-xs font-medium text-amber-400">
                      {activeSite?.terrain_screening?.rating?.toLowerCase() ?? 'caution'}
                    </span>
                  </>
                )}
              </div>
              {coords && (
                <span
                  data-testid="site-coordinates"
                  className="font-mono text-[10px] text-slate-400"
                >
                  Elev {formatMeters(coords.elevation_m)}
                </span>
              )}
            </div>
          </div>

          {/* Circular Compass / Focus Site Button (Top Right of Right Sidebar) */}
          <button
            type="button"
            onClick={() => onRequestCameraView?.(activeMainTab === 'view' ? 'pov' : 'site')}
            disabled={!activeSite}
            title="Fokus kamera ke lokasi Site aktif"
            aria-label="Fokus kamera ke lokasi Site aktif"
            data-testid="focus-site-compass-btn"
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-white/25 bg-[#18191e] shadow-md transition hover:border-amber-400/60 hover:bg-[#22242c] active:scale-95 disabled:opacity-40"
          >
            <NorthArrowIcon className="h-6 w-6" />
          </button>
        </div>
      </div>

      {/* =====================================================================
          MODE 1: NAVIGATE TAB TOOLS (Summary, Solar, Earth DTE, Horizon)
         ===================================================================== */}
      {activeMainTab === 'navigate' && (
        <>
          {/* 4 Sub-tabs Row */}
          <div
            role="tablist"
            aria-label="Sub-panel analisis lokasi"
            className="grid grid-cols-4 border-b border-white/10 px-3 pt-2"
          >
            {NAVIGATE_SUBTABS.map(({ id, label, Icon }) => {
              const isAct = navigateSubTab === id;
              return (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={isAct}
                  data-testid={`right-subtab-${id}`}
                  onClick={() => setNavigateSubTab(id)}
                  className={`flex flex-col items-center gap-1.5 border-b-2 pb-2.5 pt-1 text-[11px] font-medium transition ${
                    isAct
                      ? 'border-white text-white'
                      : 'border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <span
                    className={`flex h-6 w-6 items-center justify-center rounded ${
                      isAct ? 'bg-white text-black' : 'bg-white/15 text-slate-300'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <span>{label}</span>
                </button>
              );
            })}
          </div>

          {/* Scrollable Sub-tab Body */}
          <div className="flex-1 space-y-3.5 overflow-y-auto px-4 py-3.5">
            {navigateSubTab === 'summary' && (
              <>
                <MetricValueRow
                  label="Coordinates"
                  value={coordsFormatted}
                  testId="summary-coordinates"
                />

                {/* Sunlight Availability Progress Bar (Matches Image 1) */}
                <div className="space-y-1.5 py-1">
                  <div className="flex items-center justify-between text-[12px]">
                    <span className="text-slate-300">Sunlight Availability</span>
                    <span className="font-mono font-semibold text-amber-300">
                      {formatPercent(solarPct)}
                    </span>
                  </div>
                  <div className="h-2.5 w-full overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-[#f5a623] transition-all duration-300"
                      style={{
                        width: `${Math.max(0, Math.min(100, Number(solarPct) || 0))}%`,
                      }}
                    />
                  </div>
                </div>

                <MetricValueRow
                  label="Longest Darkness"
                  value={hours(activeMetrics?.max_eclipse_hours)}
                  subvalue={coordsFormatted}
                  indicatorColor="bg-slate-200"
                />

                <MetricValueRow
                  label="Earth Direct Link"
                  value={formatPercent(dtePct)}
                  subvalue={coordsFormatted}
                  indicatorColor="bg-emerald-300"
                />

                <MetricValueRow
                  label="Max Ground Slope"
                  value={formatAngleShort(activeMetrics?.max_slope_deg)}
                  subvalue={coordsFormatted}
                  indicatorColor="bg-amber-300"
                />

                <MetricValueRow
                  label="Sun Grazing Angle"
                  value={
                    sunVec
                      ? `${formatAngleShort(sunVec.elevation_deg)} (Az ${formatAngleShort(sunVec.azimuth_deg)})`
                      : NO_VALUE
                  }
                  subvalue={coordsFormatted}
                  indicatorColor="bg-amber-400"
                />

                {/* Quick Site Switcher Grid (Site A, B, C, D) */}
                <div className="pt-2">
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="font-mono text-[10px] font-semibold tracking-wider text-slate-400 uppercase">
                      Perbandingan Cepat Site ({visibleSites.length}/{MAX_SITES})
                    </span>
                    <span className="font-mono text-[10px] text-amber-300">{separationLabel}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5" data-testid="site-cards-grid">
                    {visibleSites.filter(Boolean).map((site, index) => {
                      const isSelected = site.site_id === selectedSiteId;
                      const m = metricsForSite(site) ?? {};
                      const letter = SITE_LETTERS[index] ?? String(index + 1);
                      return (
                        <button
                          key={site.site_id}
                          type="button"
                          data-testid={`site-card-${letter}`}
                          onClick={() => {
                            onSelectSite(site.site_id);
                            if (placementMode === 'move') syncFormFromSite(site);
                          }}
                          aria-pressed={isSelected}
                          className={`rounded-lg border p-2 text-left transition ${
                            isSelected
                              ? 'border-amber-400 bg-amber-500/15'
                              : 'border-white/10 bg-white/[0.03] hover:border-white/25'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-mono text-[11px] font-bold text-amber-300">
                              SITE {letter}
                            </span>
                            <span className="font-mono text-[9.5px] text-slate-400">
                              {formatAngleShort(m.max_slope_deg)}
                            </span>
                          </div>
                          <div className="mt-1 flex justify-between font-mono text-[10px] text-slate-300">
                            <span>Surya {formatPercent(m.solar_illumination_pct)}</span>
                            <span className="text-emerald-300">
                              DTE {formatPercent(m.dte_availability_pct)}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Micro-Shift Delta Summary Box */}
                {solarDelta !== null && dteDelta !== null && (
                  <div className="rounded-lg border border-amber-400/20 bg-amber-500/10 p-2.5 text-[11px] text-slate-200">
                    <div className="mb-1 flex items-center gap-1.5 font-mono text-[10px] font-semibold text-amber-300 uppercase">
                      <ArrowRightLeft className="h-3.5 w-3.5" />
                      <span>
                        Micro-Shift Δ ({primaryLetter} vs {secondaryLetter} · {separationLabel})
                      </span>
                    </div>
                    {uiMode === 'planner' ? (
                      <div className="flex flex-wrap justify-between gap-1 font-mono text-[10px]">
                        <span>Δ Solar: {signed(solarDelta)} pp</span>
                        <span className="text-emerald-300">Δ DTE: {signed(dteDelta)} pp</span>
                      </div>
                    ) : (
                      <p className="text-[10.5px] leading-relaxed text-slate-300">
                        Pergeseran {separationLabel} mengubah sinar Matahari sebesar{' '}
                        <strong className="text-amber-300">{signed(solarDelta)} pp</strong> dan
                        visibilitas Bumi{' '}
                        <strong className="text-emerald-300">{signed(dteDelta)} pp</strong>.
                      </p>
                    )}
                  </div>
                )}

                {/* Add / Move Site Action Buttons */}
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {onAddSite && (
                    <button
                      type="button"
                      data-testid="add-site-button"
                      disabled={visibleSites.length >= MAX_SITES}
                      onClick={openAddMode}
                      className={`flex flex-1 items-center justify-center gap-1 rounded-lg border px-2.5 py-1.5 text-[11px] font-medium transition ${
                        placementMode === 'add'
                          ? 'border-sky-400 bg-sky-500/25 text-sky-200'
                          : 'border-white/15 bg-white/[0.04] text-slate-200 hover:border-sky-400/40'
                      }`}
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <span>Tambah Site</span>
                    </button>
                  )}
                  {onMoveSite && activeSite && (
                    <button
                      type="button"
                      data-testid="move-site-button"
                      onClick={openMoveMode}
                      className={`flex flex-1 items-center justify-center gap-1 rounded-lg border px-2.5 py-1.5 text-[11px] font-medium transition ${
                        placementMode === 'move'
                          ? 'border-amber-400 bg-amber-500/25 text-amber-200'
                          : 'border-white/15 bg-white/[0.04] text-slate-200 hover:border-amber-400/40'
                      }`}
                    >
                      <Move className="h-3.5 w-3.5" />
                      <span>Pindah Site {activeLetter}</span>
                    </button>
                  )}
                  {hasCustomSiteChanges && onResetSites && (
                    <button
                      type="button"
                      data-testid="reset-sites-button"
                      onClick={() => {
                        onPlacementModeChange?.(null);
                        onResetSites();
                      }}
                      className="rounded-lg border border-white/15 bg-white/[0.04] px-2 py-1.5 text-[11px] text-slate-300 hover:text-white"
                      title="Reset ke site bawaan"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </>
            )}

            {navigateSubTab === 'solar' && (
              <div className="space-y-3">
                <div className="rounded-xl border border-amber-400/25 bg-amber-500/10 p-3">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-xs font-semibold text-amber-300">
                      <Sun className="h-4 w-4" />
                      Ketersediaan Sinar Surya
                    </span>
                    <span className="font-mono text-sm font-bold text-amber-300">
                      {formatPercent(solarPct)}
                    </span>
                  </div>
                  <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-black/40">
                    <div
                      className="h-full rounded-full bg-amber-400"
                      style={{ width: `${Math.max(0, Math.min(100, Number(solarPct) || 0))}%` }}
                    />
                  </div>
                  <p className="mt-2 text-[11px] text-slate-300">{sunVisLabel.text}</p>
                </div>

                <MetricValueRow
                  label="Azimut Matahari"
                  value={sunVec ? formatAngleShort(sunVec.azimuth_deg) : NO_VALUE}
                  indicatorColor="bg-amber-400"
                />
                <MetricValueRow
                  label="Elevasi Matahari"
                  value={sunVec ? formatAngleShort(sunVec.elevation_deg) : NO_VALUE}
                  indicatorColor="bg-amber-300"
                />
                <MetricValueRow
                  label="Tinggi Bibir Kawah (Rim)"
                  value={
                    Number.isFinite(activeVisibility?.sun_horizon_deg)
                      ? formatAngleShort(activeVisibility.sun_horizon_deg)
                      : NO_VALUE
                  }
                  indicatorColor="bg-slate-400"
                />
                <MetricValueRow
                  label="Gelap Terlama (Eclipse)"
                  value={hours(activeMetrics?.max_eclipse_hours)}
                  indicatorColor="bg-rose-400"
                />
                <MetricValueRow
                  label="Baseline 0° (Tanpa Medan)"
                  value={formatPercent(activeSite?.summary_metrics?.solar_illumination_pct)}
                  indicatorColor="bg-slate-300"
                />

                <button
                  type="button"
                  onClick={() => onLookSkyBody?.('sun')}
                  className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-amber-400/40 bg-amber-500/20 py-2 text-xs font-semibold text-amber-200 transition hover:bg-amber-500/30"
                >
                  <Sun className="h-4 w-4" />
                  Arahkan Kamera 3D ke Matahari
                </button>
              </div>
            )}

            {navigateSubTab === 'earth' && (
              <div className="space-y-3">
                <div className="rounded-xl border border-emerald-400/25 bg-emerald-500/10 p-3">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-300">
                      <Radio className="h-4 w-4" />
                      Visibilitas Geometris Bumi (DTE)
                    </span>
                    <span className="font-mono text-sm font-bold text-emerald-300">
                      {formatPercent(dtePct)}
                    </span>
                  </div>
                  <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-black/40">
                    <div
                      className="h-full rounded-full bg-emerald-400"
                      style={{ width: `${Math.max(0, Math.min(100, Number(dtePct) || 0))}%` }}
                    />
                  </div>
                  <p className="mt-2 text-[11px] text-slate-300">{earthVisLabel.text}</p>
                </div>

                <MetricValueRow
                  label="Azimut Bumi"
                  value={earthVec ? formatAngleShort(earthVec.azimuth_deg) : NO_VALUE}
                  indicatorColor="bg-sky-400"
                />
                <MetricValueRow
                  label="Elevasi Bumi"
                  value={earthVec ? formatAngleShort(earthVec.elevation_deg) : NO_VALUE}
                  indicatorColor="bg-emerald-300"
                />
                <MetricValueRow
                  label="Bibir Kawah Arah Bumi"
                  value={
                    Number.isFinite(activeVisibility?.earth_horizon_deg)
                      ? formatAngleShort(activeVisibility.earth_horizon_deg)
                      : NO_VALUE
                  }
                  indicatorColor="bg-slate-400"
                />
                <MetricValueRow
                  label="Selisih DTE (Δ Site)"
                  value={dteDelta !== null ? `${signed(dteDelta)} pp` : NO_VALUE}
                  indicatorColor="bg-emerald-400"
                />

                <p className="rounded-lg border border-white/10 bg-white/[0.03] p-2.5 text-[11px] leading-relaxed text-slate-300">
                  Bumi bergerak mengikuti pola librasi di dekat cakrawala. Nilai di atas adalah
                  garis pandang geometris (Line-of-Sight) terhadap medan lokal, bukan jaminan
                  kualitas sinyal radio.
                </p>

                <button
                  type="button"
                  onClick={() => onLookSkyBody?.('earth')}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-sky-400/40 bg-sky-500/20 py-2 text-xs font-semibold text-sky-200 transition hover:bg-sky-500/30"
                >
                  <Globe className="h-4 w-4" />
                  Arahkan Kamera 3D ke Bumi
                </button>
              </div>
            )}

            {navigateSubTab === 'horizon' && (
              <div className="space-y-3">
                <HorizonPanoramaChart
                  activeSite={activeSite}
                  ephemerisTimeline={ephemerisTimeline}
                  activeEphemeris={activeEphemeris}
                  activeVisibility={activeVisibility}
                  uiMode={uiMode}
                />

                {/* Terrain Overlay Toggles */}
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                  <div className="mb-2 font-mono text-[10px] font-semibold tracking-wider text-slate-400 uppercase">
                    Lapisan Medan & Horizon 3D
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() =>
                        onChangeTerrainConfig?.((prev) => ({
                          ...prev,
                          terrainLayer: prev.terrainLayer === 'relief' ? 'roughness' : 'relief',
                        }))
                      }
                      className={`flex-1 rounded-lg border px-2.5 py-1.5 text-[11px] font-medium transition ${
                        terrainConfig?.terrainLayer === 'roughness'
                          ? 'border-amber-400 bg-amber-500/20 text-amber-200'
                          : 'border-white/15 bg-white/5 text-slate-300 hover:text-white'
                      }`}
                    >
                      {terrainConfig?.terrainLayer === 'roughness'
                        ? 'Layer: Roughness RMS'
                        : 'Lihat Roughness RMS'}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        onChangeTerrainConfig?.((prev) => ({
                          ...prev,
                          showBlockers: !prev.showBlockers,
                        }))
                      }
                      className={`flex-1 rounded-lg border px-2.5 py-1.5 text-[11px] font-medium transition ${
                        terrainConfig?.showBlockers
                          ? 'border-amber-400 bg-amber-500/20 text-amber-200'
                          : 'border-white/15 bg-white/5 text-slate-300 hover:text-white'
                      }`}
                    >
                      Penentu Horizon
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Coordinate Form (Shown whenever placementMode is 'add' or 'move') */}
            {placementMode && (
              <form
                onSubmit={handleSubmitCoordinates}
                data-testid="site-coordinate-form"
                className="space-y-2 rounded-xl border border-sky-400/35 bg-[#0a0e17] p-3 text-[11px]"
              >
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1 font-mono text-[10px] font-semibold text-sky-300 uppercase">
                    <MapPin className="h-3.5 w-3.5" />
                    {placementMode === 'add'
                      ? `Tambah Site ${SITE_LETTERS[visibleSites.length] ?? 'Baru'}`
                      : `Pindah Site ${activeLetter}`}
                  </span>
                  <button
                    type="button"
                    onClick={() => onPlacementModeChange?.(null)}
                    className="rounded px-1.5 py-0.5 text-[10px] text-slate-400 hover:bg-white/10 hover:text-white"
                  >
                    Tutup
                  </button>
                </div>
                <p className="text-[10px] text-slate-300">
                  Klik langsung pada medan 3D di tengah atau isi koordinat di bawah:
                </p>
                <label className="block font-mono text-[10px] text-slate-400">
                  Nama Site
                  <input
                    type="text"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    data-testid="site-name-input"
                    className="mt-0.5 w-full rounded border border-white/15 bg-black/60 px-2 py-1 text-xs text-slate-100"
                  />
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="block font-mono text-[10px] text-slate-400">
                    Lintang (Lat °)
                    <input
                      type="number"
                      step="0.0005"
                      min="-90"
                      max="0"
                      value={formLat}
                      onChange={(e) => handleLatLonChange(e.target.value, formLon)}
                      data-testid="site-lat-input"
                      className="mt-0.5 w-full rounded border border-white/15 bg-black/60 px-2 py-1 font-mono text-xs text-slate-100"
                    />
                  </label>
                  <label className="block font-mono text-[10px] text-slate-400">
                    Bujur (Lon °)
                    <input
                      type="number"
                      step="0.005"
                      min="-180"
                      max="180"
                      value={formLon}
                      onChange={(e) => handleLatLonChange(formLat, e.target.value)}
                      data-testid="site-lon-input"
                      className="mt-0.5 w-full rounded border border-white/15 bg-black/60 px-2 py-1 font-mono text-xs text-slate-100"
                    />
                  </label>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <label className="block font-mono text-[10px] text-slate-400">
                    Tile U ({uvBounds.minU}..{uvBounds.maxU})
                    <input
                      type="number"
                      step="0.01"
                      min={uvBounds.minU}
                      max={uvBounds.maxU}
                      value={formU}
                      onChange={(e) => handleUvChange(e.target.value, formV)}
                      data-testid="site-u-input"
                      className="mt-0.5 w-full rounded border border-white/15 bg-black/60 px-2 py-1 font-mono text-xs text-slate-100"
                    />
                  </label>
                  <label className="block font-mono text-[10px] text-slate-400">
                    Tile V ({uvBounds.minV}..{uvBounds.maxV})
                    <input
                      type="number"
                      step="0.01"
                      min={uvBounds.minV}
                      max={uvBounds.maxV}
                      value={formV}
                      onChange={(e) => handleUvChange(formU, e.target.value)}
                      data-testid="site-v-input"
                      className="mt-0.5 w-full rounded border border-white/15 bg-black/60 px-2 py-1 font-mono text-xs text-slate-100"
                    />
                  </label>
                </div>
                {tileRange && (
                  <p className="font-mono text-[9px] text-slate-400">
                    DEM: Lat {tileRange.minLat}°..{tileRange.maxLat}° · Lon {tileRange.minLon}°..
                    {tileRange.maxLon}°
                  </p>
                )}
                {coordNotice && <p className="text-[10px] text-amber-300">{coordNotice}</p>}
                <button
                  type="submit"
                  data-testid="apply-site-coordinates"
                  className="w-full rounded-md bg-amber-500 py-1.5 font-semibold text-slate-950 transition hover:bg-amber-400"
                >
                  {placementMode === 'add' ? 'Simpan & Hitung Site Baru' : 'Terapkan Koordinat'}
                </button>
              </form>
            )}
          </div>
        </>
      )}

      {/* =====================================================================
          MODE 2: VIEW TAB TOOLS (360° Panorama & Sky Dome Controls)
         ===================================================================== */}
      {activeMainTab === 'view' && (
        <div className="flex-1 space-y-3.5 overflow-y-auto px-4 py-3.5">
          <div className="flex items-center justify-between border-b border-white/10 pb-2">
            <span className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-amber-300 uppercase">
              <Compass className="h-4 w-4" />
              360° Panorama & Sky Tools
            </span>
            <span className="font-mono text-[10px] text-slate-400">POV +2,0 m</span>
          </div>

          {/* Synchronized 2D 360° Horizon Chart */}
          <HorizonPanoramaChart
            activeSite={activeSite}
            ephemerisTimeline={ephemerisTimeline}
            activeEphemeris={activeEphemeris}
            activeVisibility={activeVisibility}
            uiMode={uiMode}
          />

          {/* Camera & Sky Target Shortcuts */}
          <div className="rounded-xl border border-white/15 bg-[#161820] p-3">
            <div className="mb-2 font-mono text-[10px] font-semibold tracking-wider text-slate-400 uppercase">
              Arahkan Pandangan 360°
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => onLookSkyBody?.('sun')}
                className="flex items-center justify-center gap-1.5 rounded-lg border border-amber-400/35 bg-amber-500/15 px-2.5 py-2 text-xs font-medium text-amber-200 transition hover:bg-amber-500/25"
              >
                <Sun className="h-3.5 w-3.5" />
                Lihat Matahari
              </button>
              <button
                type="button"
                onClick={() => onLookSkyBody?.('earth')}
                className="flex items-center justify-center gap-1.5 rounded-lg border border-sky-400/35 bg-sky-500/15 px-2.5 py-2 text-xs font-medium text-sky-200 transition hover:bg-sky-500/25"
              >
                <Globe className="h-3.5 w-3.5" />
                Lihat Bumi
              </button>
              <button
                type="button"
                onClick={() => onRequestCameraView?.('pov')}
                className={`flex items-center justify-center gap-1.5 rounded-lg border px-2.5 py-2 text-xs font-medium transition ${
                  cameraView === 'pov'
                    ? 'border-white/40 bg-white/15 text-white'
                    : 'border-white/10 bg-white/5 text-slate-300 hover:text-white'
                }`}
              >
                <Crosshair className="h-3.5 w-3.5" />
                Reset POV Lander
              </button>
              <button
                type="button"
                onClick={() => onRequestCameraView?.('overview')}
                className="flex items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-2 text-xs font-medium text-slate-300 transition hover:text-white"
              >
                <Maximize2 className="h-3.5 w-3.5" />
                Peta Kawah
              </button>
            </div>
          </div>

          {/* 3D Sky Dome Display Settings */}
          <div className="space-y-2.5 rounded-xl border border-white/15 bg-[#161820] p-3">
            <div className="font-mono text-[10px] font-semibold tracking-wider text-slate-400 uppercase">
              Mode Langit & Jejak Lintasan
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => onChangeSkyConfig?.((prev) => ({ ...prev, skyMode: 'small' }))}
                className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition ${
                  skyConfig?.skyMode === 'small'
                    ? 'border-sky-400 bg-sky-500/20 text-sky-100'
                    : 'border-white/10 bg-white/5 text-slate-400 hover:text-slate-200'
                }`}
              >
                Kubah 360° & Jejak
              </button>
              <button
                type="button"
                onClick={() => onChangeSkyConfig?.((prev) => ({ ...prev, skyMode: 'big' }))}
                className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition ${
                  skyConfig?.skyMode === 'big'
                    ? 'border-sky-400 bg-sky-500/20 text-sky-100'
                    : 'border-white/10 bg-white/5 text-slate-400 hover:text-slate-200'
                }`}
              >
                Model 3D NASA
              </button>
            </div>

            {skyConfig?.skyMode === 'big' && (
              <div className="grid grid-cols-2 gap-1.5 pt-1">
                <button
                  type="button"
                  onClick={() =>
                    onChangeSkyConfig?.((prev) => ({ ...prev, sizeMode: 'enlarged' }))
                  }
                  className={`rounded-md border px-2 py-1 text-[11px] transition ${
                    skyConfig?.sizeMode === 'enlarged'
                      ? 'border-amber-400/50 bg-amber-500/20 text-amber-200'
                      : 'border-white/10 text-slate-400'
                  }`}
                >
                  Diperbesar 6,4×
                </button>
                <button
                  type="button"
                  onClick={() => onChangeSkyConfig?.((prev) => ({ ...prev, sizeMode: 'true' }))}
                  className={`rounded-md border px-2 py-1 text-[11px] transition ${
                    skyConfig?.sizeMode === 'true'
                      ? 'border-amber-400/50 bg-amber-500/20 text-amber-200'
                      : 'border-white/10 text-slate-400'
                  }`}
                >
                  Ukuran Nyata
                </button>
              </div>
            )}

            <div className="flex flex-wrap gap-1.5 pt-1">
              {[
                { key: 'horizon', label: 'Cincin Horizon' },
                { key: 'tracks', label: 'Jejak Lintasan' },
                { key: 'lines', label: 'Garis Arah' },
                { key: 'compass', label: 'Kompas' },
              ].map(({ key, label }) => {
                const active = Boolean(skyConfig?.layers?.[key]);
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() =>
                      onChangeSkyConfig?.((prev) => ({
                        ...prev,
                        layers: { ...prev.layers, [key]: !prev.layers?.[key] },
                      }))
                    }
                    className={`rounded-md border px-2 py-1 text-[11px] transition ${
                      active
                        ? 'border-white/30 bg-white/15 text-white'
                        : 'border-white/10 bg-white/[0.02] text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Live Horizon Clearance Metrics */}
          <div className="space-y-1.5 rounded-xl border border-white/10 bg-white/[0.02] p-3">
            <MetricValueRow
              label="Sun El vs Rim"
              value={
                sunVec && Number.isFinite(activeVisibility?.sun_horizon_deg)
                  ? `${formatAngleShort(sunVec.elevation_deg)} vs ${formatAngleShort(activeVisibility.sun_horizon_deg)}`
                  : NO_VALUE
              }
              indicatorColor={isSunVisible ? 'bg-amber-400' : 'bg-slate-500'}
            />
            <MetricValueRow
              label="Earth El vs Rim"
              value={
                earthVec && Number.isFinite(activeVisibility?.earth_horizon_deg)
                  ? `${formatAngleShort(earthVec.elevation_deg)} vs ${formatAngleShort(activeVisibility.earth_horizon_deg)}`
                  : NO_VALUE
              }
              indicatorColor={isDteActive ? 'bg-emerald-400' : 'bg-rose-500'}
            />
          </div>
        </div>
      )}

      {/* =====================================================================
          MODE 3: READ TAB TOOLS (Comprehensive Summary & Report Navigation)
         ===================================================================== */}
      {activeMainTab === 'read' && (
        <div className="flex-1 space-y-3.5 overflow-y-auto px-4 py-3.5">
          <div className="flex items-center justify-between border-b border-white/10 pb-2">
            <span className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-amber-300 uppercase">
              <BookOpen className="h-4 w-4" />
              Ringkasan & Navigasi Laporan
            </span>
          </div>

          {/* Section Jump Links */}
          <div className="space-y-1.5 rounded-xl border border-white/15 bg-[#161820] p-3">
            <div className="mb-1 font-mono text-[10px] font-semibold tracking-wider text-slate-400 uppercase">
              Daftar Isi Laporan Ilmiah
            </div>
            {[
              { id: 'hemisphere-heading', label: '1. Overview Belahan Selatan (LOLA)' },
              { id: selectedSiteId, label: `2. Metrik Lokasi Aktif (${activeSite?.name ?? 'Site'})` },
              { id: 'terrain-heading', label: '3. Cakupan DEM, Roughness & Validasi' },
              { id: 'contrast-section', label: '4. Kontras Lingkungan Bulan vs Bumi' },
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onScrollReportSection?.(item.id)}
                className="flex w-full items-center justify-between rounded-lg border border-white/5 bg-white/[0.03] px-3 py-2 text-left text-xs text-slate-200 transition hover:border-amber-400/40 hover:bg-white/[0.07] hover:text-amber-200"
              >
                <span className="truncate">{item.label}</span>
              </button>
            ))}
          </div>

          {/* Quick Key Metrics Snapshot */}
          <div className="space-y-2 rounded-xl border border-white/15 bg-[#161820] p-3">
            <div className="font-mono text-[10px] font-semibold tracking-wider text-slate-400 uppercase">
              Ikhtisar Metrik Site {activeLetter}
            </div>
            <MetricValueRow label="Koordinat" value={coordsFull} indicatorColor="bg-slate-200" />
            <MetricValueRow
              label="Sinar Surya (Lokal)"
              value={formatPercent(solarPct)}
              indicatorColor="bg-amber-400"
            />
            <MetricValueRow
              label="Visibilitas Bumi"
              value={formatPercent(dtePct)}
              indicatorColor="bg-emerald-400"
            />
            <MetricValueRow
              label="Durasi Gelap Maks"
              value={hours(activeMetrics?.max_eclipse_hours)}
              indicatorColor="bg-rose-400"
            />
            <MetricValueRow
              label="Jendela Simulasi"
              value={`${totalSteps} jam`}
              indicatorColor="bg-sky-400"
            />
          </div>

          {/* Button to open Lunar vs Earth Contrast Modal */}
          <button
            type="button"
            onClick={onOpenContrast}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-sky-400/35 bg-sky-500/15 px-3 py-2.5 text-xs font-semibold text-sky-200 transition hover:bg-sky-500/25"
          >
            <Sparkles className="h-4 w-4 text-sky-300" />
            Buka Tabel Kontras Bulan vs Bumi
          </button>
        </div>
      )}
    </aside>
  );
}
