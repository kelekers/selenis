# Kontrak aset publik v1

Ini kontrak operasional untuk integritas rilis, bukan schema ilmiah final.
Contoh telemetry dalam blueprint masih berupa satu record dan tidak menetapkan
seluruh relasi lokasi/waktu. Tim data dan frontend harus menyepakatinya sebelum integrasi.

Manifest awal memakai `schema_version: 1`, `status: "scaffold"`, `assets: []`.
Ubah ke `ready` ketika aset sungguhan tersedia, dengan satu entri per file:

```json
{
  "path": "data/site_telemetry.json",
  "source_url": "https://alamat-produk-asli.example/dataset",
  "dataset_id": "ID produk dan versi dari sumber",
  "retrieved_at": "2026-11-14T00:00:00Z",
  "processing": "Parameter, versi skrip/commit, resolusi, dan metode pengolahan",
  "units": "deg, m; uraikan satuan setiap field",
  "reference_frame": "Frame lunar, konvensi longitude, datum elevasi",
  "sha256": "isi dengan SHA-256 file sebenarnya, 64 karakter hex lowercase"
}
```

Contoh di atas dokumentasi, bukan data siap rilis. `source_url` harus URL produk
atau endpoint sumber yang benar; portal umum saja tidak cukup untuk reproduksi.
Catat query Horizons (observer/site, target, frame, time scale, rentang, interval),
identitas DEM, proyeksi/CRS, datum/radius, resolusi, nodata, konvensi azimuth, dan
interpolasi pada `processing` atau dokumentasi dataset yang dirujuk di sana.

Hitung checksum di PowerShell:

```powershell
(Get-FileHash public/data/site_telemetry.json -Algorithm SHA256).Hash.ToLower()
```

Atau pada Linux: `sha256sum public/data/site_telemetry.json`.
Git menyimpan JSON dengan akhir baris LF sesuai `.gitattributes`. Pastikan file lokal
juga memakai LF sebelum menghitung checksum; CRLF akan menghasilkan hash berbeda meskipun
isi JSON terlihat sama. Generator pipeline menulis byte output dan checksum secara konsisten.
Setelah memperbarui manifest, jalankan `npm run data:check` sebelum commit.
Validator memeriksa provenance wajib, path, duplikasi, ukuran, JSON valid,
checksum, dan file yang tidak terdaftar. Batas awal: 10 MiB/file, total 50 MiB.
Ini budget transfer awal, bukan jaminan FPS. Sesuaikan hanya setelah pengukuran.
WebP harus diuji oleh tim terrain (format, dimensi <=2048², orientasi, skala tinggi);
validator saat ini tidak mendekode gambar atau membuktikan kebenaran fisika.
WebP boleh dipakai untuk tekstur tinggi visual, tetapi elevasi DEM yang diukur
butuh data numerik/terkuantisasi tervalidasi; kompresi lossy tidak aman untuk
perhitungan slope yang presisi.

Sebelum release ilmiah, set `REQUIRE_SCIENCE_DATA=true` di environment build
Netlify. Ini menolak scaffold/manifest kosong; **tetap butuh review ilmiah**.
Untuk lokal PowerShell:

```powershell
$env:REQUIRE_SCIENCE_DATA = 'true'
npm run verify
Remove-Item Env:REQUIRE_SCIENCE_DATA
```

Output besar dan DEM mentah disimpan di storage tim dengan backup terpisah,
bukan Git. Pertahankan dataset terkurasi versi sebelumnya untuk rollback.
Jangan mempublikasikan data fixture tes sebagai pengamatan NASA.

---

# Kontrak data ilmiah (DRAFT; setujui sebelum implementasi)

STATUS: DRAFT. Field bertanda TBD **bukan** fakta yang sudah disepakati. Butuh
persetujuan Anggota 1, 2, 4 dan 6. Contoh bentuk di sini adalah antarmuka ilustratif,
bukan pengukuran NASA. Sumber, ID dataset, sitasi/lisensi, dan `reference_frame`
setiap file dicatat lewat entri manifest di atas, bukan diulang di sini.

## Aset terrain — pemilik Anggota 2
- `asset_url`: TBD (usulan `/textures/<tile-id>.<ext>`)
- `crs_projection` (south polar stereographic? definisi persis): TBD
- `pixel_grid`, orientasi/urutan sumbu, transformasi sampel→dunia: TBD
- `tile_bounds`, pemetaan lintang/bujur ke posisi mesh: TBD
- `height_encoding`: TBD, **termasuk meter-per-unit dan offset**
- `height_datum/reference_radius`: TBD
- `no_data_value`, mask no-data, penanganan lubang: TBD
- `min/max_elevation_m`, `vertical_exaggeration`: TBD
- `resolution_m_per_pixel`, akurasi ketinggian site: TBD

## Data ephemeris — pemilik Anggota 1
- `timestamp_utc`: ISO-8601 Z persis, beserta langkah waktu/kebijakan interpolasi
- `site_id` atau koordinat asal tempat azimuth/elevasi berlaku
- `sun`: `azimuth_deg`, `elevation_deg`, opsional ketidakpastian/frame
- `earth`: `azimuth_deg`, `elevation_deg`, opsional ketidakpastian/frame
- `coordinate_convention`: utara 0°, searah jarum jam, timur 90°? Konfirmasi.
- Lokasi observer dan sumber vektor Horizons/SPICE: TBD
- `availability_interval`: start/end/step, clamp vs ekstrapolasi terinterpolasi: TBD
- Visibilitas yang dihitung di muka harus spesifik per site dengan horizon mask atau
  ambang obstruksi; JANGAN menyimpulkan DTE hanya dari elevasi di atas 0.

### USULAN (Anggota 3, perlu persetujuan Anggota 1): orientasi Bumi dilihat dari site
Tujuan: model Bumi 3D berotasi dan miring sesuai waktu (sekarang posisi benua ilustratif).
Tambahan opsional per baris `timelines_by_site[site_id][i].earth_vector`:

| Field | Horizons | Arti |
|---|---|---|
| `sub_observer_lon_deg` | 14 `ObsSub-LON` | bujur titik Bumi yang menghadap site; planetodetik, **positif ke timur** (Earth, ITRF93) |
| `sub_observer_lat_deg` | 14 `ObsSub-LAT` | lintang titik tersebut (−90..90) |
| `north_pole_pa_deg` | 17 `NP.ang` | sudut posisi kutub utara Bumi di langit, berlawanan jarum jam (utara→timur) dari arah kutub utara **Bulan** (kerangka RA/Dec ekuator IAU 2015 Bulan untuk pengamat di Bulan) |

- Kueri: query Bumi yang sudah ada per site (`COMMAND='399'`, `CENTER='coord@301'`,
  `SITE_COORD` site, `APPARENT='AIRLESS'`) dengan `QUANTITIES='4,14,17'` (sekarang `'4'`).
  Waktu, langkah, dan site sama, jadi baris tetap sejajar dengan `azimuth_deg`/`elevation_deg`.
- Field ini menggantikan peran `libration_*` untuk orientasi, tetapi `libration_*` tetap dipakai.
- Konsumen: `src/utils/earthOrientation.js` (kutub Bulan di ENU dari lintang site). Jika field
  tidak ada, tampilan tetap berjalan dengan benua ilustratif.
- Validasi (2026-11-14, sampel Horizons 720 jam untuk kedua site, tidak dipublikasikan): arah
  Matahari dari data tim yang diproyeksikan ke piringan Bumi cocok dengan Horizons `SN.ang`
  (kuantitas 16) hingga ≤ 0,007°; titik sub-pengamat menghadap site; rotasi ≈ 14,5°/jam.
- Selisih kecil antara kutub IAU 2015 dan kerangka mean-Earth site diabaikan (visualisasi).

## Metadata site — pemilik Anggota 2 / integrasi
- `id`, `display_name`, `latitude_deg`, `longitude_deg`, `elevation_m`: nilai asli menyusul
- `mesh_x`, `mesh_z` diturunkan dari proyeksi yang disetujui, BUKAN ditebak
- `slope_deg` dan mask/grid: dihitung dan didokumentasikan oleh engineer terrain
- `horizon_mask`: resolusi azimuth dan interpolasi: TBD
- Bedakan metrik site dari status bayangan visual.

## Antarmuka UI ↔ 3D — sepakati dengan Anggota 4/6
```ts
// Konseptual saja; sesuaikan dengan repository dan konvensi penamaan yang ada.
type LunarSceneProps = {
  selectedSiteId: string | null;
  timestampUtc: string;
  onSelectSite: (siteId: string) => void;
  displayMode?: 'planner' | 'explorer';
};
```

## Konvensi koordinat (masih didiskusikan)
Usulan pemetaan ENU lokal Three.js: x=timur, y=atas, z=utara. Untuk azimuth A
(searah jarum jam dari utara) dan elevasi E di atas horizon lokal, vektor satuan:
`x = cos(E) sin(A); y = sin(E); z = cos(E) cos(A)` (sudut dalam radian).
Validasi arah utara/timur terhadap titik sumber yang diketahui sebelum deploy.

> Catatan konflik: blueprint TIMOREX dan kode di `origin/feat/web-app`
> (`src/utils/shadowMath.js`) memakai **−Z = utara**, berbeda dengan usulan +Z di atas.
> Belum diputuskan tim.

## Checklist persetujuan lintas tim
- [ ] Anggota 1 mengonfirmasi observer, frame koordinat, timestamp dan satuan.
- [ ] Anggota 2 mengonfirmasi proyeksi DEM, ketinggian, encoding dan schema horizon mask.
- [ ] Anggota 4 mengonfirmasi API event site/waktu terpilih dan kepemilikan state.
- [ ] Anggota 6 mengonfirmasi path file publik/statis dan kebutuhan deployment.
- [ ] Satu titik data yang dicek independen memvalidasi pemetaan terrain dan posisi Matahari/Bumi.
