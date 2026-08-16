import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { Point } from '../lib/protocol';
import { Peer } from '../lib/useLiveBoard';

export interface CanvasHandle {
  drawSegment: (from: Point, to: Point, color: string, width: number) => void;
  clear: () => void;
}

interface Props {
  color: string;
  width: number;
  onLocalDraw: (from: Point, to: Point, color: string, width: number) => void;
  onCursor: (x: number, y: number) => void;
  peers: Record<string, Peer>;
}

export const BoardCanvas = forwardRef<CanvasHandle, Props>(function BoardCanvas(props, ref) {
  const drawCanvas = useRef<HTMLCanvasElement>(null);
  const overlay = useRef<HTMLCanvasElement>(null);
  const dctx = useRef<CanvasRenderingContext2D | null>(null);
  const octx = useRef<CanvasRenderingContext2D | null>(null);

  const drawing = useRef(false);
  const last = useRef<Point | null>(null);

  // Latest props for use inside long-lived event/RAF closures.
  const propsRef = useRef(props);
  propsRef.current = props;

  const stroke = (
    ctx: CanvasRenderingContext2D,
    from: Point,
    to: Point,
    color: string,
    width: number,
  ) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
  };

  // Size both canvases to the container, accounting for device pixel ratio.
  useEffect(() => {
    const fit = () => {
      const el = drawCanvas.current;
      const ov = overlay.current;
      if (!el || !ov) return;
      const dpr = window.devicePixelRatio || 1;
      const { clientWidth: w, clientHeight: h } = el;
      for (const cv of [el, ov]) {
        cv.width = Math.floor(w * dpr);
        cv.height = Math.floor(h * dpr);
      }
      const d = el.getContext('2d');
      const o = ov.getContext('2d');
      if (d) {
        d.setTransform(dpr, 0, 0, dpr, 0, 0);
        d.lineCap = 'round';
        d.lineJoin = 'round';
        dctx.current = d;
      }
      if (o) {
        o.setTransform(dpr, 0, 0, dpr, 0, 0);
        octx.current = o;
      }
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      drawSegment: (from, to, color, width) => {
        if (dctx.current) stroke(dctx.current, from, to, color, width);
      },
      clear: () => {
        const el = drawCanvas.current;
        if (dctx.current && el) dctx.current.clearRect(0, 0, el.width, el.height);
      },
    }),
    [],
  );

  // Cursor overlay: cleared and redrawn each frame.
  useEffect(() => {
    let raf = 0;
    const render = () => {
      const ctx = octx.current;
      const ov = overlay.current;
      if (ctx && ov) {
        ctx.clearRect(0, 0, ov.width, ov.height);
        for (const peer of Object.values(propsRef.current.peers)) {
          drawCursor(ctx, peer);
        }
      }
      raf = requestAnimationFrame(render);
    };
    raf = requestAnimationFrame(render);
    return () => cancelAnimationFrame(raf);
  }, []);

  const posOf = (e: React.PointerEvent): Point => {
    const rect = drawCanvas.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    drawing.current = true;
    last.current = posOf(e);
    drawCanvas.current?.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const p = posOf(e);
    propsRef.current.onCursor(p.x, p.y);
    if (!drawing.current || !last.current) return;
    const { color, width } = propsRef.current;
    if (dctx.current) stroke(dctx.current, last.current, p, color, width); // optimistic local render
    propsRef.current.onLocalDraw(last.current, p, color, width);
    last.current = p;
  };
  const endStroke = () => {
    drawing.current = false;
    last.current = null;
  };

  return (
    <div className="board">
      <canvas
        ref={drawCanvas}
        className="board-draw"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endStroke}
        onPointerLeave={endStroke}
      />
      <canvas ref={overlay} className="board-cursors" />
    </div>
  );
});

function drawCursor(ctx: CanvasRenderingContext2D, peer: Peer) {
  const { x, y, color, name } = peer;
  // Pointer triangle.
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x, y + 16);
  ctx.lineTo(x + 4.5, y + 11.5);
  ctx.lineTo(x + 11, y + 11);
  ctx.closePath();
  ctx.fill();

  // Name label.
  ctx.font = '600 11px ui-sans-serif, system-ui, sans-serif';
  const padX = 6;
  const w = ctx.measureText(name).width + padX * 2;
  const lx = x + 12;
  const ly = y + 14;
  roundRect(ctx, lx, ly, w, 18, 9);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.fillText(name, lx + padX, ly + 13);
  ctx.restore();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
