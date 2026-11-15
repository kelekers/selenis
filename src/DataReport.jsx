import { useEffect, useState } from 'react';
import { formatRegionLabel } from './utils/hudModel';

function siteVerdict(site) {
  const terrain = site?.terrain_summary_metrics;
  const sun = terrain?.solar_illumination_pct ?? site?.summary_metrics?.solar_illumination_pct;
  const slope = site?.summary_metrics?.max_slope_deg ?? terrain?.max_slope_deg;
  if (terrain?.safety_rating === 'OPTIMAL') {
    return { label: 'Optimal', badge: 'bg-emerald-500/15 text-emerald-300 ring-emerald-400/25' };
  }
  if (Number.isFinite(sun) && sun >= 70 && (!Number.isFinite(slope) || slope <= 10)) {
    return { label: 'Optimal', badge: 'bg-emerald-500/15 text-emerald-300 ring-emerald-400/25' };
  }
  if (Number.isFinite(sun) && sun >= 50 && (!Number.isFinite(slope) || slope <= 15)) {
    return { label: 'Moderate', badge: 'bg-amber-400/15 text-amber-300 ring-amber-400/25' };
  }
  return { label: 'Caution', badge: 'bg-red-500/15 text-red-300 ring-red-400/25' };
}

function daysLabel(hours) {
  if (!Number.isFinite(hours)) return '—';
  return `${hours} hrs (~${(hours / 24).toFixed(1)}d)`;
}

export function DataReport({ telemetryUrl = '/data/site_telemetry.json', uiMode = 'planner' }) {
  const isPlanner = uiMode === 'planner';
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [hemisphere, setHemisphere] = useState(null);
  const [hemisphereError, setHemisphereError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    fetch('/data/south_hemisphere.json', { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error('Hemisphere overview unavailable.');
        return response.json();
      })
      .then(setHemisphere)
      .catch((failure) => {
        if (failure.name !== 'AbortError') setHemisphereError(failure.message);
      });
    fetch(telemetryUrl, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error('Dataset could not be loaded.');
        return response.json();
      })
      .then((result) => {
        if (!result.sites?.length) throw new Error('Site dataset is empty.');
        setData(result);
      })
      .catch((failure) => {
        if (failure.name !== 'AbortError') setError(failure.message);
      });
    return () => controller.abort();
  }, [telemetryUrl]);

  const demo = data?.demo_48_hours;
  const terrainName = formatRegionLabel(data?.terrain_metadata?.region_name) || 'Local Region';
  const percent = (value) =>
    Number.isFinite(value)
      ? `${value.toLocaleString('en-US', { maximumFractionDigits: 2 })}%`
      : '—';

  return (
    <main className="font-jakarta mx-auto max-w-[54rem] space-y-6 pb-10 text-[#d1d5db]">
      {/* Report Header Card */}
      {isPlanner ? (
        <header className="rounded bg-[#14161b] p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="rounded-sm bg-[#23262d] px-2.5 py-1 text-[10.5px] font-semibold tracking-widest text-[#d1d5db] uppercase">
              NASA Space Apps · TIMOREX
            </span>
            {data?.mission_window && (
              <span className="text-xs font-medium tabular-nums text-[#8e939e]">
                Baseline Window: {data.mission_window.start_utc.slice(0, 10)} →{' '}
                {data.mission_window.end_utc.slice(0, 10)} UTC (+100Y Projection Ready)
              </span>
            )}
          </div>
          <h1 className="font-selenis mt-3 text-3xl font-semibold tracking-tight text-white">
            selenis
          </h1>
          <p className="mt-1 text-base font-medium text-[#e5e7eb]">
            Lunar South Pole Navigator — Comprehensive Scientific Summary ({terrainName})
          </p>
          <p className="mt-2 text-xs leading-relaxed text-[#9ca3af]">
            Topocentric solar illumination, Direct-to-Earth (DTE) line-of-sight, and 5 m LOLA DEM
            horizon &amp; slope analysis derived from NASA JPL Horizons ephemeris.
          </p>
        </header>
      ) : (
        <header className="rounded bg-gradient-to-br from-sky-500/15 via-[#14161b] to-amber-500/15 p-6 ring-1 ring-white/10">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="rounded-sm bg-sky-400/20 px-2.5 py-1 text-[10.5px] font-semibold tracking-wider text-sky-200 uppercase">
              Explorer Mission Guide · {terrainName}
            </span>
            {data?.terrain_metadata && (
              <span className="rounded-sm bg-emerald-400/15 px-2.5 py-1 text-xs font-medium tabular-nums text-emerald-300">
                Elev {Math.round(data.terrain_metadata.min_elevation_m)} m to{' '}
                {Math.round(data.terrain_metadata.max_elevation_m)} m
              </span>
            )}
          </div>
          <h1 className="font-selenis mt-3 text-3xl font-semibold tracking-tight text-white">
            selenis
          </h1>
          <p className="mt-1 text-sm text-slate-200">
            Compare landing zones visually by sunlight hours, Earth signal windows, and crater rim silhouettes.
          </p>
        </header>
      )}

      {/* EXPLORER VISUAL SITE COMPARISON CHARTS */}
      {!isPlanner && data?.sites?.length > 0 && (
        <section
          aria-label="Visual Site Comparison Charts"
          data-testid="explorer-report-charts"
          className="rounded bg-[#14161b] p-6 ring-1 ring-white/[0.06]"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.06] pb-3">
            <h2 className="!m-0 flex items-center gap-2 text-base font-semibold text-white">
              <span className="material-symbols-outlined text-[19px] text-amber-300" aria-hidden="true">
                bar_chart
              </span>
              Landing Site Power &amp; Terrain Scoreboard
            </h2>
            <div className="flex items-center gap-3 text-[11px] font-medium">
              <span className="flex items-center gap-1.5 text-amber-300">
                <span className="h-2 w-2 rounded-full bg-amber-400" />
                Sunlight
              </span>
              <span className="flex items-center gap-1.5 text-sky-300">
                <span className="h-2 w-2 rounded-full bg-sky-400" />
                Earth Signal
              </span>
              <span className="flex items-center gap-1.5 text-emerald-300">
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                Terrain Slope
              </span>
            </div>
          </div>

          <div className="mt-4 space-y-4">
            {data.sites.map((site) => {
              const sunPct =
                site.terrain_summary_metrics?.solar_illumination_pct ??
                site.summary_metrics?.solar_illumination_pct ??
                0;
              const earthPct =
                site.terrain_summary_metrics?.dte_availability_pct ??
                site.summary_metrics?.dte_availability_pct ??
                0;
              const maxSlope = site.summary_metrics?.max_slope_deg;
              const darkHrs =
                site.terrain_summary_metrics?.max_eclipse_hours ??
                site.summary_metrics?.max_eclipse_hours;
              const verdict = siteVerdict(site);
              const slopeBarPct = Number.isFinite(maxSlope)
                ? Math.max(4, Math.min(100, (maxSlope / 25) * 100))
                : 0;
              const slopeColor =
                !Number.isFinite(maxSlope) || maxSlope <= 10
                  ? 'bg-emerald-400'
                  : maxSlope <= 15
                    ? 'bg-amber-400'
                    : 'bg-red-400';

              return (
                <div
                  key={site.site_id}
                  className="rounded bg-[#1a1d24] p-4 ring-1 ring-white/[0.05]"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-white">
                        {formatRegionLabel(site.name)}
                      </span>
                      <span
                        className={`rounded-sm px-2 py-0.5 text-[10px] font-semibold uppercase ring-1 ${verdict.badge}`}
                      >
                        {verdict.label}
                      </span>
                    </div>
                    <span className="rounded-sm bg-violet-400/15 px-2.5 py-0.5 text-[11px] font-medium tabular-nums text-violet-200">
                      Longest Night: {daysLabel(darkHrs)}
                    </span>
                  </div>

                  <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                    {/* Sunlight Bar */}
                    <div>
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-amber-300">Sunlight</span>
                        <span className="font-semibold tabular-nums text-white">
                          {percent(sunPct)}
                        </span>
                      </div>
                      <div className="mt-1 h-2.5 w-full overflow-hidden rounded-full bg-black/40">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-amber-500 to-yellow-300"
                          style={{ width: `${Math.max(2, Math.min(100, sunPct))}%` }}
                        />
                      </div>
                    </div>

                    {/* Earth Signal Bar */}
                    <div>
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-sky-300">Earth Signal</span>
                        <span className="font-semibold tabular-nums text-white">
                          {percent(earthPct)}
                        </span>
                      </div>
                      <div className="mt-1 h-2.5 w-full overflow-hidden rounded-full bg-black/40">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-sky-500 to-cyan-300"
                          style={{ width: `${Math.max(2, Math.min(100, earthPct))}%` }}
                        />
                      </div>
                    </div>

                    {/* Slope Safety Gauge Bar (0° to 25° scale, 15° marker) */}
                    <div>
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-emerald-300">Max Slope</span>
                        <span className="font-semibold tabular-nums text-white">
                          {Number.isFinite(maxSlope) ? `${maxSlope}°` : '—'}
                        </span>
                      </div>
                      <div className="relative mt-1 h-2.5 w-full overflow-hidden rounded-full bg-black/40">
                        <div
                          className={`h-full rounded-full ${slopeColor}`}
                          style={{ width: `${slopeBarPct}%` }}
                        />
                        <div
                          title="15° Safe Lander Limit"
                          className="absolute top-0 bottom-0 left-[60%] w-0.5 bg-white/70"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* 1. Southern Hemisphere Overview */}
      {hemisphere && isPlanner && (
        <section aria-labelledby="hemisphere-heading" className="rounded bg-[#14161b] p-6">
          <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
            <h2 id="hemisphere-heading" className="!m-0 !border-0 !p-0 text-base font-semibold text-white">
              1. Southern Hemisphere Overview (0°–90°S)
            </h2>
            <span className="text-xs font-medium text-[#8e939e]">NASA LOLA LDEM_16 V3.1</span>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded bg-[#1a1d24] p-3">
              <div className="text-[11px] text-[#8e939e]">Reference Frame</div>
              <div className="mt-1 text-xs font-semibold text-white">
                {hemisphere.reference_frame}
              </div>
            </div>
            <div className="rounded bg-[#1a1d24] p-3">
              <div className="text-[11px] text-[#8e939e]">Mean Lunar Radius</div>
              <div className="mt-1 text-xs font-semibold tabular-nums text-white">
                {hemisphere.reference_radius_m.toLocaleString('en-US')} m
              </div>
            </div>
            <div className="rounded bg-[#1a1d24] p-3">
              <div className="text-[11px] text-[#8e939e]">Overview Mesh Grid</div>
              <div className="mt-1 text-xs font-semibold tabular-nums text-white">
                {hemisphere.grid.width} × {hemisphere.grid.height} vertices (~
                {(hemisphere.source_meridional_spacing_m / 1000).toFixed(2)} km)
              </div>
            </div>
          </div>

          <p className="mt-3.5 text-xs leading-relaxed text-[#9ca3af]">
            The hemisphere globe provides regional polar context. Slope, 360° horizon masks,
            roughness screening, and landing site comparisons below are evaluated directly on the 5 m
            local DEM of the active region.
          </p>

          <div className="mt-3 flex flex-wrap gap-4 text-xs">
            <a
              href="https://pds-geosciences.wustl.edu/missions/lro/lola.htm"
              target="_blank"
              rel="noreferrer"
              className="text-[#d1d5db] underline underline-offset-4 hover:text-white"
            >
              NASA PDS LOLA Source
            </a>
            <a
              href="https://svs.gsfc.nasa.gov/4720/"
              target="_blank"
              rel="noreferrer"
              className="text-[#d1d5db] underline underline-offset-4 hover:text-white"
            >
              NASA SVS Visual Source
            </a>
          </div>
        </section>
      )}

      {/* EXPLORER TERRAIN RELIEF & ELEVATION MAP CARD */}
      {!isPlanner && data?.terrain_metadata && (
        <section
          id="hemisphere-heading"
          className="grid grid-cols-1 gap-4 rounded bg-[#14161b] p-6 ring-1 ring-white/[0.06] md:grid-cols-[1fr_auto]"
        >
          <div className="flex flex-col justify-between space-y-3">
            <div>
              <h2
                id="terrain-heading"
                className="!m-0 !border-0 !p-0 flex items-center gap-2 text-base font-semibold text-white"
              >
                <span className="material-symbols-outlined text-[19px] text-emerald-400" aria-hidden="true">
                  landscape
                </span>
                Region Topography ({terrainName})
              </h2>
              <p className="mt-1.5 text-xs leading-relaxed text-slate-300">
                Brighter areas show sunlit ridges high above crater floors, while dark basins stay shielded in icy shadow.
              </p>
            </div>

            <div className="space-y-2 rounded bg-[#1a1d24] p-3">
              <div className="flex justify-between text-[11px] font-medium tabular-nums">
                <span className="text-indigo-300">
                  Deep Crater ({Math.round(data.terrain_metadata.min_elevation_m)} m)
                </span>
                <span className="text-amber-300">
                  High Ridge ({Math.round(data.terrain_metadata.max_elevation_m)} m)
                </span>
              </div>
              <div className="h-2.5 w-full rounded-full bg-gradient-to-r from-indigo-900 via-slate-400 to-amber-200" />
              {hemisphere && (
                <div className="flex justify-between pt-1 text-[11px] text-slate-400">
                  <span>Region Tile: {data.terrain_metadata.area_width_km} × {data.terrain_metadata.area_height_km} km</span>
                  <span>Moon Radius: {(hemisphere.reference_radius_m / 1000).toFixed(0)} km</span>
                </div>
              )}
            </div>
          </div>

          <figure className="!m-0 flex flex-col items-center justify-center rounded bg-[#0c0d10] p-3">
            <img
              className="heightmap max-h-44 w-auto rounded-sm object-contain"
              src={data.terrain_metadata.heightmap_texture}
              alt={`Elevation heightmap for ${terrainName}`}
            />
          </figure>
        </section>
      )}

      {hemisphereError && (
        <p role="status" className="rounded bg-[#14161b] p-4 text-xs text-[#9ca3af]">
          {hemisphereError} Local DEM analysis remains available.
        </p>
      )}

      {!data && (
        <p role="status" className="rounded bg-[#14161b] p-6 text-xs text-[#9ca3af]">
          {error || 'Loading offline scientific dataset…'}
        </p>
      )}

      {/* 2. Per-Site Metrics & 360° Horizon Profiles */}
      {data && (
        <>
          <div className="grid grid-cols-1 gap-4">
            {data.sites.map((site, idx) => {
              const verdict = siteVerdict(site);
              const terrainMetrics = site.terrain_summary_metrics;
              return (
                <section
                  key={site.site_id}
                  aria-labelledby={site.site_id}
                  className="rounded bg-[#14161b] p-6"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.06] pb-3">
                    <div className="flex items-center gap-2">
                      <h2
                        id={site.site_id}
                        className="!m-0 !border-0 !p-0 text-base font-semibold text-white"
                      >
                        {isPlanner ? `2.${idx + 1} ` : ''}
                        {formatRegionLabel(site.name)}
                      </h2>
                      {!isPlanner && (
                        <span
                          className={`rounded-sm px-2 py-0.5 text-[10px] font-semibold uppercase ring-1 ${verdict.badge}`}
                        >
                          {verdict.label}
                        </span>
                      )}
                    </div>
                    {site.coordinates && (
                      <span className="rounded-sm bg-[#1c1f26] px-2.5 py-1 text-xs font-medium tabular-nums text-[#b4b8c2]">
                        {Math.abs(site.coordinates.latitude_deg).toFixed(4)}°S,{' '}
                        {Math.abs(site.coordinates.longitude_deg).toFixed(4)}°
                        {site.coordinates.longitude_deg < 0 ? 'W' : 'E'} · Elev{' '}
                        {Math.round(site.coordinates.elevation_m)} m
                      </span>
                    )}
                  </div>

                  {isPlanner ? (
                    <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                      {/* 0° Horizon Baseline (Planner Mode Only) */}
                      <div className="rounded bg-[#1a1d24] p-4">
                        <h3 className="!mt-0 mb-2.5 text-xs font-semibold tracking-wider text-[#9ca3af] uppercase">
                          0° Horizontal Baseline
                        </h3>
                        <dl className="!m-0 !border-0 !bg-transparent !p-0 text-xs">
                          <dt>Sun Center Above 0°</dt>
                          <dd>{percent(site.summary_metrics.solar_illumination_pct)}</dd>
                          <dt>Earth Visibility (0°)</dt>
                          <dd>{percent(site.summary_metrics.dte_availability_pct)}</dd>
                          <dt>Longest Darkness (0°)</dt>
                          <dd>{site.summary_metrics.max_eclipse_hours} hrs</dd>
                          <dt>Mean / Max Ground Slope</dt>
                          <dd>
                            {site.summary_metrics.average_slope_deg == null
                              ? 'Unavailable'
                              : `${site.summary_metrics.average_slope_deg}°`}
                            {' / '}
                            {site.summary_metrics.max_slope_deg == null
                              ? 'Unavailable'
                              : `${site.summary_metrics.max_slope_deg}°`}
                          </dd>
                        </dl>
                      </div>

                      {/* Local 5m DEM Horizon Model */}
                      {terrainMetrics && (
                        <div className="rounded bg-[#1a1d24] p-4">
                          <h3 className="!mt-0 mb-2.5 text-xs font-semibold tracking-wider text-white uppercase">
                            Local 5 m DEM Horizon Model
                          </h3>
                          <dl className="!m-0 !border-0 !bg-transparent !p-0 text-xs">
                            <dt>Unobstructed Sunlight</dt>
                            <dd>{percent(terrainMetrics.solar_illumination_pct)}</dd>
                            <dt>Unobstructed Earth DTE</dt>
                            <dd>{percent(terrainMetrics.dte_availability_pct)}</dd>
                            <dt>Longest Continuous Darkness</dt>
                            <dd>{terrainMetrics.max_eclipse_hours} hrs</dd>
                            <dt>Slope Footprint / Ray Span</dt>
                            <dd>
                              R={site.slope_analysis.radius_m} m ·{' '}
                              {(site.horizon_coverage.min_sampled_distance_m / 1000).toFixed(1)}–
                              {(site.horizon_coverage.max_sampled_distance_m / 1000).toFixed(1)} km
                            </dd>
                          </dl>
                        </div>
                      )}
                    </div>
                  ) : (
                    terrainMetrics && (
                      <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                        <div className="rounded bg-amber-400/10 p-3 ring-1 ring-amber-400/20">
                          <div className="text-[11px] font-medium text-amber-300">Sunlight</div>
                          <div className="mt-1 text-lg font-bold tabular-nums text-white">
                            {percent(terrainMetrics.solar_illumination_pct)}
                          </div>
                        </div>
                        <div className="rounded bg-sky-400/10 p-3 ring-1 ring-sky-400/20">
                          <div className="text-[11px] font-medium text-sky-300">Earth Signal</div>
                          <div className="mt-1 text-lg font-bold tabular-nums text-white">
                            {percent(terrainMetrics.dte_availability_pct)}
                          </div>
                        </div>
                        <div className="rounded bg-violet-400/10 p-3 ring-1 ring-violet-400/20">
                          <div className="text-[11px] font-medium text-violet-300">Longest Night</div>
                          <div className="mt-1 text-base font-bold tabular-nums text-white">
                            {daysLabel(terrainMetrics.max_eclipse_hours)}
                          </div>
                        </div>
                        <div className="rounded bg-emerald-400/10 p-3 ring-1 ring-emerald-400/20">
                          <div className="text-[11px] font-medium text-emerald-300">Max Slope</div>
                          <div className="mt-1 text-lg font-bold tabular-nums text-white">
                            {site.summary_metrics.max_slope_deg == null
                              ? '—'
                              : `${site.summary_metrics.max_slope_deg}°`}
                          </div>
                        </div>
                      </div>
                    )
                  )}

                  {terrainMetrics && site.horizon_mask_360 && (
                    <figure className="!mb-0 mt-4 rounded bg-[#0c0d10] p-4">
                      {!isPlanner && (
                        <div className="mb-2 flex items-center justify-between text-[11px]">
                          <span className="font-semibold text-sky-300">
                            360° Crater Skyline View
                          </span>
                          <span className="text-amber-300/90">
                            Lower cyan ridge = clearer sunlight &amp; Earth signal
                          </span>
                        </div>
                      )}
                      <svg
                        viewBox="0 0 720 160"
                        role="img"
                        aria-label={`Local 360° horizon profile for ${formatRegionLabel(site.name)}`}
                        className="h-32 w-full"
                      >
                        {!isPlanner && (
                          <defs>
                            <linearGradient id={`skyBg-${idx}`} x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#0f172a" />
                              <stop offset="100%" stopColor="#1e1b4b" stopOpacity="0.45" />
                            </linearGradient>
                            <linearGradient id={`craterFill-${idx}`} x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.45" />
                              <stop offset="100%" stopColor="#0f172a" stopOpacity="0.95" />
                            </linearGradient>
                          </defs>
                        )}
                        {!isPlanner && (
                          <>
                            <rect x="0" y="0" width="720" height="160" rx="4" fill={`url(#skyBg-${idx})`} />
                            <rect x="0" y="88" width="720" height="42" fill="#f59e0b" fillOpacity="0.08" />
                          </>
                        )}
                        <line
                          x1="0"
                          y1="130"
                          x2="720"
                          y2="130"
                          stroke={isPlanner ? 'rgba(255,255,255,0.2)' : 'rgba(125,211,252,0.45)'}
                          strokeDasharray="4 4"
                        />
                        {!isPlanner && (
                          <polygon
                            fill={`url(#craterFill-${idx})`}
                            points={`0,160 ${site.horizon_mask_360
                              .map(
                                (point) =>
                                  `${point.azimuth_deg * 2},${130 - Math.max(0, point.horizon_elevation_deg) * 8.5}`
                              )
                              .join(' ')} 720,160`}
                          />
                        )}
                        <polyline
                          fill="none"
                          stroke={isPlanner ? '#e5e7eb' : '#38bdf8'}
                          strokeWidth={isPlanner ? '2' : '2.5'}
                          points={site.horizon_mask_360
                            .map(
                              (point) =>
                                `${point.azimuth_deg * 2},${130 - Math.max(0, point.horizon_elevation_deg) * 8.5}`
                            )
                            .join(' ')}
                        />
                      </svg>
                      <figcaption className="mt-2 flex justify-between text-[11px] text-[#8e939e]">
                        <span>0° N</span>
                        <span>90° E</span>
                        <span>180° S</span>
                        <span>270° W</span>
                        <span>360° N (Dashed = 0° Horizontal)</span>
                      </figcaption>
                    </figure>
                  )}
                </section>
              );
            })}
          </div>

          {/* 3. DEM Coverage, Roughness & +48h Validation (Planner Mode) */}
          {isPlanner && data.terrain_metadata && (
            <section aria-labelledby="terrain-heading" className="rounded bg-[#14161b] p-6">
              <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
                <h2
                  id="terrain-heading"
                  className="!m-0 !border-0 !p-0 text-base font-semibold text-white"
                >
                  3. DEM Coverage, Surface Roughness &amp; Validation ({terrainName})
                </h2>
                <span className="text-xs font-medium text-[#8e939e]">
                  {data.terrain_metadata.area_width_km} × {data.terrain_metadata.area_height_km} km
                  Tile
                </span>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-3 text-xs leading-relaxed text-[#b4b8c2]">
                  <p>{data.terrain_metadata.visibility_model}.</p>
                  {data.terrain_metadata.context_dataset_url && (
                    <div className="rounded bg-[#1a1d24] p-3.5">
                      <div className="font-semibold text-white">40 × 40 km Wide Context Mosaic</div>
                      <p className="mt-1 text-[#9ca3af]">
                        NASA LOLA 5 m mosaic; 16-bit lossless heightmap with 62.5 m visual mesh
                        spacing surrounding the central 16 km high-resolution DEM.
                      </p>
                      <a
                        href={data.terrain_metadata.context_dataset_url}
                        className="mt-2 inline-block text-[#d1d5db] underline underline-offset-4 hover:text-white"
                      >
                        Context Metadata &amp; Overlap Comparison
                      </a>
                    </div>
                  )}
                  {data.terrain_metadata.roughness_analysis && (
                    <div className="rounded bg-[#1a1d24] p-3.5">
                      <div className="font-semibold text-white">Measured RMS Surface Roughness</div>
                      <p className="mt-1 text-[#9ca3af]">
                        RMS elevation residual against a local fitted plane on 100 × 100 m blocks
                        (m).
                      </p>
                      <a
                        href={data.terrain_metadata.roughness_analysis.data_url}
                        className="mt-2 inline-block text-[#d1d5db] underline underline-offset-4 hover:text-white"
                      >
                        Download Numerical Roughness Dataset
                      </a>
                    </div>
                  )}

                  {demo?.is_available && (
                    <div className="rounded bg-[#1a1d24] p-3.5">
                      <div className="font-semibold text-white">+48 Hour Window Comparison</div>
                      <div className="mt-1.5 space-y-1 text-[11px] tabular-nums text-[#9ca3af]">
                        {demo.windows.map((window, index) => (
                          <div key={window.start_utc}>
                            {window.start_utc.slice(0, 16)} UTC: DTE{' '}
                            <strong className="text-white">
                              {percent(demo.summary_metrics[index].dte_availability_pct)}
                            </strong>{' '}
                            · Sun{' '}
                            <strong className="text-white">
                              {percent(demo.summary_metrics[index].solar_illumination_pct)}
                            </strong>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <figure className="!m-0 flex flex-col items-center justify-center rounded bg-[#0c0d10] p-4">
                  <img
                    className="heightmap max-h-60 w-auto rounded-sm object-contain"
                    src={data.terrain_metadata.heightmap_texture}
                    alt={`Elevation heightmap for ${terrainName}`}
                  />
                  <figcaption className="mt-2 text-center text-[11px] tabular-nums text-[#8e939e]">
                    {data.terrain_metadata.area_width_km} × {data.terrain_metadata.area_height_km}{' '}
                    km tile · Elev {data.terrain_metadata.min_elevation_m.toFixed(1)} m to{' '}
                    {data.terrain_metadata.max_elevation_m.toFixed(1)} m
                  </figcaption>
                </figure>
              </div>
            </section>
          )}
        </>
      )}

      {/* Provenance & AI Backsound Attribution Footer */}
      <footer className="flex flex-wrap items-center justify-between gap-2 rounded bg-[#14161b] px-5 py-3.5 text-xs text-[#8e939e]">
        <a
          href="https://ssd.jpl.nasa.gov/horizons/"
          target="_blank"
          rel="noreferrer"
          className="text-[#d1d5db] underline underline-offset-4 hover:text-white"
        >
          NASA JPL Horizons Ephemeris Reference
        </a>
        <span>Ambient Backsound (backsound-1.mp3) — Music generated by AI</span>
      </footer>
    </main>
  );
}
