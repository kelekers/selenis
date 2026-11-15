import React, { useMemo, useRef, useState } from 'react';
import { metricsForSite } from '../../utils/timeline';
import {
  NO_VALUE,
  formatAngleShort,
  formatLatitude,
  formatLongitude,
  formatMeters,
  formatPercent,
  formatRegionLabel,
  greatCircleDistanceM,
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
import { HeaderCompassDial } from '../3d/sky/SkyCompass';
import { HorizonPanoramaChart } from './HorizonPanoramaChart';

function deltaPoints(a, b) {
  return Number.isFinite(a) && Number.isFinite(b) ? Number((a - b).toFixed(1)) : null;
}
const signed = (v) => (v > 0 ? `+${v}` : `${v}`);
const hours = (v) => (Number.isFinite(v) ? `${v} hrs` : NO_VALUE);

function MaterialIcon({ name, className = 'text-[17px]' }) {
  return (
    <span className={`material-symbols-outlined select-none ${className}`} aria-hidden="true">
      {name}
    </span>
  );
}

/**
 * Viewport-clamped fixed tooltip so information cards are never clipped by sidebar scroll/overflow containers.
 */
function InfoTooltip({ text }) {
  const triggerRef = useRef(null);
  const [pos, setPos] = useState(null);

  const updatePos = () => {
    const el = triggerRef.current;
    if (!el || typeof window === 'undefined') return;
    const rect = el.getBoundingClientRect();
    const width = 220;
    const left = Math.max(12, Math.min(window.innerWidth - width - 12, rect.right - width / 2));
    const showAbove = rect.bottom + 110 > window.innerHeight && rect.top > 120;
    setPos({
      left,
      top: showAbove ? rect.top - 8 : rect.bottom + 8,
      showAbove,
    });
  };

  return (
    <span
      ref={triggerRef}
      onMouseEnter={updatePos}
      onFocus={updatePos}
      onMouseLeave={() => setPos(null)}
      onBlur={() => setPos(null)}
      className="group relative inline-flex shrink-0 items-center"
    >
      <span
        tabIndex={0}
        className="material-symbols-outlined cursor-help text-[14px] text-[#7c818c] transition hover:text-white focus:text-white focus:outline-none"
        aria-label={text}
      >
        info
      </span>
      <span
        role="tooltip"
        style={
          pos
            ? {
                position: 'fixed',
                left: `${pos.left}px`,
                top: `${pos.top}px`,
                transform: pos.showAbove ? 'translateY(-100%)' : 'none',
              }
            : undefined
        }
        className={`pointer-events-none z-[100] w-[220px] rounded bg-[#22252d] px-3 py-2 text-[10.5px] leading-relaxed font-normal whitespace-normal text-[#e5e7eb] shadow-2xl transition-opacity duration-150 ${
          pos ? 'visible opacity-100' : 'invisible fixed opacity-0'
        }`}
      >
        {text}
      </span>
    </span>
  );
}

/**
 * Clean, aligned metric row using Plus Jakarta Sans (`font-jakarta`) and Google Material Symbols.
 */
function MetricValueRow({ label, icon, value, tooltip, testId }) {
  return (
    <div className="font-jakarta grid grid-cols-[1fr_auto] items-center gap-2.5 py-1">
      <div className="flex min-w-0 items-center gap-1.5 text-[12px] font-normal text-[#b4b8c2]">
        <span className="truncate">{label}</span>
        {tooltip && <InfoTooltip text={tooltip} />}
      </div>
      <div className="flex items-center gap-2">
        <MaterialIcon name={icon} className="text-[16px] text-[#8e939e]" />
        <div
          data-testid={testId}
          className="w-[148px] rounded bg-[#16181d] px-2.5 py-1.5 text-right font-jakarta text-[12px] font-medium tabular-nums text-white"
        >
          <div className="truncate">{value}</div>
        </div>
      </div>
    </div>
  );
}

const NAVIGATE_SUBTABS = [
  { id: 'summary', label: 'Summary', icon: 'space_dashboard' },
  { id: 'solar', label: 'Solar', icon: 'wb_sunny' },
  { id: 'earth', label: 'Earth DTE', icon: 'satellite_alt' },
  { id: 'horizon', label: 'Horizon', icon: 'panorama_horizontal' },
];

/** Site suitability: 'optimal' (green) · 'moderate' (yellow) · 'caution' (red). */
export function rateSite(metrics) {
  const sun = metrics?.solar_illumination_pct;
  const slope = metrics?.max_slope_deg;
  if (metrics?.safety_rating === 'OPTIMAL') return 'optimal';
  if (!Number.isFinite(sun)) return 'caution';
  const slopeOk = !Number.isFinite(slope) || slope <= 10;
  const slopeFair = !Number.isFinite(slope) || slope <= 15;
  if (sun >= 70 && slopeOk) return 'optimal';
  if (sun >= 50 && slopeFair) return 'moderate';
  return 'caution';
}

export const RATING_STYLE = {
  optimal: {
    chip: 'bg-emerald-500/15 text-emerald-300',
    icon: 'check_circle',
    accent: '#34d399',
    label: 'Optimal',
  },
  moderate: {
    chip: 'bg-amber-400/15 text-amber-300',
    icon: 'error',
    accent: '#fbbf24',
    label: 'Moderate',
  },
  caution: {
    chip: 'bg-red-500/15 text-red-300',
    icon: 'warning',
    accent: '#f87171',
    label: 'Caution',
  },
};

export function RightSidebar({
  activeMainTab,
  collapsed: controlledCollapsed,
  onToggleCollapse,
  sites = [],
  selectedSiteId,
  onSelectSite,
  activeSite,
  uiMode = 'planner',
  regionName = 'Region 01',
  terrainMetadata,
  ephemerisTimeline,
  activeEphemeris,
  activeVisibility,
  totalSteps = 0,
  onAddSite,
  onMoveSite,
  onRenameSite,
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
  onScrollReportSection,
  compassApiRef,
}) {
  const [internalCollapsed, setInternalCollapsed] = useState(false);
  const isCollapsed = controlledCollapsed ?? internalCollapsed;
  const handleToggleCollapse = () => {
    if (onToggleCollapse) {
      onToggleCollapse();
    } else {
      setInternalCollapsed((prev) => !prev);
    }
  };

  const [navigateSubTab, setNavigateSubTab] = useState('summary');
  const [siteDropdownOpen, setSiteDropdownOpen] = useState(false);
  const [isRenamingSite, setIsRenamingSite] = useState(false);
  const [renameDraft, setRenameDraft] = useState('');

  const isPlanner = uiMode === 'planner';

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

  const siteRating = rateSite(activeMetrics);
  const isOptimal = siteRating === 'optimal';

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
    const regionShort = formatRegionLabel(regionName?.split('/')[0]?.trim()) || 'Region 01';
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
            : 'Coordinates are near/outside local DEM bounds; clamped to nearest tile edge.'
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

  const ratingStyle = RATING_STYLE[siteRating];
  const statusChipLabel = siteRating;
  const siteInfoSummary = `${formatRegionLabel(activeSite?.name) || `Site ${activeLetter}`}${
    coords?.elevation_m !== undefined ? ` · Elev ${formatMeters(coords.elevation_m)}` : ''
  } · Screening: ${ratingStyle.label}`;

  const startRenamingSite = (e) => {
    e?.stopPropagation?.();
    if (!activeSite) return;
    setSiteDropdownOpen(false);
    setRenameDraft(formatRegionLabel(activeSite.name) || `Site ${activeLetter}`);
    setIsRenamingSite(true);
  };

  const submitRenameSite = (e) => {
    e?.preventDefault?.();
    const cleaned = renameDraft.trim();
    if (activeSite && cleaned) {
      if (onRenameSite) {
        onRenameSite(activeSite.site_id, cleaned);
      } else if (onMoveSite) {
        onMoveSite(activeSite.site_id, { name: cleaned });
      }
    }
    setIsRenamingSite(false);
  };

  const customDisplayName = formatRegionLabel(activeSite?.name);
  const showCustomSuffix =
    customDisplayName &&
    customDisplayName.toLowerCase() !== `site ${activeLetter}`.toLowerCase();

  const compassVisible = skyConfig?.layers?.compass !== false;
  const handleCompassClick = () => {
    onRequestCameraView?.(activeMainTab === 'view' ? 'pov' : 'site');
  };

  // When collapsed, show the live 3D Compass (if compass toggle in Options is ON) and Expand button
  if (isCollapsed) {
    return (
      <aside
        aria-label="Collapsed Right Sidebar with Live Compass"
        data-testid="right-sidebar-collapsed"
        className="font-jakarta pointer-events-auto absolute top-3 right-3 z-20 flex items-center gap-1.5 rounded bg-[#0b0c0e]/95 p-1.5 text-white shadow-xl select-none"
      >
        {compassVisible && (
          <HeaderCompassDial
            apiRef={compassApiRef}
            sunLocal={activeEphemeris?.sun_vector}
            earthLocal={activeEphemeris?.earth_vector}
            isSunVisible={activeVisibility?.is_sun_visible}
            isDteActive={activeVisibility?.is_dte_active}
            compassVisible={compassVisible}
            disabled={!activeSite}
            onClick={handleCompassClick}
          />
        )}
        <button
          type="button"
          onClick={handleToggleCollapse}
          aria-label="Expand right sidebar"
          title="Expand inspector sidebar"
          data-testid="toggle-right-sidebar"
          className="flex h-9 w-9 items-center justify-center rounded bg-[#16181d] text-[#8e939e] transition hover:bg-[#23262d] hover:text-white"
        >
          <MaterialIcon name="right_panel_open" className="text-[19px]" />
        </button>
      </aside>
    );
  }

  return (
    <aside
      aria-label="Right Site Inspector & Tools"
      data-testid="right-sidebar"
      className="font-jakarta pointer-events-auto relative z-20 flex h-full w-80 shrink-0 flex-col border-l border-white/[0.06] bg-[#0b0c0e]/95 text-white select-none sm:w-[344px]"
    >
      {/* Top Site Header (Renamable Site Box + Status Chip Below + Live 3D Compass Dial + Collapse Toggle) */}
      <div className="border-b border-white/[0.06] px-3.5 pt-3.5 pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="relative min-w-0 flex-1">
            {isRenamingSite ? (
              <form
                onSubmit={submitRenameSite}
                data-testid="site-rename-form"
                className="flex w-full items-center gap-1 rounded bg-[#16181d] px-2.5 py-1.5"
              >
                <input
                  type="text"
                  value={renameDraft}
                  onChange={(e) => setRenameDraft(e.target.value)}
                  autoFocus
                  aria-label="Rename active landing site"
                  data-testid="site-rename-input"
                  className="min-w-0 flex-1 bg-transparent text-[14px] font-semibold text-white focus:outline-none"
                />
                <button
                  type="submit"
                  title="Save site name"
                  aria-label="Save site name"
                  className="flex h-6 w-6 items-center justify-center rounded-sm bg-[#252830] text-white hover:bg-[#323641]"
                >
                  <MaterialIcon name="check" className="text-[15px]" />
                </button>
                <button
                  type="button"
                  onClick={() => setIsRenamingSite(false)}
                  title="Cancel rename"
                  aria-label="Cancel rename"
                  className="flex h-6 w-6 items-center justify-center rounded-sm text-[#8e939e] hover:bg-[#23262d] hover:text-white"
                >
                  <MaterialIcon name="close" className="text-[15px]" />
                </button>
              </form>
            ) : (
              <div className="flex w-full items-center rounded bg-[#16181d] transition hover:bg-[#1d2026]">
                <button
                  type="button"
                  onClick={() => setSiteDropdownOpen((prev) => !prev)}
                  data-testid="site-selector-header"
                  className="flex min-w-0 flex-1 items-center justify-between py-2 pr-1.5 pl-3 text-left"
                >
                  <div className="min-w-0 truncate">
                    <span className="text-[17px] font-semibold leading-tight tracking-tight text-white">
                      Site {activeLetter}
                    </span>
                    {showCustomSuffix && (
                      <span className="ml-1.5 text-[12px] font-normal text-[#9ca3af]">
                        · {customDisplayName}
                      </span>
                    )}
                  </div>
                  <MaterialIcon
                    name="expand_more"
                    className={`shrink-0 text-[18px] text-[#8e939e] transition-transform ${
                      siteDropdownOpen ? 'rotate-180' : ''
                    }`}
                  />
                </button>
                <button
                  type="button"
                  onClick={startRenamingSite}
                  data-testid="rename-site-btn"
                  title="Rename landing site"
                  aria-label="Rename landing site"
                  className="mr-1.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-sm text-[#8e939e] transition hover:bg-[#252830] hover:text-white"
                >
                  <MaterialIcon name="edit" className="text-[15px]" />
                </button>
              </div>
            )}

            {/* Status Chip (Optimal / Moderate / Caution) — green / yellow / red */}
            <div className="mt-1.5 flex items-center justify-between px-0.5">
              <div className="flex items-center gap-1.5">
                <span
                  data-testid="site-rating-chip"
                  className={`inline-flex items-center gap-1 rounded-sm px-2 py-0.5 text-[10px] font-semibold tracking-wider uppercase ${ratingStyle.chip}`}
                >
                  <MaterialIcon name={ratingStyle.icon} className="text-[12px]" />
                  {statusChipLabel}
                </span>
                {isPlanner && <InfoTooltip text={siteInfoSummary} />}
              </div>
              {coords?.elevation_m !== undefined && (
                <span
                  data-testid="site-coordinates"
                  className="text-[10.5px] font-normal tabular-nums text-[#7c818c]"
                >
                  {formatMeters(coords.elevation_m)}
                </span>
              )}
            </div>

            {/* Quick Site Switcher Dropdown */}
            {siteDropdownOpen && (
              <div className="absolute inset-x-0 top-full z-30 mt-1 overflow-hidden rounded bg-[#14161b] p-1 shadow-2xl">
                {visibleSites.filter(Boolean).map((site, idx) => {
                  const letter = SITE_LETTERS[idx] ?? String(idx + 1);
                  const isSel = site.site_id === selectedSiteId;
                  const m = metricsForSite(site) ?? {};
                  const canDelete = visibleSites.length > 2 && idx >= 2 && Boolean(onRemoveSite);
                  return (
                    <div
                      key={site.site_id}
                      className={`flex items-center justify-between rounded-sm px-2.5 py-1.5 text-xs transition ${
                        isSel
                          ? 'bg-[#252830] text-white'
                          : 'text-[#b4b8c2] hover:bg-[#1c1f26] hover:text-white'
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
                        <span className="font-semibold text-white">
                          Site {letter}{' '}
                          <span className="font-normal text-[#8e939e]">
                            · {formatRegionLabel(site.name)}
                          </span>
                        </span>
                        <span className="tabular-nums text-[11px] font-medium text-[#d1d5db]">
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
                          title={`Remove Site ${letter}`}
                          aria-label={`Remove Site ${letter}`}
                          className="rounded-sm p-1 text-[#8e939e] hover:bg-[#2c303a] hover:text-white"
                        >
                          <MaterialIcon name="delete" className="text-[14px]" />
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
                    className="mt-1 flex w-full items-center justify-center gap-1 rounded-sm bg-[#1c1f26] py-1.5 text-[11px] font-medium text-white hover:bg-[#252830]"
                  >
                    <MaterialIcon name="add" className="text-[15px]" />
                    Add New Site ({visibleSites.length}/{MAX_SITES})
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Collapse Right Sidebar Button (Compass is only shown when sidebar is collapsed) */}
          <button
            type="button"
            onClick={handleToggleCollapse}
            aria-label="Collapse right sidebar"
            title="Collapse sidebar"
            data-testid="toggle-right-sidebar"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-[#16181d] text-[#8e939e] transition hover:bg-[#23262d] hover:text-white"
          >
            <MaterialIcon name="right_panel_close" className="text-[18px]" />
          </button>
        </div>
      </div>

      {/* =====================================================================
          MODE 1: NAVIGATE TAB — DISTINCT EXPLORER (GENERAL) VS PLANNER (PRO)
         ===================================================================== */}
      {activeMainTab === 'navigate' && !isPlanner && (
        <div
          data-testid="explorer-overview"
          className="flex-1 space-y-2.5 overflow-y-auto px-3.5 py-3"
        >
          {/* Suitability Verdict — colored by rating */}
          <div
            className="rounded p-3"
            style={{
              background: `linear-gradient(135deg, ${ratingStyle.accent}26 0%, ${ratingStyle.accent}08 100%)`,
            }}
          >
            <div className="flex items-center gap-2.5">
              <div
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
                style={{ backgroundColor: `${ratingStyle.accent}33`, color: ratingStyle.accent }}
              >
                <MaterialIcon name={ratingStyle.icon} className="text-[20px]" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-bold" style={{ color: ratingStyle.accent }}>
                  {ratingStyle.label} Landing Zone
                </div>
                <div className="text-[11px] tabular-nums text-[#b4b8c2]">{coordsFormatted}</div>
              </div>
            </div>
          </div>

          {/* Metric Tiles */}
          <div className="grid grid-cols-2 gap-2">
            {/* Sunlight */}
            <div className="rounded bg-amber-400/10 p-3">
              <div className="flex items-center justify-between">
                <MaterialIcon name="wb_sunny" className="text-[18px] text-amber-300" />
                <span
                  className={`h-2 w-2 rounded-full ${
                    isSunVisible === true ? 'bg-amber-300' : 'bg-white/20'
                  }`}
                  title={isSunVisible === true ? 'In sunlight now' : 'In shadow now'}
                />
              </div>
              <div className="mt-2 text-xl font-bold tabular-nums text-amber-200">
                {formatPercent(solarPct)}
              </div>
              <div className="text-[11px] font-medium text-amber-200/70">Sunlight</div>
              <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-black/30">
                <div
                  className="h-full rounded-full bg-amber-300"
                  style={{ width: `${Math.max(0, Math.min(100, Number(solarPct) || 0))}%` }}
                />
              </div>
            </div>

            {/* Earth Link */}
            <div className="rounded bg-sky-400/10 p-3">
              <div className="flex items-center justify-between">
                <MaterialIcon name="public" className="text-[18px] text-sky-300" />
                <span
                  className={`h-2 w-2 rounded-full ${
                    isDteActive === true ? 'bg-sky-300' : 'bg-white/20'
                  }`}
                  title={isDteActive === true ? 'Earth visible now' : 'Earth hidden now'}
                />
              </div>
              <div className="mt-2 text-xl font-bold tabular-nums text-sky-200">
                {formatPercent(dtePct)}
              </div>
              <div className="text-[11px] font-medium text-sky-200/70">Earth Link</div>
              <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-black/30">
                <div
                  className="h-full rounded-full bg-sky-300"
                  style={{ width: `${Math.max(0, Math.min(100, Number(dtePct) || 0))}%` }}
                />
              </div>
            </div>

            {/* Longest Night */}
            <div className="rounded bg-violet-400/10 p-3">
              <MaterialIcon name="dark_mode" className="text-[18px] text-violet-300" />
              <div className="mt-2 text-xl font-bold tabular-nums text-violet-200">
                {Number.isFinite(activeMetrics?.max_eclipse_hours)
                  ? `${(activeMetrics.max_eclipse_hours / 24).toFixed(1)} d`
                  : NO_VALUE}
              </div>
              <div className="text-[11px] font-medium text-violet-200/70">Longest Night</div>
            </div>

            {/* Slope */}
            <div className="rounded bg-emerald-400/10 p-3">
              <MaterialIcon name="terrain" className="text-[18px] text-emerald-300" />
              <div className="mt-2 text-xl font-bold tabular-nums text-emerald-200">
                {formatAngleShort(activeMetrics?.max_slope_deg)}
              </div>
              <div className="text-[11px] font-medium text-emerald-200/70">Ground Slope</div>
            </div>
          </div>

          {/* Site Switcher — colored by each site's rating */}
          <div className="grid grid-cols-2 gap-1.5 pt-1" data-testid="site-cards-grid">
            {visibleSites.filter(Boolean).map((site, index) => {
              const isSelected = site.site_id === selectedSiteId;
              const m = metricsForSite(site) ?? {};
              const letter = SITE_LETTERS[index] ?? String(index + 1);
              const rs = RATING_STYLE[rateSite(m)];
              return (
                <button
                  key={site.site_id}
                  type="button"
                  data-testid={`site-card-${letter}`}
                  onClick={() => onSelectSite(site.site_id)}
                  aria-pressed={isSelected}
                  className={`flex items-center gap-2 rounded p-2 text-left transition ${
                    isSelected ? 'bg-[#252830]' : 'bg-[#15171c] hover:bg-[#1c1f26]'
                  }`}
                  style={isSelected ? { boxShadow: `inset 0 0 0 1px ${rs.accent}` } : undefined}
                >
                  <span
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-xs font-bold text-[#0b0c0e]"
                    style={{ backgroundColor: rs.accent }}
                  >
                    {letter}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-xs font-semibold text-white">Site {letter}</span>
                    <span className="block text-[10.5px] tabular-nums text-amber-200/80">
                      {formatPercent(m.solar_illumination_pct)} sun
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {activeMainTab === 'navigate' && isPlanner && (
        <>
          {/* 4 Sub-tabs Row: Single Full-Box Tabs (Brighter when Active, No Inner Icon Box) */}
          <div
            role="tablist"
            aria-label="Site analysis sub-panels"
            className="grid grid-cols-4 gap-1 border-b border-white/[0.06] px-3.5 py-2"
          >
            {NAVIGATE_SUBTABS.map(({ id, label, icon }) => {
              const isAct = navigateSubTab === id;
              return (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={isAct}
                  data-testid={`right-subtab-${id}`}
                  onClick={() => setNavigateSubTab(id)}
                  className={`flex flex-col items-center justify-center gap-1 rounded py-2 px-1 text-[11px] font-medium transition ${
                    isAct
                      ? 'bg-[#252830] text-white'
                      : 'bg-[#14161b] text-[#8e939e] hover:bg-[#1b1e25] hover:text-white'
                  }`}
                >
                  <MaterialIcon name={icon} className="text-[17px]" />
                  <span>{label}</span>
                </button>
              );
            })}
          </div>

          {/* Scrollable Sub-tab Body */}
          <div className="flex-1 space-y-3 overflow-y-auto px-3.5 py-3">
            {navigateSubTab === 'summary' && (
              <>
                <div className="space-y-1">
                  <MetricValueRow
                    label="Coordinates"
                    icon="my_location"
                    value={isPlanner ? coordsFull : coordsFormatted}
                    testId="summary-coordinates"
                  />

                  {/* Sunlight Availability Progress Bar */}
                  <div className="space-y-1.5 py-1.5">
                    <div className="flex items-center justify-between text-[12px]">
                      <span className="font-normal text-[#b4b8c2]">Sunlight Availability</span>
                      <span className="font-semibold tabular-nums text-white">
                        {formatPercent(solarPct)}
                      </span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-sm bg-[#16181d]">
                      <div
                        className="h-full rounded-sm bg-[#d1d5db] transition-all duration-300"
                        style={{
                          width: `${Math.max(0, Math.min(100, Number(solarPct) || 0))}%`,
                        }}
                      />
                    </div>
                  </div>

                  <MetricValueRow
                    label="Longest Darkness"
                    icon="dark_mode"
                    value={hours(activeMetrics?.max_eclipse_hours)}
                  />

                  <MetricValueRow
                    label="Earth Direct Link"
                    icon="cell_tower"
                    value={formatPercent(dtePct)}
                  />

                  <MetricValueRow
                    label="Max Ground Slope"
                    icon="terrain"
                    value={formatAngleShort(activeMetrics?.max_slope_deg)}
                  />

                  {isPlanner && (
                    <>
                      <MetricValueRow
                        label="Mean Ground Slope"
                        icon="Analytics"
                        value={formatAngleShort(activeSite?.slope_analysis?.average_slope_deg)}
                      />
                      <MetricValueRow
                        label="RMS Roughness"
                        icon="gradient"
                        value={
                          Number.isFinite(activeSite?.terrain_screening?.roughness_rmse_m)
                            ? `${activeSite.terrain_screening.roughness_rmse_m.toFixed(2)} m`
                            : NO_VALUE
                        }
                      />
                      <MetricValueRow
                        label="Sun Grazing Angle"
                        icon="wb_twilight"
                        value={
                          sunVec
                            ? `${formatAngleShort(sunVec.elevation_deg)} (Az ${formatAngleShort(sunVec.azimuth_deg)})`
                            : NO_VALUE
                        }
                      />
                    </>
                  )}
                </div>

                {/* Quick Site Comparison */}
                <div className="border-t border-white/[0.06] pt-2.5">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wider text-[#8e939e] uppercase">
                      <span>Site Comparison ({visibleSites.length}/{MAX_SITES})</span>
                      {isPlanner && solarDelta !== null && dteDelta !== null && (
                        <InfoTooltip
                          text={`Micro-Shift Δ (Site ${primaryLetter} vs ${secondaryLetter}, ${separationLabel}): Δ Solar ${signed(solarDelta)} pp · Δ Earth DTE ${signed(dteDelta)} pp`}
                        />
                      )}
                    </span>
                    {isPlanner && (
                      <span className="text-[11px] font-medium tabular-nums text-[#8e939e]">
                        {separationLabel}
                      </span>
                    )}
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
                          className={`font-jakarta rounded p-2.5 text-left transition ${
                            isSelected
                              ? 'bg-[#252830] text-white'
                              : 'bg-[#15171c] text-[#8e939e] hover:bg-[#1c1f26] hover:text-white'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-[12px] font-semibold text-white">
                              Site {letter}
                            </span>
                            <span className="text-[10.5px] tabular-nums text-[#8e939e]">
                              {formatAngleShort(m.max_slope_deg)}
                            </span>
                          </div>
                          <div className="mt-1 flex justify-between text-[11px] tabular-nums">
                            <span className={isSelected ? 'text-[#e5e7eb]' : 'text-[#8e939e]'}>
                              Sun {formatPercent(m.solar_illumination_pct)}
                            </span>
                            <span className={isSelected ? 'text-[#e5e7eb]' : 'text-[#8e939e]'}>
                              DTE {formatPercent(m.dte_availability_pct)}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Add / Move Site Action Buttons (Shown in Planner / Professional Mode) */}
                {isPlanner && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {onAddSite && (
                      <button
                        type="button"
                        data-testid="add-site-button"
                        disabled={visibleSites.length >= MAX_SITES}
                        onClick={openAddMode}
                        className={`flex flex-1 items-center justify-center gap-1.5 rounded px-2.5 py-2 text-[11.5px] font-medium transition ${
                          placementMode === 'add'
                            ? 'bg-[#252830] text-white'
                            : 'bg-[#15171c] text-[#b4b8c2] hover:bg-[#1c1f26] hover:text-white'
                        }`}
                      >
                        <MaterialIcon name="add_location_alt" className="text-[15px]" />
                        <span>Add Site</span>
                      </button>
                    )}
                    {onMoveSite && activeSite && (
                      <button
                        type="button"
                        data-testid="move-site-button"
                        onClick={openMoveMode}
                        className={`flex flex-1 items-center justify-center gap-1.5 rounded px-2.5 py-2 text-[11.5px] font-medium transition ${
                          placementMode === 'move'
                            ? 'bg-[#252830] text-white'
                            : 'bg-[#15171c] text-[#b4b8c2] hover:bg-[#1c1f26] hover:text-white'
                        }`}
                      >
                        <MaterialIcon name="open_with" className="text-[15px]" />
                        <span>Move Site {activeLetter}</span>
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
                        className="flex items-center justify-center rounded bg-[#15171c] px-2.5 py-2 text-[#8e939e] hover:bg-[#1c1f26] hover:text-white"
                        title="Reset to default sites"
                      >
                        <MaterialIcon name="restart_alt" className="text-[15px]" />
                      </button>
                    )}
                  </div>
                )}
              </>
            )}

            {navigateSubTab === 'solar' && (
              <div className="space-y-2.5">
                <div className="rounded bg-[#15171c] p-3">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-xs font-semibold text-white">
                      <MaterialIcon name="wb_sunny" className="text-[16px] text-[#d1d5db]" />
                      <span>Solar Illumination</span>
                      {isPlanner && (
                        <InfoTooltip
                          text={
                            isSunVisible === true
                              ? 'Sun is currently above the local crater horizon.'
                              : isSunVisible === false
                                ? 'Sun is currently occluded by local terrain relief.'
                                : 'Evaluates geometric solar visibility against the 360° DEM horizon mask.'
                          }
                        />
                      )}
                    </span>
                    <span className="text-sm font-semibold tabular-nums text-white">
                      {formatPercent(solarPct)}
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-sm bg-[#0c0d10]">
                    <div
                      className="h-full rounded-sm bg-[#d1d5db] transition-all duration-300"
                      style={{ width: `${Math.max(0, Math.min(100, Number(solarPct) || 0))}%` }}
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <MetricValueRow
                    label="Current Status"
                    icon="light_mode"
                    value={
                      isSunVisible === true
                        ? 'Sun Visible'
                        : isSunVisible === false
                          ? 'In Shadow'
                          : NO_VALUE
                    }
                  />
                  <MetricValueRow
                    label="Sun Elevation"
                    icon="wb_twilight"
                    value={sunVec ? formatAngleShort(sunVec.elevation_deg) : NO_VALUE}
                  />
                  <MetricValueRow
                    label="Longest Darkness"
                    icon="dark_mode"
                    value={hours(activeMetrics?.max_eclipse_hours)}
                  />
                  {isPlanner && (
                    <>
                      <MetricValueRow
                        label="Sun Azimuth"
                        icon="explore"
                        value={sunVec ? formatAngleShort(sunVec.azimuth_deg) : NO_VALUE}
                      />
                      <MetricValueRow
                        label="Crater Rim Elevation"
                        icon="landscape"
                        value={
                          Number.isFinite(activeVisibility?.sun_horizon_deg)
                            ? formatAngleShort(activeVisibility.sun_horizon_deg)
                            : NO_VALUE
                        }
                      />
                      <MetricValueRow
                        label="0° Horizon Baseline"
                        icon="horizontal_rule"
                        value={formatPercent(activeSite?.summary_metrics?.solar_illumination_pct)}
                      />
                    </>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => onLookSkyBody?.('sun')}
                  className="mt-1 flex w-full items-center justify-center gap-2 rounded bg-[#23262d] py-2 text-xs font-semibold text-white transition hover:bg-[#2c3038]"
                >
                  <MaterialIcon name="wb_sunny" className="text-[16px]" />
                  Point 3D Camera at Sun
                </button>
              </div>
            )}

            {navigateSubTab === 'earth' && (
              <div className="space-y-2.5">
                <div className="rounded bg-[#15171c] p-3">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-xs font-semibold text-white">
                      <MaterialIcon name="satellite_alt" className="text-[16px] text-[#d1d5db]" />
                      <span>Direct-to-Earth (DTE)</span>
                      {isPlanner && (
                        <InfoTooltip
                          text={
                            isDteActive === true
                              ? 'Direct geometric line-of-sight to Earth is clear. Earth traces a figure-8 libration pattern near the lunar horizon.'
                              : 'Earth is currently occluded by the crater ridge. Values represent geometric line-of-sight against local DEM relief.'
                          }
                        />
                      )}
                    </span>
                    <span className="text-sm font-semibold tabular-nums text-white">
                      {formatPercent(dtePct)}
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-sm bg-[#0c0d10]">
                    <div
                      className="h-full rounded-sm bg-[#d1d5db] transition-all duration-300"
                      style={{ width: `${Math.max(0, Math.min(100, Number(dtePct) || 0))}%` }}
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <MetricValueRow
                    label="Link Status"
                    icon="cell_tower"
                    value={
                      isDteActive === true
                        ? 'Line-of-Sight Clear'
                        : isDteActive === false
                          ? 'Blocked by Ridge'
                          : NO_VALUE
                    }
                  />
                  <MetricValueRow
                    label="Earth Elevation"
                    icon="public"
                    value={earthVec ? formatAngleShort(earthVec.elevation_deg) : NO_VALUE}
                  />
                  {isPlanner && (
                    <>
                      <MetricValueRow
                        label="Earth Azimuth"
                        icon="explore"
                        value={earthVec ? formatAngleShort(earthVec.azimuth_deg) : NO_VALUE}
                      />
                      <MetricValueRow
                        label="Rim at Earth Azimuth"
                        icon="landscape"
                        value={
                          Number.isFinite(activeVisibility?.earth_horizon_deg)
                            ? formatAngleShort(activeVisibility.earth_horizon_deg)
                            : NO_VALUE
                        }
                      />
                      <MetricValueRow
                        label="DTE Site Delta (Δ)"
                        icon="compare_arrows"
                        value={dteDelta !== null ? `${signed(dteDelta)} pp` : NO_VALUE}
                      />
                    </>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => onLookSkyBody?.('earth')}
                  className="mt-1 flex w-full items-center justify-center gap-2 rounded bg-[#23262d] py-2 text-xs font-semibold text-white transition hover:bg-[#2c3038]"
                >
                  <MaterialIcon name="public" className="text-[16px]" />
                  Point 3D Camera at Earth
                </button>
              </div>
            )}

            {navigateSubTab === 'horizon' && (
              <div className="space-y-2.5">
                <HorizonPanoramaChart
                  activeSite={activeSite}
                  ephemerisTimeline={ephemerisTimeline}
                  activeEphemeris={activeEphemeris}
                  activeVisibility={activeVisibility}
                  uiMode={uiMode}
                />

                <div className="space-y-1">
                  <MetricValueRow
                    label="Max Ground Slope"
                    icon="terrain"
                    value={formatAngleShort(activeMetrics?.max_slope_deg)}
                  />
                  {isPlanner && (
                    <>
                      <MetricValueRow
                        label="Mean Ground Slope"
                        icon="landscape"
                        value={formatAngleShort(activeSite?.slope_analysis?.average_slope_deg)}
                      />
                      <MetricValueRow
                        label="RMS Roughness"
                        icon="gradient"
                        value={
                          Number.isFinite(activeSite?.terrain_screening?.roughness_rmse_m)
                            ? `${activeSite.terrain_screening.roughness_rmse_m.toFixed(2)} m`
                            : NO_VALUE
                        }
                        tooltip="RMS elevation residual against a local fitted plane on 100×100 m blocks."
                      />
                      {activeSite?.horizon_coverage?.max_sampled_distance_m && (
                        <MetricValueRow
                          label="Horizon Ray Distance"
                          icon="radar"
                          value={`${(activeSite.horizon_coverage.max_sampled_distance_m / 1000).toFixed(1)} km`}
                        />
                      )}
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Coordinate Form (Shown whenever placementMode is 'add' or 'move') */}
            {placementMode && (
              <form
                onSubmit={handleSubmitCoordinates}
                data-testid="site-coordinate-form"
                className="space-y-2 rounded bg-[#14161b] p-3 text-[11.5px]"
              >
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-[11px] font-semibold text-white uppercase">
                    <MaterialIcon name="pin_drop" className="text-[15px] text-[#d1d5db]" />
                    <span>
                      {placementMode === 'add'
                        ? `Add Site ${SITE_LETTERS[visibleSites.length] ?? 'New'}`
                        : `Move Site ${activeLetter}`}
                    </span>
                    {tileRange && (
                      <InfoTooltip
                        text={`Click on the 3D terrain or enter coordinates. DEM bounds: Lat ${tileRange.minLat}°..${tileRange.maxLat}°, Lon ${tileRange.minLon}°..${tileRange.maxLon}°`}
                      />
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={() => onPlacementModeChange?.(null)}
                    className="rounded-sm px-1.5 py-0.5 text-[11px] text-[#8e939e] hover:bg-[#23262d] hover:text-white"
                  >
                    Close
                  </button>
                </div>
                <label className="block text-[11px] text-[#8e939e]">
                  Site Name
                  <input
                    type="text"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    data-testid="site-name-input"
                    className="mt-1 w-full rounded-sm bg-[#0b0c0e] px-2.5 py-1.5 text-xs text-white focus:outline-none"
                  />
                </label>
                <div className="grid grid-cols-2 gap-1.5">
                  <label className="block text-[11px] text-[#8e939e]">
                    Latitude (°)
                    <input
                      type="number"
                      step="0.0005"
                      min="-90"
                      max="0"
                      value={formLat}
                      onChange={(e) => handleLatLonChange(e.target.value, formLon)}
                      data-testid="site-lat-input"
                      className="mt-1 w-full rounded-sm bg-[#0b0c0e] px-2.5 py-1.5 text-xs tabular-nums text-white focus:outline-none"
                    />
                  </label>
                  <label className="block text-[11px] text-[#8e939e]">
                    Longitude (°)
                    <input
                      type="number"
                      step="0.005"
                      min="-180"
                      max="180"
                      value={formLon}
                      onChange={(e) => handleLatLonChange(formLat, e.target.value)}
                      data-testid="site-lon-input"
                      className="mt-1 w-full rounded-sm bg-[#0b0c0e] px-2.5 py-1.5 text-xs tabular-nums text-white focus:outline-none"
                    />
                  </label>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <label className="block text-[11px] text-[#8e939e]">
                    Tile U ({uvBounds.minU}..{uvBounds.maxU})
                    <input
                      type="number"
                      step="0.01"
                      min={uvBounds.minU}
                      max={uvBounds.maxU}
                      value={formU}
                      onChange={(e) => handleUvChange(e.target.value, formV)}
                      data-testid="site-u-input"
                      className="mt-1 w-full rounded-sm bg-[#0b0c0e] px-2.5 py-1.5 text-xs tabular-nums text-white focus:outline-none"
                    />
                  </label>
                  <label className="block text-[11px] text-[#8e939e]">
                    Tile V ({uvBounds.minV}..{uvBounds.maxV})
                    <input
                      type="number"
                      step="0.01"
                      min={uvBounds.minV}
                      max={uvBounds.maxV}
                      value={formV}
                      onChange={(e) => handleUvChange(formU, e.target.value)}
                      data-testid="site-v-input"
                      className="mt-1 w-full rounded-sm bg-[#0b0c0e] px-2.5 py-1.5 text-xs tabular-nums text-white focus:outline-none"
                    />
                  </label>
                </div>
                {coordNotice && <p className="text-[10.5px] text-[#d1d5db]">{coordNotice}</p>}
                <button
                  type="submit"
                  data-testid="apply-site-coordinates"
                  className="w-full rounded bg-[#252830] py-2 text-xs font-semibold text-white transition hover:bg-[#2f333d]"
                >
                  {placementMode === 'add' ? 'Save & Compute New Site' : 'Apply Coordinates'}
                </button>
              </form>
            )}
          </div>
        </>
      )}

      {/* =====================================================================
          MODE 2: VIEW TAB TOOLS (360° Panorama & Camera Orientation)
         ===================================================================== */}
      {activeMainTab === 'view' && (
        <div className="flex-1 space-y-3 overflow-y-auto px-3.5 py-3">
          {/* Surface Horizon Chart with Yellow (Sun) & Blue (Earth) Markers */}
          <HorizonPanoramaChart
            activeSite={activeSite}
            ephemerisTimeline={ephemerisTimeline}
            activeEphemeris={activeEphemeris}
            activeVisibility={activeVisibility}
            uiMode={uiMode}
            hideHeader={true}
          />

          {!isPlanner && (
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded bg-amber-400/10 p-3">
                <MaterialIcon name="wb_sunny" className="text-[18px] text-amber-300" />
                <div className="mt-1.5 text-sm font-bold text-amber-200">
                  {isSunVisible === true ? 'Visible' : 'Hidden'}
                </div>
                <div className="text-[11px] text-amber-200/70">Sun</div>
              </div>
              <div className="rounded bg-sky-400/10 p-3">
                <MaterialIcon name="public" className="text-[18px] text-sky-300" />
                <div className="mt-1.5 text-sm font-bold text-sky-200">
                  {isDteActive === true ? 'Visible' : 'Hidden'}
                </div>
                <div className="text-[11px] text-sky-200/70">Earth</div>
              </div>
            </div>
          )}

          {/* Camera & Sky Target Shortcuts */}
          <div className="rounded bg-[#15171c] p-2.5">
            {isPlanner && (
              <div className="mb-2 text-[10.5px] font-semibold tracking-wider text-[#8e939e] uppercase">
                360° Camera Orientation
              </div>
            )}
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => onLookSkyBody?.('sun')}
                className="flex items-center justify-center gap-1.5 rounded bg-[#1c1f26] px-2.5 py-2 text-xs font-medium text-white transition hover:bg-[#252830]"
              >
                <MaterialIcon name="wb_sunny" className="text-[15px] text-[#d1d5db]" />
                Look at Sun
              </button>
              <button
                type="button"
                onClick={() => onLookSkyBody?.('earth')}
                className="flex items-center justify-center gap-1.5 rounded bg-[#1c1f26] px-2.5 py-2 text-xs font-medium text-white transition hover:bg-[#252830]"
              >
                <MaterialIcon name="public" className="text-[15px] text-[#d1d5db]" />
                Look at Earth
              </button>
              <button
                type="button"
                onClick={() => onRequestCameraView?.('pov')}
                className={`flex items-center justify-center gap-1.5 rounded px-2.5 py-2 text-xs font-medium transition ${
                  cameraView === 'pov'
                    ? 'bg-[#252830] text-white'
                    : 'bg-[#1c1f26] text-[#b4b8c2] hover:text-white'
                }`}
              >
                <MaterialIcon name="center_focus_strong" className="text-[15px]" />
                Reset Lander POV
              </button>
              <button
                type="button"
                onClick={() => onRequestCameraView?.('overview')}
                className="flex items-center justify-center gap-1.5 rounded bg-[#1c1f26] px-2.5 py-2 text-xs font-medium text-[#b4b8c2] transition hover:bg-[#252830] hover:text-white"
              >
                <MaterialIcon name="map" className="text-[15px]" />
                Crater Overview
              </button>
            </div>
          </div>

          {/* Live Horizon Clearance Metrics (Detailed in Planner Mode) */}
          {isPlanner && (
            <div className="space-y-1">
              <MetricValueRow
                label="Sun El vs Rim"
                icon="wb_sunny"
                value={
                  sunVec && Number.isFinite(activeVisibility?.sun_horizon_deg)
                    ? `${formatAngleShort(sunVec.elevation_deg)} vs ${formatAngleShort(activeVisibility.sun_horizon_deg)}`
                    : NO_VALUE
                }
              />
              <MetricValueRow
                label="Earth El vs Rim"
                icon="satellite_alt"
                value={
                  earthVec && Number.isFinite(activeVisibility?.earth_horizon_deg)
                    ? `${formatAngleShort(earthVec.elevation_deg)} vs ${formatAngleShort(activeVisibility.earth_horizon_deg)}`
                    : NO_VALUE
                }
              />
            </div>
          )}
        </div>
      )}

      {/* =====================================================================
          MODE 3: READ TAB TOOLS (Comprehensive Summary & Report Navigation)
         ===================================================================== */}
      {activeMainTab === 'read' && (
        <div className="flex-1 space-y-3 overflow-y-auto px-3.5 py-3">
          <div className="flex items-center justify-between border-b border-white/[0.06] pb-2">
            <span className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-white uppercase">
              <MaterialIcon name="draft" className="text-[17px] text-[#d1d5db]" />
              <span>Report & Summary</span>
            </span>
          </div>

          {/* Section Jump Links */}
          <div className="space-y-1 rounded bg-[#15171c] p-2.5">
            <div className="mb-1.5 text-[10.5px] font-semibold tracking-wider text-[#8e939e] uppercase">
              Report Sections
            </div>
            {[
              { id: 'hemisphere-heading', label: '1. Southern Hemisphere Overview' },
              {
                id: selectedSiteId,
                label: `2. Active Site Metrics (Site ${activeLetter})`,
              },
              { id: 'terrain-heading', label: '3. DEM Coverage, Roughness & Validation' },
              { id: 'contrast-section', label: '4. Lunar South Pole vs. Earth' },
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onScrollReportSection?.(item.id)}
                className="flex w-full items-center justify-between rounded bg-[#1c1f26] px-2.5 py-2 text-left text-xs text-[#d1d5db] transition hover:bg-[#252830] hover:text-white"
              >
                <span className="truncate">{item.label}</span>
              </button>
            ))}
          </div>

          {/* Quick Key Metrics Snapshot */}
          <div className="space-y-1">
            <MetricValueRow
              label="Coordinates"
              icon="my_location"
              value={isPlanner ? coordsFull : coordsFormatted}
            />
            <MetricValueRow
              label="Solar Illumination"
              icon="wb_sunny"
              value={formatPercent(solarPct)}
            />
            <MetricValueRow
              label="Earth Visibility"
              icon="cell_tower"
              value={formatPercent(dtePct)}
            />
            <MetricValueRow
              label="Longest Darkness"
              icon="dark_mode"
              value={hours(activeMetrics?.max_eclipse_hours)}
            />
            {isPlanner && (
              <MetricValueRow label="Mission Window" icon="schedule" value={`${totalSteps} hrs`} />
            )}
          </div>
        </div>
      )}
    </aside>
  );
}
