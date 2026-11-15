import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRightLeft,
  CheckCircle2,
  MapPin,
  Move,
  Plus,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import { metricsForSite } from '../../utils/timeline';
import {
  NO_VALUE,
  formatAngleShort,
  formatLatitude,
  formatLongitude,
  formatMeters,
  formatPercent,
  greatCircleDistanceM,
} from '../../utils/hudModel';
import {
  MAX_SITES,
  SITE_LETTERS,
  getPlacementUvBounds,
  getTileCoordinateRange,
  latLonToUv,
  uvToLatLon,
} from '../../utils/siteCalculations';

/** Signed percentage-point difference, or null when either value is missing. */
function deltaPoints(a, b) {
  return Number.isFinite(a) && Number.isFinite(b) ? Number((a - b).toFixed(1)) : null;
}
const signed = (v) => (v > 0 ? `+${v}` : `${v}`);
const hours = (v) => (Number.isFinite(v) ? `${v} jam` : NO_VALUE);

export function MicroShiftDeltaCard({
  sites = [],
  selectedSiteId,
  onSelectSite,
  activeSite,
  uiMode,
  regionName = 'Site01',
  terrainMetadata,
  onAddSite,
  onMoveSite,
  onRemoveSite,
  onResetSites,
  hasCustomSiteChanges = false,
  placementMode = null,
  onPlacementModeChange,
}) {
  const visibleSites = sites.slice(0, MAX_SITES);
  const activeIndex = Math.max(
    0,
    visibleSites.findIndex((s) => s?.site_id === (activeSite?.site_id ?? selectedSiteId))
  );
  const activeLetter = SITE_LETTERS[activeIndex] ?? 'A';

  // Comparison pair: when activeSite is Site A (index 0), compare Site A vs Site B (index 1).
  // When activeSite is Site B/C/D, compare activeSite vs Site A (index 0), unless only 2 sites exist
  // where Site A vs Site B remains the canonical pair.
  const primarySite = visibleSites.length > 2 && activeSite ? activeSite : visibleSites[0];
  const secondarySite =
    visibleSites.length > 2 && activeSite && activeSite.site_id !== visibleSites[0]?.site_id
      ? visibleSites[0]
      : visibleSites[1];

  const primaryLetter =
    SITE_LETTERS[visibleSites.findIndex((s) => s?.site_id === primarySite?.site_id)] ?? 'A';
  const secondaryLetter =
    SITE_LETTERS[visibleSites.findIndex((s) => s?.site_id === secondarySite?.site_id)] ?? 'B';

  const metricsA = metricsForSite(primarySite);
  const metricsB = metricsForSite(secondarySite);

  // Differences of two percentages are percentage points (pp), not a relative % increase.
  const solarDelta = deltaPoints(metricsA?.solar_illumination_pct, metricsB?.solar_illumination_pct);
  const dteDelta = deltaPoints(metricsA?.dte_availability_pct, metricsB?.dte_availability_pct);
  // Distance derived from the two sites' coordinates (sphere, IAU mean radius), not hard-coded.
  const separationM = greatCircleDistanceM(primarySite?.coordinates, secondarySite?.coordinates);
  const separationLabel = separationM === null ? NO_VALUE : `≈${formatMeters(separationM)}`;

  const activeMetrics = metricsForSite(activeSite);

  const tileRange = useMemo(
    () => getTileCoordinateRange(terrainMetadata, sites),
    [terrainMetadata, sites]
  );
  const uvBounds = useMemo(
    () => getPlacementUvBounds(terrainMetadata),
    [terrainMetadata]
  );

  const [localEditorMode, setLocalEditorMode] = useState(null); // null | 'add' | 'move'
  const editorMode = placementMode !== undefined ? placementMode : localEditorMode;
  const setEditorMode = (nextMode) => {
    setLocalEditorMode(nextMode);
    onPlacementModeChange?.(nextMode);
  };

  const [formName, setFormName] = useState('');
  const [formLat, setFormLat] = useState('');
  const [formLon, setFormLon] = useState('');
  const [formU, setFormU] = useState('0.5000');
  const [formV, setFormV] = useState('0.5000');
  const [coordNotice, setCoordNotice] = useState(null);

  const syncFormFromSite = (site) => {
    if (!site) return;
    setFormName(site.name ?? '');
    setFormLat(
      Number.isFinite(site.coordinates?.latitude_deg)
        ? String(Number(site.coordinates.latitude_deg.toFixed(5)))
        : ''
    );
    setFormLon(
      Number.isFinite(site.coordinates?.longitude_deg)
        ? String(Number(site.coordinates.longitude_deg.toFixed(5)))
        : ''
    );
    setFormU(
      Number.isFinite(site.coordinates?.uv?.u)
        ? site.coordinates.uv.u.toFixed(4)
        : '0.5000'
    );
    setFormV(
      Number.isFinite(site.coordinates?.uv?.v)
        ? site.coordinates.uv.v.toFixed(4)
        : '0.5000'
    );
    setCoordNotice(null);
  };

  const openAddMode = () => {
    if (visibleSites.length >= MAX_SITES) return;
    if (editorMode === 'add') {
      setEditorMode(null);
      return;
    }
    const nextLetter = SITE_LETTERS[visibleSites.length] ?? 'C';
    const baseUv = activeSite?.coordinates?.uv ?? { u: 0.5, v: 0.5 };
    const defaultUv = {
      u: Number(Math.max(0.08, Math.min(0.92, baseUv.u + (visibleSites.length % 2 === 0 ? -0.05 : 0.05))).toFixed(4)),
      v: Number(Math.max(0.08, Math.min(0.92, baseUv.v + 0.05)).toFixed(4)),
    };
    const defaultLatLon = uvToLatLon(defaultUv, terrainMetadata, visibleSites);
    const regionShort = regionName?.split('/')[0]?.trim() || 'Site';
    setFormName(`${regionShort} Site ${nextLetter}`);
    setFormU(defaultUv.u.toFixed(4));
    setFormV(defaultUv.v.toFixed(4));
    setFormLat(defaultLatLon ? String(Number(defaultLatLon.latitude_deg.toFixed(5))) : '-89.4600');
    setFormLon(defaultLatLon ? String(Number(defaultLatLon.longitude_deg.toFixed(5))) : '-137.4000');
    setCoordNotice(null);
    setEditorMode('add');
  };

  const openMoveMode = () => {
    if (!activeSite) return;
    if (editorMode === 'move') {
      setEditorMode(null);
      return;
    }
    syncFormFromSite(activeSite);
    setEditorMode('move');
  };

  const closeEditor = () => {
    setCoordNotice(null);
    setEditorMode(null);
  };

  const handleLatLonChange = (nextLatStr, nextLonStr) => {
    setFormLat(nextLatStr);
    setFormLon(nextLonStr);
    const latNum = Number(nextLatStr);
    const lonNum = Number(nextLonStr);
    if (Number.isFinite(latNum) && Number.isFinite(lonNum) && latNum >= -90 && latNum <= 0) {
      const projected = latLonToUv(latNum, lonNum, terrainMetadata, visibleSites);
      if (projected) {
        setFormU(projected.u.toFixed(4));
        setFormV(projected.v.toFixed(4));
        setCoordNotice(
          projected.inBounds
            ? null
            : 'Koordinat berada di tepi/luar batas DEM lokal; disesuaikan ke batas terdekat tile.'
        );
      }
    }
  };

  const handleUvChange = (nextUStr, nextVStr) => {
    setFormU(nextUStr);
    setFormV(nextVStr);
    const uNum = Number(nextUStr);
    const vNum = Number(nextVStr);
    if (Number.isFinite(uNum) && Number.isFinite(vNum)) {
      const clampedU = Math.max(uvBounds.minU, Math.min(uvBounds.maxU, uNum));
      const clampedV = Math.max(uvBounds.minV, Math.min(uvBounds.maxV, vNum));
      const ll = uvToLatLon({ u: clampedU, v: clampedV }, terrainMetadata, visibleSites);
      if (ll) {
        setFormLat(String(Number(ll.latitude_deg.toFixed(5))));
        setFormLon(String(Number(ll.longitude_deg.toFixed(5))));
        setCoordNotice(null);
      }
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const uNum = Math.max(uvBounds.minU, Math.min(uvBounds.maxU, Number(formU)));
    const vNum = Math.max(uvBounds.minV, Math.min(uvBounds.maxV, Number(formV)));
    const latNum = Number(formLat);
    const lonNum = Number(formLon);
    if (!Number.isFinite(uNum) || !Number.isFinite(vNum)) return;

    const payload = {
      name: formName.trim() || undefined,
      uv: { u: uNum, v: vNum, extended: true },
      latitude_deg: Number.isFinite(latNum) ? latNum : undefined,
      longitude_deg: Number.isFinite(lonNum) ? lonNum : undefined,
    };

    if (editorMode === 'add') {
      onAddSite?.(payload);
      setEditorMode(null);
      onPlacementModeChange?.(null);
    } else if (editorMode === 'move' && activeSite) {
      onMoveSite?.(activeSite.site_id, payload);
    }
  };

  return (
    <section className="rounded-xl border border-white/15 bg-[#0b101b]/80 p-3.5 shadow-lg backdrop-blur-md">
      <div className="mb-2.5 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <ArrowRightLeft className="h-4 w-4 text-amber-400" />
          <h2 className="text-xs font-semibold tracking-wide text-slate-100 uppercase">
            Micro-Shift Sensitivity (<span className="normal-case">{separationLabel}</span>)
          </h2>
        </div>
        {activeMetrics && (
          <span
            className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-mono text-[10px] font-semibold ${
              activeMetrics.safety_rating === 'OPTIMAL'
                ? 'bg-emerald-500/20 text-emerald-300'
                : 'bg-amber-500/20 text-amber-300'
            }`}
          >
            {activeMetrics.safety_rating === 'OPTIMAL' ? (
              <CheckCircle2 className="h-3 w-3" />
            ) : (
              <AlertTriangle className="h-3 w-3" />
            )}
            {activeMetrics.safety_rating ?? 'Keamanan belum dinilai'}
          </span>
        )}
      </div>

      {/* Pilihan Cepat Site (Hingga 4 Site: A, B, C, D) */}
      <div className="grid grid-cols-2 gap-2" data-testid="site-cards-grid">
        {visibleSites.filter(Boolean).map((site, index) => {
          const isSelected = site.site_id === selectedSiteId;
          const m = metricsForSite(site) ?? {};
          const letter = SITE_LETTERS[index] ?? String(index + 1);
          const canDelete = visibleSites.length > 2 && index >= 2 && Boolean(onRemoveSite);
          return (
            <div
              key={site.site_id}
              className={`relative min-w-0 overflow-hidden rounded-lg border transition ${
                isSelected
                  ? 'border-amber-400 bg-amber-500/15 shadow-sm'
                  : 'border-white/10 bg-white/[0.03] hover:border-white/25'
              }`}
            >
              <button
                type="button"
                data-testid={`site-card-${letter}`}
                onClick={() => {
                  onSelectSite(site.site_id);
                  if (editorMode === 'move') {
                    syncFormFromSite(site);
                  }
                }}
                aria-pressed={isSelected}
                className="w-full p-2.5 text-left"
              >
                <div className="flex flex-wrap items-center justify-between gap-1 pr-4">
                  <span className="font-mono text-[11px] font-bold text-amber-300">
                    SITE {letter}
                  </span>
                  <span className="font-mono text-[10px] text-slate-400">
                    Slope {formatAngleShort(m.max_slope_deg)}
                  </span>
                </div>
                <p
                  className="mt-1 line-clamp-1 text-xs font-medium text-slate-100"
                  title={site.name ?? site.site_id}
                >
                  {site.name ?? site.site_id}
                </p>
                <div className="mt-2 space-y-1 font-mono text-[11px]">
                  <div className="flex flex-wrap justify-between gap-x-2 text-slate-300">
                    <span>Surya</span>
                    <span className="font-semibold text-amber-300">
                      {formatPercent(m.solar_illumination_pct)}
                    </span>
                  </div>
                  <div className="flex flex-wrap justify-between gap-x-2 text-slate-300">
                    <span>Bumi (geometris)</span>
                    <span className="font-semibold text-emerald-300">
                      {formatPercent(m.dte_availability_pct)}
                    </span>
                  </div>
                </div>
              </button>
              {canDelete && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemoveSite(site.site_id);
                  }}
                  title={`Hapus Site ${letter}`}
                  aria-label={`Hapus Site ${letter}`}
                  data-testid={`remove-site-${letter}`}
                  className="absolute top-1.5 right-1.5 rounded p-1 text-slate-400 transition hover:bg-rose-500/20 hover:text-rose-300"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Tombol Aksi Tambah Site (up to 4) & Pindah Site */}
      {(onAddSite || onMoveSite) && (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          {onAddSite && (
            <button
              type="button"
              data-testid="add-site-button"
              disabled={visibleSites.length >= MAX_SITES}
              onClick={openAddMode}
              aria-pressed={editorMode === 'add'}
              className={`flex flex-1 items-center justify-center gap-1 rounded-lg border px-2.5 py-1.5 text-[11px] font-medium transition ${
                editorMode === 'add'
                  ? 'border-sky-400 bg-sky-500/25 text-sky-200'
                  : visibleSites.length >= MAX_SITES
                    ? 'cursor-not-allowed border-white/10 bg-white/[0.02] text-slate-500'
                    : 'border-white/15 bg-white/[0.05] text-slate-200 hover:border-sky-400/50 hover:text-sky-200'
              }`}
              title={
                visibleSites.length >= MAX_SITES
                  ? 'Maksimal 4 site telah tercapai'
                  : 'Tambah site baru (maksimal 4 site)'
              }
            >
              <Plus className="h-3.5 w-3.5" />
              <span>
                {visibleSites.length >= MAX_SITES
                  ? `Penuh (${MAX_SITES}/${MAX_SITES})`
                  : `Tambah Site (${visibleSites.length}/${MAX_SITES})`}
              </span>
            </button>
          )}

          {onMoveSite && activeSite && (
            <button
              type="button"
              data-testid="move-site-button"
              onClick={openMoveMode}
              aria-pressed={editorMode === 'move'}
              className={`flex flex-1 items-center justify-center gap-1 rounded-lg border px-2.5 py-1.5 text-[11px] font-medium transition ${
                editorMode === 'move'
                  ? 'border-amber-400 bg-amber-500/25 text-amber-200'
                  : 'border-white/15 bg-white/[0.05] text-slate-200 hover:border-amber-400/50 hover:text-amber-200'
              }`}
              title={`Pindah atau ubah koordinat Site ${activeLetter}`}
            >
              <Move className="h-3.5 w-3.5" />
              <span>Pindah Site {activeLetter}</span>
            </button>
          )}

          {hasCustomSiteChanges && onResetSites && (
            <button
              type="button"
              data-testid="reset-sites-button"
              onClick={() => {
                closeEditor();
                onResetSites();
              }}
              className="flex items-center justify-center gap-1 rounded-lg border border-white/15 bg-white/[0.04] px-2 py-1.5 text-[11px] text-slate-300 transition hover:border-white/30 hover:text-white"
              title="Reset daftar site dan koordinat ke data awal kawasan"
            >
              <RotateCcw className="h-3 w-3" />
              <span>Reset</span>
            </button>
          )}
        </div>
      )}

      {/* Panel Input Koordinat Kustom (Tambah Site / Pindah Site) */}
      {editorMode && (
        <form
          onSubmit={handleSubmit}
          data-testid="site-coordinate-form"
          className="mt-2.5 space-y-2 rounded-lg border border-sky-400/30 bg-[#070b14]/95 p-2.5 text-[11px]"
        >
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1 font-mono text-[10px] font-semibold tracking-wide text-sky-300 uppercase">
              <MapPin className="h-3 w-3" />
              {editorMode === 'add'
                ? `Tambah Site ${SITE_LETTERS[visibleSites.length] ?? 'Baru'}`
                : `Pindah Koordinat Site ${activeLetter}`}
            </span>
            <button
              type="button"
              onClick={closeEditor}
              className="rounded px-1.5 py-0.5 text-[10px] text-slate-400 hover:bg-white/10 hover:text-white"
            >
              Tutup
            </button>
          </div>

          <p className="text-[10px] leading-snug text-slate-300">
            Klik langsung pada permukaan medan 3D untuk memilih titik, atau masukkan koordinat
            lintang/bujur maupun posisi tile UV di bawah:
          </p>

          <div>
            <label className="block font-mono text-[10px] text-slate-400">
              Nama Site
              <input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                data-testid="site-name-input"
                className="mt-0.5 w-full rounded border border-white/15 bg-black/50 px-2 py-1 text-xs text-slate-100 focus:border-amber-400 focus:outline-none"
                placeholder="Nama lokasi pendaratan"
              />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <label className="block font-mono text-[10px] text-slate-400">
              Lintang (Lat °)
              <input
                type="number"
                step="0.0005"
                min="-90"
                max="0"
                value={formLat}
                onChange={(e) => handleLatLonChange(e.target.value, formLon)}
                data-testid="site-lat-input"
                className="mt-0.5 w-full rounded border border-white/15 bg-black/50 px-2 py-1 font-mono text-xs text-slate-100 focus:border-amber-400 focus:outline-none"
              />
            </label>
            <label className="block font-mono text-[10px] text-slate-400">
              Bujur (Lon °)
              <input
                type="number"
                step="0.005"
                min="-180"
                max="180"
                value={formLon}
                onChange={(e) => handleLatLonChange(formLat, e.target.value)}
                data-testid="site-lon-input"
                className="mt-0.5 w-full rounded border border-white/15 bg-black/50 px-2 py-1 font-mono text-xs text-slate-100 focus:border-amber-400 focus:outline-none"
              />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <label className="block font-mono text-[10px] text-slate-400">
              Posisi Barat–Timur (U: {uvBounds.minU} s/d {uvBounds.maxU})
              <input
                type="number"
                step="0.01"
                min={uvBounds.minU}
                max={uvBounds.maxU}
                value={formU}
                onChange={(e) => handleUvChange(e.target.value, formV)}
                data-testid="site-u-input"
                className="mt-0.5 w-full rounded border border-white/15 bg-black/50 px-2 py-1 font-mono text-xs text-slate-100 focus:border-amber-400 focus:outline-none"
              />
            </label>
            <label className="block font-mono text-[10px] text-slate-400">
              Posisi Utara–Selatan (V: {uvBounds.minV} s/d {uvBounds.maxV})
              <input
                type="number"
                step="0.01"
                min={uvBounds.minV}
                max={uvBounds.maxV}
                value={formV}
                onChange={(e) => handleUvChange(formU, e.target.value)}
                data-testid="site-v-input"
                className="mt-0.5 w-full rounded border border-white/15 bg-black/50 px-2 py-1 font-mono text-xs text-slate-100 focus:border-amber-400 focus:outline-none"
              />
            </label>
          </div>

          {tileRange && (
            <p className="font-mono text-[9px] text-slate-400">
              Cakupan tile DEM: Lat {tileRange.minLat}° s/d {tileRange.maxLat}° · Lon{' '}
              {tileRange.minLon}° s/d {tileRange.maxLon}°
            </p>
          )}
          {coordNotice && <p className="text-[10px] text-amber-300">{coordNotice}</p>}

          <div className="flex items-center gap-2 pt-0.5">
            <button
              type="submit"
              data-testid="apply-site-coordinates"
              className="flex-1 rounded-md bg-amber-500 px-3 py-1.5 font-semibold text-slate-950 transition hover:bg-amber-400"
            >
              {editorMode === 'add' ? 'Simpan & Hitung Site Baru' : 'Terapkan & Hitung Ulang'}
            </button>
          </div>
        </form>
      )}

      {/* Info Koordinat Site Aktif */}
      {activeSite?.coordinates && (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-1 rounded-md border border-white/10 bg-white/[0.02] px-2.5 py-1.5 font-mono text-[10px] text-slate-300">
          <span>
            Site {activeLetter}: {formatLatitude(activeSite.coordinates.latitude_deg)},{' '}
            {formatLongitude(activeSite.coordinates.longitude_deg)}
          </span>
          <span className="text-amber-300">
            Elev {formatMeters(activeSite.coordinates.elevation_m)}
          </span>
        </div>
      )}

      {/* Ringkasan Delta & Penjelasan Mode */}
      {solarDelta !== null && dteDelta !== null && (
        <div className="mt-2.5 rounded-lg border border-amber-400/20 bg-amber-500/10 p-2.5 text-[11px] text-slate-200">
          {uiMode === 'planner' ? (
            <div className="flex flex-wrap items-center justify-between gap-1 font-mono text-[10px]">
              <span className="text-amber-300">
                Δ Solar ({primaryLetter}−{secondaryLetter}): {signed(solarDelta)} pp
              </span>
              <span className="text-emerald-300">
                Δ DTE: {signed(dteDelta)} pp
              </span>
              <span className="text-slate-300">
                Matahari tidak lolos ambang terlama: {hours(activeMetrics?.max_eclipse_hours)}
              </span>
            </div>
          ) : (
            <p className="leading-relaxed text-slate-200">
              Selisih Site {primaryLetter} dibanding Site {secondaryLetter} (jarak{' '}
              <strong>{separationLabel}</strong>): penyinaran Matahari{' '}
              <strong>{signed(solarDelta)} poin persen</strong>, durasi tidak lolos ambang terlama{' '}
              {hours(metricsB?.max_eclipse_hours)} → {hours(metricsA?.max_eclipse_hours)}.
            </p>
          )}
        </div>
      )}
      <p className="mt-2 text-[10px] text-slate-400">
        {activeSite?.terrain_summary_metrics ? `Model medan lokal ${regionName}, ambang minimum 0°.` : 'Baseline horizontal 0°, tanpa medan.'}
        {' '}Ringkasan seluruh periode; penghalang luar dan keselamatan belum dinilai.
      </p>
      {activeSite?.selection_basis?.startsWith('DEMO_DEM_CENTRE') && <p className="mt-1 text-[10px] text-amber-200">
        A/B adalah titik demo di kawasan DEM, bukan rekomendasi lokasi pendaratan.
      </p>}
      {activeSite?.selection_basis === 'USER_CUSTOM_COORDINATES' && (
        <p className="mt-1 text-[10px] text-sky-300">
          Koordinat kustom aktif: elevasi, slope, horizon 360°, dan efemeris topocentris dihitung otomatis dari DEM lokal.
        </p>
      )}
      {activeSite?.terrain_screening && <details className="mt-2 text-[11px] text-slate-300">
        <summary>Screening medan demo: {activeSite.terrain_screening.rating}</summary>
        <p>{activeSite.terrain_screening.note}</p>
        <p>Maks slope {formatAngleShort(activeSite.terrain_screening.max_slope_deg)};
          {' '}RMS {activeSite.terrain_screening.roughness_rmse_m.toFixed(3)} m;
          radius {activeSite.terrain_screening.radius_m} m.</p>
      </details>}
    </section>
  );
}
