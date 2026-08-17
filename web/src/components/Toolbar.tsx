import { PALETTE } from '../lib/protocol';
import { TOOLS, Tool } from '../lib/tools';

type IconId = Tool | 'zin' | 'zout' | 'reset' | 'clear';

interface Props {
  tool: Tool;
  setTool: (t: Tool) => void;
  color: string;
  setColor: (c: string) => void;
  width: number;
  setWidth: (w: number) => void;
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
  onClear: () => void;
}

export function Toolbar({
  tool,
  setTool,
  color,
  setColor,
  width,
  setWidth,
  zoom,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  onClear,
}: Props) {
  return (
    <div className="toolbar">
      <div className="brand">
        <span className="brand-mark" aria-hidden>
          EA
        </span>
        <span className="brand-name">Draw</span>
      </div>
      <div className="divider" />

      <div className="tools">
        {TOOLS.map((t) => (
          <button
            key={t.id}
            className={'tool' + (tool === t.id ? ' active' : '')}
            onClick={() => setTool(t.id)}
            title={`${t.label} — ${t.hint}`}
            aria-label={t.label}
            aria-pressed={tool === t.id}
          >
            <Icon id={t.id} />
          </button>
        ))}
      </div>
      <div className="divider" />

      <div className="swatches">
        {PALETTE.map((c) => (
          <button
            key={c}
            className={'swatch' + (c === color ? ' active' : '')}
            style={{ background: c }}
            onClick={() => setColor(c)}
            aria-label={`color ${c}`}
          />
        ))}
        <label className="swatch custom" title="Pick any color" aria-label="custom color">
          <span className="swatch-dot" style={{ background: color }} />
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
        </label>
      </div>
      <div className="divider" />

      <label className="width" title="Stroke width">
        <input type="range" min={1} max={24} value={width} onChange={(e) => setWidth(Number(e.target.value))} />
        <span className="width-preview" style={{ width: width, height: width, background: color }} />
      </label>
      <div className="divider" />

      <div className="zoom">
        <button className="icon-btn" onClick={onZoomOut} title="Zoom out" aria-label="Zoom out">
          <Icon id="zout" />
        </button>
        <button className="zoom-level" onClick={onZoomReset} title="Reset to 100%">
          {Math.round(zoom * 100)}%
        </button>
        <button className="icon-btn" onClick={onZoomIn} title="Zoom in" aria-label="Zoom in">
          <Icon id="zin" />
        </button>
      </div>
      <div className="divider" />

      <button className="btn" onClick={onClear} title="Clear the board for everyone">
        <Icon id="clear" />
        <span>Clear</span>
      </button>
    </div>
  );
}

function Icon({ id }: { id: IconId }) {
  const p = {
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  const svg = (children: React.ReactNode) => (
    <svg viewBox="0 0 24 24" width="18" height="18" {...p}>
      {children}
    </svg>
  );
  switch (id) {
    case 'pan':
      return svg(
        <>
          <path d="M12 3v18M3 12h18" />
          <path d="M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3" />
        </>,
      );
    case 'pen':
      return svg(
        <>
          <path d="M4 20l3.5-1L18 8.5 15.5 6 5 16.5 4 20z" />
          <path d="M14 7.5l2.5 2.5" />
        </>,
      );
    case 'rect':
      return svg(<rect x="4" y="6" width="16" height="12" rx="2" />);
    case 'ellipse':
      return svg(<ellipse cx="12" cy="12" rx="9" ry="7" />);
    case 'diamond':
      return svg(<path d="M12 3l9 9-9 9-9-9z" />);
    case 'connector':
      return svg(<path d="M5 19L19 5M19 5h-6M19 5v6" />);
    case 'eraser':
      return svg(
        <>
          <path d="M15 5l4 4-9 9H6l-2-2z" />
          <path d="M9 20h11" />
        </>,
      );
    case 'zin':
      return svg(
        <>
          <circle cx="11" cy="11" r="7" />
          <path d="M11 8v6M8 11h6M20.5 20.5L16 16" />
        </>,
      );
    case 'zout':
      return svg(
        <>
          <circle cx="11" cy="11" r="7" />
          <path d="M8 11h6M20.5 20.5L16 16" />
        </>,
      );
    case 'reset':
      return svg(<path d="M3 9V4h5M21 15v5h-5M21 9a9 9 0 0 0-15-3M3 15a9 9 0 0 0 15 3" />);
    case 'clear':
      return svg(<path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13" />);
  }
}
