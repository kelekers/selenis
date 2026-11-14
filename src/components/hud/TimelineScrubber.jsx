import { Pause, Play, SkipBack, SkipForward } from 'lucide-react';
import { isValidSkyVector } from '../../utils/shadowMath';
import { formatAngleShort, formatUtcLabel, stepIndex } from '../../utils/hudModel';

export function TimelineScrubber({
  timeIndex,
  totalSteps,
  onChangeTimeIndex,
  isPlaying,
  onTogglePlay,
  activeEphemeris,
}) {
  // Never substitute a made-up timestamp when the sample has none.
  const formattedUtc = formatUtcLabel(activeEphemeris?.timestamp_utc) ?? 'Waktu tidak tersedia';
  const sunVec = isValidSkyVector(activeEphemeris?.sun_vector) ? activeEphemeris.sun_vector : null;
  const hasTimeline = totalSteps > 0;

  const stepPrev = () => {
    if (!hasTimeline) return;
    onChangeTimeIndex(stepIndex(timeIndex, totalSteps, -1));
  };

  const stepNext = () => {
    if (!hasTimeline) return;
    onChangeTimeIndex(stepIndex(timeIndex, totalSteps, +1));
  };

  return (
    <footer className="pointer-events-none fixed inset-x-0 bottom-0 z-20 flex justify-center p-4">
      <div className="pointer-events-auto flex w-full max-w-3xl flex-col gap-2 rounded-2xl border border-white/15 bg-[#0b101b]/85 px-4 py-3 shadow-xl backdrop-blur-md sm:flex-row sm:items-center sm:gap-4">
        {/* Tombol Kontrol Pemutaran */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={stepPrev}
            disabled={!hasTimeline}
            aria-label="Mundur satu langkah waktu"
            className="rounded-lg border border-white/10 bg-white/5 p-2 text-slate-300 transition hover:border-white/25 hover:text-white"
            title="Mundur satu langkah waktu"
          >
            <SkipBack className="h-3.5 w-3.5" />
          </button>

          <button
            type="button"
            onClick={onTogglePlay}
            disabled={!hasTimeline}
            aria-pressed={isPlaying}
            className="flex items-center gap-1.5 rounded-lg bg-amber-500 px-3.5 py-2 text-xs font-semibold text-slate-950 transition hover:bg-amber-400"
          >
            {isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
            <span>{isPlaying ? 'Pause' : 'Simulasi'}</span>
          </button>

          <button
            type="button"
            onClick={stepNext}
            disabled={!hasTimeline}
            aria-label="Maju satu langkah waktu"
            className="rounded-lg border border-white/10 bg-white/5 p-2 text-slate-300 transition hover:border-white/25 hover:text-white"
            title="Maju satu langkah waktu"
          >
            <SkipForward className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Slider Waktu */}
        <div className="flex flex-1 flex-col gap-1">
          <input
            type="range"
            min={0}
            max={Math.max(0, totalSteps - 1)}
            value={timeIndex}
            onChange={(e) => onChangeTimeIndex(Number(e.target.value))}
            disabled={!hasTimeline}
            aria-label="Mission timeline hour scrubber"
            aria-valuetext={formattedUtc}
            className="h-1.5 w-full cursor-pointer accent-amber-400"
          />
          <div className="flex justify-between font-mono text-[10px] text-slate-400">
            <span>T+000h</span>
            <span>Jam ke-{timeIndex + 1} dari {totalSteps}</span>
            <span>T+{Math.max(0, totalSteps - 1)}h</span>
          </div>
        </div>

        {/* Telemetri Waktu & Sudut Cepat */}
        <div className="border-t border-white/10 pt-2 text-left font-mono text-xs sm:border-t-0 sm:border-l sm:pt-0 sm:pl-4 sm:text-right">
          <div className="font-semibold text-slate-100" data-testid="active-utc">
            {formattedUtc}
          </div>
          <div className={`text-[11px] ${sunVec ? 'text-amber-300' : 'text-slate-400'}`}>
            {sunVec
              ? `Sun Az ${formatAngleShort(sunVec.azimuth_deg)} · El ${formatAngleShort(sunVec.elevation_deg)}`
              : 'Sun: arah tidak tersedia'}
          </div>
        </div>
      </div>
    </footer>
  );
}