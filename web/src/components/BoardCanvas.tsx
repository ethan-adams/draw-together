import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Connector, EndRef, Point, SceneObject, Shape, Text, newObjectId } from '../lib/protocol';
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
const ENDPOINT_GRAB_PX = 12; // click within this of a selected connector's end to drag it
const BIND_MARGIN_PX = 8; // a connector end binds to a shape if dropped within this of it
const SNAP_GOLD = 'rgba(212, 175, 55, 0.95)'; // gold — selection + bind highlight
const TEXT_SIZE = 18; // default standalone text size (world units)
const LABEL_SIZE = 16; // shape label size (world units)
const FONT = "Inter, ui-sans-serif, system-ui, sans-serif";

type ActionKind = 'draw' | 'shape' | 'connector' | 'erase' | 'pan' | 'move' | 'endpoint';

interface MoveState {
  start: Point;
  obj: SceneObject;
  moved: boolean;
  orig: { x?: number; y?: number; x1?: number; y1?: number; x2?: number; y2?: number; points?: Point[] };
  rebound: Connector[]; // loose connector ends this move just bound to the shape
}

interface Editing {
  id: string;
  kind: 'shape' | 'text';
  left: number;
  top: number;
  width: number;
  height: number;
  fontPx: number;
  center: boolean;
  value: string;
  isNew: boolean;
}

export const BoardCanvas = forwardRef<CanvasHandle, Props>(function BoardCanvas(props, ref) {
  const mainRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const editRef = useRef<HTMLTextAreaElement>(null);
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
  const pointerWorld = useRef<Point | null>(null);
  const selected = useRef<string | null>(null);
  const move = useRef<MoveState | null>(null);
  const endDrag = useRef<{ c: Connector; end: 'x1' | 'x2' } | null>(null);

  const [editing, setEditing] = useState<Editing | null>(null);
  const editingRef = useRef<Editing | null>(null);
  editingRef.current = editing;

  const requestRender = () => {
    dirty.current = true;
  };
  const toWorld = (sx: number, sy: number): Point => {
    const v = view.current;
    return { x: (sx - v.tx) / v.scale, y: (sy - v.ty) / v.scale };
  };
  const toScreen = (p: Point) => {
    const v = view.current;
    return { x: p.x * v.scale + v.tx, y: p.y * v.scale + v.ty };
  };
  const screenPos = (e: { clientX: number; clientY: number }) => {
    const r = mainRef.current!.getBoundingClientRect();
    return { sx: e.clientX - r.left, sy: e.clientY - r.top };
  };

  // ---- shape geometry for floating connections ----
  const findShape = (id: string): Shape | undefined => {
    const o = scene.current.find((s) => s.id === id);
    return o && o.kind === 'shape' ? o : undefined;
  };
  const shapeAt = (wp: Point, marginPx = 0): Shape | null => {
    const m = marginPx / view.current.scale;
    for (let i = scene.current.length - 1; i >= 0; i--) {
      const o = scene.current[i];
      if (o.kind !== 'shape') continue;
      const n = normalizeShape(o);
      if (wp.x >= n.x - m && wp.x <= n.x + n.w + m && wp.y >= n.y - m && wp.y <= n.y + n.h + m) return o;
    }
    return null;
  };
  // Derived connector endpoints: a bound end sits on its shape's border facing
  // the other end, so it tracks the shape as it moves. Unbound ends use x1..y2.
  const resolveEnds = (c: Connector) => {
    const fs = c.from ? findShape(c.from.id) : undefined;
    const ts = c.to ? findShape(c.to.id) : undefined;
    let a = { x: c.x1, y: c.y1 };
    let b = { x: c.x2, y: c.y2 };
    if (fs) a = nearestAnchor(fs, ts ? shapeCenter(ts) : b);
    if (ts) b = nearestAnchor(ts, fs ? shapeCenter(fs) : a);
    return { x1: a.x, y1: a.y, x2: b.x, y2: b.y };
  };

  const hitObject = (o: SceneObject, wp: Point, pad: number): boolean => {
    if (o.kind === 'connector') {
      const e = resolveEnds(o);
      return distToSeg(wp, { x: e.x1, y: e.y1 }, { x: e.x2, y: e.y2 }) <= pad + o.width / 2;
    }
    return hitTest(o, wp, pad);
  };
  const topmostAt = (wp: Point): SceneObject | null => {
    const pad = 6 / view.current.scale;
    for (let i = scene.current.length - 1; i >= 0; i--) {
      if (hitObject(scene.current[i], wp, pad)) return scene.current[i];
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

  // ---- fit / resize ----
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

  useEffect(() => {
    gridColor.current = cssVar('--board-grid', gridColor.current);
    requestRender();
  }, [props.theme]);

  useEffect(() => {
    selected.current = null;
    requestRender();
  }, [props.tool]);

  // ---- wheel: pan / pinch-zoom ----
  useEffect(() => {
    const el = mainRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        const { sx, sy } = screenPos(e);
        zoomAt(sx, sy, Math.exp(-e.deltaY * 0.0015));
      } else {
        const k = e.deltaMode === 1 ? 16 : 1;
        view.current.tx -= e.deltaX * k;
        view.current.ty -= e.deltaY * k;
        requestRender();
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // ---- keyboard ----
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (editingRef.current) return; // typing in the text editor
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
    for (const obj of scene.current) {
      if (editingRef.current && editingRef.current.id === obj.id) continue; // hidden while editing
      drawObject(ctx, obj, ink, obj.kind === 'connector' ? resolveEnds(obj) : undefined);
    }
  };

  const renderOverlay = () => {
    const ctx = octx.current;
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    const v = view.current;
    const ink = cssVar('--on-board', '#26312b');
    if (temp.current) {
      worldTransform(ctx);
      const t = temp.current;
      drawObject(ctx, t, ink, t.kind === 'connector' ? resolveEnds(t) : undefined);
    }
    screenTransform(ctx);
    if (propsRef.current.tool === 'connector' || action.current === 'endpoint') drawBindHint(ctx);
    drawSelection(ctx);
    for (const peer of Object.values(propsRef.current.peers)) {
      drawCursor(ctx, peer.x * v.scale + v.tx, peer.y * v.scale + v.ty, peer.color, peer.name);
    }
  };

  const drawBindHint = (ctx: CanvasRenderingContext2D) => {
    const wp = pointerWorld.current;
    if (!wp) return;
    const s = shapeAt(wp, BIND_MARGIN_PX);
    if (!s) return;
    const v = view.current;
    const anchors = shapeAnchors(s);
    const near = nearestAnchor(s, wp);
    ctx.save();
    for (const a of anchors) {
      const isNear = a.x === near.x && a.y === near.y;
      ctx.beginPath();
      ctx.arc(a.x * v.scale + v.tx, a.y * v.scale + v.ty, isNear ? 6 : 4, 0, Math.PI * 2);
      ctx.fillStyle = isNear ? SNAP_GOLD : 'rgba(212, 175, 55, 0.55)';
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = '#fff';
      ctx.stroke();
    }
    ctx.restore();
  };

  const drawSelection = (ctx: CanvasRenderingContext2D) => {
    const id = selected.current;
    if (!id) return;
    const obj = scene.current.find((o) => o.id === id);
    if (!obj) return;
    if (obj.kind === 'connector') {
      const e = resolveEnds(obj);
      for (const p of [{ x: e.x1, y: e.y1 }, { x: e.x2, y: e.y2 }]) {
        const s = toScreen(p);
        ctx.beginPath();
        ctx.arc(s.x, s.y, 5, 0, Math.PI * 2);
        ctx.fillStyle = SNAP_GOLD;
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#fff';
        ctx.stroke();
      }
      return;
    }
    const b = objBBox(obj);
    const v = view.current;
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
    for (const [hx, hy] of [[x, y], [x + w, y], [x, y + h], [x + w, y + h]]) {
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

  // ---- text editing ----
  const beginEditShape = (s: Shape) => {
    const v = view.current;
    const n = normalizeShape(s);
    setEditing({
      id: s.id,
      kind: 'shape',
      left: n.x * v.scale + v.tx,
      top: n.y * v.scale + v.ty,
      width: n.w * v.scale,
      height: n.h * v.scale,
      fontPx: LABEL_SIZE * v.scale,
      center: true,
      value: s.text ?? '',
      isNew: false,
    });
  };
  const beginEditText = (t: Text, isNew: boolean) => {
    const v = view.current;
    const s = toScreen({ x: t.x, y: t.y });
    setEditing({
      id: t.id,
      kind: 'text',
      left: s.x,
      top: s.y,
      width: Math.max(160, 240 * v.scale),
      height: Math.max(t.size * 1.4 * v.scale, 28),
      fontPx: t.size * v.scale,
      center: false,
      value: t.text,
      isNew,
    });
  };
  const commitEdit = () => {
    const e = editingRef.current;
    if (!e) return;
    const value = e.value.trim();
    const obj = scene.current.find((o) => o.id === e.id);
    if (obj) {
      if (obj.kind === 'text' || obj.kind === 'shape') {
        if (obj.kind === 'text' && value === '') {
          scene.current = scene.current.filter((o) => o.id !== e.id);
          if (!e.isNew) propsRef.current.onErase([e.id]);
        } else {
          obj.text = value;
          broadcast(obj);
        }
      }
    }
    setEditing(null);
    requestRender();
  };

  // ---- pointer handling ----
  const onDoubleClick = (ev: React.MouseEvent) => {
    const { sx, sy } = screenPos(ev);
    const wp = toWorld(sx, sy);
    const s = shapeAt(wp);
    if (s) {
      beginEditShape(s);
      return;
    }
    const t = topmostAt(wp);
    if (t && t.kind === 'text') beginEditText(t, false);
  };

  // Text is created on click (after mouseup) so the click's own pointerup can't
  // blur the fresh editor and commit it empty.
  const onClick = (ev: React.MouseEvent) => {
    if (propsRef.current.tool !== 'text' || editingRef.current) return;
    const { sx, sy } = screenPos(ev);
    const wp = toWorld(sx, sy);
    const s = shapeAt(wp);
    if (s) {
      selected.current = s.id;
      beginEditShape(s);
      return;
    }
    const t: Text = { id: newObjectId(), kind: 'text', x: wp.x, y: wp.y, text: '', color: propsRef.current.color, size: TEXT_SIZE };
    scene.current.push(t);
    selected.current = t.id;
    beginEditText(t, true);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (editingRef.current) commitEdit();
    if (propsRef.current.tool === 'text') return; // handled in onClick
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
      const sel = selected.current ? scene.current.find((o) => o.id === selected.current) : null;
      if (sel && sel.kind === 'connector') {
        const e2 = resolveEnds(sel);
        const gr = ENDPOINT_GRAB_PX / view.current.scale;
        if (Math.hypot(wp.x - e2.x1, wp.y - e2.y1) <= gr) {
          action.current = 'endpoint';
          endDrag.current = { c: sel, end: 'x1' };
          return;
        }
        if (Math.hypot(wp.x - e2.x2, wp.y - e2.y2) <= gr) {
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
      const s = shapeAt(wp, BIND_MARGIN_PX);
      temp.current = {
        id: newObjectId(),
        kind: 'connector',
        x1: wp.x,
        y1: wp.y,
        x2: wp.x,
        y2: wp.y,
        color,
        width,
        arrow: true,
        from: s ? { id: s.id } : undefined,
      };
    } else if (tool === 'eraser') {
      action.current = 'erase';
      erased.current = new Set();
      eraseAt(wp);
    }
  };

  const beginMove = (obj: SceneObject, wp: Point): MoveState => {
    const orig: MoveState['orig'] = {};
    if (obj.kind === 'shape' || obj.kind === 'text') {
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
    // Grabbing a shape binds any loose connector end sitting on it, so a connector
    // drawn before this shape existed grabs on and follows from the first move.
    const rebound: Connector[] = [];
    if (obj.kind === 'shape') {
      const n = normalizeShape(obj);
      const m = BIND_MARGIN_PX / view.current.scale;
      const inside = (x: number, y: number) => x >= n.x - m && x <= n.x + n.w + m && y >= n.y - m && y <= n.y + n.h + m;
      for (const o of scene.current) {
        if (o.kind !== 'connector') continue;
        let changed = false;
        if (!o.from && inside(o.x1, o.y1)) {
          o.from = { id: obj.id };
          changed = true;
        }
        if (!o.to && inside(o.x2, o.y2)) {
          o.to = { id: obj.id };
          changed = true;
        }
        if (changed) rebound.push(o);
      }
    }
    return { start: wp, obj, moved: false, orig, rebound };
  };

  const applyMove = (wp: Point) => {
    const m = move.current;
    if (!m) return;
    const dx = wp.x - m.start.x;
    const dy = wp.y - m.start.y;
    if (dx !== 0 || dy !== 0) m.moved = true;
    const o = m.obj;
    if (o.kind === 'shape' || o.kind === 'text') {
      o.x = (m.orig.x ?? 0) + dx;
      o.y = (m.orig.y ?? 0) + dy;
    } else if (o.kind === 'connector') {
      o.x1 = (m.orig.x1 ?? 0) + dx;
      o.y1 = (m.orig.y1 ?? 0) + dy;
      o.x2 = (m.orig.x2 ?? 0) + dx;
      o.y2 = (m.orig.y2 ?? 0) + dy;
      o.from = undefined;
      o.to = undefined;
    } else {
      o.points = (m.orig.points ?? []).map((p) => ({ x: p.x + dx, y: p.y + dy }));
    }
    requestRender();
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
      const s = shapeAt(wp, BIND_MARGIN_PX);
      if (end === 'x1') {
        c.x1 = wp.x;
        c.y1 = wp.y;
        c.from = s ? { id: s.id } : undefined;
      } else {
        c.x2 = wp.x;
        c.y2 = wp.y;
        c.to = s ? { id: s.id } : undefined;
      }
      requestRender();
    } else if (a === 'draw' && t?.kind === 'stroke') {
      t.points.push(wp);
    } else if (a === 'shape' && t?.kind === 'shape') {
      t.w = wp.x - t.x;
      t.h = wp.y - t.y;
    } else if (a === 'connector' && t?.kind === 'connector') {
      t.x2 = wp.x;
      t.y2 = wp.y;
      const s = shapeAt(wp, BIND_MARGIN_PX);
      t.to = s ? { id: s.id } : undefined;
      requestRender();
    } else if (a === 'erase') {
      eraseAt(wp);
    }
  };

  const onPointerUp = () => {
    const a = action.current;
    const t = temp.current;
    action.current = null;
    temp.current = null;
    if (a === 'move') {
      const m = move.current;
      move.current = null;
      if (m) {
        if (m.moved) broadcast(m.obj);
        for (const c of m.rebound) broadcast(c); // persist any newly-bound ends
      }
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
    else if (a === 'connector' && t.kind === 'connector') {
      const bound = t.from || t.to;
      const selfLoop = t.from && t.to && t.from.id === t.to.id;
      if (!selfLoop && (bound || Math.hypot(t.x2 - t.x1, t.y2 - t.y1) > 6)) commit(t);
    }
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
      if (hitObject(obj, wp, pad)) {
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
    props.tool === 'pan'
      ? 'grab'
      : props.tool === 'eraser'
      ? 'cell'
      : props.tool === 'select'
      ? 'default'
      : props.tool === 'text'
      ? 'text'
      : 'crosshair';

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
        onClick={onClick}
        onDoubleClick={onDoubleClick}
      />
      <canvas ref={overlayRef} className="board-overlay" />
      {editing && (
        <textarea
          ref={editRef}
          className="text-editor"
          autoFocus
          value={editing.value}
          onChange={(e) => setEditing({ ...editing, value: e.target.value })}
          onBlur={commitEdit}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              commitEdit();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              commitEdit();
            }
          }}
          style={{
            left: editing.left,
            top: editing.top,
            width: editing.width,
            height: editing.height,
            fontSize: editing.fontPx,
            textAlign: editing.center ? 'center' : 'left',
          }}
        />
      )}
    </div>
  );
});

// ---------- drawing helpers ----------

function drawObject(
  ctx: CanvasRenderingContext2D,
  obj: SceneObject,
  ink: string,
  ends?: { x1: number; y1: number; x2: number; y2: number },
) {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const stroke = obj.color === 'ink' ? ink : obj.color;
  ctx.strokeStyle = stroke;
  ctx.fillStyle = stroke;
  if ('width' in obj) ctx.lineWidth = obj.width;
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
    if (obj.text) drawLabel(ctx, obj.text, x, y, w, h, ink);
  } else if (obj.kind === 'text') {
    ctx.fillStyle = obj.color === 'ink' ? ink : obj.color;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.font = `500 ${obj.size}px ${FONT}`;
    const lines = obj.text.split('\n');
    lines.forEach((ln, i) => ctx.fillText(ln, obj.x, obj.y + i * obj.size * 1.3));
  } else {
    const e = ends ?? { x1: obj.x1, y1: obj.y1, x2: obj.x2, y2: obj.y2 };
    ctx.beginPath();
    ctx.moveTo(e.x1, e.y1);
    ctx.lineTo(e.x2, e.y2);
    ctx.stroke();
    if (obj.arrow) drawArrowHead(ctx, e.x1, e.y1, e.x2, e.y2, obj.width);
  }
}

function drawLabel(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, w: number, h: number, ink: string) {
  ctx.save();
  ctx.fillStyle = ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `500 ${LABEL_SIZE}px ${FONT}`;
  const lines = wrapLabel(ctx, text, w - 12);
  const lh = LABEL_SIZE * 1.25;
  const startY = y + h / 2 - ((lines.length - 1) * lh) / 2;
  lines.forEach((ln, i) => ctx.fillText(ln, x + w / 2, startY + i * lh));
  ctx.restore();
}

function wrapLabel(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    const words = para.split(' ');
    let line = '';
    for (const word of words) {
      const test = line ? line + ' ' + word : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        out.push(line);
        line = word;
      } else {
        line = test;
      }
    }
    out.push(line);
  }
  return out;
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

function shapeCenter(s: Shape): Point {
  const n = normalizeShape(s);
  return { x: n.x + n.w / 2, y: n.y + n.h / 2 };
}

// Four connection points that lie ON the shape: the edge midpoints of a rect,
// the cardinal points of an ellipse, and the vertices of a diamond all sit at
// these same N/E/S/W positions — so a connector attaches to the shape itself.
function shapeAnchors(s: Shape): Point[] {
  const n = normalizeShape(s);
  return [
    { x: n.x + n.w / 2, y: n.y }, // N
    { x: n.x + n.w, y: n.y + n.h / 2 }, // E
    { x: n.x + n.w / 2, y: n.y + n.h }, // S
    { x: n.x, y: n.y + n.h / 2 }, // W
  ];
}

// The connection point nearest a target — the connector attaches here.
function nearestAnchor(s: Shape, target: Point): Point {
  const as = shapeAnchors(s);
  let best = as[0];
  let bd = Infinity;
  for (const a of as) {
    const d = Math.hypot(a.x - target.x, a.y - target.y);
    if (d < bd) {
      bd = d;
      best = a;
    }
  }
  return best;
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
  if (obj.kind === 'text') {
    const lines = obj.text.split('\n');
    const w = Math.max(1, ...lines.map((l) => l.length)) * obj.size * 0.58;
    const h = lines.length * obj.size * 1.3;
    return { x: obj.x, y: obj.y, w, h };
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
  if (obj.kind === 'text') {
    const b = objBBox(obj);
    return p.x >= b.x - pad && p.x <= b.x + b.w + pad && p.y >= b.y - pad && p.y <= b.y + b.h + pad;
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

  ctx.font = `600 11px ${FONT}`;
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
