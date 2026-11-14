import { AlertTriangle, ArrowRightLeft, CheckCircle2 } from 'lucide-react';

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

  const solarDelta =
    metricsA && metricsB
      ? (metricsA.solar_illumination_pct - metricsB.solar_illumination_pct).toFixed(1)
      : null;

  const dteDelta =
    metricsA && metricsB
      ? (metricsA.dte_availability_pct - metricsB.dte_availability_pct).toFixed(1)
      : null;

  const activeMetrics = activeSite?.summary_metrics;

  return (
    <section className="rounded-xl border border-white/15 bg-[#0b101b]/80 p-3.5 shadow-lg backdrop-blur-md">
      <div className="mb-2.5 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <ArrowRightLeft className="h-4 w-4 text-amber-400" />
          <h2 className="text-xs font-semibold tracking-wide text-slate-100 uppercase">
            Micro-Shift Sensitivity (450m)
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
          const m = site.summary_metrics;
          return (
            <button
              key={site.site_id}
              type="button"
              onClick={() => onSelectSite(site.site_id)}
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
                  Slope {m.max_slope_deg}°
                </span>
              </div>
              <p className="mt-1 line-clamp-1 text-xs font-medium text-slate-100">
                {index === 0 ? 'Connecting Ridge' : 'Inner Rim Slope'}
              </p>
              <div className="mt-2 space-y-1 font-mono text-[11px]">
                <div className="flex justify-between text-slate-300">
                  <span>Surya</span>
                  <span className="font-semibold text-amber-300">
                    {m.solar_illumination_pct}%
                  </span>
                </div>
                <div className="flex justify-between text-slate-300">
                  <span>DTE Bumi</span>
                  <span className="font-semibold text-emerald-300">
                    {m.dte_availability_pct}%
                  </span>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Ringkasan Delta & Penjelasan Mode */}
      {solarDelta && dteDelta && (
        <div className="mt-2.5 rounded-lg border border-amber-400/20 bg-amber-500/10 p-2.5 text-[11px] text-slate-200">
          {uiMode === 'planner' ? (
            <div className="flex flex-wrap items-center justify-between gap-1 font-mono text-[10px]">
              <span className="text-amber-300">
                Δ Solar: {Number(solarDelta) >= 0 ? `+${solarDelta}%` : `${solarDelta}%`}
              </span>
              <span className="text-emerald-300">
                Δ DTE: {Number(dteDelta) >= 0 ? `+${dteDelta}%` : `${dteDelta}%`}
              </span>
              <span className="text-slate-300">
                Eclipse Maks: {activeMetrics?.max_eclipse_hours} jam
              </span>
            </div>
          ) : (
            <p className="leading-relaxed text-slate-200">
              Bergeser <strong>450 meter</strong> ke punggungan kawah (Site A) meningkatkan pasokan
              listrik surya sebesar <strong>+{solarDelta}%</strong> dan memangkas waktu gelap total
              dari {metricsB?.max_eclipse_hours} jam menjadi {metricsA?.max_eclipse_hours} jam.
            </p>
          )}
        </div>
      )}
    </section>
  );
}