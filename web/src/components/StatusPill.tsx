import { Status } from '../lib/useDraw';

interface Props {
  status: Status;
  node: string;
  board: string;
}

const LABEL: Record<Status, string> = {
  connecting: 'connecting',
  live: 'live',
  reconnecting: 'reconnecting',
};

export function StatusPill({ status, node, board }: Props) {
  const copyLink = () => {
    void navigator.clipboard?.writeText(location.href);
  };
  return (
    <div className="statusbar">
      <button className="board-chip" onClick={copyLink} title="Copy a link to this board">
        <span className="hash">#</span>
        {board}
        <span className="copy">copy link</span>
      </button>
      <span
        className={`status ${status}`}
        title={
          status === 'live'
            ? `Live: your realtime link is up, on gateway node "${node}". Nodes are interchangeable; a load balancer spreads people across them and they all serve this same board.`
            : LABEL[status]
        }
      >
        <span className="status-dot" />
        {LABEL[status]}
        {node && status === 'live' && <span className="node">· {node}</span>}
      </span>
    </div>
  );
}
