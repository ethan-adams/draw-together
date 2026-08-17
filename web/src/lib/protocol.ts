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
  text?: string; // centered label
}
// A connector endpoint can be "bound" to a shape by id (a floating connection,
// draw.io-style). When bound, the actual endpoint is derived every frame as the
// point on that shape's border facing the other end — so it tracks the shape as
// it moves. When unbound, the stored x1..y2 point is authoritative. (Older data
// may carry an extra `anchor` field; only `id` is read.)
export interface EndRef {
  id: string;
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
  from?: EndRef;
  to?: EndRef;
}
export interface Text {
  id: string;
  kind: 'text';
  x: number;
  y: number;
  text: string;
  color: string;
  size: number;
}
export type SceneObject = Stroke | Shape | Connector | Text;

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

// The default "ink" is a theme-adaptive sentinel: objects drawn with it store
// the string 'ink', and each client renders it in its own theme's foreground —
// so the default is always readable, for every collaborator, whatever theme
// they're in. Any explicit swatch or picker stores a real hex instead.
export const INK = 'ink';
export const INK_HEX = { light: '#26312b', dark: '#e9ede9' } as const;

// The rest of the palette reads on both light and dark boards. Any other color
// is a click away via the custom picker.
export const PALETTE = [
  '#5b6b62', // slate
  '#d1495b', // red
  '#e08a3c', // amber
  '#c99a2e', // gold (brand)
  '#2f9e63', // forest (brand)
  '#3b7dd8', // blue
  '#8257c5', // violet
];

export const DEFAULT_COLOR = INK;

// Identity colors for cursors/avatars — saturated hues that pop on a light board
// and carry white label text well.
const IDENTITY_COLORS = ['#2f9e63', '#3b7dd8', '#d1495b', '#e08a3c', '#8257c5', '#0e9488'];

const ADJECTIVES = ['Swift', 'Calm', 'Bright', 'Bold', 'Quiet', 'Merry', 'Clever', 'Brave', 'Gentle', 'Lucky'];
const ANIMALS = ['Fox', 'Otter', 'Heron', 'Lynx', 'Wren', 'Koi', 'Ibex', 'Moth', 'Finch', 'Mole'];

const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(Math.random() * xs.length)];

export const randomName = (): string => `${pick(ADJECTIVES)} ${pick(ANIMALS)}`;
export const randomColor = (): string => pick(IDENTITY_COLORS);

// Short unique id for scene objects.
export const newObjectId = (): string =>
  Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
