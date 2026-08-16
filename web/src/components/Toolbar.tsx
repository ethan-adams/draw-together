import { PALETTE } from '../lib/protocol';

interface Props {
  color: string;
  setColor: (c: string) => void;
  width: number;
  setWidth: (w: number) => void;
  onClear: () => void;
}

export function Toolbar({ color, setColor, width, setWidth, onClear }: Props) {
  return (
    <div className="toolbar">
      <div className="brand">
        <span className="brand-dot" />
        LiveBoard
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
        <label className="swatch custom" style={{ background: color }} aria-label="custom color">
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
        </label>
      </div>

      <div className="divider" />

      <label className="width">
        <input
          type="range"
          min={1}
          max={24}
          value={width}
          onChange={(e) => setWidth(Number(e.target.value))}
        />
        <span className="width-preview" style={{ width: width, height: width, background: color }} />
      </label>

      <div className="divider" />

      <button className="btn" onClick={onClear}>
        Clear
      </button>
    </div>
  );
}
