import { useEffect, useState } from 'react';
import { formatRegionLabel } from './utils/hudModel';

export function DataReport({ telemetryUrl = '/data/site_telemetry.json' }) {
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
          horizon & slope analysis derived from NASA JPL Horizons ephemeris.
        </p>
      </header>

      {/* 1. Southern Hemisphere Overview */}
      {hemisphere && (
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
            {data.sites.map((site, idx) => (
              <section
                key={site.site_id}
                aria-labelledby={site.site_id}
                className="rounded bg-[#14161b] p-6"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.06] pb-3">
                  <h2
                    id={site.site_id}
                    className="!m-0 !border-0 !p-0 text-base font-semibold text-white"
                  >
                    2.{idx + 1} {formatRegionLabel(site.name)}
                  </h2>
                  {site.coordinates && (
                    <span className="rounded-sm bg-[#1c1f26] px-2.5 py-1 text-xs font-medium tabular-nums text-[#b4b8c2]">
                      {Math.abs(site.coordinates.latitude_deg).toFixed(4)}°S,{' '}
                      {Math.abs(site.coordinates.longitude_deg).toFixed(4)}°
                      {site.coordinates.longitude_deg < 0 ? 'W' : 'E'} · Elev{' '}
                      {Math.round(site.coordinates.elevation_m)} m
                    </span>
                  )}
                </div>

                <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                  {/* 0° Horizon Baseline */}
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
                  {site.terrain_summary_metrics && (
                    <div className="rounded bg-[#1a1d24] p-4">
                      <h3 className="!mt-0 mb-2.5 text-xs font-semibold tracking-wider text-white uppercase">
                        Local 5 m DEM Horizon Model
                      </h3>
                      <dl className="!m-0 !border-0 !bg-transparent !p-0 text-xs">
                        <dt>Unobstructed Sunlight</dt>
                        <dd>{percent(site.terrain_summary_metrics.solar_illumination_pct)}</dd>
                        <dt>Unobstructed Earth DTE</dt>
                        <dd>{percent(site.terrain_summary_metrics.dte_availability_pct)}</dd>
                        <dt>Longest Continuous Darkness</dt>
                        <dd>{site.terrain_summary_metrics.max_eclipse_hours} hrs</dd>
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

                {site.terrain_summary_metrics && site.horizon_mask_360 && (
                  <figure className="!mb-0 mt-4 rounded bg-[#0c0d10] p-4">
                    <svg
                      viewBox="0 0 720 160"
                      role="img"
                      aria-label={`Local 360° horizon profile for ${formatRegionLabel(site.name)}`}
                      className="h-28 w-full"
                    >
                      <line
                        x1="0"
                        y1="130"
                        x2="720"
                        y2="130"
                        stroke="rgba(255,255,255,0.2)"
                        strokeDasharray="4 4"
                      />
                      <polyline
                        fill="none"
                        stroke="#e5e7eb"
                        strokeWidth="2"
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
            ))}
          </div>

          {/* 3. DEM Coverage, Roughness & +48h Validation */}
          {data.terrain_metadata && (
            <section aria-labelledby="terrain-heading" className="rounded bg-[#14161b] p-6">
              <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
                <h2
                  id="terrain-heading"
                  className="!m-0 !border-0 !p-0 text-base font-semibold text-white"
                >
                  3. DEM Coverage, Surface Roughness & Validation ({terrainName})
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
                        Context Metadata & Overlap Comparison
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
