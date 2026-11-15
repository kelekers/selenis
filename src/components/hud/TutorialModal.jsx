import React, { useCallback, useEffect, useRef, useState } from 'react';

function MaterialIcon({ name, className = 'text-[18px]' }) {
  return (
    <span className={`material-symbols-outlined select-none ${className}`} aria-hidden="true">
      {name}
    </span>
  );
}

const KEYBOARD_SHORTCUTS = [
  { keys: 'Space', label: 'Play / Pause timeline' },
  { keys: '← / →', label: 'Step ±1 hour' },
  { keys: 'S', label: 'Cycle playback speed (1x–1000x)' },
  { keys: '1 / 2 / 3', label: 'Switch Navigate / View / Read' },
  { keys: 'M', label: 'Toggle Planner / Explorer mode' },
  { keys: 'R', label: 'Open / close Regions panel' },
  { keys: 'F', label: 'Open / close Sites panel' },
  { keys: 'C', label: 'Toggle 3D Sky Compass' },
  { keys: 'H', label: 'Show / hide HUD overlay' },
  { keys: '?', label: 'Toggle Tutorial & Shortcuts' },
];

const FEATURE_TOUR_STEPS = [
  {
    id: 'nav-sections',
    stepLabel: '1 / 7 · Primary Navigation',
    title: 'Navigate, View & Read Sections',
    icon: 'nearby',
    selectors: ['nav[aria-label="Primary modes"]'],
    preferredSide: 'right',
    description:
      'Switch between 3D orbital terrain navigation (Navigate), 360° surface lander POV (View), and the scientific mission report (Read).',
  },
  {
    id: 'experience-mode',
    stepLabel: '2 / 7 · Experience Mode',
    title: 'Planner (Pro) vs. Explorer (General)',
    icon: 'tune',
    selectors: ['[data-testid="left-mode-toggle"]', '[data-testid="left-mode-toggle-collapsed"]'],
    preferredSide: 'right',
    description:
      'Use Planner Mode for full engineering telemetry (4-tab inspector, RMS roughness, custom coordinates) or Explorer Mode for a colorful, simplified overview.',
    showModeSwitch: true,
  },
  {
    id: 'sky-terrain-options',
    stepLabel: '3 / 7 · 3D Viewport Overlays',
    title: 'Terrain & Sky Display Options',
    icon: 'landscape',
    selectors: ['[data-testid="viewer-terrain-tools"]', '[data-testid="sky-controls"]'],
    preferredSide: 'right',
    description:
      'Toggle 3D surface overlays (Roughness & Horizon Ridge in Planner mode), switch between Large 3D bodies and Small sky-dome tracks, and toggle the 3D Compass inside Options.',
  },
  {
    id: 'floating-region-site',
    stepLabel: '4 / 7 · Floating Spatial Controls',
    title: 'Switch Regions & Add Landing Sites',
    icon: 'add_location_alt',
    selectors: ['[data-testid="right-floating-tools"]'],
    preferredSide: 'left',
    description:
      'Switch Lunar South Pole Regions (Region 01, 04, 11, or Southern Hemisphere) and select or place Landing Sites (Site A–D) directly on the terrain.',
  },
  {
    id: 'inspector-panel',
    stepLabel: '5 / 7 · Site Inspector',
    title: 'Site Telemetry & 3D Compass',
    icon: 'space_dashboard',
    selectors: ['[data-testid="right-sidebar"]', '[data-testid="right-sidebar-collapsed"]'],
    preferredSide: 'left',
    description:
      'Inspect or rename your active landing site and check its Optimal, Moderate, or Caution rating. Collapse this panel anytime to reveal the top-right 3D Compass.',
  },
  {
    id: 'mission-timeline',
    stepLabel: '6 / 7 · 100-Year Timeline',
    title: 'Mission Date Picker & Fast Playback',
    icon: 'schedule',
    selectors: ['[data-testid="bottom-sandbox-bar"]'],
    preferredSide: 'top',
    description:
      'Scrub hour-by-hour, cycle playback speed from 1x up to 1000x, pick any mission date between 2026 and 2126, or jump straight to the optimal solar window.',
  },
  {
    id: 'keyboard-shortcuts',
    stepLabel: '7 / 7 · Keyboard Shortcuts',
    title: 'Keyboard Shortcuts Guide',
    icon: 'keyboard',
    selectors: [],
    preferredSide: 'center',
    showShortcuts: true,
    description:
      'Control playback, switch views, or toggle overlays directly from your keyboard anytime in the 3D workspace.',
  },
];

function measureTargetRect(selectors) {
  if (typeof document === 'undefined' || !selectors?.length) return null;

  let minLeft = Infinity;
  let minTop = Infinity;
  let maxRight = -Infinity;
  let maxBottom = -Infinity;
  let matched = 0;

  for (const selector of selectors) {
    const el = document.querySelector(selector);
    if (!el) continue;
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) continue;
    matched += 1;
    minLeft = Math.min(minLeft, r.left);
    minTop = Math.min(minTop, r.top);
    maxRight = Math.max(maxRight, r.right);
    maxBottom = Math.max(maxBottom, r.bottom);
  }

  if (matched === 0) return null;

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const pad = 6;

  const left = Math.max(4, minLeft - pad);
  const top = Math.max(4, minTop - pad);
  const right = Math.min(vw - 4, maxRight + pad);
  const bottom = Math.min(vh - 4, maxBottom + pad);

  return {
    top,
    left,
    width: Math.max(24, right - left),
    height: Math.max(24, bottom - top),
  };
}

function computeCardPosition(spotRect, preferredSide, cardWidth, cardHeight) {
  if (typeof window === 'undefined' || !spotRect || preferredSide === 'center') {
    return null;
  }

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const gap = 16;
  const margin = 16;

  let left = vw / 2 - cardWidth / 2;
  let top = vh / 2 - cardHeight / 2;

  if (preferredSide === 'right') {
    const rightSpace = vw - (spotRect.left + spotRect.width) - margin;
    if (rightSpace >= cardWidth + gap) {
      left = spotRect.left + spotRect.width + gap;
      top = spotRect.top;
    } else if (spotRect.top - margin >= cardHeight + gap) {
      left = spotRect.left;
      top = spotRect.top - cardHeight - gap;
    }
  } else if (preferredSide === 'left') {
    const leftSpace = spotRect.left - margin;
    if (leftSpace >= cardWidth + gap) {
      left = spotRect.left - cardWidth - gap;
      top = spotRect.top + Math.min(0, spotRect.height - cardHeight);
      if (spotRect.height < 160) {
        top = spotRect.top + spotRect.height - cardHeight;
      }
    } else if (spotRect.top - margin >= cardHeight + gap) {
      left = spotRect.left + spotRect.width - cardWidth;
      top = spotRect.top - cardHeight - gap;
    }
  } else if (preferredSide === 'top') {
    const topSpace = spotRect.top - margin;
    if (topSpace >= cardHeight + gap) {
      top = spotRect.top - cardHeight - gap;
      left = spotRect.left + spotRect.width / 2 - cardWidth / 2;
    } else {
      top = spotRect.top + spotRect.height + gap;
      left = spotRect.left + spotRect.width / 2 - cardWidth / 2;
    }
  }

  return {
    left: Math.round(Math.min(Math.max(margin, left), Math.max(margin, vw - cardWidth - margin))),
    top: Math.round(Math.min(Math.max(margin, top), Math.max(margin, vh - cardHeight - margin))),
  };
}

export function TutorialModal({
  isOpen,
  onClose,
  uiMode = 'planner',
  onSelectUiMode,
  initialStep = 0,
}) {
  const [stepIdx, setStepIdx] = useState(initialStep);
  const [spotRect, setSpotRect] = useState(null);
  const [cardSize, setCardSize] = useState({ width: 380, height: 240 });
  const cardRef = useRef(null);

  const step = FEATURE_TOUR_STEPS[stepIdx] ?? FEATURE_TOUR_STEPS[0];
  const isLast = stepIdx === FEATURE_TOUR_STEPS.length - 1;

  useEffect(() => {
    if (isOpen) {
      setStepIdx(initialStep);
    }
  }, [isOpen, initialStep]);

  const updateMeasurements = useCallback(() => {
    if (!isOpen) return;
    setSpotRect(measureTargetRect(step.selectors));
    if (cardRef.current) {
      setCardSize({
        width: cardRef.current.offsetWidth || 380,
        height: cardRef.current.offsetHeight || 240,
      });
    }
  }, [isOpen, step.selectors]);

  useEffect(() => {
    if (!isOpen || typeof window === 'undefined') return undefined;
    updateMeasurements();
    const raf = window.requestAnimationFrame(updateMeasurements);
    window.addEventListener('resize', updateMeasurements);
    window.addEventListener('scroll', updateMeasurements, true);
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener('resize', updateMeasurements);
      window.removeEventListener('scroll', updateMeasurements, true);
    };
  }, [isOpen, stepIdx, uiMode, updateMeasurements]);

  if (!isOpen) return null;

  const cardPos = computeCardPosition(
    spotRect,
    step.preferredSide,
    cardSize.width,
    cardSize.height,
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="tutorial-modal-title"
      data-testid="tutorial-modal"
      className={`font-jakarta fixed inset-0 z-50 select-none ${
        spotRect ? 'bg-transparent' : 'bg-black/60'
      }`}
    >
      {/* Dynamic Highlight Spotlight Ring Measured Directly From Active Target */}
      {spotRect && (
        <div
          aria-hidden="true"
          data-testid="tutorial-spotlight"
          style={{
            top: `${spotRect.top}px`,
            left: `${spotRect.left}px`,
            width: `${spotRect.width}px`,
            height: `${spotRect.height}px`,
          }}
          className="pointer-events-none fixed rounded border-2 border-white/85 shadow-[0_0_0_9999px_rgba(0,0,0,0.6),0_0_24px_rgba(255,255,255,0.3)] transition-all duration-200"
        />
      )}

      {/* Step-by-Step Callout Card Positioned Clamped Beside Target Feature */}
      <div
        ref={cardRef}
        style={
          cardPos
            ? { top: `${cardPos.top}px`, left: `${cardPos.left}px` }
            : { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }
        }
        className={`fixed z-50 max-w-[calc(100vw-2rem)] rounded border border-white/20 bg-[#0e1015] p-4 text-white shadow-2xl transition-all duration-200 ${
          step.showShortcuts ? 'w-[440px]' : 'w-[376px]'
        }`}
      >
        {/* Top Row: Step Counter + Close */}
        <div className="flex items-center justify-between border-b border-white/[0.07] pb-2.5">
          <span className="rounded-xs bg-[#23262f] px-2 py-0.5 text-[10.5px] font-semibold tracking-wider text-[#d1d5db] uppercase">
            {step.stepLabel}
          </span>
          <button
            type="button"
            onClick={onClose}
            data-testid="close-tutorial-btn"
            aria-label="Close tutorial"
            className="flex h-6 w-6 items-center justify-center rounded-xs text-[#8e939e] transition hover:bg-[#1c1f26] hover:text-white"
          >
            <MaterialIcon name="close" className="text-[16px]" />
          </button>
        </div>

        {/* Feature Title & Explanation */}
        <div className="mt-3 flex items-start gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-[#1b1e26] text-white">
            <MaterialIcon name={step.icon} className="text-[18px]" />
          </div>
          <div>
            <h2 id="tutorial-modal-title" className="text-sm font-semibold text-white">
              {step.title}
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-[#b4b8c2]">{step.description}</p>
          </div>
        </div>

        {/* Interactive Mode Switcher on Step 2 */}
        {step.showModeSwitch && onSelectUiMode && (
          <div className="mt-3 flex items-center justify-between rounded bg-[#151820] px-3 py-2">
            <span className="text-[11px] font-medium text-[#d1d5db]">Try switching mode:</span>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => onSelectUiMode('planner')}
                className={`rounded-xs px-2.5 py-1 text-[11px] font-semibold transition ${
                  uiMode === 'planner'
                    ? 'bg-white text-[#0b0c0e]'
                    : 'bg-[#22252e] text-[#9ca3af] hover:text-white'
                }`}
              >
                Planner
              </button>
              <button
                type="button"
                onClick={() => onSelectUiMode('explorer')}
                className={`rounded-xs px-2.5 py-1 text-[11px] font-semibold transition ${
                  uiMode === 'explorer'
                    ? 'bg-gradient-to-r from-sky-400 to-emerald-400 text-[#0b0c0e]'
                    : 'bg-[#22252e] text-[#9ca3af] hover:text-white'
                }`}
              >
                Explorer
              </button>
            </div>
          </div>
        )}

        {/* Keyboard Shortcuts Reference Grid on Final Step */}
        {step.showShortcuts && (
          <div
            data-testid="tutorial-shortcuts-list"
            className="mt-3 grid grid-cols-1 gap-1.5 rounded bg-[#14171f] p-2.5 sm:grid-cols-2"
          >
            {KEYBOARD_SHORTCUTS.map((sc) => (
              <div
                key={sc.keys}
                className="flex items-center justify-between gap-2 rounded-xs bg-[#1b1f29] px-2 py-1.5"
              >
                <span className="truncate text-[11px] text-[#d1d5db]">{sc.label}</span>
                <kbd className="shrink-0 rounded-xs border border-white/15 bg-[#0e1015] px-1.5 py-0.5 font-mono text-[10px] font-semibold text-white">
                  {sc.keys}
                </kbd>
              </div>
            ))}
          </div>
        )}

        {/* Step Navigation Footer */}
        <div className="mt-4 flex items-center justify-between border-t border-white/[0.07] pt-3">
          <div className="flex items-center gap-1.5">
            {FEATURE_TOUR_STEPS.map((s, idx) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setStepIdx(idx)}
                aria-label={`Go to tutorial step ${idx + 1}`}
                className={`h-1.5 rounded-full transition-all ${
                  idx === stepIdx ? 'w-5 bg-white' : 'w-1.5 bg-white/25 hover:bg-white/45'
                }`}
              />
            ))}
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onClose}
              className="rounded-sm px-2.5 py-1 text-[11.5px] font-medium text-[#8e939e] transition hover:text-white"
            >
              Skip
            </button>
            {stepIdx > 0 && (
              <button
                type="button"
                onClick={() => setStepIdx((i) => Math.max(0, i - 1))}
                className="rounded-sm bg-[#1c1f27] px-2.5 py-1 text-[11.5px] font-medium text-white transition hover:bg-[#272b36]"
              >
                Back
              </button>
            )}
            <button
              type="button"
              data-testid="tutorial-next-btn"
              onClick={() => {
                if (isLast) {
                  onClose();
                } else {
                  setStepIdx((i) => i + 1);
                }
              }}
              className="rounded-sm bg-white px-3.5 py-1 text-[11.5px] font-semibold text-[#0b0c0e] transition hover:bg-[#e5e7eb]"
            >
              {isLast ? 'Finish' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
