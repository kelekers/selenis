import React from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <main>
      <p>NASA Space Apps · TIMOREX</p>
      <h1>SELENIS</h1>
      <h2>Lunar South Pole Navigator</h2>
      <p>Fondasi pengembangan siap. Visualisasi medan, pencahayaan Matahari,
        dan komunikasi langsung ke Bumi sedang dikembangkan.</p>
      <p role="status">Belum ada dataset ilmiah yang dipublikasikan.
        Halaman ini hanya pemeriksaan deployment, bukan simulator.</p>
      <a href="https://ssd.jpl.nasa.gov/horizons/">Referensi NASA JPL Horizons</a>
    </main>
  </React.StrictMode>,
);
