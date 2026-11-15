const MODES = [
  { key: 'big', label: 'Large', title: 'Display Sun and Earth as 3D celestial bodies in the sky' },
  { key: 'small', label: 'Small', title: 'Display sky dome icons with orbital tracks and horizon ring' },
];

const SIZES = [
  { key: 'enlarged', label: 'Enlarged', title: 'Enlarged 6.4× while preserving the Earth:Sun angular ratio' },
  { key: 'true', label: 'True Scale', title: 'True angular diameter as seen from the Moon (Earth 1.9°, Sun 0.53°)' },
];

const LOOKS = [
  { key: 'earth', label: 'Earth', title: 'Point camera toward Earth' },
  { key: 'sun', label: 'Sun', title: 'Point camera toward the Sun' },
];

const LAYERS = {
  big: [
    { key: 'earthLine', label: 'Earth Line' },
    { key: 'compass', label: 'Compass' },
  ],
  small: [
    { key: 'icons', label: 'Icons' },
    { key: 'lines', label: 'Lines' },
    { key: 'tracks', label: 'Tracks' },
    { key: 'horizon', label: 'Horizon' },
    { key: 'compass', label: 'Compass' },
  ],
};

export const DEFAULT_SKY_LAYERS = Object.freeze({
  earthLine: true,
  icons: true,
  lines: true,
  tracks: true,
  horizon: true,
  compass: true,
});

const LEGEND = {
  big: [
    ['h-0.5 w-4 bg-white', 'Earth visible'],
    ['h-0 w-4 border-t-2 border-dashed border-neutral-500', 'Earth occluded'],
  ],
  small: [
    ['h-2 w-2 rounded-full bg-white', 'visible'],
    ['h-2 w-2 rounded-full bg-neutral-500', 'occluded'],
    ['h-0.5 w-4 bg-neutral-300', 'horizon'],
  ],
};

const chip = (active) =>
  `min-h-8 rounded-sm px-2 text-[11px] font-medium transition lg:min-h-0 lg:py-1 ${
    active
      ? 'bg-[#252830] text-white'
      : 'bg-[#15171c] text-[#8e939e] hover:bg-[#1c1f26] hover:text-white'
  }`;

function Row({ label, children }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="w-12 shrink-0 text-[11px] text-[#7c818c]">{label}</span>
      <div className="flex flex-wrap gap-1">{children}</div>
    </div>
  );
}

export function SkyControls({
  skyMode,
  onSkyMode,
  sizeMode,
  onSizeMode,
  layers,
  onToggleLayer,
  onLook,
  expanded,
  onToggleExpanded,
}) {
  return (
    <section
      data-testid="sky-controls"
      aria-label="3D Sky Display Controls"
      className="font-jakarta pointer-events-auto w-64 max-w-[calc(100vw-2rem)] rounded bg-[#0c0d10]/95 p-1 text-xs text-slate-200 shadow-xl backdrop-blur-md"
    >
      <div className="flex items-center gap-1">
        <div role="group" aria-label="Sun and Earth display mode" className="flex flex-1 gap-1">
          {MODES.map(({ key, label, title }) => (
            <button
              key={key}
              type="button"
              title={title}
              aria-pressed={skyMode === key}
              data-testid={`sky-mode-${key}`}
              onClick={() => onSkyMode(key)}
              className={`h-8 flex-1 rounded-sm px-2 text-[11.5px] font-medium transition ${
                skyMode === key
                  ? 'bg-[#252830] text-white'
                  : 'bg-transparent text-[#8e939e] hover:bg-[#181b21] hover:text-white'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls="sky-controls-body"
          data-testid="sky-controls-toggle"
          onClick={onToggleExpanded}
          className="h-8 rounded-sm px-2.5 text-[11.5px] font-medium text-[#8e939e] transition hover:bg-[#181b21] hover:text-white"
        >
          {expanded ? 'Close' : 'Options'}
        </button>
      </div>

      {expanded && (
        <div
          id="sky-controls-body"
          className="mt-1 space-y-1.5 border-t border-white/[0.06] px-1 pt-2 pb-1"
        >
          {skyMode === 'big' && (
            <Row label="Scale">
              {SIZES.map(({ key, label, title }) => (
                <button
                  key={key}
                  type="button"
                  title={title}
                  aria-pressed={sizeMode === key}
                  data-testid={`size-${key}`}
                  onClick={() => onSizeMode(key)}
                  className={chip(sizeMode === key)}
                >
                  {label}
                </button>
              ))}
            </Row>
          )}
          <Row label="Look">
            {LOOKS.map(({ key, label, title }) => (
              <button
                key={key}
                type="button"
                title={title}
                data-testid={`look-${key}`}
                onClick={() => onLook(key)}
                className={chip(false)}
              >
                {label}
              </button>
            ))}
          </Row>
          <Row label="Show">
            {LAYERS[skyMode].map(({ key, label }) => (
              <button
                key={key}
                type="button"
                aria-pressed={layers[key]}
                data-testid={`layer-${key}`}
                onClick={() => onToggleLayer(key)}
                className={chip(layers[key])}
              >
                {label}
              </button>
            ))}
          </Row>
          <ul
            data-testid="sky-legend"
            className="flex flex-wrap gap-x-3 gap-y-1 pt-1 text-[10.5px] text-[#8e939e]"
          >
            {LEGEND[skyMode].map(([swatch, text]) => (
              <li key={text} className="flex items-center gap-1.5">
                <span aria-hidden="true" className={`inline-block ${swatch}`} />
                {text}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
