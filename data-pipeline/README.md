# Pipeline offline

Folder ini untuk anggota ephemeris dan terrain. Implementasi fisika belum dibuat.
Jalankan dari root repository dengan `uv run python data-pipeline/<skrip>.py`.

- `fetch_horizons.py`: rencana pengambilan ephemeris; simpan parameter query dan respons mentah.
- `process_dem.py`: rencana pengolahan DEM, slope, heightmap WebP maksimal 2048 x 2048.
- `generate_horizon_mask.py`: rencana horizon mask per lokasi.

Tambahkan dependency saat dipakai melalui `uv add <package>` lalu commit
`pyproject.toml` dan `uv.lock`. Kandidat: numpy, rasterio, pillow, astroquery.
Belum dipasang karena belum ada kode yang memerlukannya.

Data mentah masuk `raw/` (diabaikan Git). Jangan jalankan unduhan NASA atau
komputasi berat saat build frontend. Terapkan timeout, retry terbatas, cache lokal,
dan tulis output ke file sementara sebelum rename agar kegagalan tidak merusak output lama.
Jangan mengganti respons gagal dengan angka buatan tanpa label eksplisit.

Output terkurasi masuk `public/data/` dan `public/textures/`; lihat
[kontrak aset](../docs/data-contract.md). Tambahkan unit test Python di folder ini
bernama `test_*.py`; CI otomatis menemukannya.
