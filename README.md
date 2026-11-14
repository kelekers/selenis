# SELENIS · TIMOREX

## Menjalankan integrasi data dan web

Branch lokal `develop` sudah memuat gabungan pipeline dan web. Dari root repository:

```powershell
npm ci
uv sync --locked
npm run verify
npm run dev
```

Buka URL yang dicetak Vite (biasanya http://127.0.0.1:5173).
JSON dan WebP hasil pipeline sudah disertakan, sehingga tidak perlu mengunduh ulang
NASA atau menjalankan komputasi DEM untuk menguji web. Pilih Site A/B, geser waktu,
dan buka **Laporan data ilmiah** untuk memeriksa cakupan serta batas hasil.

Integrasi memakai `timelines_by_site`, status `terrain_visibility_timeline` per UTC,
ringkasan dengan penghalang DEM, encoding heightmap 8-bit linear, dan basis utara
lokal dari `slope_analysis.local_basis_projected`. Heightmap adalah visualisasi
terkuantisasi; hasil analisis berasal dari pipeline, bukan bayangan GPU.
Keamanan pendaratan dan penghalang di luar Site01 belum divalidasi.

Fondasi DevOps tanpa Docker untuk Lunar South Pole Illumination & Direct-to-Earth
Line-of-Sight Navigator. **Status: demo terintegrasi dengan data offline Site01;
belum tervalidasi untuk perencanaan misi nyata.**

## Pemahaman kebutuhan

Blueprint `NASA - TIMOREX.pdf` menjelaskan aplikasi 3D untuk membandingkan
pencahayaan, komunikasi langsung ke Bumi (DTE), dan kemiringan lereng di
80–90° lintang selatan Bulan. Fitur sasaran: panorama horizon 360°, perbandingan
lokasi/waktu, Planner/Explorer, librasi Bumi, dan panel perbandingan Bulan–Bumi.
Markdown pendamping berisi referensi sumber. Jadwal, klaim penjurian, dan angka
contoh di blueprint adalah bahan perencanaan tim, bukan hasil validasi resmi.

Arsitektur: NASA/LOLA → Python offline → JSON/WebP terkurasi → React/Vite/R3F
di browser → hosting statis Netlify. Tidak ada backend, database, atau container.
Target 60 FPS perlu dibuktikan pada perangkat demo.

## Mulai lokal (PowerShell, macOS, Linux)

Prasyarat: Git, Node.js **24.19.0** dengan npm, dan **uv 0.12.3**.
uv menyiapkan Python 3.13 sesuai `.python-version`.

```sh
npm ci
uv sync --locked
npm run verify
npm run dev
```

Buka URL lokal yang dicetak Vite. Perintah dijalankan dari root repository.
Jika PowerShell memblokir `npm.ps1`, gunakan `npm.cmd`, tanpa mengubah kebijakan mesin.
Tidak perlu `.env` untuk menjalankan scaffold; `.env.example` menjelaskan batasnya.

```sh
npm run preview
```

Setelah kode Python ditambahkan, jalankan pemeriksaannya (test kosong akan gagal):

```sh
uv run --locked ruff check data-pipeline
uv run --locked ruff format --check data-pipeline
uv run --locked python -m unittest discover -s data-pipeline -p "test_*.py"
```

`preview` digunakan setelah build dan hanya untuk pemeriksaan lokal.

## Isi repository

| Lokasi | Tanggung jawab |
| --- | --- |
| `src/` | Frontend React; React 18 dan R3F 8 mengikuti blueprint |
| `data-pipeline/` | Area kerja Python tim ephemeris/terrain |
| `public/data/manifest.json` | Daftar aset, provenance, dan checksum |
| `public/textures/` | Tekstur WebP terkurasi |
| `scripts/` | Validasi aset dan tes negatif |
| `.github/workflows/ci.yml` | Lint, tes, validasi, build pada Windows/Linux |
| `netlify.toml` | Build terverifikasi, publish `dist`, header keamanan/cache |
| `docs/` | Kontrak data dan runbook DevOps |

`package-lock.json` dan `uv.lock` wajib di-commit. `npm ci` dan `uv sync --locked`
mencegah resolusi dependency diam-diam berubah. Library UI tambahan dipasang oleh
pemilik frontend ketika diperlukan; tidak ada komponen fitur yang dibuat sebagai stub palsu.

## Cara kerja tim

Buat branch `feat/<topik>` atau `fix/<topik>`, buka PR ke `main`, tunggu CI dan
review. Jangan commit `.env`, token, data mentah, `node_modules`, `.venv`, atau `dist`.
File di `public/` dapat diunduh siapa saja. Seluruh `VITE_*` juga bersifat publik.

DevOps menangani CI/CD, hosting, konfigurasi, batas aset, dan rollback.
Tim data menangani pengambilan NASA, fisika, provenance, serta validasi ilmiah.
Tim frontend menangani mesh/lighting/HUD, aksesibilitas, dan performa WebGL.
QA/pitch memeriksa alur demo, perangkat, sitasi, serta persyaratan lomba terkini.

Lanjutkan dengan [runbook DevOps](docs/devops.md) dan [kontrak data](docs/data-contract.md).

## Referensi

- [NASA JPL Horizons](https://ssd.jpl.nasa.gov/horizons/)
- [LROC QuickMap](https://quickmap.lroc.asu.edu/)
- [NASA Moon Trek](https://trek.nasa.gov/moon/)
- [CSA Moon Exploration](https://www.asc-csa.gc.ca/eng/astronomy/moon-exploration/)
- [Vite](https://vite.dev/guide/)
- [Netlify build configuration](https://docs.netlify.com/build/configure-builds/file-based-configuration/)
- [uv locked sync](https://docs.astral.sh/uv/concepts/projects/sync/)

Lisensi kode perlu diputuskan bersama tim sebelum distribusi; lisensi dan atribusi
dataset tetap mengikuti setiap sumbernya.
