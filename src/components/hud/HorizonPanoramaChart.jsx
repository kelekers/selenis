import { useCallback, useMemo } from 'react';
import { Eye, Radio, Sun } from 'lucide-react';
import { isValidSkyVector, normalizeAzimuth } from '../../utils/shadowMath';
import {
  buildHorizonPolygon,
  buildSkyTrackPath,
  formatAngleShort,
  visibilityLabel,
  panoramaElevationRange,
} from '../../utils/hudModel';

const TONE_TEXT = {
  positive: 'text-emerald-300',
  negative: 'text-rose-300',
  unknown: 'text-slate-400',
};

export function HorizonPanoramaChart({
  activeSite,
  ephemerisTimeline,
  activeEphemeris,
  activeVisibility,
  uiMode,
}) {
  const { min, max } = useMemo(() => panoramaElevationRange(activeSite, ephemerisTimeline), [activeSite, ephemerisTimeline]);
  const elevationToY = useCallback((elevation) =>
    100 - (Math.max(min, Math.min(max, elevation)) - min) / (max - min) * 100, [min, max]);
  // null when the site has no usable mask → no fake flat horizon is drawn.
  const horizonPolygonPoints = useMemo(
    () => buildHorizonPolygon(activeSite?.horizon_mask_360, elevationToY),
    [activeSite, elevationToY]
  );

  // Missing samples and 0°/360° jumps break the path instead of crashing / drawing across the chart.
  const earthLibrationPath = useMemo(
    () => buildSkyTrackPath(ephemerisTimeline, 'earth_vector', elevationToY),
    [ephemerisTimeline, elevationToY]
  );

  const sunVec = isValidSkyVector(activeEphemeris?.sun_vector) ? activeEphemeris.sun_vector : null;
  const earthVec = isValidSkyVector(activeEphemeris?.earth_vector)
    ? activeEphemeris.earth_vector
    : null;
  // Tri-state (true / false / null = unknown) from the browser horizon-mask preview.
  const isSunVisible = activeVisibility?.is_sun_visible ?? null;
  const isDteActive = activeVisibility?.is_dte_active ?? null;
  const sunLabel = visibilityLabel('sun', isSunVisible);
  const earthLabel = visibilityLabel('earth', isDteActive);
  const sunDetail =
    sunVec && Number.isFinite(activeVisibility?.sun_horizon_deg)
      ? `El ${formatAngleShort(sunVec.elevation_deg)} vs Rim ${formatAngleShort(activeVisibility.sun_horizon_deg)}`
      : 'Data sudut/horizon tidak tersedia';
  const earthDetail =
    earthVec && Number.isFinite(activeVisibility?.earth_horizon_deg)
      ? `El ${formatAngleShort(earthVec.elevation_deg)} vs Rim ${formatAngleShort(activeVisibility.earth_horizon_deg)}`
      : 'Data sudut/horizon tidak tersedia';

  return (
    <section className="rounded-xl border border-white/15 bg-[#0b101b]/80 p-3.5 shadow-lg backdrop-blur-md">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Eye className="h-4 w-4 text-amber-400" />
          <h2 className="text-xs font-semibold tracking-wide text-slate-100 uppercase">
            360° Lander POV Horizon
          </h2>
        </div>
        <span className="font-mono text-[10px] text-slate-400">Elev {min}° s/d +{max}°</span>
      </div>

      {/* Kanvas SVG Siluet Cakrawala */}
      <div className="relative overflow-hidden rounded-lg border border-white/10 bg-[#050811]">
        <svg viewBox="0 0 360 100" className="h-32 w-full preserve-3d">
          {/* Garis referensi elevasi 0° dan +5° */}
          <line
            x1="0"
            y1={elevationToY(5)}
            x2="360"
            y2={elevationToY(5)}
            stroke="rgba(255,255,255,0.08)"
            strokeDasharray="3 3"
            strokeWidth="0.6"
          />
          <line
            x1="0"
            y1={elevationToY(0)}
            x2="360"
            y2={elevationToY(0)}
            stroke="rgba(255,255,255,0.18)"
            strokeWidth="0.7"
          />

          {/* Jejak Lintasan Librasi Bumi (Earth Libration Wobble) */}
          {earthLibrationPath && (
            <path
              d={earthLibrationPath}
              fill="none"
              stroke="rgba(56, 189, 248, 0.45)"
              strokeWidth="1"
              strokeDasharray="2 1.5"
            />
          )}

          {/* Siluet Topografi Bibir Kawah (hanya bila horizon mask tersedia) */}
          {horizonPolygonPoints && (
            <polygon
              points={horizonPolygonPoints}
              fill="rgba(30, 41, 59, 0.9)"
              stroke="#64748b"
              strokeWidth="1.2"
            />
          )}

          {/* Titik Posisi Matahari Saat Ini */}
          {sunVec && (
            <g
              transform={`translate(${normalizeAzimuth(sunVec.azimuth_deg)}, ${elevationToY(sunVec.elevation_deg)})`}
            >
              <circle
                r="6.5"
                fill={isSunVisible === true ? 'rgba(245, 158, 11, 0.25)' : 'rgba(148, 163, 184, 0.15)'}
              />
              <circle
                r="3.2"
                fill={isSunVisible === true ? '#f59e0b' : '#94a3b8'}
                stroke="#fff"
                strokeWidth="0.6"
              />
            </g>
          )}

          {/* Titik Posisi Bumi Saat Ini */}
          {earthVec && (
            <g
              transform={`translate(${normalizeAzimuth(earthVec.azimuth_deg)}, ${elevationToY(
                earthVec.elevation_deg
              )})`}
            >
              <circle
                r="5.5"
                fill={
                  isDteActive === true
                    ? 'rgba(16, 185, 129, 0.25)'
                    : isDteActive === false
                      ? 'rgba(239, 68, 68, 0.25)'
                      : 'rgba(148, 163, 184, 0.2)'
                }
              />
              <circle
                r="2.8"
                fill={isDteActive === true ? '#10b981' : isDteActive === false ? '#ef4444' : '#94a3b8'}
                stroke="#fff"
                strokeWidth="0.6"
              />
            </g>
          )}
        </svg>

        {!horizonPolygonPoints && (
          <div className="pointer-events-none absolute inset-x-0 top-2 text-center font-mono text-[10px] text-slate-400">
            Horizon mask site tidak tersedia
          </div>
        )}

        {/* Label Arah Mata Angin */}
        <div className="flex justify-between border-t border-white/10 bg-black/40 px-2 py-1 font-mono text-[9px] text-slate-400">
          <span>0° U</span>
          <span>90° T</span>
          <span>180° S</span>
          <span>270° B</span>
          <span>360° U</span>
        </div>
      </div>

      {/* Keterangan Status Cakrawala */}
      <div className="mt-2.5 grid grid-cols-2 gap-2 text-[11px]">
        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-2">
          <div
            className={`flex items-center gap-1 font-medium ${
              isSunVisible === null ? TONE_TEXT.unknown : 'text-amber-300'
            }`}
            data-testid="sun-visibility"
          >
            <Sun className="h-3.5 w-3.5" />
            <span>{sunLabel.text}</span>
          </div>
          <p className="mt-0.5 font-mono text-[10px] text-slate-400">
            {uiMode === 'planner'
              ? sunDetail
              : isSunVisible === true
                ? 'Panel surya dapat menerima cahaya'
                : isSunVisible === false
                  ? 'Site dalam bayangan horizon'
                  : 'Status cahaya tidak diketahui'}
          </p>
        </div>

        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-2">
          <div
            className={`flex items-center gap-1 font-medium ${TONE_TEXT[earthLabel.tone]}`}
            data-testid="earth-visibility"
            title="Garis pandang geometris terhadap horizon mask — bukan kualitas link komunikasi"
          >
            <Radio className="h-3.5 w-3.5" />
            <span>{earthLabel.text}</span>
          </div>
          <p className="mt-0.5 font-mono text-[10px] text-slate-400">
            {uiMode === 'planner'
              ? earthDetail
              : isDteActive === true
                ? 'Ada garis pandang langsung ke Bumi'
                : isDteActive === false
                  ? 'Bumi di balik horizon/tebing'
                  : 'Status garis pandang tidak diketahui'}
          </p>
        </div>
      </div>
      <p className="mt-2 text-[10px] text-slate-400">Model geometris hanya mencakup medan lokal; penghalang di luar Site01, daya, dan kualitas sinyal belum dinilai.</p>
    </section>
  );
}
