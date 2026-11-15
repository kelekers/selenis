const MODES = [
  { key: 'big', label: 'Besar', title: 'Matahari dan Bumi sebagai benda besar di langit lokasi' },
  { key: 'small', label: 'Kecil', title: 'Ikon kecil di sekitar site, dengan lintasan dan horizon' },
];

const SIZES = [
  { key: 'enlarged', label: 'Diperbesar', title: 'Diperbesar 6,4×, perbandingan Bumi:Matahari tetap' },
  { key: 'true', label: 'Nyata', title: 'Ukuran sudut sebenarnya dari Bulan (Bumi 1,9°, Matahari 0,53°)' },
];

const LOOKS = [
  { key: 'earth', label: 'Bumi', title: 'Arahkan kamera ke Bumi' },
  { key: 'sun', label: 'Matahari', title: 'Arahkan kamera ke Matahari' },
];

const LAYERS = {
  big: [
    { key: 'earthLine', label: 'Garis Bumi' },
    { key: 'compass', label: 'Kompas' },
  ],
  small: [
    { key: 'icons', label: 'Ikon' },
    { key: 'lines', label: 'Garis' },
    { key: 'tracks', label: 'Lintasan' },
    { key: 'horizon', label: 'Horizon' },
    { key: 'compass', label: 'Kompas' },
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

/** One short legend line per mode: swatch + two-word meaning. */
const LEGEND = {
  big: [
    ['h-0.5 w-4 bg-emerald-400', 'Bumi terlihat'],
    ['h-0 w-4 border-t-2 border-dashed border-red-400', 'Bumi terhalang'],
  ],
  small: [
    ['h-2 w-2 rounded-full bg-amber-400', 'terlihat'],
    ['h-2 w-2 rounded-full bg-slate-400', 'terhalang'],
    ['h-0.5 w-4 bg-slate-200', 'horizon'],
  ],
};

const chip = (active) =>
  `min-h-11 rounded-md px-2 transition lg:min-h-0 lg:py-1 ${
    active ? 'bg-white/15 text-white' : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
  }`;

function Row({ label, children }) {
  return (
    <div className="flex items-center gap-1">
      <span className="w-12 shrink-0 text-slate-500">{label}</span>
      <div className="flex flex-wrap gap-1">{children}</div>
    </div>
  );
}

/**
 * Sky display panel in the 3D overlay (Anggota 3 area, not the HUD). Collapsed it shows only the
 * Besar/Kecil switch; "Opsi" opens size, camera shortcuts, layers and a one-line legend.
 * Touch targets are ≥ 44 px below the lg breakpoint.
 */
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
      aria-label="Tampilan langit 3D"
      className="pointer-events-auto w-64 max-w-[calc(100vw-2rem)] rounded-lg border border-white/10 bg-black/60 p-1 text-xs text-slate-300 backdrop-blur-md"
    >
      <div className="flex items-center gap-1">
        <div role="group" aria-label="Tampilan Matahari dan Bumi" className="flex flex-1 gap-1">
          {MODES.map(({ key, label, title }) => (
            <button
              key={key}
              type="button"
              title={title}
              aria-pressed={skyMode === key}
              data-testid={`sky-mode-${key}`}
              onClick={() => onSkyMode(key)}
              className={`min-h-11 flex-1 rounded-md px-2 font-medium transition lg:min-h-0 lg:py-1.5 ${
                skyMode === key ? 'bg-sky-500/25 text-sky-50' : 'text-slate-400 hover:text-slate-200'
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
          className="min-h-11 min-w-11 rounded-md px-2 text-slate-400 hover:text-slate-200 lg:min-h-0 lg:min-w-0 lg:py-1.5"
        >
          {expanded ? 'Tutup' : 'Opsi'}
        </button>
      </div>

      {expanded && (
        <div id="sky-controls-body" className="mt-1 space-y-1 border-t border-white/10 px-1 pt-1.5 pb-0.5">
          {skyMode === 'big' && (
            <Row label="Ukuran">
              {SIZES.map(({ key, label, title }) => (
                <button key={key} type="button" title={title} aria-pressed={sizeMode === key} data-testid={`size-${key}`} onClick={() => onSizeMode(key)} className={chip(sizeMode === key)}>
                  {label}
                </button>
              ))}
            </Row>
          )}
          <Row label="Lihat">
            {LOOKS.map(({ key, label, title }) => (
              <button key={key} type="button" title={title} data-testid={`look-${key}`} onClick={() => onLook(key)} className={chip(false)}>
                {label}
              </button>
            ))}
          </Row>
          <Row label="Tampil">
            {LAYERS[skyMode].map(({ key, label }) => (
              <button key={key} type="button" aria-pressed={layers[key]} data-testid={`layer-${key}`} onClick={() => onToggleLayer(key)} className={chip(layers[key])}>
                {label}
              </button>
            ))}
          </Row>
          <ul data-testid="sky-legend" className="flex flex-wrap gap-x-3 gap-y-1 pt-1 text-[11px] text-slate-400">
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
