import { useEffect, useRef } from 'react';
import { Globe, Moon, X } from 'lucide-react';

const COMPARISON_ROWS = [
  {
    aspect: 'Sudut Elevasi Matahari',
    lunar: '1,5° – 5° (menyapu cakrawala)',
    earth: 'Hingga 75° – 90° (tinggi di atas kepala)',
  },
  {
    aspect: 'Siklus Siang & Malam',
    lunar: '~14 hari Bumi terang, ~14 hari gelap',
    earth: '24 jam (12 jam siang, 12 jam malam)',
  },
  {
    aspect: 'Atmosfer & Hamburan Cahaya',
    lunar: 'Hampa udara; bayangan kawah gelap total',
    earth: 'Ada atmosfer & twilight (senja/fajar)',
  },
  {
    aspect: 'Posisi Bumi di Langit',
    lunar: 'Bergoyang pola angka-8 (Librasi) dekat horizon',
    earth: 'Bulan terbit dan terbenam setiap hari',
  },
];

export function ContrastPanel({ isOpen, onClose, activeSite }) {
  const closeRef = useRef(null);
  // Latest onClose without re-running the open effect (App passes a new arrow every render,
  // e.g. every 350 ms during playback — re-running would keep stealing focus).
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // Dialog basics: Escape closes, focus moves to the close button once on open.
  useEffect(() => {
    if (!isOpen) return undefined;
    closeRef.current?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') onCloseRef.current?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="contrast-panel-title"
        className="w-full max-w-2xl rounded-2xl border border-white/15 bg-[#0b101b] p-5 shadow-2xl"
      >
        <div className="flex items-start justify-between border-b border-white/10 pb-3">
          <div>
            <p className="font-mono text-[11px] tracking-widest text-amber-400 uppercase">
              Kontras Lingkungan Ekstrem
            </p>
            <h2 id="contrast-panel-title" className="mt-0.5 text-lg font-semibold text-slate-100">
              Kutub Selatan Bulan vs. Bumi
            </h2>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="rounded-lg border border-white/10 bg-white/5 p-1.5 text-slate-300 hover:text-white"
            aria-label="Tutup panel perbandingan"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="mt-3 text-xs leading-relaxed text-slate-300">
          Pada lokasi terpilih (<strong>{activeSite?.name ?? 'belum dipilih'}</strong>), kemiringan sumbu Bulan yang
          hanya 1,5° membuat tebing kawah setinggi beberapa puluh meter mampu memblokir sinar
          Matahari dan sinyal komunikasi Bumi selama berminggu-minggu.
        </p>

        <div className="mt-4 overflow-hidden rounded-xl border border-white/10">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-white/10 bg-white/[0.04] text-slate-200">
                <th className="p-2.5 font-semibold">Parameter Fisik</th>
                <th className="p-2.5 font-semibold text-amber-300">
                  <span className="inline-flex items-center gap-1">
                    <Moon className="h-3.5 w-3.5" /> Kutub Selatan Bulan
                  </span>
                </th>
                <th className="p-2.5 font-semibold text-sky-300">
                  <span className="inline-flex items-center gap-1">
                    <Globe className="h-3.5 w-3.5" /> Bumi (Referensi)
                  </span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10 text-slate-300">
              {COMPARISON_ROWS.map((row) => (
                <tr key={row.aspect} className="hover:bg-white/[0.02]">
                  <td className="p-2.5 font-medium text-slate-100">{row.aspect}</td>
                  <td className="p-2.5">{row.lunar}</td>
                  <td className="p-2.5 text-slate-400">{row.earth}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}