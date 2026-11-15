import { useCallback, useMemo, useRef, useState } from 'react';
import { isValidSkyVector, normalizeAzimuth } from '../../utils/shadowMath';
import {
  buildHorizonPolygon,
  buildSkyTrackPath,
  formatAngleShort,
  panoramaElevationRange,
} from '../../utils/hudModel';

function englishVisibilityLabel(kind, state) {
  if (kind === 'sun') {
    if (state === true) return { tone: 'positive', text: 'Sun Visible' };
    if (state === false) return { tone: 'negative', text: 'Sun Occluded' };
    return { tone: 'unknown', text: 'Sun Unknown' };
  }
  if (state === true) return { tone: 'positive', text: 'Earth Clear' };
  if (state === false) return { tone: 'negative', text: 'Earth Occluded' };
  return { tone: 'unknown', text: 'Earth Unknown' };
}

function InfoHover({ text }) {
  const triggerRef = useRef(null);
  const [coords, setCoords] = useState(null);

  const updatePosition = () => {
    const el = triggerRef.current;
    if (!el || typeof window === 'undefined') return;
    const rect = el.getBoundingClientRect();
    const tooltipWidth = 216;
    const left = Math.max(12, Math.min(window.innerWidth - tooltipWidth - 12, rect.right - tooltipWidth));
    const showAbove = rect.top > 110;
    setCoords({
      left,
      top: showAbove ? rect.top - 8 : rect.bottom + 8,
      showAbove,
    });
  };

  return (
    <span
      ref={triggerRef}
      onMouseEnter={updatePosition}
      onFocus={updatePosition}
      onMouseLeave={() => setCoords(null)}
      onBlur={() => setCoords(null)}
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
          coords
            ? {
                position: 'fixed',
                left: `${coords.left}px`,
                top: `${coords.top}px`,
                transform: coords.showAbove ? 'translateY(-100%)' : 'none',
              }
            : undefined
        }
        className={`pointer-events-none z-[100] w-[216px] rounded bg-[#22252d] px-2.5 py-2 text-[10.5px] leading-relaxed font-normal whitespace-normal text-[#e5e7eb] shadow-2xl transition-opacity duration-150 ${
          coords ? 'visible opacity-100' : 'invisible fixed opacity-0'
        }`}
      >
        {text}
      </span>
    </span>
  );
}

export function HorizonPanoramaChart({
  activeSite,
  ephemerisTimeline,
  activeEphemeris,
  activeVisibility,
  uiMode = 'planner',
  hideHeader = false,
}) {
  const { min, max } = useMemo(
    () => panoramaElevationRange(activeSite, ephemerisTimeline),
    [activeSite, ephemerisTimeline]
  );
  const elevationToY = useCallback(
    (elevation) => 100 - ((Math.max(min, Math.min(max, elevation)) - min) / (max - min)) * 100,
    [min, max]
  );

  const horizonPolygonPoints = useMemo(
    () => buildHorizonPolygon(activeSite?.horizon_mask_360, elevationToY),
    [activeSite, elevationToY]
  );

  const earthLibrationPath = useMemo(
    () => buildSkyTrackPath(ephemerisTimeline, 'earth_vector', elevationToY),
    [ephemerisTimeline, elevationToY]
  );

  const sunVec = isValidSkyVector(activeEphemeris?.sun_vector) ? activeEphemeris.sun_vector : null;
  const earthVec = isValidSkyVector(activeEphemeris?.earth_vector)
    ? activeEphemeris.earth_vector
    : null;
  const isSunVisible = activeVisibility?.is_sun_visible ?? null;
  const isDteActive = activeVisibility?.is_dte_active ?? null;
  const sunLabel = englishVisibilityLabel('sun', isSunVisible);
  const earthLabel = englishVisibilityLabel('earth', isDteActive);
  const sunDetail =
    sunVec && Number.isFinite(activeVisibility?.sun_horizon_deg)
      ? `Sun El ${formatAngleShort(sunVec.elevation_deg)} vs Crater Rim ${formatAngleShort(activeVisibility.sun_horizon_deg)}`
      : 'Local horizon elevation comparison unavailable';
  const earthDetail =
    earthVec && Number.isFinite(activeVisibility?.earth_horizon_deg)
      ? `Earth El ${formatAngleShort(earthVec.elevation_deg)} vs Crater Rim ${formatAngleShort(activeVisibility.earth_horizon_deg)}`
      : 'Geometric line-of-sight against local horizon mask';

  const isPlanner = uiMode === 'planner';

  return (
    <section className="font-jakarta rounded bg-[#15171c] p-3">
      {!hideHeader && (
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span
              className="material-symbols-outlined text-[16px] text-[#9ca3af]"
              aria-hidden="true"
            >
              panorama_horizontal
            </span>
            <h2 className="text-[11.5px] font-semibold tracking-wide text-white uppercase">
              360° Horizon Profile
            </h2>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[10.5px] font-medium tabular-nums text-[#8e939e]">
              {min}° to +{max}°
            </span>
            {isPlanner && (
              <InfoHover text="360° topographic silhouette computed from the local 5 m DEM around the active landing site. Dashed curve shows Earth's libration path." />
            )}
          </div>
        </div>
      )}

      {/* SVG Horizon Silhouette Canvas */}
      <div className="relative overflow-hidden rounded-sm bg-[#090a0d]">
        <svg viewBox="0 0 360 100" className="h-28 w-full preserve-3d">
          <line
            x1="0"
            y1={elevationToY(5)}
            x2="360"
            y2={elevationToY(5)}
            stroke="rgba(255,255,255,0.06)"
            strokeDasharray="3 3"
            strokeWidth="0.6"
          />
          <line
            x1="0"
            y1={elevationToY(0)}
            x2="360"
            y2={elevationToY(0)}
            stroke="rgba(255,255,255,0.16)"
            strokeWidth="0.7"
          />

          {/* Earth Libration Wobble Track */}
          {earthLibrationPath && (
            <path
              d={earthLibrationPath}
              fill="none"
              stroke="rgba(209, 213, 219, 0.4)"
              strokeWidth="1"
              strokeDasharray="2 1.5"
            />
          )}

          {/* Crater Rim Silhouette */}
          {horizonPolygonPoints && (
            <polygon
              points={horizonPolygonPoints}
              fill="rgba(24, 26, 32, 0.96)"
              stroke="#525866"
              strokeWidth="1.1"
            />
          )}

          {/* Current Sun Position */}
          {sunVec && (
            <g
              transform={`translate(${normalizeAzimuth(sunVec.azimuth_deg)}, ${elevationToY(sunVec.elevation_deg)})`}
            >
              <circle
                r="5.5"
                fill={
                  isSunVisible === true ? 'rgba(255, 255, 255, 0.2)' : 'rgba(156, 163, 175, 0.12)'
                }
              />
              <circle
                r="2.8"
                fill={isSunVisible === true ? '#ffffff' : '#6b7280'}
                stroke="#111317"
                strokeWidth="0.6"
              />
            </g>
          )}

          {/* Current Earth Position */}
          {earthVec && (
            <g
              transform={`translate(${normalizeAzimuth(earthVec.azimuth_deg)}, ${elevationToY(
                earthVec.elevation_deg
              )})`}
            >
              <circle
                r="5"
                fill={
                  isDteActive === true
                    ? 'rgba(209, 213, 219, 0.2)'
                    : 'rgba(107, 114, 128, 0.15)'
                }
              />
              <circle
                r="2.6"
                fill={isDteActive === true ? '#d1d5db' : '#52525b'}
                stroke="#ffffff"
                strokeWidth="0.6"
              />
            </g>
          )}
        </svg>

        {!horizonPolygonPoints && (
          <div className="pointer-events-none absolute inset-x-0 top-2 text-center text-[10.5px] text-[#8e939e]">
            Site horizon mask unavailable
          </div>
        )}

        {/* Cardinal Azimuth Labels */}
        <div className="flex justify-between bg-[#0d0e12] px-2.5 py-1 text-[10px] font-medium tabular-nums text-[#7c818c]">
          <span>0° N</span>
          <span>90° E</span>
          <span>180° S</span>
          <span>270° W</span>
          <span>360° N</span>
        </div>
      </div>

      {/* Compact Visibility Status Pills */}
      <div className="mt-2 grid grid-cols-2 gap-1.5 text-[11px]">
        <div className="flex items-center justify-between rounded bg-[#1c1f26] px-2.5 py-1.5">
          <div
            className="flex min-w-0 items-center gap-1.5 font-medium text-[#e5e7eb]"
            data-testid="sun-visibility"
          >
            <span
              className="material-symbols-outlined text-[14px] text-[#9ca3af]"
              aria-hidden="true"
            >
              wb_sunny
            </span>
            <span className="truncate">{sunLabel.text}</span>
          </div>
          {isPlanner && <InfoHover text={sunDetail} />}
        </div>

        <div className="flex items-center justify-between rounded bg-[#1c1f26] px-2.5 py-1.5">
          <div
            className="flex min-w-0 items-center gap-1.5 font-medium text-[#e5e7eb]"
            data-testid="earth-visibility"
          >
            <span
              className="material-symbols-outlined text-[14px] text-[#9ca3af]"
              aria-hidden="true"
            >
              satellite_alt
            </span>
            <span className="truncate">{earthLabel.text}</span>
          </div>
          {isPlanner && <InfoHover text={earthDetail} />}
        </div>
      </div>
    </section>
  );
}
