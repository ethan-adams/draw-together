import { useEffect, useRef, useState } from 'react';
import { INK, PALETTE } from '../lib/protocol';
import { TOOLS, Tool } from '../lib/tools';
import { Theme } from '../lib/useTheme';

type IconId = Tool | 'zin' | 'zout' | 'reset' | 'clear' | 'sun' | 'moon';

interface Props {
  tool: Tool;
  setTool: (t: Tool) => void;
  color: string;
  setColor: (c: string) => void;
  inkHex: string;
  width: number;
  setWidth: (w: number) => void;
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
  theme: Theme;
  onToggleTheme: () => void;
  onClear: () => void;
}

export function Toolbar({
  tool,
  setTool,
  color,
  setColor,
  inkHex,
  width,
  setWidth,
  zoom,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  theme,
  onToggleTheme,
  onClear,
}: Props) {
  const shown = color === INK ? inkHex : color;
  const [styleOpen, setStyleOpen] = useState(false);
  const styleRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!styleOpen) return;
    const onDown = (e: MouseEvent) => {
      if (styleRef.current && !styleRef.current.contains(e.target as Node)) setStyleOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [styleOpen]);

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

      {/* Color + width collapse into one popover so the bar stays a single row. */}
      <div className="style" ref={styleRef}>
        <button
          className="style-trigger"
          onClick={() => setStyleOpen((v) => !v)}
          title="Color & stroke width"
          aria-label="Color and width"
          aria-expanded={styleOpen}
        >
          <span className="style-dot" style={{ background: shown }} />
        </button>
        {styleOpen && (
          <div className="style-pop">
            <div className="swatches">
              <button
                className={'swatch' + (color === INK ? ' active' : '')}
                style={{ background: inkHex }}
                onClick={() => setColor(INK)}
                aria-label="ink color"
              />
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
                <span className="swatch-dot" style={{ background: shown }} />
                <input type="color" value={shown} onChange={(e) => setColor(e.target.value)} />
              </label>
            </div>
            <label className="width" title="Stroke width">
              <input type="range" min={1} max={24} value={width} onChange={(e) => setWidth(Number(e.target.value))} />
              <span className="width-preview" style={{ width: width, height: width, background: shown }} />
            </label>
          </div>
        )}
      </div>
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

      <button
        className="icon-btn"
        onClick={onToggleTheme}
        title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      >
        <Icon id={theme === 'dark' ? 'sun' : 'moon'} />
      </button>

      <button className="icon-btn" onClick={onClear} title="Clear the board for everyone" aria-label="Clear the board">
        <Icon id="clear" />
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
    case 'select':
      return svg(<path d="M5 3l5.6 15 2.2-6.2 6.2-2.2z" />);
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
    case 'text':
      return svg(<path d="M6 6h12M6 6V5m12 1V5M12 6v13m-2 0h4" />);
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
    case 'sun':
      return svg(
        <>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.4 1.4M17.6 17.6L19 19M19 5l-1.4 1.4M6.4 17.6L5 19" />
        </>,
      );
    case 'moon':
      return svg(<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />);
    case 'clear':
      return svg(<path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13" />);
  }
}
