import { useMemo } from 'react';
import { Eye, Radio, Sun } from 'lucide-react';

const MIN_EL = -2;
const MAX_EL = 10;
const EL_SPAN = MAX_EL - MIN_EL;

function elevationToY(elDeg) {
  const clamped = Math.max(MIN_EL, Math.min(MAX_EL, elDeg));
  return 100 - ((clamped - MIN_EL) / EL_SPAN) * 100;
}

export function HorizonPanoramaChart({
  activeSite,
  ephemerisTimeline,
  activeEphemeris,
  activeVisibility,
  uiMode,
}) {
  const horizonPolygonPoints = useMemo(() => {
    const mask = activeSite?.horizon_mask_360;
    if (!Array.isArray(mask) || mask.length === 0) {
      return '0,100 0,85 360,85 360,100';
    }

    const sorted = [...mask].sort((a, b) => a.azimuth_deg - b.azimuth_deg);
    const points = sorted.map(
      (pt) => `${pt.azimuth_deg},${elevationToY(pt.horizon_elevation_deg).toFixed(2)}`
    );
    const closingY = elevationToY(sorted[0].horizon_elevation_deg).toFixed(2);
    points.push(`360,${closingY}`);

    return `0,100 ${points.join(' ')} 360,100`;
  }, [activeSite]);

  const earthLibrationPath = useMemo(() => {
    if (!Array.isArray(ephemerisTimeline) || ephemerisTimeline.length === 0) return '';
    return ephemerisTimeline
      .map((item, idx) => {
        const x = item.earth_vector.azimuth_deg;
        const y = elevationToY(item.earth_vector.elevation_deg).toFixed(2);
        return `${idx === 0 ? 'M' : 'L'} ${x} ${y}`;
      })
      .join(' ');
  }, [ephemerisTimeline]);

  const sunVec = activeEphemeris?.sun_vector;
  const earthVec = activeEphemeris?.earth_vector;
  const isSunVisible = activeVisibility?.is_sun_visible;
  const isDteActive = activeVisibility?.is_dte_active;

  return (
    <section className="rounded-xl border border-white/15 bg-[#0b101b]/80 p-3.5 shadow-lg backdrop-blur-md">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Eye className="h-4 w-4 text-amber-400" />
          <h2 className="text-xs font-semibold tracking-wide text-slate-100 uppercase">
            360° Lander POV Horizon
          </h2>
        </div>
        <span className="font-mono text-[10px] text-slate-400">Elev -2° s/d +10°</span>
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

          {/* Siluet Topografi Bibir Kawah */}
          <polygon
            points={horizonPolygonPoints}
            fill="rgba(30, 41, 59, 0.9)"
            stroke="#64748b"
            strokeWidth="1.2"
          />

          {/* Titik Posisi Matahari Saat Ini */}
          {sunVec && (
            <g transform={`translate(${sunVec.azimuth_deg}, ${elevationToY(sunVec.elevation_deg)})`}>
              <circle
                r="6.5"
                fill={isSunVisible ? 'rgba(245, 158, 11, 0.25)' : 'rgba(148, 163, 184, 0.15)'}
              />
              <circle
                r="3.2"
                fill={isSunVisible ? '#f59e0b' : '#94a3b8'}
                stroke="#fff"
                strokeWidth="0.6"
              />
            </g>
          )}

          {/* Titik Posisi Bumi Saat Ini */}
          {earthVec && (
            <g
              transform={`translate(${earthVec.azimuth_deg}, ${elevationToY(
                earthVec.elevation_deg
              )})`}
            >
              <circle
                r="5.5"
                fill={isDteActive ? 'rgba(16, 185, 129, 0.25)' : 'rgba(239, 68, 68, 0.25)'}
              />
              <circle
                r="2.8"
                fill={isDteActive ? '#10b981' : '#ef4444'}
                stroke="#fff"
                strokeWidth="0.6"
              />
            </g>
          )}
        </svg>

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
          <div className="flex items-center gap-1 font-medium text-amber-300">
            <Sun className="h-3.5 w-3.5" />
            <span>{isSunVisible ? 'Surya Terpapar' : 'Terhalang Kawah'}</span>
          </div>
          <p className="mt-0.5 font-mono text-[10px] text-slate-400">
            {uiMode === 'planner'
              ? `El ${sunVec?.elevation_deg}° vs Rim ${activeVisibility?.sun_horizon_deg}°`
              : isSunVisible
              ? 'Pusat Matahari terlihat dalam model lokal'
              : 'Pusat Matahari tidak terlihat dalam model lokal'}
          </p>
        </div>

        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-2">
          <div
            className={`flex items-center gap-1 font-medium ${
              isDteActive ? 'text-emerald-300' : 'text-rose-300'
            }`}
          >
            <Radio className="h-3.5 w-3.5" />
            <span>{isDteActive ? 'Bumi terlihat secara geometris' : 'Bumi tidak terlihat dalam model lokal'}</span>
          </div>
          <p className="mt-0.5 font-mono text-[10px] text-slate-400">
            {uiMode === 'planner'
              ? `El ${earthVec?.elevation_deg}° vs Rim ${activeVisibility?.earth_horizon_deg}°`
              : isDteActive
              ? 'Garis pandang langsung ke Bumi'
              : 'Bumi turun di balik tebing'}
          </p>
        </div>
      </div>
      <p className="mt-2 text-[10px] text-slate-400">Model geometris hanya mencakup medan lokal; penghalang di luar Site01, daya, dan kualitas sinyal belum dinilai.</p>
    </section>
  );
}
