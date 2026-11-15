import React from 'react';
import {
  formatAngleShort,
  formatPercent,
  formatRegionLabel,
} from '../../utils/hudModel';
import { metricsForSite } from '../../utils/timeline';
import { MAX_SITES, SITE_LETTERS } from '../../utils/siteCalculations';

function MaterialIcon({ name, className = 'text-[18px]' }) {
  return (
    <span className={`material-symbols-outlined select-none ${className}`} aria-hidden="true">
      {name}
    </span>
  );
}

/**
 * Floating action buttons on the right side of the 3D viewport for switching Lunar South Pole
 * Regions and selecting/adding Landing Sites (removed from the bottom footer bar).
 */
export function RightFloatingTools({
  openPanel = null,
  onTogglePanel,
  uiMode = 'planner',
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
}) {
  const isPlanner = uiMode === 'planner';
  const visibleSites = sites.slice(0, MAX_SITES);
  const activeSiteIdx = Math.max(
    0,
    visibleSites.findIndex((s) => s?.site_id === (activeSite?.site_id ?? selectedSiteId))
  );
  const activeLetter = SITE_LETTERS[activeSiteIdx] ?? 'A';
  const activeRegionObj = regions.find((r) => r.id === selectedRegionId);
  const activeRegionLabel =
    surfaceMode === 'hemisphere'
      ? 'South Hemisphere'
      : formatRegionLabel(activeRegionObj?.name) || 'Region 01';

  return (
    <div
      data-testid="right-floating-tools"
      className="font-jakarta pointer-events-none absolute right-4 bottom-4 z-20 flex flex-col items-end gap-2 select-none"
    >
      {/* EXPANDED POPOVER: REGION SELECTOR */}
      {openPanel === 'regions' && (
        <div
          data-testid="floating-panel-regions"
          className="pointer-events-auto w-80 max-w-[calc(100vw-2rem)] rounded border border-white/[0.08] bg-[#0c0d10]/95 p-3 text-white shadow-2xl backdrop-blur-xl sm:w-96"
        >
          <div className="mb-2.5 flex items-center justify-between border-b border-white/[0.06] pb-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-white">
              <MaterialIcon name="public" className="text-[16px] text-[#d1d5db]" />
              <span>Select Lunar South Pole Region</span>
            </div>
            <button
              type="button"
              onClick={() => onTogglePanel?.(null)}
              aria-label="Close region panel"
              className="rounded-xs p-0.5 text-[#8e939e] transition hover:bg-[#1c1f26] hover:text-white"
            >
              <MaterialIcon name="close" className="text-[15px]" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {/* South Hemisphere Globe Card */}
            <button
              type="button"
              data-testid="surface-toggle"
              onClick={() => {
                if (surfaceMode !== 'hemisphere') onToggleSurface?.();
              }}
              className={`group flex flex-col items-center justify-center rounded p-2.5 text-center transition ${
                surfaceMode === 'hemisphere'
                  ? 'bg-[#252830] text-white ring-1 ring-white/20'
                  : 'bg-[#15171c] text-[#b4b8c2] hover:bg-[#1c1f26] hover:text-white'
              }`}
            >
              <div
                className="mb-1.5 flex h-9 w-9 items-center justify-center rounded-full shadow-inner"
                style={{
                  background:
                    'radial-gradient(circle at 35% 30%, #cbd5e1 0%, #64748b 45%, #1e293b 80%, #090d16 100%)',
                }}
              >
                <MaterialIcon name="public" className="text-[18px] text-white/90" />
              </div>
              <span className="text-xs font-semibold text-white">Southern Hemisphere</span>
            </button>

            {/* Individual DEM Region Cards */}
            {regions.map((reg) => {
              const isSelected = surfaceMode !== 'hemisphere' && reg.id === selectedRegionId;
              const regionLabel = formatRegionLabel(reg.name);
              const regionCode = reg.id.replace(/^SITE/i, 'R');
              return (
                <button
                  key={reg.id}
                  type="button"
                  onClick={() => {
                    onRegionChange?.(reg.id);
                  }}
                  className={`group flex flex-col items-center justify-center rounded p-2.5 text-center transition ${
                    isSelected
                      ? 'bg-[#252830] text-white ring-1 ring-white/20'
                      : 'bg-[#15171c] text-[#b4b8c2] hover:bg-[#1c1f26] hover:text-white'
                  }`}
                >
                  <div
                    className="mb-1.5 flex h-9 w-9 items-center justify-center rounded-full text-[11px] font-bold text-white shadow-inner"
                    style={{
                      background:
                        'radial-gradient(circle at 35% 30%, #9b9794 0%, #545053 45%, #1d1c1f 85%)',
                    }}
                  >
                    {regionCode}
                  </div>
                  <span className="line-clamp-1 text-xs font-semibold text-white">
                    {regionLabel}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* EXPANDED POPOVER: SITES & ADD SITE */}
      {openPanel === 'sites' && (
        <div
          data-testid="floating-panel-sites"
          className="pointer-events-auto w-80 max-w-[calc(100vw-2rem)] rounded border border-white/[0.08] bg-[#0c0d10]/95 p-3 text-white shadow-2xl backdrop-blur-xl sm:w-96"
        >
          <div className="mb-2.5 flex items-center justify-between border-b border-white/[0.06] pb-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-white">
              <MaterialIcon name="add_location_alt" className="text-[16px] text-[#d1d5db]" />
              <span>
                {isPlanner
                  ? 'Select or Place Landing Sites'
                  : 'Switch Landing Site'}
              </span>
            </div>
            <button
              type="button"
              onClick={() => onTogglePanel?.(null)}
              aria-label="Close sites panel"
              className="rounded-xs p-0.5 text-[#8e939e] transition hover:bg-[#1c1f26] hover:text-white"
            >
              <MaterialIcon name="close" className="text-[15px]" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {visibleSites.filter(Boolean).map((site, idx) => {
              const letter = SITE_LETTERS[idx] ?? String(idx + 1);
              const isSel = site.site_id === selectedSiteId;
              const m = metricsForSite(site) ?? {};
              return (
                <button
                  key={site.site_id}
                  type="button"
                  onClick={() => onSelectSite?.(site.site_id)}
                  className={`flex flex-col items-center rounded p-2.5 text-center transition ${
                    isSel
                      ? 'bg-[#252830] text-white ring-1 ring-white/20'
                      : 'bg-[#15171c] text-[#b4b8c2] hover:bg-[#1c1f26] hover:text-white'
                  }`}
                >
                  <div
                    className={`mb-1 flex h-8 w-8 items-center justify-center rounded text-xs font-bold ${
                      isSel ? 'bg-white text-[#0b0c0e]' : 'bg-[#1d2027] text-slate-200'
                    }`}
                  >
                    {letter}
                  </div>
                  <span className="line-clamp-1 text-xs font-semibold text-white">
                    Site {letter}
                  </span>
                  <span className="mt-0.5 text-[10.5px] tabular-nums text-[#b4b8c2]">
                    Sun {formatPercent(m.solar_illumination_pct)}
                  </span>
                  {isPlanner && (
                    <span className="text-[10px] tabular-nums text-[#8e939e]">
                      Slope {formatAngleShort(m.max_slope_deg)}
                    </span>
                  )}
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
                className={`flex flex-col items-center justify-center rounded border p-2.5 text-center transition ${
                  placementMode === 'add'
                    ? 'border-sky-300 bg-sky-400 text-[#0b0c0e] shadow-sm'
                    : visibleSites.length >= MAX_SITES
                      ? 'cursor-not-allowed border-white/[0.06] bg-[#15171c] opacity-40'
                      : 'border-sky-400/35 bg-sky-500/15 text-sky-100 hover:border-sky-300/60 hover:bg-sky-500/25'
                }`}
              >
                <MaterialIcon name="add_location_alt" className="mb-1 text-[19px]" />
                <span className="text-xs font-semibold">Add Site</span>
                <span
                  className={`mt-0.5 text-[10px] ${
                    placementMode === 'add' ? 'text-[#0b0c0e]/80' : 'text-sky-200/75'
                  }`}
                >
                  Click on 3D Terrain
                </span>
              </button>
            )}

            {/* Move & Reset Cards (Planner Mode) */}
            {isPlanner && (
              <button
                type="button"
                disabled={!activeSite}
                onClick={() => {
                  onPlacementModeChange?.(placementMode === 'move' ? null : 'move');
                }}
                className={`flex flex-col items-center justify-center rounded border p-2.5 text-center transition ${
                  placementMode === 'move'
                    ? 'border-amber-300 bg-amber-400 text-[#0b0c0e] shadow-sm'
                    : 'border-amber-400/35 bg-amber-400/15 text-amber-100 hover:border-amber-300/60 hover:bg-amber-400/25'
                }`}
              >
                <MaterialIcon name="open_with" className="mb-1 text-[18px]" />
                <span className="text-xs font-semibold">Move Site</span>
                <span
                  className={`mt-0.5 text-[10px] ${
                    placementMode === 'move' ? 'text-[#0b0c0e]/80' : 'text-amber-200/75'
                  }`}
                >
                  Relocate Active
                </span>
              </button>
            )}

            {hasCustomSiteChanges && onResetSites && (
              <button
                type="button"
                onClick={() => {
                  onPlacementModeChange?.(null);
                  onResetSites();
                }}
                className="flex flex-col items-center justify-center rounded bg-[#15171c] p-2.5 text-center text-[#b4b8c2] hover:bg-[#1c1f26] hover:text-white"
              >
                <MaterialIcon name="restart_alt" className="mb-1 text-[18px]" />
                <span className="text-xs font-semibold">Reset Sites</span>
                <span className="mt-0.5 text-[10px] text-[#8e939e]">Default Dataset</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* FLOATING BUTTON BAR ON THE RIGHT SIDE OF 3D VIEWPORT */}
      <div className="pointer-events-auto flex items-center gap-1.5 rounded bg-[#0c0d10]/95 p-1 shadow-2xl backdrop-blur-md">
        <button
          type="button"
          onClick={() => onTogglePanel?.(openPanel === 'regions' ? null : 'regions')}
          data-testid="sandbox-btn-regions"
          aria-expanded={openPanel === 'regions'}
          title="Select Lunar South Pole Region or Hemisphere"
          className={`flex h-8 items-center gap-1.5 rounded-sm px-2.5 text-[11.5px] font-medium transition ${
            openPanel === 'regions'
              ? 'bg-[#252830] text-white'
              : 'text-[#b4b8c2] hover:bg-[#181b21] hover:text-white'
          }`}
        >
          <MaterialIcon name="public" className="text-[16px]" />
          <span>{activeRegionLabel}</span>
        </button>

        <button
          type="button"
          onClick={() => onTogglePanel?.(openPanel === 'sites' ? null : 'sites')}
          data-testid="sandbox-btn-sites"
          aria-expanded={openPanel === 'sites'}
          title="Select or Add Landing Site on 3D Terrain"
          className={`flex h-8 items-center gap-1.5 rounded-sm px-2.5 text-[11.5px] font-medium transition ${
            openPanel === 'sites' || placementMode
              ? 'bg-[#252830] text-white'
              : 'text-[#b4b8c2] hover:bg-[#181b21] hover:text-white'
          }`}
        >
          <MaterialIcon name="add_location_alt" className="text-[16px]" />
          <span>Site {activeLetter} / Add</span>
        </button>
      </div>
    </div>
  );
}
