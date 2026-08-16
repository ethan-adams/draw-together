// WebSocket load test for LiveBoard.
//
// Opens CONNS concurrent clients through the load balancer, sharded into rooms
// of ROOM users (the realistic model: many independent boards, a handful of
// people each). Every client draws a few times a second; each stroke carries a
// send timestamp so receivers can measure live broadcast latency.
//
//   k6 run loadtest/ws_load.js                 # defaults: 500 conns, rooms of 20
//   CONNS=1000 ROOM=20 k6 run loadtest/ws_load.js
//
// Point it at the docker-compose cluster (default) or anywhere else via URL.
import ws from 'k6/ws';
import { check, sleep } from 'k6';
import { Trend, Counter, Rate } from 'k6/metrics';

const latency = new Trend('broadcast_latency_ms', true);
const drawsReceived = new Counter('draws_received');
const connectErrors = new Rate('connect_errors');

const CONNS = __ENV.CONNS ? parseInt(__ENV.CONNS, 10) : 500;
const ROOM = __ENV.ROOM ? parseInt(__ENV.ROOM, 10) : 20;
const HOLD = __ENV.HOLD || '25s';
const URL = __ENV.URL || 'ws://localhost:8080/ws';

// Guard against counting a stray non-live message. The post-connect warmup skip
// already excludes the one-time catch-up replay, so this can be generous — we
// want true high latencies under load to show, not be capped away.
const LIVE_WINDOW_MS = 10000;
const ROOMS = Math.max(1, Math.ceil(CONNS / ROOM));

export const options = {
  summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
  scenarios: {
    load: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '20s', target: CONNS },
        { duration: HOLD, target: CONNS },
        { duration: '5s', target: 0 },
      ],
      gracefulStop: '5s',
    },
  },
  thresholds: {
    connect_errors: ['rate<0.01'],
    broadcast_latency_ms: ['p(95)<250'],
  },
};

export default function () {
  const room = 'room-' + (__VU % ROOMS);
  let connectedAt = 0;
  const res = ws.connect(`${URL}?board=${room}`, {}, (socket) => {
    socket.on('open', () => {
      connectedAt = Date.now();
      socket.setInterval(() => {
        socket.send(JSON.stringify({
          type: 'draw',
          t: Date.now(),
          from: { x: 0, y: 0 },
          to: { x: 1, y: 1 },
          color: '#000',
          width: 1,
        }));
      }, 200);
      // Hold the connection roughly for the scenario, then close cleanly.
      socket.setTimeout(() => socket.close(), 50000);
    });

    socket.on('message', (data) => {
      // Skip the first couple of seconds: that's the one-time catch-up replay
      // on join, which carries old timestamps and isn't live broadcast latency.
      if (Date.now() - connectedAt < 2500) return;
      let m;
      try { m = JSON.parse(data); } catch { return; }
      if (m.type === 'draw' && typeof m.t === 'number') {
        const d = Date.now() - m.t;
        if (d >= 0 && d < LIVE_WINDOW_MS) {
          latency.add(d);
          drawsReceived.add(1);
        }
      }
    });

    socket.on('error', () => connectErrors.add(true));
  });

  if (!check(res, { 'ws handshake 101': (r) => r && r.status === 101 })) {
    connectErrors.add(true);
    sleep(1); // a failed connect returns instantly — don't spin and storm
  }
}
