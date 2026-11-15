import { useEffect, useRef } from 'react';

const COMPARISON_ROWS = [
  {
    aspect: 'Solar Elevation Angle',
    lunar: '1.5° – 5° (grazing the horizon continuously)',
    earth: 'Up to 75° – 90° (high overhead)',
  },
  {
    aspect: 'Day & Night Cycle',
    lunar: '~14 Earth days of light, ~14 days of darkness (~29.5 d synodic)',
    earth: '24 hours (12 hrs day, 12 hrs night)',
  },
  {
    aspect: 'Atmosphere & Light Scattering',
    lunar: 'Hard vacuum; crater shadows are pitch black and cryogenic',
    earth: 'Atmospheric scattering creates gradual twilight',
  },
  {
    aspect: 'Earth Position in the Sky',
    lunar: 'Traces a figure-8 libration pattern near the horizon',
    earth: 'Moon rises and sets daily across the sky',
  },
];

export function ContrastPanel({ isOpen, onClose, activeSite }) {
  const closeRef = useRef(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return undefined;
    closeRef.current?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') onCloseRef.current?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="font-jakarta fixed inset-0 z-40 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="contrast-panel-title"
        className="w-full max-w-2xl rounded bg-[#0c0d10] p-5 shadow-2xl"
      >
        <div className="flex items-start justify-between border-b border-white/[0.06] pb-3">
          <div>
            <p className="text-[10.5px] font-semibold tracking-widest text-[#8e939e] uppercase">
              Extreme Environment Comparison
            </p>
            <h2 id="contrast-panel-title" className="mt-0.5 text-base font-semibold text-white">
              Lunar South Pole vs. Earth
            </h2>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-sm bg-[#16181d] text-[#8e939e] hover:bg-[#252830] hover:text-white"
            aria-label="Close comparison dialog"
          >
            <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
              close
            </span>
          </button>
        </div>

        <p className="mt-3 text-xs leading-relaxed text-[#b4b8c2]">
          At the selected landing site (<strong>{activeSite?.name ?? 'unselected'}</strong>), the
          Moon&apos;s 1.54° axial tilt means crater rims just a few dozen meters tall can block
          sunlight and Direct-to-Earth (DTE) line-of-sight for weeks at a time.
        </p>

        <div className="mt-3.5 overflow-hidden rounded bg-[#14161b]">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-white/[0.06] bg-[#1a1d24] text-white">
                <th className="p-3 font-semibold">Physical Parameter</th>
                <th className="p-3 font-semibold text-white">Lunar South Pole</th>
                <th className="p-3 font-semibold text-[#9ca3af]">Earth (Reference)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.05] text-[#b4b8c2]">
              {COMPARISON_ROWS.map((row) => (
                <tr key={row.aspect} className="hover:bg-white/[0.02]">
                  <td className="p-3 font-medium text-white">{row.aspect}</td>
                  <td className="p-3">{row.lunar}</td>
                  <td className="p-3 text-[#8e939e]">{row.earth}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
