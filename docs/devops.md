# Runbook DevOps tanpa Docker

## Aktivasi repository dan CI

Konfigurasi lokal sudah tersedia; pengaturan akun berikut belum diterapkan.

1. Periksa perubahan, commit, lalu push ke repository GitHub tim.
2. Di Actions, pastikan workflow `CI` berjalan dan kedua job verify berhasil.
3. Aktifkan ruleset `main`: wajib PR, minimal satu review, wajib status
   `verify (ubuntu-latest)` dan `verify (windows-latest)`, blok force-push/deletion.
   Nama check dapat dikonfirmasi setelah run pertama. Batasi bypass kepada kebutuhan tim.
4. Aktifkan secret scanning/push protection bila tersedia untuk akun/repository.
5. Dependabot memperbarui npm dan Actions mingguan. Python diperbarui terkontrol
   memakai `uv lock --upgrade`, lalu `uv sync --locked`, lint, tes, dan review lockfile.

CI tidak mengunduh NASA dan tidak menjalankan pipeline ilmiah berat. Saat ini belum
ada test Python karena pipeline belum diimplementasikan. CI melewati lint/test Python
hanya selama tidak ada file `.py` di pipeline; setelah kode ditambahkan, unittest
menemukan `data-pipeline/test_*.py` dan test kosong akan gagal. Tes Node menguji gerbang aset.
Artifact `site-<commit>` menyimpan hasil build 7 hari untuk investigasi.

## Deployment Netlify

1. Import repository GitHub melalui Netlify, pilih production branch `main`.
2. Base directory: root; build/publish dibaca dari `netlify.toml`.
3. Aktifkan Deploy Previews untuk PR. Hosting menjalankan `npm ci && npm run verify`;
   build gagal tidak menggantikan production yang berhasil sebelumnya.
4. Setelah dataset disetujui tim data, set `REQUIRE_SCIENCE_DATA=true` pada
   production build environment. Jangan gunakan nilai ini untuk menyatakan hasil ilmiah valid.
5. Buka URL HTTPS hasil deploy; uji `/`, `/health.json`, dan `/data/manifest.json`.
   Uji aset JSON/WebP sebenarnya setelah tersedia; URL hilang harus tetap 404.

Tidak perlu token deployment di repository: integrasi Git Netlify mengelola publish.
Netlify tidak otomatis menunggu seluruh CI Python GitHub; ruleset `main` wajib
digunakan supaya perubahan pipeline tidak masuk sebelum tes lolos.
`npm run preview` bukan server production. Tidak ada rewrite SPA sampai router
client diperlukan, agar JSON hilang tidak tersamarkan oleh respons HTML 200.

Node dipilih sesuai [persyaratan Vite](https://vite.dev/guide/) dan dapat dipasang
melalui [konfigurasi versi Netlify](https://docs.netlify.com/build/configure-builds/available-software-at-build-time/).
Lock Python mengikuti [uv locked sync](https://docs.astral.sh/uv/concepts/projects/sync/).

## Monitoring dan respons insiden

- Setelah deploy, periksa log build dan console/network browser.
- Daftarkan URL `/health.json` pada monitor HTTP pilihan tim; interval awal 5 menit,
  harapkan HTTP 200 dan `service: selenis`; arahkan alert ke kanal penanggung jawab.
- Endpoint statis tersebut hanya menguji delivery CDN, bukan kesiapan data atau WebGL.
  Periksa `manifest.status` serta lakukan smoke test UI terpisah.
- Catat commit, URL deploy, dataset/version, perangkat, dan hasil tes saat rilis.
- Ukur ukuran transfer, waktu muat, penggunaan memori, dan FPS pada perangkat demo
  serta minimal satu ponsel. Target 60 FPS adalah sasaran, bukan hasil pengujian saat ini.

Jika production rusak, buka Deploys Netlify, pilih deployment sukses sebelumnya,
dan gunakan Publish deploy. Periksa kembali halaman, manifest dan aset. Revert commit
bermasalah melalui PR supaya deploy berikutnya tidak mengembalikan kerusakan.
Rollback bersama frontend dan dataset; jangan campur versi manifest dan file.
Jika token bocor, cabut/rotasi di penyedia, lalu bersihkan riwayat secara terencana;
menghapus file pada commit terbaru saja tidak mencabut token.

## Checklist sebelum demo

- [ ] CI Windows/Linux dan build hosting hijau; preview disetujui.
- [ ] Dataset asli tersedia, provenance lengkap, review data/koordinat/satuan selesai.
- [ ] Gate production aktif; tampilan scaffold sudah diganti aplikasi tim frontend.
- [ ] Tidak ada request NASA langsung dari browser yang menjadi titik kegagalan demo.
- [ ] Alur lokasi/waktu, DTE, lighting, aksesibilitas keyboard, mobile diuji.
- [ ] Tautan sumber NASA/CSA dan atribusi diverifikasi oleh tim sitasi.
- [ ] URL HTTPS demo, commit rilis, dan deployment rollback tercatat.
- [ ] Backup data mentah/output terkurasi tersedia di storage tim.

Tidak ada resource cloud berbayar, monitor, domain, atau pengaturan GitHub yang
dibuat otomatis. Biaya/kuota hosting mengikuti akun yang dipakai tim.
