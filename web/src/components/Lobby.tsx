import { useEffect, useState } from 'react';
import { gql } from '../lib/gql';
import { Theme } from '../lib/useTheme';

interface Board {
  id: string;
  title: string;
  objectCount: number;
  lastActiveAt: string | null;
  createdAt: string;
}

const BOARDS_QUERY = `{ boards { id title objectCount lastActiveAt createdAt } }`;
const CREATE_MUTATION = `mutation($t: String!) { createBoard(title: $t) { id } }`;
const DELETE_MUTATION = `mutation($id: ID!) { deleteBoard(id: $id) }`;

export function Lobby({ theme, onToggleTheme }: { theme: Theme; onToggleTheme: () => void }) {
  const [boards, setBoards] = useState<Board[] | null>(null);
  const [title, setTitle] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    gql<{ boards: Board[] }>(BOARDS_QUERY)
      .then((d) => setBoards(d.boards))
      .catch((e) => setErr(String(e.message || e)));
  }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    const t = title.trim();
    if (!t || busy) return;
    setBusy(true);
    setErr(null);
    try {
      const d = await gql<{ createBoard: { id: string } }>(CREATE_MUTATION, { t });
      location.href = `/?board=${encodeURIComponent(d.createBoard.id)}`;
    } catch (e) {
      setErr(String((e as Error).message || e));
      setBusy(false);
    }
  };

  const scratch = () => {
    location.href = `/?board=scratch-${Math.random().toString(36).slice(2, 8)}`;
  };

  const del = async (b: Board) => {
    if (!window.confirm(`Delete "${b.title}"? This removes the board and its drawing.`)) return;
    const prev = boards;
    setBoards((bs) => (bs ? bs.filter((x) => x.id !== b.id) : bs)); // optimistic
    try {
      await gql(DELETE_MUTATION, { id: b.id });
    } catch (e) {
      setErr(String((e as Error).message || e));
      setBoards(prev); // rollback
    }
  };

  return (
    <div className="lobby">
      <header className="lobby-top">
        <div className="brand">
          <span className="brand-mark" aria-hidden>
            EA
          </span>
          <span className="brand-name">Draw</span>
        </div>
        <button
          className="icon-btn ghost"
          onClick={onToggleTheme}
          aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          <ThemeIcon dark={theme === 'dark'} />
        </button>
      </header>

      <main className="lobby-main">
        <h1 className="lobby-title">Your boards</h1>
        <p className="lobby-sub">
          Real-time diagram boards. Name a new one or open a recent board. Anyone with the link can draw on it live.
        </p>

        <form className="lobby-create" onSubmit={create}>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Name a new board…"
            aria-label="New board title"
            maxLength={80}
          />
          <button className="btn primary" type="submit" disabled={busy || !title.trim()}>
            {busy ? 'Creating…' : 'New board'}
          </button>
          <button className="btn" type="button" onClick={scratch} title="Open a throwaway board without naming it">
            Quick scratch
          </button>
        </form>

        {err && <div className="lobby-err">Couldn’t reach the board service: {err}</div>}

        <div className="board-grid">
          {boards === null ? (
            <div className="lobby-empty">Loading boards…</div>
          ) : boards.length === 0 ? (
            <div className="lobby-empty">No named boards yet. Name one above to begin.</div>
          ) : (
            boards.map((b) => (
              <div key={b.id} className="board-card">
                <a className="board-card-main" href={`/?board=${encodeURIComponent(b.id)}`}>
                  <div className="board-card-title">{b.title}</div>
                  <div className="board-card-meta">
                    {b.objectCount} object{b.objectCount === 1 ? '' : 's'} · {relTime(b.lastActiveAt ?? b.createdAt)}
                  </div>
                </a>
                <button className="board-del" onClick={() => del(b)} title="Delete board" aria-label={`Delete ${b.title}`}>
                  ×
                </button>
              </div>
            ))
          )}
        </div>
      </main>
    </div>
  );
}

function relTime(iso: string): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return '';
  const s = Math.max(0, (Date.now() - then) / 1000);
  if (s < 45) return 'just now';
  const m = s / 60;
  if (m < 45) return `${Math.round(m)}m ago`;
  const h = m / 60;
  if (h < 24) return `${Math.round(h)}h ago`;
  const d = h / 24;
  if (d < 30) return `${Math.round(d)}d ago`;
  return new Date(then).toLocaleDateString();
}

function ThemeIcon({ dark }: { dark: boolean }) {
  const p = {
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  return dark ? (
    <svg viewBox="0 0 24 24" width="18" height="18" {...p}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.4 1.4M17.6 17.6L19 19M19 5l-1.4 1.4M6.4 17.6L5 19" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" width="18" height="18" {...p}>
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </svg>
  );
}
