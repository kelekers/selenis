import { Component } from 'react';
import { describeRenderFailure } from '../../utils/renderQuality';

/**
 * Non-blocking panel shown instead of the 3D canvas. The HUD keeps working (it does not need
 * WebGL), and nothing here pretends to show terrain or NASA elevation.
 */
export function SceneFallbackPanel({ title, detail, onRetry }) {
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
      <div
        role="alert"
        data-testid="scene-fallback"
        className="pointer-events-auto max-w-sm rounded-xl border border-red-400/40 bg-[#0b101b]/90 p-4 text-center font-mono text-xs text-slate-200 backdrop-blur-md"
      >
        <div className="font-bold tracking-wider text-red-200">{title}</div>
        {detail && <p className="mt-1.5 text-[11px] text-slate-400">{detail}</p>}
        <p className="mt-1.5 text-[11px] text-slate-400">
          Panel data (HUD) tetap dapat digunakan. Tidak ada terrain yang ditampilkan.
        </p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-3 rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-[11px] text-slate-200 hover:border-white/30"
          >
            Coba lagi
          </button>
        )}
      </div>
    </div>
  );
}

/** Catches errors thrown while creating/rendering the R3F canvas (incl. WebGL context creation). */
export class SceneErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
    this.retry = () => {
      this.setState({ error: null });
      this.props.onReset?.();
    };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error) {
    console.warn('[SELENIS] 3D scene disabled:', error);
    this.props.onError?.(error);
  }

  render() {
    if (this.state.error) {
      return (
        <SceneFallbackPanel
          title="TAMPILAN 3D TIDAK TERSEDIA"
          detail={describeRenderFailure(this.state.error)}
          onRetry={this.retry}
        />
      );
    }
    return this.props.children;
  }
}
