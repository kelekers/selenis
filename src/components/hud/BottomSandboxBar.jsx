import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  formatAngleShort,
  formatPercent,
  formatRegionLabel,
  formatUtcLabel,
  stepIndex,
} from '../../utils/hudModel';
import { metricsForSite } from '../../utils/timeline';
import { MAX_SITES, SITE_LETTERS } from '../../utils/siteCalculations';
import {
  SYNODIC_MONTH_DAYS,
  SYNODIC_MONTH_HOURS,
  findBestMissionWindows,
} from '../../utils/missionPlanner';

const PLAYBACK_SPEEDS = [1, 2, 5, 10, 100, 1000];
const DISPLAY_SYNODIC_DAYS = 29.5;

function MaterialIcon({ name, className = 'text-[18px]' }) {
  return (
    <span className={`material-symbols-outlined select-none ${className}`} aria-hidden="true">
      {name}
    </span>
  );
}

export function BottomSandboxBar({
  timeIndex,
  totalSteps,
  onChangeTimeIndex,
  epochOffsetHours = 0,
  onChangeEpochOffsetHours,
  onJumpToDateUtc,
  ephemerisTimeline = [],
  isPlaying,
  onTogglePlay,
  playbackSpeed = 1,
  onChangePlaybackSpeed,
  activeEphemeris,
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
  isHudOpen,
  onToggleHud,
}) {
  // Active bottom drawer: null | 'planner' | 'regions' | 'sites'
  const [openDrawer, setOpenDrawer] = useState(null);

  // Looping AI Backsound Audio (`/music/backsound-1.mp3`)
  const audioRef = useRef(null);
  const [isMusicPlaying, setIsMusicPlaying] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof Audio === 'undefined') return undefined;
    const audio = new Audio('/music/backsound-1.mp3');
    audio.loop = true;
    audio.volume = 0.35;
    audioRef.current = audio;

    // Attempt gentle autoplay on first user interaction if browser blocks immediate autoplay
    const handlePlayError = () => {
      setIsMusicPlaying(false);
    };
    audio
      .play()
      .then(() => setIsMusicPlaying(true))
      .catch(handlePlayError);

    return () => {
      audio.pause();
      audioRef.current = null;
    };
  }, []);

  const toggleMusic = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      audio
        .play()
        .then(() => setIsMusicPlaying(true))
        .catch(() => setIsMusicPlaying(false));
    } else {
      audio.pause();
      setIsMusicPlaying(false);
    }
  };

  const toggleDrawer = (drawerKey) => {
    setOpenDrawer((prev) => (prev === drawerKey ? null : drawerKey));
  };

  const formattedUtc = formatUtcLabel(activeEphemeris?.timestamp_utc) ?? 'Time unavailable';
  const currentIsoDate = activeEphemeris?.timestamp_utc
    ? activeEphemeris.timestamp_utc.slice(0, 10)
    : '2026-09-01';
  const currentYear = Number(currentIsoDate.slice(0, 4)) || 2026;

  const hasTimeline = totalSteps > 0;
  const progressPct =
    totalSteps > 1 ? Math.max(0, Math.min(100, (timeIndex / (totalSteps - 1)) * 100)) : 0;

  const totalElapsedHours = epochOffsetHours + timeIndex;
  const totalElapsedDays = hasTimeline ? (totalElapsedHours / 24).toFixed(1) : '0.0';
  const synodicCycleNumber = Math.floor(totalElapsedHours / SYNODIC_MONTH_HOURS) + 1;
  const synodicDayCurrent = hasTimeline
    ? (((totalElapsedHours + 1) / 24) % DISPLAY_SYNODIC_DAYS).toFixed(1)
    : '0.0';

  const stepPrev = () => {
    if (!hasTimeline) return;
    if (timeIndex === 0 && epochOffsetHours >= totalSteps && onChangeEpochOffsetHours) {
      onChangeEpochOffsetHours(Math.max(0, epochOffsetHours - totalSteps));
      onChangeTimeIndex(totalSteps - 1);
      return;
    }
    onChangeTimeIndex(stepIndex(timeIndex, totalSteps, -1));
  };

  const stepNext = () => {
    if (!hasTimeline) return;
    if (timeIndex >= totalSteps - 1 && onChangeEpochOffsetHours) {
      onChangeEpochOffsetHours(epochOffsetHours + totalSteps);
      onChangeTimeIndex(0);
      return;
    }
    onChangeTimeIndex(stepIndex(timeIndex, totalSteps, +1));
  };

  const cycleSpeed = () => {
    if (!onChangePlaybackSpeed) return;
    const currentIdx = PLAYBACK_SPEEDS.indexOf(playbackSpeed);
    const next = PLAYBACK_SPEEDS[(currentIdx + 1) % PLAYBACK_SPEEDS.length] ?? 1;
    onChangePlaybackSpeed(next);
  };

  const visibleSites = sites.slice(0, MAX_SITES);
  const activeSiteIdx = Math.max(
    0,
    visibleSites.findIndex((s) => s?.site_id === (activeSite?.site_id ?? selectedSiteId))
  );
  const activeLetter = SITE_LETTERS[activeSiteIdx] ?? 'A';

  // Best Landing Window analysis for the active site & active epoch
  const windowAnalysis = useMemo(() => {
    if (openDrawer !== 'planner' && !activeSite) return null;
    return findBestMissionWindows(activeSite, ephemerisTimeline, epochOffsetHours);
  }, [activeSite, ephemerisTimeline, epochOffsetHours, openDrawer]);

  const shiftEpochByHours = (deltaHours) => {
    if (!onChangeEpochOffsetHours || !totalSteps) return;
    const maxOffset = 100 * 365.25 * 24;
    const rawNext = Math.max(0, Math.min(maxOffset, epochOffsetHours + deltaHours));
    const aligned = Math.round(rawNext / totalSteps) * totalSteps;
    onChangeEpochOffsetHours(aligned);
  };

  return (
    <div className="font-jakarta pointer-events-none fixed inset-x-0 bottom-0 z-30 flex flex-col select-none">
      {/* =====================================================================
          EXPANDABLE DRAWER ABOVE BOTTOM BAR (100-Year Planner, Regions, Sites)
         ===================================================================== */}
      {openDrawer && (
        <div
          data-testid={`sandbox-drawer-${openDrawer}`}
          className="pointer-events-auto mx-auto w-full max-w-4xl border-x border-t border-white/[0.06] bg-[#0c0d10]/95 shadow-2xl backdrop-blur-xl"
        >
          {/* Drawer Header Bar */}
          <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-2">
            <div className="flex items-center gap-2 text-xs font-medium text-white">
              {openDrawer === 'planner' && (
                <>
                  <MaterialIcon name="event_available" className="text-[16px] text-[#d1d5db]" />
                  <span>Mission Calendar (2026–2126) — Site {activeLetter}</span>
                </>
              )}
            </div>
            <button
              type="button"
              onClick={() => setOpenDrawer(null)}
              aria-label="Close bottom drawer"
              className="rounded-sm p-1 text-[#8e939e] transition hover:bg-[#1c1f26] hover:text-white"
            >
              <MaterialIcon name="close" className="text-[16px]" />
            </button>
          </div>

          {/* Drawer Content Grid */}
          <div className="max-h-64 overflow-y-auto p-3.5">
            {openDrawer === 'planner' && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded bg-[#15171c] p-3 text-xs">
                {/* Date Picker */}
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-medium text-[#9ca3af]">Date</span>
                  <input
                    type="date"
                    min="2026-09-01"
                    max="2126-12-31"
                    value={currentIsoDate}
                    onChange={(e) => {
                      if (e.target.value) onJumpToDateUtc?.(`${e.target.value}T00:00:00Z`);
                    }}
                    aria-label="Target mission date (2026 to 2126)"
                    data-testid="mission-date-picker"
                    className="rounded-sm bg-[#0b0c0e] px-2.5 py-1.5 text-xs font-medium tabular-nums text-white focus:outline-none"
                  />
                </div>

                {/* Year Scrubber (2026–2126) */}
                <div className="flex min-w-[200px] flex-1 items-center gap-2 px-1">
                  <span className="text-[11px] tabular-nums text-[#8e939e]">2026</span>
                  <input
                    type="range"
                    min={2026}
                    max={2126}
                    value={Math.max(2026, Math.min(2126, currentYear))}
                    onChange={(e) => {
                      const targetYr = Number(e.target.value);
                      const monthDay = currentIsoDate.slice(5) || '09-01';
                      onJumpToDateUtc?.(`${targetYr}-${monthDay}T00:00:00Z`);
                    }}
                    aria-label="Mission Year Scrubber (2026–2126)"
                    className="h-1.5 flex-1 cursor-pointer accent-white"
                  />
                  <span className="text-[11px] tabular-nums text-[#8e939e]">2126</span>
                </div>

                {/* Optimal Time Action + Reset */}
                <div className="flex items-center gap-2">
                  {epochOffsetHours > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        onChangeEpochOffsetHours?.(0);
                        onChangeTimeIndex(0);
                      }}
                      className="rounded-sm bg-[#1e2128] px-2.5 py-1.5 text-[11px] font-medium text-[#d1d5db] transition hover:bg-[#272b34] hover:text-white"
                    >
                      Reset
                    </button>
                  )}

                  {windowAnalysis && (
                    <button
                      type="button"
                      data-testid="jump-best-window-btn"
                      onClick={() => onChangeTimeIndex(windowAnalysis.recommendedIndex)}
                      className="flex items-center gap-1.5 rounded-sm bg-[#252830] px-3 py-1.5 text-[11.5px] font-semibold text-white transition hover:bg-[#323641]"
                    >
                      <MaterialIcon name="auto_awesome" className="text-[14px]" />
                      <span>Jump to Best Time</span>
                      {windowAnalysis.recommendedUtc && (
                        <span className="ml-1 font-normal tabular-nums text-[#b4b8c2]">
                          ({windowAnalysis.recommendedUtc})
                        </span>
                      )}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* =====================================================================
          MAIN DOCKED BOTTOM BAR (Professional Matte Timeline Scrubber)
         ===================================================================== */}
      <footer
        aria-label="Bottom Simulation Timeline & Controls"
        data-testid="bottom-sandbox-bar"
        className="pointer-events-auto flex h-12 w-full items-center gap-2.5 border-t border-white/[0.06] bg-[#0a0b0d]/95 px-3 text-white backdrop-blur-md"
      >
        {/* LEFT: Play/Pause, Step, Clickable Date/Epoch Planner & 1x..1000x Speed Button */}
        <div className="flex shrink-0 items-center gap-1.5">
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={stepPrev}
              disabled={!hasTimeline}
              aria-label="Step back 1 hour"
              title="Step back 1 hour"
              className="flex h-7 w-7 items-center justify-center rounded-sm text-[#8e939e] transition hover:bg-[#1c1f26] hover:text-white disabled:opacity-40"
            >
              <MaterialIcon name="skip_previous" className="text-[18px]" />
            </button>

            <button
              type="button"
              onClick={onTogglePlay}
              disabled={!hasTimeline}
              aria-pressed={isPlaying}
              aria-label={isPlaying ? 'Pause simulation' : 'Play simulation'}
              title={isPlaying ? 'Pause simulation' : 'Play simulation'}
              className="flex h-7 w-7 items-center justify-center rounded-sm bg-[#23262d] text-white transition hover:bg-[#2f333d] disabled:opacity-40"
            >
              <MaterialIcon name={isPlaying ? 'pause' : 'play_arrow'} className="text-[18px]" />
            </button>

            <button
              type="button"
              onClick={stepNext}
              disabled={!hasTimeline}
              aria-label="Step forward 1 hour"
              title="Step forward 1 hour"
              className="flex h-7 w-7 items-center justify-center rounded-sm text-[#8e939e] transition hover:bg-[#1c1f26] hover:text-white disabled:opacity-40"
            >
              <MaterialIcon name="skip_next" className="text-[18px]" />
            </button>
          </div>

          {/* Clickable UTC Date Button -> Opens 100-Year Date & Best Window Planner */}
          <button
            type="button"
            onClick={() => toggleDrawer('planner')}
            data-testid="active-utc"
            title="Click to open 100-Year Mission Date & Best Landing Window Planner (2026–2126)"
            className={`hidden shrink-0 items-center gap-1 rounded-sm px-2 py-1 text-[11.5px] font-medium tabular-nums transition sm:inline-flex ${
              openDrawer === 'planner'
                ? 'bg-[#252830] text-white'
                : 'text-[#b4b8c2] hover:bg-[#181b21] hover:text-white'
            }`}
          >
            <MaterialIcon name="calendar_month" className="text-[14px] text-[#8e939e]" />
            <span>{formattedUtc}</span>
          </button>

          {/* 1-Click Speed Multiplier Button: 1x -> 2x -> 5x -> 10x -> 100x -> 1000x */}
          <button
            type="button"
            onClick={cycleSpeed}
            data-testid="playback-speed-btn"
            title="Click to cycle playback speed: 1x, 2x, 5x, 10x, 100x, 1000x"
            className="flex shrink-0 items-center gap-1 rounded-sm bg-[#16181d] px-2 py-1 text-[11.5px] font-semibold tabular-nums text-white transition hover:bg-[#252830]"
          >
            <MaterialIcon name="fast_forward" className="text-[14px] text-[#9ca3af]" />
            <span>{playbackSpeed}x</span>
          </button>
        </div>

        {/* CENTER (MAXIMIZED SPACE): Sleek Non-Neon Timeline Scrubber + Synodic Day / Best Time */}
        <div className="flex min-w-0 flex-1 items-center gap-3 rounded bg-[#14161b] px-3 py-1.5">
          <div className="relative flex flex-1 items-center py-1">
            {/* Matte Charcoal Track */}
            <div className="pointer-events-none h-1.5 w-full overflow-hidden rounded-xs bg-[#23262e]">
              <div className="h-full bg-[#b4b8c2]" style={{ width: `${progressPct}%` }} />
            </div>
            <input
              type="range"
              min={0}
              max={Math.max(0, totalSteps - 1)}
              value={timeIndex}
              onChange={(e) => onChangeTimeIndex(Number(e.target.value))}
              disabled={!hasTimeline}
              aria-label="Mission timeline hour scrubber"
              aria-valuetext={formattedUtc}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            />
            {/* Crisp Matte Slider Thumb (No Neon Glow) */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute h-3 w-2 -translate-x-1/2 rounded-xs bg-white"
              style={{ left: `${progressPct}%` }}
            />
          </div>

          <button
            type="button"
            onClick={() => toggleDrawer('planner')}
            title="Open Mission Calendar (2026–2126)"
            className="shrink-0 text-[11px] font-medium tabular-nums text-[#8e939e] transition hover:text-white"
          >
            Synodic Day {synodicDayCurrent} / {DISPLAY_SYNODIC_DAYS}
          </button>
        </div>

        {/* RIGHT: Simplified Actions (AI Backsound Loop + Hide/Show Sidebars) */}
        <div className="flex shrink-0 items-center gap-1">
          {/* Looping Backsound Toggle with AI Attribution Tooltip */}
          <div className="group relative flex items-center">
            <button
              type="button"
              onClick={toggleMusic}
              data-testid="backsound-toggle-btn"
              aria-pressed={isMusicPlaying}
              aria-label={
                isMusicPlaying
                  ? 'Mute ambient backsound (Music generated by AI)'
                  : 'Play ambient backsound (Music generated by AI)'
              }
              className={`flex h-8 items-center gap-1 rounded px-2 text-[11px] font-medium transition ${
                isMusicPlaying
                  ? 'bg-[#252830] text-white'
                  : 'text-[#8e939e] hover:bg-[#181b21] hover:text-white'
              }`}
            >
              <MaterialIcon
                name={isMusicPlaying ? 'volume_up' : 'volume_off'}
                className="text-[16px]"
              />
              <span className="hidden xl:inline">AI Audio</span>
            </button>
            <span
              role="tooltip"
              className="pointer-events-none invisible absolute right-0 bottom-full z-40 mb-2 w-52 rounded bg-[#22252d] px-2.5 py-1.5 text-[10.5px] leading-snug text-[#e5e7eb] opacity-0 shadow-xl transition group-hover:visible group-hover:opacity-100"
            >
              Ambient Backsound Loop (backsound-1.mp3) · Source: Music generated by AI.
            </span>
          </div>

          <button
            type="button"
            onClick={onToggleHud}
            aria-expanded={isHudOpen}
            title={isHudOpen ? 'Hide sidebars' : 'Show sidebars'}
            className={`flex h-8 items-center justify-center rounded px-2 transition ${
              isHudOpen
                ? 'text-[#8e939e] hover:bg-[#181b21] hover:text-white'
                : 'bg-[#252830] text-white'
            }`}
          >
            <MaterialIcon name="dock_to_right" className="text-[16px]" />
          </button>
        </div>
      </footer>
    </div>
  );
}
