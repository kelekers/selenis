# Catatan Persetujuan Lintas Anggota (Anggota 3 → tim)

Status: **BUTUH REVIEW**. Dibuat 2026-11-14 oleh Anggota 3 (3D). Atas instruksi Anggota 3, beberapa
file milik anggota lain sudah diedit langsung di `feat/web-app` (lokal, **belum di-push**) supaya
integrasi bisa jalan. Setiap perubahan di bawah bisa ditolak/di-revert per file; tolong beri
✅ / ❌ / komentar per baris, lalu Anggota 3 menyesuaikan sebelum push.

Bukti umum (P05, 2026-11-14): `npm run verify` lulus (lint, **38/38 tes**, data:check `scaffold`,
build). QA browser Chrome + Edge lulus (lihat `docs/QA_REPORT_P04.md` dan bagian P05 di
`docs/CONTEXT_HANDOFF.md`). Semua data yang tampil masih **fixture/dummy**, bukan data NASA.

## 1. Perubahan pada file milik anggota lain

| # | File | Pemilik | Perubahan | Alasan | Commit |
|---|---|---|---|---|---|
| 0 | `.gitignore` | Tim / A6 | +`docs/reference-local/`, +`.claude/settings.local.json`, +`CARA_PAKAI_PATCH_INI.md` | Jangan commit PDF referensi lokal, setelan pribadi Claude, catatan patch sekali pakai | `3fc87c5` |
| 1 | `docs/data-contract.md` | Tim (A1/A2/A4/A6) | Menambah bagian "Kontrak data ilmiah (DRAFT)" — semua TBD, tidak ada yang ditandai disetujui | Daftar pertanyaan kontrak DEM/ephemeris/mask | `6529f06` |
| 2 | `src/utils/shadowMath.js` (dipakai hook & HUD) | Baseline tim / A3 | `evaluateLineOfSight` kini tri-state: `true/false/null` (null = tidak diketahui); mask hilang ≠ 0°; perbaikan bug batas 360° | Data hilang sebelumnya dianggap 0° / "terblokir"; `sun_vector: null` membuat aplikasi crash | `0e6a3e0` |
| 3 | `src/App.jsx` | A4 / A6 | `cameraView` → `cameraCommand {view, nonce}`; tombol kamera `aria-pressed`, `title`; "Fokus Site" disabled bila tidak ada site | Tombol "Peta Kawah" tidak me-reset kamera bila view sudah overview (FR-05) | P03A |
| 4 | `src/hooks/useEphemerisData.js` | Bersama (A4/A6, data A1) | `activeSite` = null bila id tidak dikenal (dulu diam-diam ganti ke site pertama); `companionSite` tidak pernah dirinya sendiri; `activeEphemeris` = null bila indeks di luar rentang (dulu diam-diam jam ke-0); `setTimeIndex` meng-clamp. Bentuk return tetap sama | Satu sumber state yang jujur | P03A |
| 5 | `src/components/hud/HorizonPanoramaChart.jsx` | A4 | Tri-state label & warna; label "DTE Link Aktif/Sinyal Terblokir" → "Bumi di atas/terhalang horizon"; mask hilang → teks "Horizon mask site tidak tersedia" (dulu garis datar palsu); poligon menutup benar di 0°/360°; jalur Bumi tidak crash bila sampel tanpa `earth_vector` & putus di batas 360° | Crash + klaim yang tidak didukung data (ini bukan kualitas link) | P03A |
| 6 | `src/components/hud/TimelineScrubber.jsx` | A4 | Tidak ada timestamp karangan (`'2026-11-14 00:00 UTC'`) bila data hilang → "Waktu tidak tersedia"; "Sun Az ° · El °" → "Sun: arah tidak tersedia"; tombol disabled bila timeline kosong; `aria-valuetext`, `aria-label` | Tidak boleh mengarang waktu | P03A |
| 7 | `src/components/hud/TopTelemetryBar.jsx` | A4 | Badge: `scaffold` → "DATA DUMMY — BUKAN DATA NASA"; `ready` → "DATA TIM · lihat provenance" (dulu "NASA DATA LIVE"); koordinat `-89.4521°S` → `89.4521°S` (tanda dobel); aman bila elevasi kosong; `aria-pressed`/`aria-expanded` | Label menyesatkan; data statis bukan "live" | P03A |
| 8 | `src/components/hud/MicroShiftDeltaCard.jsx` | A4 | Judul "(450m)" → jarak dihitung dari koordinat kedua site (bola, R = 1737,4 km): saat ini ≈454 m; nama site dari data (dulu teks mati); Δ dalam **pp** (poin persen), bukan "%"; aman bila metrik kosong; `aria-pressed` | Selisih dua persentase = poin persen; angka tidak boleh ditulis mati | P03A |
| 9 | `src/components/hud/ContrastPanel.jsx` | A4 | `role="dialog"`, `aria-modal`, tutup dengan Esc / klik latar, fokus ke tombol tutup | Aksesibilitas | P03A |
| 10 | `src/App.jsx` (layout) | A4 / A6 | Offset panel HUD responsif: `top-60 sm:top-44 lg:top-24`, `bottom-44 lg:bottom-28` (dulu `top-24 bottom-28` di semua ukuran); HUD **tertutup secara default bila lebar < 1024 px** (tombol "Tampilkan HUD") | Diukur di 390×844: header 228 px menimpa panel, timeline menutup kartu, 3D tertutup total. Setelah perbaikan: panel 240–668 px, header berakhir 228, timeline mulai 689 | P03B |
| 11 | `index.html` | A6 | Favicon kosong (`data:,`); teks statis "Memuat SELENIS…" di `#root` (diganti React saat mount); `<noscript>` | QA P04: `404 /favicon.ico` di setiap halaman; di jaringan lambat (1 Mbps) halaman kosong sampai bundle 1,1 MB termuat. Setelah perbaikan teks muncul < 1,5 s | P04 |
| 12 | `src/hooks/useEphemerisData.js`, `src/App.jsx`, `src/components/hud/TopTelemetryBar.jsx` | A4 / A6 | Hook mengembalikan `dataError`; header menampilkan "Data tim gagal dimuat (…) — menampilkan data dummy" bila manifest rusak / HTTP error, file data 404, atau skema kosong. Manifest 404 tetap dianggap scaffold normal (tanpa banner) | QA P04: kegagalan data tim sebelumnya diam-diam (tetap dummy tanpa keterangan) | P04 |
| 13 | `src/components/hud/TimelineScrubber.jsx` | A4 | `title` tombol "Mundur/Maju 1 jam" → "… satu langkah waktu" (sama dengan `aria-label`) | Review P05: langkah waktu belum disepakati (TBD), title dan aria-label saling bertentangan. Label "T+…h"/"Jam ke-" belum diubah (butuh keputusan A1/A4) | P05 (belum commit) |
| 14 | `src/components/hud/MicroShiftDeltaCard.jsx` | A4 | Jam eclipse di mode Explorer memakai formatter yang sama dengan Planner (`—` bila bukan angka) | Review P05: cabang Explorer mencetak nilai mentah | P05 (belum commit) |

Yang **tidak** diubah: desain visual/warna HUD (restyle "space look" dijadwalkan terpisah). Catatan untuk
A4: offset di #10 adalah angka tetap; bila teks header berubah panjang, sebaiknya layout diganti ke
kolom flex (header / konten / timeline) — itu perubahan desain, jadi diserahkan ke A4.

## 2. Kontrak props/event yang diusulkan (UI ↔ 3D)

Pemilik state tunggal: `useEphemerisData` (site & waktu) + `App` (mode UI & kamera). `LunarScene`
tidak menyimpan state site/waktu sendiri.

```js
<LunarScene
  telemetry={telemetry}            // { terrain_metadata, sites[] }
  sites={sites}
  activeSite={activeSite}          // site | null (null = id tidak dikenal)
  selectedSiteId={selectedSiteId}
  onSelectSite={(siteId) => …}     // dipanggil saat marker 3D diklik (bukan saat drag > 6 px)
  activeEphemeris={activeEphemeris} // sampel | null (null = di luar rentang / tidak ada)
  activeVisibility={activeVisibility} // { is_sun_visible, is_dte_active: true|false|null, … }
  cameraCommand={{ view: 'overview' | 'site', nonce }} // nonce naik setiap tombol ditekan = reset
/>
```

Rencana lanjutan (butuh setuju A4/A6): ganti `timeIndex` dengan `timestampUtc` sebagai state
bersama dan gunakan `ephemerisAtTime()` (`src/utils/ephemerisMath.js`, sudah dites) — tanpa
interpolasi diam-diam; status `between-samples` / `out-of-range` ditampilkan sebagai "tidak diketahui".

## 3. Pertanyaan per anggota

**Anggota 1 (ephemeris)**
- Azimuth Matahari/Bumi diukur dari **utara sejati lokal** di site? Frame/observer apa (SPICE/Horizons)? Lihat BLOCKER di `docs/CONTEXT_HANDOFF.md`.
- Langkah waktu & kebijakan interpolasi? HUD saat ini mengasumsikan 1 jam per langkah ("Mundur 1 jam", "T+71h").
- Apakah DTE yang dihitung tim sudah per site dengan horizon mask? (`is_dte_active` browser hanya pratinjau geometris).

**Anggota 2 (DEM/terrain)**
- Proyeksi tile & arah "grid north" (perlu untuk rotasi azimuth → sumbu −Z scene).
- `height_encoding` (usulan: `{ bits_per_sample, meters_per_unit, offset_m, nodata_value?, lossy? }`), datum, nilai no-data, `vertical_exaggeration`.
- Konvensi UV site: usulan `u` barat→timur, `v` utara→selatan (baris gambar).

**Anggota 4 (HUD)**
- Setuju dengan 9 perubahan di tabel §1? Khususnya penamaan "Bumi di atas horizon" vs "DTE Link".
- Teks edukasi `ContrastPanel` **belum diubah tapi perlu dicek sumbernya**: "Sudut Elevasi Matahari 1,5° – 5°" — di sekitar −89,5° elevasi Matahari maksimum kira-kira ±(1,5° + 0,5°), "5°" tampaknya terlalu besar; mohon sitasi. Baris "Posisi Bumi di Langit" kolom Bumi berisi tentang Bulan.
- `MicroShiftDeltaCard` melabeli Site A/B berdasarkan urutan array (`sites[0]`, `sites[1]`), bukan `pair_group`.
- Di ponsel (390 px) panel HUD saling menumpuk dan menutupi label terrain.
- `safety_rating`, persentase surya/DTE, eclipse: semuanya angka fixture.

**Anggota 6 (integrasi/deploy)**
- Gate label: `manifest.status === 'ready'` → "DATA TIM · lihat provenance" sudah diterapkan; setuju?
- Push commit lokal Anggota 3 ke `feat/web-app` setelah review ini (lihat `git log origin/feat/web-app..HEAD`).

## 4. Verifikasi manual (untuk reviewer)

1. `npm ci` (Node 24) → `npm run verify` → harus lulus.
2. `npm run dev` → buka URL. Badge kiri atas: **"DATA DUMMY — BUKAN DATA NASA"**; label kanan bawah: **"TERRAIN SINTETIS — BUKAN DEM NASA"**.
3. Klik marker biru (Site B) di 3D → kartu Site B tersorot, koordinat header berubah ke `89.4610°S, 130.4200°E`.
4. Putar kamera (drag) → klik **Peta Kawah** → kamera kembali ke tampilan awal (dulu tidak).
5. Klik **Fokus Site** → kamera mendekat ke site terpilih; pilih site lain → kamera mengikuti. Di mode Peta Kawah, memilih site **tidak** memindahkan kamera.
6. Drag kamera yang dimulai di atas marker tidak mengganti site.
7. Tombol ⏮/⏭: dari jam 1, mundur → "2026-11-16 23:00 UTC" (wrap).
8. **Bulan vs Bumi** → tekan Esc → dialog tertutup.
9. Console browser: tidak ada error (warning lama three: `THREE.Clock` deprecated, `PCFSoftShadowMap` diganti).
