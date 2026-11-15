import { Html } from '@react-three/drei';

const DOT = {
  sun: 'bg-amber-300',
  earth: 'bg-sky-300',
  muted: 'bg-slate-400',
};

/**
 * Short DOM label pinned to a 3D point (one line, optional dimmed suffix). Kept below the HUD
 * panels (z-index ≤ 5; drei's default range would put it above every panel), never clickable.
 */
export function SkyLabel({ position, tone = 'muted', testId, detail, children }) {
  if (!position) return null;
  return (
    <Html position={position} center zIndexRange={[5, 0]} style={{ pointerEvents: 'none' }}>
      <div className="-translate-y-7 flex items-center gap-1.5 rounded-full bg-black/55 px-2 py-0.5 text-[11px] whitespace-nowrap text-slate-100 backdrop-blur-sm">
        <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${DOT[tone] ?? DOT.muted}`} />
        <span data-testid={testId}>{children}</span>
        {detail && (
          <span data-testid={testId && `${testId}-detail`} className="text-slate-400">
            {detail}
          </span>
        )}
      </div>
    </Html>
  );
}
