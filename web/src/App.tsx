import { useMemo, useRef, useState } from 'react';
import { BoardCanvas, CanvasHandle } from './components/BoardCanvas';
import { Toolbar } from './components/Toolbar';
import { Presence } from './components/Presence';
import { StatusPill } from './components/StatusPill';
import { useLiveBoard } from './lib/useLiveBoard';
import { DEFAULT_COLOR } from './lib/protocol';
import { Tool } from './lib/tools';

export default function App() {
  const board = useMemo(() => new URLSearchParams(location.search).get('board') || 'welcome', []);

  const [tool, setTool] = useState<Tool>('pen');
  const [color, setColor] = useState(DEFAULT_COLOR);
  const [width, setWidth] = useState(4);
  const [zoom, setZoom] = useState(1);
  const canvas = useRef<CanvasHandle>(null);

  const { status, node, peers, me, sendAdd, sendErase, sendClear, sendCursor } = useLiveBoard({
    board,
    onAdd: (obj) => canvas.current?.applyAdd(obj),
    onErase: (ids) => canvas.current?.applyErase(ids),
    onClear: () => canvas.current?.clear(),
  });

  const clear = () => {
    canvas.current?.clear();
    sendClear();
  };

  return (
    <div className="app">
      <header className="top">
        <Toolbar
          tool={tool}
          setTool={setTool}
          color={color}
          setColor={setColor}
          width={width}
          setWidth={setWidth}
          zoom={zoom}
          onZoomIn={() => canvas.current?.zoomIn()}
          onZoomOut={() => canvas.current?.zoomOut()}
          onZoomReset={() => canvas.current?.resetView()}
          onClear={clear}
        />
        <div className="top-right">
          <Presence me={me} peers={peers} />
          <StatusPill status={status} node={node} board={board} />
        </div>
      </header>

      <BoardCanvas
        ref={canvas}
        tool={tool}
        color={color}
        width={width}
        peers={peers}
        onAdd={sendAdd}
        onErase={sendErase}
        onCursor={sendCursor}
        onZoom={setZoom}
      />

      <div className="hint">
        <kbd>Scroll</kbd> to zoom · <kbd>Space</kbd>-drag to pan · pick a shape and drag it out
      </div>
    </div>
  );
}
