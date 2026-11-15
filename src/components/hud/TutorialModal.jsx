import React, { useState } from 'react';

function MaterialIcon({ name, className = 'text-[18px]' }) {
  return (
    <span className={`material-symbols-outlined select-none ${className}`} aria-hidden="true">
      {name}
    </span>
  );
}

const FEATURE_TOUR_STEPS = [
  {
    id: 'nav-sections',
    stepLabel: '1 / 5 · Primary Navigation',
    title: 'Navigate, View & Read Sections',
    icon: 'nearby',
    positionClass: 'top-16 left-4 sm:left-60',
    spotlightClass: 'top-16 left-2 h-48 w-52',
    arrowDirection: 'left',
    description:
      'Use these three primary sections in the left sidebar to switch between 3D orbital terrain navigation (Navigate), 360° surface lander POV (View), and the scientific mission report (Read).',
  },
  {
    id: 'experience-mode',
    stepLabel: '2 / 5 · Experience Mode',
    title: 'Planner (Pro) vs. Explorer (General)',
    icon: 'tune',
    positionClass: 'top-64 left-4 sm:left-60',
    spotlightClass: 'top-64 left-2 h-24 w-52',
    arrowDirection: 'left',
    description:
      'Switch between Planner Mode for full engineering telemetry (4-tab inspector, RMS roughness, custom site placement) and Explorer Mode for a simplified, visual mission overview.',
    showModeSwitch: true,
  },
  {
    id: 'sky-terrain-options',
    stepLabel: '3 / 5 · 3D Viewport Overlays',
    title: 'Terrain & Sky Display Options',
    icon: 'landscape',
    positionClass: 'bottom-32 left-4 sm:left-60',
    spotlightClass: 'bottom-14 left-4 h-24 w-64',
    arrowDirection: 'down',
    description:
      'Control 3D surface overlays (Roughness & Horizon Ridge in Planner mode), switch between Large 3D celestial bodies and Small sky-dome tracks, and toggle the 3D Compass visibility inside Options.',
  },
  {
    id: 'floating-region-site',
    stepLabel: '4 / 5 · Floating Spatial Controls',
    title: 'Switch Regions & Add Landing Sites',
    icon: 'add_location_alt',
    positionClass: 'bottom-28 right-4 sm:right-[364px]',
    spotlightClass: 'bottom-14 right-[356px] h-12 w-60',
    arrowDirection: 'down',
    description:
      'Use these floating buttons on the right of the 3D viewport to switch Lunar South Pole Regions (Region 01, 04, 11, or Southern Hemisphere) and select or place Landing Sites (Site A–D) directly on the terrain.',
  },
  {
    id: 'inspector-timeline',
    stepLabel: '5 / 5 · Site Inspector & Timeline',
    title: 'Site Telemetry & 100-Year Mission Timeline',
    icon: 'space_dashboard',
    positionClass: 'top-20 right-4 sm:right-[364px]',
    spotlightClass: 'top-3 right-2 h-64 w-80',
    arrowDirection: 'right',
    description:
      'Inspect or rename your active landing site in the right sidebar (collapse it anytime to reveal the top-right 3D Compass). Use the bottom bar to play the timeline up to 1000x or pick any mission date from 2026 to 2126.',
  },
];

export function TutorialModal({
  isOpen,
  onClose,
  uiMode = 'planner',
  onSelectUiMode,
}) {
  const [stepIdx, setStepIdx] = useState(0);

  if (!isOpen) return null;

  const step = FEATURE_TOUR_STEPS[stepIdx] ?? FEATURE_TOUR_STEPS[0];
  const isLast = stepIdx === FEATURE_TOUR_STEPS.length - 1;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="tutorial-modal-title"
      data-testid="tutorial-modal"
      className="font-jakarta fixed inset-0 z-50 bg-black/45 select-none"
    >
      {/* Highlight Spotlight Ring on the Target UI Feature */}
      <div
        aria-hidden="true"
        className={`pointer-events-none fixed hidden rounded border-2 border-white/70 shadow-[0_0_0_9999px_rgba(0,0,0,0.45),0_0_28px_rgba(255,255,255,0.35)] transition-all duration-300 lg:block ${step.spotlightClass}`}
      />

      {/* Step-by-Step Callout Card Positioned Next to the Active Feature */}
      <div
        className={`fixed z-50 w-[340px] max-w-[calc(100vw-2rem)] rounded border border-white/20 bg-[#0e1015] p-4 text-white shadow-2xl transition-all duration-300 sm:w-[376px] ${step.positionClass}`}
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
                    ? 'bg-white text-[#0b0c0e]'
                    : 'bg-[#22252e] text-[#9ca3af] hover:text-white'
                }`}
              >
                Explorer
              </button>
            </div>
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
