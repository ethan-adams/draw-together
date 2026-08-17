import { useMemo, useRef, useState } from 'react';
import { BoardCanvas, CanvasHandle } from './components/BoardCanvas';
import { Toolbar } from './components/Toolbar';
import { Presence } from './components/Presence';
import { StatusPill } from './components/StatusPill';
import { useDraw } from './lib/useDraw';
import { useTheme } from './lib/useTheme';
import { INK, INK_HEX } from './lib/protocol';
import { Tool } from './lib/tools';

export default function App() {
  const board = useMemo(() => new URLSearchParams(location.search).get('board') || 'welcome', []);

  const [theme, setTheme] = useTheme();
  const [tool, setTool] = useState<Tool>('select');
  const [color, setColor] = useState<string>(INK);
  const [width, setWidth] = useState(4);
  const [zoom, setZoom] = useState(1);
  const canvas = useRef<CanvasHandle>(null);

  const { status, node, peers, me, sendAdd, sendErase, sendClear, sendCursor } = useDraw({
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
          inkHex={INK_HEX[theme]}
          width={width}
          setWidth={setWidth}
          zoom={zoom}
          onZoomIn={() => canvas.current?.zoomIn()}
          onZoomOut={() => canvas.current?.zoomOut()}
          onZoomReset={() => canvas.current?.resetView()}
          theme={theme}
          onToggleTheme={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
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
        theme={theme}
        peers={peers}
        onAdd={sendAdd}
        onErase={sendErase}
        onCursor={sendCursor}
        onZoom={setZoom}
      />

      <div className="hint">
        <kbd>Scroll</kbd> to pan · <kbd>Pinch</kbd> or <kbd>⌘</kbd>-scroll to zoom · connectors snap to shapes
      </div>
    </div>
  );
}
