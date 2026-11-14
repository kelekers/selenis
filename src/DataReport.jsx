import { useEffect, useState } from 'react';

export function DataReport() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    fetch('/data/site_telemetry.json', { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error('Dataset tidak dapat dimuat.');
        return response.json();
      })
      .then((result) => {
        if (!result.sites?.length) throw new Error('Dataset lokasi kosong.');
        setData(result);
      })
      .catch((failure) => {
        if (failure.name !== 'AbortError') setError(failure.message);
      });
    return () => controller.abort();
  }, []);

  const demo = data?.demo_48_hours;
  const percent = (value) => `${value.toLocaleString('id-ID', { maximumFractionDigits: 4 })}%`;

  return (
    <main>
      <p>NASA Space Apps · TIMOREX</p>
      <h1>SELENIS</h1>
      <h2>Lunar South Pole Navigator</h2>
      <p>Ephemeris Connecting Ridge A/B dari NASA JPL Horizons.</p>
      {!data && <p role="status">{error || 'Memuat dataset offline…'}</p>}
      {data && <>
        <p>{data.visibility_model}. Metrik ini merupakan proksi geometris pusat objek,
          dengan resolusi per jam, bukan jaminan daya surya atau koneksi radio.</p>
        <p>Periode UTC: {data.mission_window.start_utc} hingga{' '}
          {data.mission_window.end_utc} (akhir eksklusif).</p>
        {data.sites.map((site) => <section key={site.site_id} aria-labelledby={site.site_id}>
          <h2 id={site.site_id}>{site.name}</h2>
          <dl>
            <dt>Waktu pusat Matahari di atas horizontal</dt>
            <dd>{percent(site.summary_metrics.solar_illumination_pct)}</dd>
            <dt>Visibilitas geometris Bumi</dt>
            <dd>{percent(site.summary_metrics.dte_availability_pct)}</dd>
            <dt>Durasi terlama Matahari di bawah/di ambang horizontal</dt>
            <dd>{site.summary_metrics.max_eclipse_hours} jam</dd>
            <dt>Kemiringan rata-rata / maksimum</dt>
            <dd>{site.summary_metrics.average_slope_deg == null ? 'Tidak tersedia' : `${site.summary_metrics.average_slope_deg}°`}
              {' / '}{site.summary_metrics.max_slope_deg == null ? 'Tidak tersedia' : `${site.summary_metrics.max_slope_deg}°`}</dd>
          </dl>
          {site.safety_assessment && <p>Keamanan pendaratan belum dinilai: {site.safety_assessment.reason}</p>}
          {site.terrain_summary_metrics && <>
            <h3>Horizontal 0° + penghalang Site01</h3>
            <p>Hasil terbatas pada medan yang diperiksa di dalam Site01.</p>
            <dl>
              <dt>Matahari bebas penghalang dalam model lokal</dt>
              <dd>{percent(site.terrain_summary_metrics.solar_illumination_pct)}</dd>
              <dt>Bumi bebas penghalang dalam model lokal</dt>
              <dd>{percent(site.terrain_summary_metrics.dte_availability_pct)}</dd>
              <dt>Durasi terlama Matahari tidak lolos ambang model lokal</dt>
              <dd>{site.terrain_summary_metrics.max_eclipse_hours} jam</dd>
              <dt>Area pengukuran slope</dt>
              <dd>Radius {site.slope_analysis.radius_m} m; keamanan pendaratan belum dinilai.</dd>
              <dt>Jarak medan yang diperiksa menurut arah</dt>
              <dd>{(site.horizon_coverage.min_sampled_distance_m / 1000).toFixed(2)}–
                {(site.horizon_coverage.max_sampled_distance_m / 1000).toFixed(2)} km</dd>
            </dl>
            <figure>
              <svg viewBox="0 0 720 180" role="img" aria-label={`Profil horizon lokal ${site.name}; garis referensi nol derajat`}>
                <line x1="0" y1="150" x2="720" y2="150" stroke="currentColor" strokeDasharray="5 5" />
                <polyline fill="none" stroke="#9edbff" strokeWidth="2" points={site.horizon_mask_360.map(
                  (point) => `${point.azimuth_deg * 2},${150 - Math.max(0, point.horizon_elevation_deg) * 10}`,
                ).join(' ')} />
              </svg>
              <figcaption>Azimut: 0° Utara, 90° Timur, 180° Selatan, 270° Barat, 360° Utara.
                Horizon efektif pada 360 arah; garis putus-putus = 0°.
                Medan di luar batas belum diperiksa.</figcaption>
            </figure>
          </>}
          {site.horizon_mask_360 == null && <p>Horizon medan dan penilaian keamanan tidak tersedia.</p>}
        </section>)}
        {data.terrain_metadata == null && <p>DEM dan koordinat UV belum tersedia.</p>}
        {data.terrain_metadata && <section aria-labelledby="terrain-heading">
          <h2 id="terrain-heading">Cakupan medan Site01</h2>
          <p>{data.terrain_metadata.visibility_model}. Horizon dip belum dimodelkan.
            Peta tinggi adalah aset visual; perhitungan memakai DEM resolusi asli.</p>
          <p>Validasi pengukuran independen belum selesai; horizon di luar Site01 belum tercakup.</p>
          {data.terrain_metadata.validation && <>
            <h3>Pembanding slope resmi NASA</h3>
            <p>{data.terrain_metadata.validation.note}</p>
            {data.sites.map((site) => {
              const comparison = data.terrain_metadata.validation.sites[site.site_id];
              return comparison && <p key={site.site_id}>{site.name}: selisih absolut rata-rata{' '}
                {comparison.mae_deg.toFixed(4)}°, RMSE {comparison.rmse_deg.toFixed(4)}°,
                {' '}{comparison.sample_count} piksel. Tidak ada ambang kelulusan yang ditetapkan.</p>;
            })}
          </>}
          <figure>
            <img className="heightmap" src={data.terrain_metadata.heightmap_texture}
              alt="Peta tinggi Connecting Ridge Site01; gelap rendah, terang tinggi" />
            <figcaption>{data.terrain_metadata.area_width_km} × {data.terrain_metadata.area_height_km} km;
              gelap = {data.terrain_metadata.min_elevation_m.toFixed(1)} m,
              terang = {data.terrain_metadata.max_elevation_m.toFixed(1)} m.
              Orientasi mengikuti grid proyeksi.</figcaption>
          </figure>
        </section>}
        <h2>Demo +48 jam</h2>
        {demo?.is_available ? <>
          <p>Lokasi yang sama: {demo.site_id}; dua jendela 24 jam.</p>
          {demo.windows.map((window, index) => <p key={window.start_utc}>
            {window.start_utc} hingga {window.end_utc} (akhir eksklusif):{' '}
            visibilitas geometris Bumi {percent(demo.summary_metrics[index].dte_availability_pct)},
            {' '}Matahari {percent(demo.summary_metrics[index].solar_illumination_pct)}.
          </p>)}
        </> : <p>Tidak tersedia: cakupan data tidak cukup untuk kedua jendela.</p>}
        {data.terrain_demo_48_hours?.is_available && <>
          <h3>Demo +48 jam dengan penghalang Site01</h3>
          <p>Lokasi: {data.terrain_demo_48_hours.site_id}; durasi 24 jam.</p>
          {data.terrain_demo_48_hours.windows.map((window, index) => <p key={window.start_utc}>
            {window.start_utc} hingga {window.end_utc} (akhir eksklusif):{' '}
            Bumi {percent(data.terrain_demo_48_hours.summary_metrics[index].dte_availability_pct)},
            {' '}Matahari {percent(data.terrain_demo_48_hours.summary_metrics[index].solar_illumination_pct)}.
          </p>)}
        </>}
      </>}
      <a href="https://ssd.jpl.nasa.gov/horizons/">Referensi NASA JPL Horizons</a>
    </main>
  );
}
