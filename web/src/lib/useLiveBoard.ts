import { useCallback, useEffect, useRef, useState } from 'react';
import { DrawMsg, Point, ServerMsg, randomColor, randomName } from './protocol';

export type Status = 'connecting' | 'live' | 'reconnecting';

export interface Peer {
  name: string;
  color: string;
  x: number;
  y: number;
  lastSeen: number;
}

export interface Me {
  name: string;
  color: string;
  clientId: string | null;
}

interface Options {
  board: string;
  onDraw: (msg: DrawMsg) => void;
  onClear: () => void;
}

const PEER_TTL_MS = 5000;

/**
 * useLiveBoard owns the WebSocket to the gateway: it connects (with auto-reconnect),
 * tracks connection status and which node served us, maintains the live set of peer
 * cursors, and exposes senders for strokes, cursors, and clears. Incoming strokes and
 * clears are handed to the caller's callbacks so the canvas can render them.
 */
export function useLiveBoard({ board, onDraw, onClear }: Options) {
  const [status, setStatus] = useState<Status>('connecting');
  const [node, setNode] = useState<string>('');
  const [peers, setPeers] = useState<Record<string, Peer>>({});

  const me = useRef<Me>({ name: randomName(), color: randomColor(), clientId: null });
  const wsRef = useRef<WebSocket | null>(null);

  // Keep the latest callbacks without re-running the connect effect.
  const onDrawRef = useRef(onDraw);
  const onClearRef = useRef(onClear);
  onDrawRef.current = onDraw;
  onClearRef.current = onClear;

  useEffect(() => {
    let closed = false;
    let reconnectTimer: number | undefined;

    const connect = () => {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      const ws = new WebSocket(`${proto}://${location.host}/ws?board=${encodeURIComponent(board)}`);
      wsRef.current = ws;

      ws.onopen = () => setStatus('live');
      ws.onclose = () => {
        if (closed) return;
        setStatus('reconnecting');
        reconnectTimer = window.setTimeout(connect, 1000);
      };
      ws.onmessage = (e) => {
        let m: ServerMsg;
        try {
          m = JSON.parse(e.data);
        } catch {
          return;
        }
        switch (m.type) {
          case 'hello':
            me.current.clientId = m.clientId;
            setNode(m.node);
            break;
          case 'draw':
            onDrawRef.current(m);
            break;
          case 'cursor':
            if (m.clientId === me.current.clientId) break;
            setPeers((prev) => ({
              ...prev,
              [m.clientId]: { name: m.name, color: m.color, x: m.x, y: m.y, lastSeen: Date.now() },
            }));
            break;
          case 'clear':
            onClearRef.current();
            break;
        }
      };
    };

    connect();

    // Expire peers we haven't heard from recently.
    const gc = window.setInterval(() => {
      setPeers((prev) => {
        const now = Date.now();
        let changed = false;
        const next: Record<string, Peer> = {};
        for (const [id, p] of Object.entries(prev)) {
          if (now - p.lastSeen < PEER_TTL_MS) next[id] = p;
          else changed = true;
        }
        return changed ? next : prev;
      });
    }, 1000);

    return () => {
      closed = true;
      window.clearTimeout(reconnectTimer);
      window.clearInterval(gc);
      wsRef.current?.close();
    };
  }, [board]);

  const send = useCallback((obj: unknown) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
  }, []);

  const sendDraw = useCallback(
    (from: Point, to: Point, color: string, width: number) => {
      send({ type: 'draw', clientId: me.current.clientId, from, to, color, width });
    },
    [send],
  );

  const sendCursor = useCallback(
    (x: number, y: number) => {
      const m = me.current;
      send({ type: 'cursor', clientId: m.clientId, x, y, color: m.color, name: m.name });
    },
    [send],
  );

  const sendClear = useCallback(() => send({ type: 'clear' }), [send]);

  return { status, node, peers, me: me.current, sendDraw, sendCursor, sendClear };
}
