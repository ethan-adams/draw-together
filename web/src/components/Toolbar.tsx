import { useEffect, useRef, useState } from 'react';
import { FILLS, FILL_NONE, INK, PALETTE, PAPER } from '../lib/protocol';
import { TOOLS, Tool } from '../lib/tools';
import { Theme } from '../lib/useTheme';

type IconId = Tool | 'zin' | 'zout' | 'reset' | 'clear' | 'sun' | 'moon' | 'front' | 'back' | 'pdf' | 'more';

interface Props {
  tool: Tool;
  setTool: (t: Tool) => void;
  color: string;
  setColor: (c: string) => void;
  fill: string;
  setFill: (c: string) => void;
  inkHex: string;
  width: number;
  setWidth: (w: number) => void;
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
  onBringToFront: () => void;
  onSendToBack: () => void;
  onExportPdf: () => void;
  theme: Theme;
  onToggleTheme: () => void;
  onClear: () => void;
}

export function Toolbar(props: Props) {
  const {
    tool,
    setTool,
    color,
    setColor,
    fill,
    setFill,
    inkHex,
    width,
    setWidth,
    zoom,
    onZoomIn,
    onZoomOut,
    onZoomReset,
    onBringToFront,
    onSendToBack,
    onExportPdf,
    theme,
    onToggleTheme,
    onClear,
  } = props;

  const shown = color === INK ? inkHex : color;
  const paperHex = getComputedStyle(document.documentElement).getPropertyValue('--board-bg').trim() || '#f6f7f4';
  const fillDot = fill === FILL_NONE ? 'transparent' : fill === PAPER ? paperHex : fill;
  const [styleOpen, setStyleOpen] = useState(false);
  const styleRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!styleOpen) return;
    const onDown = (e: PointerEvent) => {
      if (styleRef.current && !styleRef.current.contains(e.target as Node)) setStyleOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setStyleOpen(false);
    };
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('keydown', onKey);
    };
  }, [styleOpen]);

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  return (
    <div className="toolbar">
      <a className="brand" href="/" title="Home: all boards">
        <span className="brand-mark" aria-hidden>
          EA
        </span>
        <span className="brand-name">Draw</span>
      </a>
      <div className="divider" />

      <div className="tools">
        {TOOLS.map((t) => (
          <button
            key={t.id}
            className={'tool' + (tool === t.id ? ' active' : '')}
            onClick={() => setTool(t.id)}
            title={`${t.label}: ${t.hint}`}
            aria-label={t.label}
            aria-pressed={tool === t.id}
          >
            <Icon id={t.id} />
          </button>
        ))}
      </div>
      <div className="divider" />

      {/* Color, fill, and width in one popover so the bar stays a single row. */}
      <div className="style" ref={styleRef}>
        <button
          className="style-trigger"
          onClick={() => setStyleOpen((v) => !v)}
          title="Color, fill & width"
          aria-label="Color and width"
          aria-expanded={styleOpen}
        >
          <span className="style-dot" style={{ background: shown }} />
        </button>
        {styleOpen && (
          <div className="style-pop">
            <div className="pop-row">
              <span className="pop-label">Stroke</span>
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
                <label className="swatch custom" title="Pick any stroke color" aria-label="custom stroke color">
                  <span className="swatch-dot" style={{ background: shown }} />
                  <input type="color" value={shown} onChange={(e) => setColor(e.target.value)} />
                </label>
              </div>
            </div>

            <div className="pop-row">
              <span className="pop-label">Fill</span>
              <div className="swatches">
                <button
                  className={'swatch none' + (fill === FILL_NONE ? ' active' : '')}
                  onClick={() => setFill(FILL_NONE)}
                  aria-label="no fill"
                  title="No fill (transparent)"
                />
                <button
                  className={'swatch' + (fill === PAPER ? ' active' : '')}
                  style={{ background: paperHex }}
                  onClick={() => setFill(PAPER)}
                  aria-label="paper fill"
                  title="Board color: opaque, so it covers what's behind"
                />
                {FILLS.map((c) => (
                  <button
                    key={c}
                    className={'swatch' + (c === fill ? ' active' : '')}
                    style={{ background: c }}
                    onClick={() => setFill(c)}
                    aria-label={`fill ${c}`}
                  />
                ))}
                <label className="swatch custom" title="Pick any fill color" aria-label="custom fill color">
                  <span className="swatch-dot" style={{ background: fillDot }} />
                  <input
                    type="color"
                    value={fill === PAPER || fill === FILL_NONE ? '#ffffff' : fill}
                    onChange={(e) => setFill(e.target.value)}
                  />
                </label>
              </div>
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

      <div className="menu" ref={menuRef}>
        <button
          className="icon-btn"
          onClick={() => setMenuOpen((v) => !v)}
          title="More actions"
          aria-label="More actions"
          aria-expanded={menuOpen}
        >
          <Icon id="more" />
        </button>
        {menuOpen && (
          <div className="menu-pop">
            <button className="menu-item" onClick={() => { setMenuOpen(false); onBringToFront(); }}>
              <Icon id="front" />
              <span>Bring to front</span>
              <kbd>]</kbd>
            </button>
            <button className="menu-item" onClick={() => { setMenuOpen(false); onSendToBack(); }}>
              <Icon id="back" />
              <span>Send to back</span>
              <kbd>[</kbd>
            </button>
            <div className="menu-sep" />
            <button className="menu-item" onClick={() => { setMenuOpen(false); onExportPdf(); }}>
              <Icon id="pdf" />
              <span>Export to PDF</span>
            </button>
            <button className="menu-item danger" onClick={() => { setMenuOpen(false); onClear(); }}>
              <Icon id="clear" />
              <span>Clear board</span>
            </button>
          </div>
        )}
      </div>
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
    case 'front':
      return svg(
        <>
          <rect x="9" y="9" width="11" height="11" rx="2" />
          <path d="M15 9V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h3" />
        </>,
      );
    case 'back':
      return svg(
        <>
          <rect x="4" y="4" width="11" height="11" rx="2" />
          <path d="M9 15v3a2 2 0 0 0 2 2h7a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2h-3" />
        </>,
      );
    case 'pdf':
      return svg(
        <>
          <path d="M12 3v11m0 0l-4-4m4 4l4-4" />
          <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
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
    case 'more':
      return (
        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" stroke="none">
          <circle cx="5" cy="12" r="1.7" />
          <circle cx="12" cy="12" r="1.7" />
          <circle cx="19" cy="12" r="1.7" />
        </svg>
      );
  }
}
