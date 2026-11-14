import { AlertTriangle, ArrowRightLeft, CheckCircle2 } from 'lucide-react';
import {
  NO_VALUE,
  formatAngleShort,
  formatMeters,
  formatPercent,
  greatCircleDistanceM,
} from '../../utils/hudModel';

/** Signed percentage-point difference, or null when either value is missing. */
function deltaPoints(a, b) {
  return Number.isFinite(a) && Number.isFinite(b) ? Number((a - b).toFixed(1)) : null;
}
const signed = (v) => (v > 0 ? `+${v}` : `${v}`);
const hours = (v) => (Number.isFinite(v) ? `${v} jam` : NO_VALUE);

export function MicroShiftDeltaCard({
  sites,
  selectedSiteId,
  onSelectSite,
  activeSite,
  uiMode,
}) {
  const siteA = sites[0];
  const siteB = sites[1];

  const metricsA = siteA?.summary_metrics;
  const metricsB = siteB?.summary_metrics;

  // Differences of two percentages are percentage points (pp), not a relative % increase.
  const solarDelta = deltaPoints(metricsA?.solar_illumination_pct, metricsB?.solar_illumination_pct);
  const dteDelta = deltaPoints(metricsA?.dte_availability_pct, metricsB?.dte_availability_pct);
  // Distance derived from the two sites' coordinates (sphere, IAU mean radius), not hard-coded.
  const separationM = greatCircleDistanceM(siteA?.coordinates, siteB?.coordinates);
  const separationLabel = separationM === null ? NO_VALUE : `≈${formatMeters(separationM)}`;

  const activeMetrics = activeSite?.summary_metrics;

  return (
    <section className="rounded-xl border border-white/15 bg-[#0b101b]/80 p-3.5 shadow-lg backdrop-blur-md">
      <div className="mb-2.5 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <ArrowRightLeft className="h-4 w-4 text-amber-400" />
          <h2 className="text-xs font-semibold tracking-wide text-slate-100 uppercase">
            Micro-Shift Sensitivity (<span className="normal-case">{separationLabel}</span>)
          </h2>
        </div>
        {activeMetrics && (
          <span
            className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-mono text-[10px] font-semibold ${
              activeMetrics.safety_rating === 'OPTIMAL'
                ? 'bg-emerald-500/20 text-emerald-300'
                : 'bg-amber-500/20 text-amber-300'
            }`}
          >
            {activeMetrics.safety_rating === 'OPTIMAL' ? (
              <CheckCircle2 className="h-3 w-3" />
            ) : (
              <AlertTriangle className="h-3 w-3" />
            )}
            {activeMetrics.safety_rating}
          </span>
        )}
      </div>

      {/* Pilihan Cepat Site A vs Site B */}
      <div className="grid grid-cols-2 gap-2">
        {[siteA, siteB].filter(Boolean).map((site, index) => {
          const isSelected = site.site_id === selectedSiteId;
          const m = site.summary_metrics ?? {};
          return (
            <button
              key={site.site_id}
              type="button"
              onClick={() => onSelectSite(site.site_id)}
              aria-pressed={isSelected}
              className={`rounded-lg border p-2.5 text-left transition ${
                isSelected
                  ? 'border-amber-400 bg-amber-500/15 shadow-sm'
                  : 'border-white/10 bg-white/[0.03] hover:border-white/25'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-[11px] font-bold text-amber-300">
                  SITE {index === 0 ? 'A' : 'B'}
                </span>
                <span className="font-mono text-[10px] text-slate-400">
                  Slope {formatAngleShort(m.max_slope_deg)}
                </span>
              </div>
              <p
                className="mt-1 line-clamp-1 text-xs font-medium text-slate-100"
                title={site.name ?? site.site_id}
              >
                {site.name ?? site.site_id}
              </p>
              <div className="mt-2 space-y-1 font-mono text-[11px]">
                <div className="flex justify-between text-slate-300">
                  <span>Surya</span>
                  <span className="font-semibold text-amber-300">
                    {formatPercent(m.solar_illumination_pct)}
                  </span>
                </div>
                <div className="flex justify-between text-slate-300">
                  <span>DTE Bumi</span>
                  <span className="font-semibold text-emerald-300">
                    {formatPercent(m.dte_availability_pct)}
                  </span>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Ringkasan Delta & Penjelasan Mode */}
      {solarDelta !== null && dteDelta !== null && (
        <div className="mt-2.5 rounded-lg border border-amber-400/20 bg-amber-500/10 p-2.5 text-[11px] text-slate-200">
          {uiMode === 'planner' ? (
            <div className="flex flex-wrap items-center justify-between gap-1 font-mono text-[10px]">
              <span className="text-amber-300">
                Δ Solar: {signed(solarDelta)} pp
              </span>
              <span className="text-emerald-300">
                Δ DTE: {signed(dteDelta)} pp
              </span>
              <span className="text-slate-300">
                Eclipse Maks: {hours(activeMetrics?.max_eclipse_hours)}
              </span>
            </div>
          ) : (
            <p className="leading-relaxed text-slate-200">
              Selisih Site A dibanding Site B (jarak <strong>{separationLabel}</strong>): penyinaran
              Matahari <strong>{signed(solarDelta)} poin persen</strong>, waktu gelap terlama{' '}
              {hours(metricsB?.max_eclipse_hours)} → {hours(metricsA?.max_eclipse_hours)}.
            </p>
          )}
        </div>
      )}
    </section>
  );
}