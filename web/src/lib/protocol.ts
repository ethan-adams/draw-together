// Wire protocol shared with the gateway. The server relays these messages
// verbatim between clients on a board; "add", "erase", and "clear" are the
// durable ops replayed to late joiners. Coordinates are in *world* space (the
// infinite canvas), so peers at different pan/zoom stay in sync.

export type Point = { x: number; y: number };

export type ShapeKind = 'rect' | 'ellipse' | 'diamond';

export interface Stroke {
  id: string;
  kind: 'stroke';
  color: string;
  width: number;
  points: Point[];
}
export interface Shape {
  id: string;
  kind: 'shape';
  shape: ShapeKind;
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  width: number;
}
export interface Connector {
  id: string;
  kind: 'connector';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  width: number;
  arrow: boolean;
}
export type SceneObject = Stroke | Shape | Connector;

export interface HelloMsg {
  type: 'hello';
  clientId: string;
  node: string;
}
export interface AddMsg {
  type: 'add';
  clientId?: string;
  obj: SceneObject;
}
export interface EraseMsg {
  type: 'erase';
  clientId?: string;
  ids: string[];
}
export interface ClearMsg {
  type: 'clear';
}
export interface CursorMsg {
  type: 'cursor';
  clientId: string;
  x: number;
  y: number;
  color: string;
  name: string;
}

export type ServerMsg = HelloMsg | AddMsg | EraseMsg | ClearMsg | CursorMsg;

// Pen/shape palette — tuned to read on the dark board: warm chalk, the brand
// gold and forest greens, plus grays and a near-black.
export const PALETTE = [
  '#ece7da', // chalk
  '#d4af37', // gold
  '#f2cd74', // light gold
  '#6cc79a', // forest light
  '#2f9e63', // forest
  '#1e6b45', // deep forest
  '#8a9a90', // sage gray
  '#0d0f0d', // near-black
];

export const DEFAULT_COLOR = '#d4af37'; // gold

// Identity colors for cursors/avatars — only the ones that pop on a dark board.
const IDENTITY_COLORS = ['#d4af37', '#f2cd74', '#6cc79a', '#2f9e63', '#ece7da', '#8a9a90'];

const ADJECTIVES = ['Swift', 'Calm', 'Bright', 'Bold', 'Quiet', 'Merry', 'Clever', 'Brave', 'Gentle', 'Lucky'];
const ANIMALS = ['Fox', 'Otter', 'Heron', 'Lynx', 'Wren', 'Koi', 'Ibex', 'Moth', 'Finch', 'Mole'];

const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(Math.random() * xs.length)];

export const randomName = (): string => `${pick(ADJECTIVES)} ${pick(ANIMALS)}`;
export const randomColor = (): string => pick(IDENTITY_COLORS);

// Short unique id for scene objects.
export const newObjectId = (): string =>
  Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
