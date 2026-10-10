// Transport: host-authoritative session over WebRTC data channels (PeerJS broker for signaling).
// Same message protocol would run over a WebSocket server in production:
//   student -> host : { t: 'intent', action }
//   host -> student : { t: 'snapshot', state, roundId }

/* global Peer */

export function hostSession({ onIntent, onPeers, onReady, onError }) {
  const peer = new Peer();
  const conns = new Set();
  let last = null;

  peer.on('open', (id) => onReady(id));
  peer.on('error', (e) => onError(e));
  peer.on('connection', (conn) => {
    conn.on('open', () => {
      conns.add(conn);
      onPeers(conns.size);
      if (last) conn.send(last); // late join / reconnect: full resync
    });
    conn.on('data', (msg) => { if (msg && msg.t === 'intent') onIntent(msg.action); });
    conn.on('close', () => { conns.delete(conn); onPeers(conns.size); });
  });

  return {
    broadcast(state, roundId) {
      last = { t: 'snapshot', state, roundId };
      for (const c of conns) if (c.open) c.send(last);
    },
  };
}

export function joinSession(hostId, { onSnapshot, onStatus }) {
  const peer = new Peer();
  let conn = null;
  let retry = 0;

  const connect = () => {
    conn = peer.connect(hostId, { reliable: true });
    conn.on('open', () => { retry = 0; onStatus('connected'); });
    conn.on('data', (msg) => { if (msg && msg.t === 'snapshot') onSnapshot(msg.state, msg.roundId); });
    conn.on('close', () => { onStatus('reconnecting'); setTimeout(connect, Math.min(4000, 500 * ++retry)); });
  };
  peer.on('open', connect);
  peer.on('error', (e) => onStatus(e.type === 'peer-unavailable' ? 'no-session' : 'error'));

  return {
    send(action) { if (conn && conn.open) conn.send({ t: 'intent', action }); },
  };
}
