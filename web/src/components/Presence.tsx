import { Me, Peer } from '../lib/useLiveBoard';

interface Props {
  me: Me;
  peers: Record<string, Peer>;
}

const initials = (name: string) =>
  name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

export function Presence({ me, peers }: Props) {
  const list = Object.entries(peers);
  const total = list.length + 1;

  return (
    <div className="presence" title={`${total} here`}>
      <div className="avatars">
        <span className="avatar me" style={{ background: me.color }} title={`${me.name} (you)`}>
          {initials(me.name)}
        </span>
        {list.slice(0, 5).map(([id, p]) => (
          <span className="avatar" key={id} style={{ background: p.color }} title={p.name}>
            {initials(p.name)}
          </span>
        ))}
        {list.length > 5 && <span className="avatar more">+{list.length - 5}</span>}
      </div>
      <span className="presence-count">{total} here</span>
    </div>
  );
}
