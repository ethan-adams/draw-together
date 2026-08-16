import { useMemo, useRef, useState } from 'react';
import { BoardCanvas, CanvasHandle } from './components/BoardCanvas';
import { Toolbar } from './components/Toolbar';
import { Presence } from './components/Presence';
import { StatusPill } from './components/StatusPill';
import { useLiveBoard } from './lib/useLiveBoard';
import { PALETTE } from './lib/protocol';

export default function App() {
  const board = useMemo(
    () => new URLSearchParams(location.search).get('board') || 'welcome',
    [],
  );

  const [color, setColor] = useState(PALETTE[5]); // blue
  const [width, setWidth] = useState(4);
  const canvas = useRef<CanvasHandle>(null);

  const { status, node, peers, me, sendDraw, sendCursor, sendClear } = useLiveBoard({
    board,
    onDraw: (m) => canvas.current?.drawSegment(m.from, m.to, m.color, m.width),
    onClear: () => canvas.current?.clear(),
  });

  const clear = () => {
    canvas.current?.clear();
    sendClear();
  };

  return (
    <div className="app">
      <header className="top">
        <Toolbar color={color} setColor={setColor} width={width} setWidth={setWidth} onClear={clear} />
        <div className="top-right">
          <Presence me={me} peers={peers} />
          <StatusPill status={status} node={node} board={board} />
        </div>
      </header>

      <BoardCanvas
        ref={canvas}
        color={color}
        width={width}
        peers={peers}
        onLocalDraw={sendDraw}
        onCursor={sendCursor}
      />
    </div>
  );
}
