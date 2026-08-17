import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { AnchorRef, Connector, Point, SceneObject, Shape, newObjectId } from '../lib/protocol';
import { Tool } from '../lib/tools';
import { Peer } from '../lib/useDraw';

export interface CanvasHandle {
  applyAdd: (obj: SceneObject) => void;
  applyErase: (ids: string[]) => void;
  clear: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  resetView: () => void;
}

interface Props {
  tool: Tool;
  color: string;
  width: number;
  theme: 'light' | 'dark';
  peers: Record<string, Peer>;
  onAdd: (obj: SceneObject) => void;
  onErase: (ids: string[]) => void;
  onCursor: (x: number, y: number) => void;
  onZoom: (scale: number) => void;
}

const MIN_SCALE = 0.15;
const MAX_SCALE = 6;
const GRID = 28;
const SNAP_PX = 12; // endpoint snaps to a shape anchor within this screen distance
const ENDPOINT_GRAB_PX = 12; // click within this of a selected connector's end to drag it
const ANCHOR_REVEAL_PX = 46; // shape anchors fade in when the cursor gets this close
const ACCENT = 'rgba(47, 158, 99, 0.92)'; // forest — anchor dots
const SNAP_GOLD = 'rgba(212, 175, 55, 0.95)'; // gold — the active snap target / selection

type ActionKind = 'draw' | 'shape' | 'connector' | 'erase' | 'pan' | 'move' | 'endpoint';

// A live move: the object being dragged, a snapshot of its start geometry, and
// (for shapes) the connectors whose endpoints must follow it.
interface MoveState {
  start: Point;
  obj: SceneObject;
  orig: { x?: number; y?: number; x1?: number; y1?: number; x2?: number; y2?: number; points?: Point[] };
  attached: { c: Connector; end: 'from' | 'to' }[];
}

export const BoardCanvas = forwardRef<CanvasHandle, Props>(function BoardCanvas(props, ref) {
  const mainRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const mctx = useRef<CanvasRenderingContext2D | null>(null);
  const octx = useRef<CanvasRenderingContext2D | null>(null);

  const scene = useRef<SceneObject[]>([]);
  const view = useRef({ tx: 0, ty: 0, scale: 1 });
  const dpr = useRef(1);
  const size = useRef({ w: 0, h: 0 }); // CSS px
  const dirty = useRef(true);
  const gridColor = useRef('rgba(28, 45, 36, 0.07)');

  const propsRef = useRef(props);
  propsRef.current = props;

  const action = useRef<ActionKind | null>(null);
  const temp = useRef<SceneObject | null>(null);
  const panStart = useRef({ sx: 0, sy: 0, tx: 0, ty: 0 });
  const erased = useRef<Set<string>>(new Set());
  const spaceDown = useRef(false);
  const pointerWorld = useRef<Point | null>(null); // for connector anchor hints
  const snapEnd = useRef<Point | null>(null); // the anchor the live connector is snapping to
  const selected = useRef<string | null>(null);
  const move = useRef<MoveState | null>(null);
  const endDrag = useRef<{ c: Connector; end: 'x1' | 'x2' } | null>(null);

  const requestRender = () => {
    dirty.current = true;
  };
  const toWorld = (sx: number, sy: number): Point => {
    const v = view.current;
    return { x: (sx - v.tx) / v.scale, y: (sy - v.ty) / v.scale };
  };
  const screenPos = (e: { clientX: number; clientY: number }) => {
    const r = mainRef.current!.getBoundingClientRect();
    return { sx: e.clientX - r.left, sy: e.clientY - r.top };
  };

  // Snap: the four edge-midpoint anchors of a shape, and the nearest one to a point.
  const findSnap = (wp: Point): { p: Point; ref: AnchorRef } | null => {
    const thr = SNAP_PX / view.current.scale;
    let best: { p: Point; ref: AnchorRef } | null = null;
    let bestD = thr;
    for (const o of scene.current) {
      if (o.kind !== 'shape') continue;
      const as = shapeAnchors(o);
      for (let i = 0; i < as.length; i++) {
        const d = Math.hypot(wp.x - as[i].x, wp.y - as[i].y);
        if (d <= bestD) {
          bestD = d;
          best = { p: as[i], ref: { id: o.id, anchor: i } };
        }
      }
    }
    return best;
  };

  const topmostAt = (wp: Point): SceneObject | null => {
    const pad = 6 / view.current.scale;
    for (let i = scene.current.length - 1; i >= 0; i--) {
      if (hitTest(scene.current[i], wp, pad)) return scene.current[i];
    }
    return null;
  };

  const broadcast = (obj: SceneObject) => propsRef.current.onAdd(obj);

  const deleteSelected = () => {
    const id = selected.current;
    if (!id) return;
    scene.current = scene.current.filter((o) => o.id !== id);
    selected.current = null;
    requestRender();
    propsRef.current.onErase([id]);
  };

  // ---- fit / resize (repaints from the retained scene, so resize never wipes it) ----
  useEffect(() => {
    const fit = () => {
      const m = mainRef.current;
      const o = overlayRef.current;
      if (!m || !o) return;
      dpr.current = window.devicePixelRatio || 1;
      const w = m.clientWidth;
      const h = m.clientHeight;
      size.current = { w, h };
      for (const cv of [m, o]) {
        cv.width = Math.max(1, Math.floor(w * dpr.current));
        cv.height = Math.max(1, Math.floor(h * dpr.current));
      }
      mctx.current = m.getContext('2d');
      octx.current = o.getContext('2d');
      gridColor.current = cssVar('--board-grid', gridColor.current);
      requestRender();
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);

  // Re-read the grid color and repaint when the theme flips.
  useEffect(() => {
    gridColor.current = cssVar('--board-grid', gridColor.current);
    requestRender();
  }, [props.theme]);

  // Switching tools clears the current selection.
  useEffect(() => {
    selected.current = null;
    requestRender();
  }, [props.tool]);

  // ---- non-passive wheel: pan (two-finger), zoom (pinch / ⌘+wheel) ----
  useEffect(() => {
    const el = mainRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        const { sx, sy } = screenPos(e);
        zoomAt(sx, sy, Math.exp(-e.deltaY * 0.0015));
      } else {
        const k = e.deltaMode === 1 ? 16 : 1; // line vs pixel deltas
        view.current.tx -= e.deltaX * k;
        view.current.ty -= e.deltaY * k;
        requestRender();
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // ---- keyboard: Space = temp pan, Delete/Backspace = remove selection ----
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space') spaceDown.current = true;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const el = document.activeElement;
        if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return;
        if (selected.current) {
          e.preventDefault();
          deleteSelected();
        }
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') spaceDown.current = false;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  // ---- render loop ----
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      if (dirty.current) {
        renderScene();
        dirty.current = false;
      }
      renderOverlay();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const worldTransform = (ctx: CanvasRenderingContext2D) => {
    const v = view.current;
    const d = dpr.current;
    ctx.setTransform(d * v.scale, 0, 0, d * v.scale, d * v.tx, d * v.ty);
  };
  const screenTransform = (ctx: CanvasRenderingContext2D) => {
    const d = dpr.current;
    ctx.setTransform(d, 0, 0, d, 0, 0);
  };

  const renderScene = () => {
    const ctx = mctx.current;
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    screenTransform(ctx);
    drawGrid(ctx);
    worldTransform(ctx);
    const ink = cssVar('--on-board', '#26312b');
    for (const obj of scene.current) drawObject(ctx, obj, ink);
  };

  const renderOverlay = () => {
    const ctx = octx.current;
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    const v = view.current;
    if (temp.current) {
      worldTransform(ctx);
      drawObject(ctx, temp.current, cssVar('--on-board', '#26312b'));
    }
    screenTransform(ctx);
    if (propsRef.current.tool === 'connector' || action.current === 'endpoint') drawSnapHints(ctx);
    drawSelection(ctx);
    for (const peer of Object.values(propsRef.current.peers)) {
      drawCursor(ctx, peer.x * v.scale + v.tx, peer.y * v.scale + v.ty, peer.color, peer.name);
    }
  };

  const drawSnapHints = (ctx: CanvasRenderingContext2D) => {
    const v = view.current;
    const wp = pointerWorld.current;
    const toScreen = (p: Point) => ({ x: p.x * v.scale + v.tx, y: p.y * v.scale + v.ty });
    if (wp) {
      const reveal = ANCHOR_REVEAL_PX / v.scale;
      for (const o of scene.current) {
        if (o.kind !== 'shape') continue;
        const as = shapeAnchors(o);
        if (!as.some((a) => Math.hypot(wp.x - a.x, wp.y - a.y) <= reveal)) continue;
        for (const a of as) {
          const s = toScreen(a);
          ctx.beginPath();
          ctx.arc(s.x, s.y, 3.5, 0, Math.PI * 2);
          ctx.fillStyle = ACCENT;
          ctx.fill();
          ctx.lineWidth = 1.5;
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
          ctx.stroke();
        }
      }
    }
    if (snapEnd.current) {
      const s = toScreen(snapEnd.current);
      ctx.beginPath();
      ctx.arc(s.x, s.y, 6, 0, Math.PI * 2);
      ctx.fillStyle = SNAP_GOLD;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#fff';
      ctx.stroke();
    }
  };

  const drawSelection = (ctx: CanvasRenderingContext2D) => {
    const id = selected.current;
    if (!id) return;
    const obj = scene.current.find((o) => o.id === id);
    if (!obj) return;
    const v = view.current;
    if (obj.kind === 'connector') {
      // Draggable endpoint handles — grab one to re-route the connector.
      for (const [ex, ey] of [
        [obj.x1, obj.y1],
        [obj.x2, obj.y2],
      ]) {
        ctx.beginPath();
        ctx.arc(ex * v.scale + v.tx, ey * v.scale + v.ty, 5, 0, Math.PI * 2);
        ctx.fillStyle = SNAP_GOLD;
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#fff';
        ctx.stroke();
      }
      return;
    }
    const b = objBBox(obj);
    const pad = 6;
    const x = b.x * v.scale + v.tx - pad;
    const y = b.y * v.scale + v.ty - pad;
    const w = b.w * v.scale + pad * 2;
    const h = b.h * v.scale + pad * 2;
    ctx.save();
    ctx.strokeStyle = SNAP_GOLD;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 4]);
    ctx.strokeRect(x, y, w, h);
    ctx.setLineDash([]);
    ctx.fillStyle = '#fff';
    for (const [hx, hy] of [
      [x, y],
      [x + w, y],
      [x, y + h],
      [x + w, y + h],
    ]) {
      ctx.beginPath();
      ctx.rect(hx - 3, hy - 3, 6, 6);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  };

  const drawGrid = (ctx: CanvasRenderingContext2D) => {
    const v = view.current;
    const g = GRID * v.scale;
    if (g < 7) return;
    const { w, h } = size.current;
    const ox = ((v.tx % g) + g) % g;
    const oy = ((v.ty % g) + g) % g;
    ctx.fillStyle = gridColor.current;
    const r = v.scale < 1 ? 1 : 1.3;
    for (let x = ox; x < w; x += g) {
      for (let y = oy; y < h; y += g) {
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  };

  // ---- pointer handling ----
  const onPointerDown = (e: React.PointerEvent) => {
    mainRef.current?.setPointerCapture(e.pointerId);
    const { sx, sy } = screenPos(e);
    const wp = toWorld(sx, sy);
    const tool = propsRef.current.tool;
    if (tool === 'pan' || spaceDown.current || e.button === 1) {
      action.current = 'pan';
      panStart.current = { sx, sy, tx: view.current.tx, ty: view.current.ty };
      return;
    }
    if (tool === 'select') {
      // If a connector is already selected, grabbing near an end drags just that
      // end (so you can re-route it onto another shape), taking priority over
      // selecting whatever is underneath.
      const sel = selected.current ? scene.current.find((o) => o.id === selected.current) : null;
      if (sel && sel.kind === 'connector') {
        const gr = ENDPOINT_GRAB_PX / view.current.scale;
        if (Math.hypot(wp.x - sel.x1, wp.y - sel.y1) <= gr) {
          action.current = 'endpoint';
          endDrag.current = { c: sel, end: 'x1' };
          return;
        }
        if (Math.hypot(wp.x - sel.x2, wp.y - sel.y2) <= gr) {
          action.current = 'endpoint';
          endDrag.current = { c: sel, end: 'x2' };
          return;
        }
      }
      const hit = topmostAt(wp);
      selected.current = hit ? hit.id : null;
      requestRender();
      if (hit) {
        action.current = 'move';
        move.current = beginMove(hit, wp);
      }
      return;
    }
    const { color, width } = propsRef.current;
    if (tool === 'pen') {
      action.current = 'draw';
      temp.current = { id: newObjectId(), kind: 'stroke', color, width, points: [wp] };
    } else if (tool === 'rect' || tool === 'ellipse' || tool === 'diamond') {
      action.current = 'shape';
      temp.current = { id: newObjectId(), kind: 'shape', shape: tool, x: wp.x, y: wp.y, w: 0, h: 0, color, width };
    } else if (tool === 'connector') {
      action.current = 'connector';
      const snap = findSnap(wp);
      const s = snap ? snap.p : wp;
      temp.current = {
        id: newObjectId(),
        kind: 'connector',
        x1: s.x,
        y1: s.y,
        x2: s.x,
        y2: s.y,
        color,
        width,
        arrow: true,
        from: snap ? snap.ref : undefined,
      };
    } else if (tool === 'eraser') {
      action.current = 'erase';
      erased.current = new Set();
      eraseAt(wp);
    }
  };

  const beginMove = (obj: SceneObject, wp: Point): MoveState => {
    const orig: MoveState['orig'] = {};
    if (obj.kind === 'shape') {
      orig.x = obj.x;
      orig.y = obj.y;
    } else if (obj.kind === 'connector') {
      orig.x1 = obj.x1;
      orig.y1 = obj.y1;
      orig.x2 = obj.x2;
      orig.y2 = obj.y2;
    } else {
      orig.points = obj.points.map((p) => ({ ...p }));
    }
    const attached: { c: Connector; end: 'from' | 'to' }[] = [];
    if (obj.kind === 'shape') {
      for (const o of scene.current) {
        if (o.kind !== 'connector') continue;
        if (o.from?.id === obj.id) attached.push({ c: o, end: 'from' });
        if (o.to?.id === obj.id) attached.push({ c: o, end: 'to' });
      }
    }
    return { start: wp, obj, orig, attached };
  };

  const applyMove = (wp: Point) => {
    const m = move.current;
    if (!m) return;
    const dx = wp.x - m.start.x;
    const dy = wp.y - m.start.y;
    const o = m.obj;
    if (o.kind === 'shape') {
      o.x = (m.orig.x ?? 0) + dx;
      o.y = (m.orig.y ?? 0) + dy;
      for (const { c, end } of m.attached) {
        const a = shapeAnchors(o)[end === 'from' ? c.from!.anchor : c.to!.anchor];
        if (end === 'from') {
          c.x1 = a.x;
          c.y1 = a.y;
        } else {
          c.x2 = a.x;
          c.y2 = a.y;
        }
      }
    } else if (o.kind === 'connector') {
      o.x1 = (m.orig.x1 ?? 0) + dx;
      o.y1 = (m.orig.y1 ?? 0) + dy;
      o.x2 = (m.orig.x2 ?? 0) + dx;
      o.y2 = (m.orig.y2 ?? 0) + dy;
      o.from = undefined; // hand-placed now
      o.to = undefined;
    } else {
      o.points = (m.orig.points ?? []).map((p) => ({ x: p.x + dx, y: p.y + dy }));
    }
    requestRender();
  };

  const endMove = () => {
    const m = move.current;
    move.current = null;
    if (!m) return;
    const sent = new Set<string>();
    broadcast(m.obj);
    sent.add(m.obj.id);
    for (const { c } of m.attached) {
      if (!sent.has(c.id)) {
        broadcast(c);
        sent.add(c.id);
      }
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const { sx, sy } = screenPos(e);
    const wp = toWorld(sx, sy);
    pointerWorld.current = wp;
    propsRef.current.onCursor(wp.x, wp.y);
    const a = action.current;
    const t = temp.current;
    if (!a) return;
    if (a === 'pan') {
      view.current.tx = panStart.current.tx + (sx - panStart.current.sx);
      view.current.ty = panStart.current.ty + (sy - panStart.current.sy);
      requestRender();
    } else if (a === 'move') {
      applyMove(wp);
    } else if (a === 'endpoint' && endDrag.current) {
      const { c, end } = endDrag.current;
      const snap = findSnap(wp);
      const p = snap ? snap.p : wp;
      if (end === 'x1') {
        c.x1 = p.x;
        c.y1 = p.y;
        c.from = snap ? snap.ref : undefined;
      } else {
        c.x2 = p.x;
        c.y2 = p.y;
        c.to = snap ? snap.ref : undefined;
      }
      snapEnd.current = snap ? snap.p : null;
      requestRender();
    } else if (a === 'draw' && t?.kind === 'stroke') {
      t.points.push(wp);
    } else if (a === 'shape' && t?.kind === 'shape') {
      t.w = wp.x - t.x;
      t.h = wp.y - t.y;
    } else if (a === 'connector' && t?.kind === 'connector') {
      const snap = findSnap(wp);
      if (snap) {
        t.x2 = snap.p.x;
        t.y2 = snap.p.y;
        t.to = snap.ref;
        snapEnd.current = snap.p;
      } else {
        t.x2 = wp.x;
        t.y2 = wp.y;
        t.to = undefined;
        snapEnd.current = null;
      }
    } else if (a === 'erase') {
      eraseAt(wp);
    }
  };

  const onPointerUp = () => {
    const a = action.current;
    const t = temp.current;
    action.current = null;
    temp.current = null;
    snapEnd.current = null;
    if (a === 'move') {
      endMove();
      return;
    }
    if (a === 'endpoint') {
      const ed = endDrag.current;
      endDrag.current = null;
      if (ed) broadcast(ed.c);
      return;
    }
    if (!a || !t) return;
    if (a === 'draw' && t.kind === 'stroke' && t.points.length >= 2) commit(t);
    else if (a === 'shape' && t.kind === 'shape' && Math.abs(t.w) > 4 && Math.abs(t.h) > 4) commit(normalizeShape(t));
    else if (a === 'connector' && t.kind === 'connector' && Math.hypot(t.x2 - t.x1, t.y2 - t.y1) > 6) commit(t);
  };

  const commit = (obj: SceneObject) => {
    scene.current.push(obj);
    requestRender();
    propsRef.current.onAdd(obj);
  };

  const eraseAt = (wp: Point) => {
    const pad = 8 / view.current.scale;
    const hits: string[] = [];
    for (const obj of scene.current) {
      if (erased.current.has(obj.id)) continue;
      if (hitTest(obj, wp, pad)) {
        hits.push(obj.id);
        erased.current.add(obj.id);
      }
    }
    if (hits.length) {
      const set = new Set(hits);
      scene.current = scene.current.filter((o) => !set.has(o.id));
      requestRender();
      propsRef.current.onErase(hits);
    }
  };

  const zoomAt = (sx: number, sy: number, factor: number) => {
    const v = view.current;
    const ns = clamp(v.scale * factor, MIN_SCALE, MAX_SCALE);
    const k = ns / v.scale;
    v.tx = sx - (sx - v.tx) * k;
    v.ty = sy - (sy - v.ty) * k;
    v.scale = ns;
    requestRender();
    propsRef.current.onZoom(ns);
  };
  const zoomCenter = (factor: number) => zoomAt(size.current.w / 2, size.current.h / 2, factor);

  useImperativeHandle(
    ref,
    () => ({
      applyAdd: (obj) => {
        const i = scene.current.findIndex((o) => o.id === obj.id);
        if (i >= 0) scene.current[i] = obj;
        else scene.current.push(obj);
        requestRender();
      },
      applyErase: (ids) => {
        const set = new Set(ids);
        scene.current = scene.current.filter((o) => !set.has(o.id));
        if (selected.current && set.has(selected.current)) selected.current = null;
        requestRender();
      },
      clear: () => {
        scene.current = [];
        selected.current = null;
        requestRender();
      },
      zoomIn: () => zoomCenter(1.25),
      zoomOut: () => zoomCenter(1 / 1.25),
      resetView: () => {
        view.current = { tx: 0, ty: 0, scale: 1 };
        requestRender();
        propsRef.current.onZoom(1);
      },
    }),
    [],
  );

  const cursor =
    props.tool === 'pan' ? 'grab' : props.tool === 'eraser' ? 'cell' : props.tool === 'select' ? 'default' : 'crosshair';

  return (
    <div className="board">
      <canvas
        ref={mainRef}
        className="board-main"
        style={{ cursor }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      />
      <canvas ref={overlayRef} className="board-overlay" />
    </div>
  );
});

// ---------- drawing helpers (assume the given transform) ----------

function drawObject(ctx: CanvasRenderingContext2D, obj: SceneObject, ink: string) {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = obj.color === 'ink' ? ink : obj.color;
  ctx.lineWidth = obj.width;
  if (obj.kind === 'stroke') {
    const p = obj.points;
    if (p.length < 2) return;
    ctx.beginPath();
    ctx.moveTo(p[0].x, p[0].y);
    for (let i = 1; i < p.length; i++) ctx.lineTo(p[i].x, p[i].y);
    ctx.stroke();
  } else if (obj.kind === 'shape') {
    const { x, y, w, h } = normalizeShape(obj);
    if (obj.shape === 'rect') {
      roundRectPath(ctx, x, y, w, h, Math.min(10, Math.min(w, h) * 0.18));
      ctx.stroke();
    } else if (obj.shape === 'ellipse') {
      ctx.beginPath();
      ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(x + w / 2, y);
      ctx.lineTo(x + w, y + h / 2);
      ctx.lineTo(x + w / 2, y + h);
      ctx.lineTo(x, y + h / 2);
      ctx.closePath();
      ctx.stroke();
    }
  } else {
    ctx.beginPath();
    ctx.moveTo(obj.x1, obj.y1);
    ctx.lineTo(obj.x2, obj.y2);
    ctx.stroke();
    if (obj.arrow) drawArrowHead(ctx, obj.x1, obj.y1, obj.x2, obj.y2, obj.width);
  }
}

function drawArrowHead(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, width: number) {
  const ang = Math.atan2(y2 - y1, x2 - x1);
  const len = 7 + width * 2.4;
  const a = Math.PI / 7;
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - len * Math.cos(ang - a), y2 - len * Math.sin(ang - a));
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - len * Math.cos(ang + a), y2 - len * Math.sin(ang + a));
  ctx.stroke();
}

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function normalizeShape(s: Shape): Shape {
  return {
    ...s,
    x: Math.min(s.x, s.x + s.w),
    y: Math.min(s.y, s.y + s.h),
    w: Math.abs(s.w),
    h: Math.abs(s.h),
  };
}

// Four edge-midpoint anchors (N, E, S, W) of a shape's bounding box.
function shapeAnchors(s: Shape): Point[] {
  const n = normalizeShape(s);
  return [
    { x: n.x + n.w / 2, y: n.y },
    { x: n.x + n.w, y: n.y + n.h / 2 },
    { x: n.x + n.w / 2, y: n.y + n.h },
    { x: n.x, y: n.y + n.h / 2 },
  ];
}

function objBBox(obj: SceneObject): { x: number; y: number; w: number; h: number } {
  if (obj.kind === 'shape') {
    const n = normalizeShape(obj);
    return { x: n.x, y: n.y, w: n.w, h: n.h };
  }
  if (obj.kind === 'connector') {
    const x = Math.min(obj.x1, obj.x2);
    const y = Math.min(obj.y1, obj.y2);
    return { x, y, w: Math.abs(obj.x2 - obj.x1), h: Math.abs(obj.y2 - obj.y1) };
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of obj.points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

function hitTest(obj: SceneObject, p: Point, pad: number): boolean {
  if (obj.kind === 'stroke') {
    const pts = obj.points;
    const t = pad + obj.width / 2;
    for (let i = 1; i < pts.length; i++) {
      if (distToSeg(p, pts[i - 1], pts[i]) <= t) return true;
    }
    return pts.length === 1 && Math.hypot(p.x - pts[0].x, p.y - pts[0].y) <= t;
  }
  if (obj.kind === 'shape') {
    const s = normalizeShape(obj);
    return p.x >= s.x - pad && p.x <= s.x + s.w + pad && p.y >= s.y - pad && p.y <= s.y + s.h + pad;
  }
  return distToSeg(p, { x: obj.x1, y: obj.y1 }, { x: obj.x2, y: obj.y2 }) <= pad + obj.width / 2;
}

function distToSeg(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function cssVar(name: string, fallback: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

function drawCursor(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, name: string) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x, y + 16);
  ctx.lineTo(x + 4.5, y + 11.5);
  ctx.lineTo(x + 11, y + 11);
  ctx.closePath();
  ctx.fill();

  ctx.font = '600 11px Inter, ui-sans-serif, system-ui, sans-serif';
  const padX = 6;
  const w = ctx.measureText(name).width + padX * 2;
  const lx = x + 12;
  const ly = y + 14;
  roundRectPath(ctx, lx, ly, w, 18, 9);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.fillText(name, lx + padX, ly + 13);
  ctx.restore();
}
