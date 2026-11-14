# SELENIS — Mulai dari SINI (Anggota 3, berdasarkan repo aktif)

Status per 14 Nov 2026 snapshot: repository `kelekers/selenis`, branch kerja bersama `feat/web-app`, HEAD `7acb426` (sama dengan origin, dicek P00 14 Nov 2026). Kode 3D awal SUDAH ADA di `src/components/3d/` dan HUD Anggota 4 di `src/components/hud/`; kamu belum perlu menulis ulang komponen dari nol.

**Urutan tunggal:**
1. Baca `docs/MODEL_SKILL_PLAYBOOK.md` (tabel model + effort + skill + 8 prompt).
2. Jalankan baseline lokal `node --version` (harus Node 24.x), `npm ci`, `npm run verify`, dan `npm run dev` lalu buka browser. Jangan paksa install jika versi Node salah.
3. Gunakan `prompts/00_BASELINE_AND_DOC_SYNC.md` untuk mengaudit bukti baseline dan menyelaraskan dokumen; audit dulu sebelum edit.
4. Jalankan `prompts/01_REPOSITORY_AUDIT.md` read-only untuk menemukan gap sebenarnya.
5. Perbaiki bertahap memakai `prompts/02_TERRAIN.md`, `03_SOLAR.md`, `03A_HUD_INTEGRATION.md`, `03B_RESILIENCE_PERFORMANCE.md`; **jangan klaim data NASA siap saat manifest masih scaffold**.
6. Jalankan `prompts/04_BROWSER_QA.md` dan `05_PR_AUDIT.md`; untuk branch bersama `feat/web-app`, jangan otomatis membuat branch/PR baru atau push tanpa koordinasi.

**Git:** sudah selesai setup remote/branch/pull. Jangan `git init`, clone, atau membuat branch baru. `.gitignore` sudah mengecualikan `docs/reference-local/` dan `.claude/settings.local.json`. File `docs/data-contract.md` adalah file milik tim dan perubahannya masih belum di-commit; jangan hapus/overwrite.

**Model default:** Sonnet medium untuk implementasi rutin, Opus medium/high untuk evaluasi kontrak + koordinat dan final review; Fable hanya eskalasi bug tersulit. **Skill:** gunakan maks 1–2 spesialis per prompt, bukan semua 934.

Baca sumber asli dari `docs/reference-local/` bila ada pertentangan spesifikasi; jangan memuat semua PDF tiap sesi. Sumber kebenaran untuk realita kode adalah keadaan repository sekarang, untuk kontrak ilmiah adalah data/kontrak yang telah disetujui tim. Semua angka contoh tetap fixture.
