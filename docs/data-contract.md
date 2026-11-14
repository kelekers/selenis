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
Validator memeriksa provenance wajib, path, duplikasi, ukuran, JSON valid,
checksum, dan file yang tidak terdaftar. Batas awal: 10 MiB/file, total 50 MiB.
Ini budget transfer awal, bukan jaminan FPS. Sesuaikan hanya setelah pengukuran.
WebP harus diuji oleh tim terrain (format, dimensi <=2048², orientasi, skala tinggi);
validator saat ini tidak mendekode gambar atau membuktikan kebenaran fisika.

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
