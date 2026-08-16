// Wire protocol shared with the gateway. The server relays these messages
// verbatim between clients on a board; only "draw" and "clear" are persisted.

export type Point = { x: number; y: number };

export interface HelloMsg {
  type: 'hello';
  clientId: string;
  node: string;
}
export interface DrawMsg {
  type: 'draw';
  clientId?: string;
  from: Point;
  to: Point;
  color: string;
  width: number;
}
export interface CursorMsg {
  type: 'cursor';
  clientId: string;
  x: number;
  y: number;
  color: string;
  name: string;
}
export interface ClearMsg {
  type: 'clear';
}

export type ServerMsg = HelloMsg | DrawMsg | CursorMsg | ClearMsg;

// A friendly, high-contrast palette for pens and identities.
export const PALETTE = [
  '#ef4444', // red
  '#f97316', // orange
  '#eab308', // yellow
  '#22c55e', // green
  '#14b8a6', // teal
  '#3b82f6', // blue
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#111827', // near-black
];

const ADJECTIVES = ['Swift', 'Calm', 'Bright', 'Bold', 'Quiet', 'Merry', 'Clever', 'Brave', 'Gentle', 'Lucky'];
const ANIMALS = ['Fox', 'Otter', 'Heron', 'Lynx', 'Wren', 'Koi', 'Ibex', 'Moth', 'Finch', 'Mole'];

const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(Math.random() * xs.length)];

export const randomName = (): string => `${pick(ADJECTIVES)} ${pick(ANIMALS)}`;
export const randomColor = (): string => pick(PALETTE);
