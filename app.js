import { newRound, reduce } from './game.js';
import { hostSession, joinSession } from './sync.js';

const $ = (s) => document.querySelector(s);
const params = new URLSearchParams(location.search);
const joinId = params.get('join');
const role = joinId ? 'student' : 'therapist';
document.body.dataset.role = role;

const content = await (await fetch('./content.json')).json();
const themeById = (id) => content.themes.find((t) => t.id === id);

let state = null;
let roundId = 0;
let lastSeen = { roundId: -1, seq: -1 };

// ---------- sound (WebAudio, no assets) ----------
let ac = null;
function tone(freq, at = 0, dur = 0.12, type = 'sine', gain = 0.15) {
  ac ??= new AudioContext();
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.value = freq;
  const t = ac.currentTime + at;
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(ac.destination);
  o.start(t); o.stop(t + dur);
}
const sfx = {
  flip: () => tone(660, 0, 0.06, 'triangle', 0.08),
  match: () => { tone(523, 0); tone(784, 0.1, 0.2); },
  miss: () => tone(220, 0, 0.18, 'sine', 0.08),
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.12, 0.25)),
};

// ---------- rendering ----------
function render(prev) {
  const theme = themeById(state.themeId);
  document.documentElement.style.setProperty('--bg', theme.background);
  document.documentElement.style.setProperty('--accent', theme.accent);
  $('#theme-name').textContent = theme.title;
  $('#moves').textContent = state.moves;
  $('#pairs').textContent = `${state.matched.length / 2} / ${state.deck.length / 2}`;
  $('#locked-banner').hidden = !(role === 'student' && state.studentLocked);
  $('#lock').textContent = state.studentLocked ? 'Unlock student' : 'Lock student';

  const board = $('#board');
  if (board.children.length !== state.deck.length || prev?.themeId !== state.themeId || prev?.roundId !== roundId) {
    board.replaceChildren(...state.deck.map((_, i) => {
      const b = document.createElement('button');
      b.className = 'card';
      b.dataset.idx = i;
      b.innerHTML = '<span class="back"></span><span class="front"><span class="emoji"></span><span class="label"></span></span>';
      return b;
    }));
  }
  [...board.children].forEach((el, i) => {
    const item = theme.items.find((it) => it.id === state.deck[i]);
    const up = state.open.includes(i) || state.matched.includes(i);
    el.classList.toggle('up', up);
    el.classList.toggle('matched', state.matched.includes(i));
    el.disabled = role === 'student' && state.studentLocked;
    el.querySelector('.emoji').textContent = up ? item.emoji : '';
    el.querySelector('.label').textContent = up ? item.label : '';
    el.setAttribute('aria-label', up ? item.label : 'hidden card');
  });

  const ev = state.lastEvent;
  const word = $('#word');
  if (ev && (ev.kind === 'match' || ev.kind === 'win')) {
    const item = theme.items.find((it) => it.id === ev.itemId);
    word.textContent = `${item.emoji} ${item.label}!`;
    word.classList.remove('pop'); void word.offsetWidth; word.classList.add('pop');
  }
  $('#win').hidden = state.status !== 'won';
}

function onState(next, isNewRound) {
  const prev = state ? { ...state, roundId: lastSeen.roundId } : null;
  state = next;
  render(prev);
  const ev = state.lastEvent;
  if (isNewRound) return;
  if (ev?.kind === 'win') { sfx.win(); confetti(); }
  else if (ev?.kind === 'match') sfx.match();
  else if (ev?.kind === 'miss') sfx.miss();
  else if (state.open.length === 1) sfx.flip();
}

function confetti() {
  const layer = $('#confetti');
  const emojis = themeById(state.themeId).items.map((i) => i.emoji);
  for (let i = 0; i < 40; i++) {
    const s = document.createElement('span');
    s.textContent = emojis[i % emojis.length];
    s.style.left = Math.random() * 100 + 'vw';
    s.style.animationDelay = Math.random() * 0.6 + 's';
    s.style.fontSize = 18 + Math.random() * 24 + 'px';
    layer.append(s);
    setTimeout(() => s.remove(), 2600);
  }
}

// ---------- therapist (host, authoritative) ----------
if (role === 'therapist') {
  let hideTimer = null;
  const session = hostSession({
    onReady: (id) => {
      const link = `${location.origin}${location.pathname}?join=${id}`;
      $('#invite').value = link;
      $('#open-student').href = link;
      $('#status').textContent = 'Waiting for student…';
    },
    onPeers: (n) => { $('#status').textContent = n ? 'Student connected' : 'Waiting for student…'; $('#status').dataset.ok = n > 0; },
    onError: (e) => { $('#status').textContent = 'Connection error: ' + e.type; },
    onIntent: (action) => dispatch({ ...action, by: 'student' }),
  });

  const publish = (isNewRound = false) => { session.broadcast(state, roundId); onState(state, isNewRound); };

  function dispatch(action) {
    const next = reduce(state, action);
    if (next === state) return;
    state = next;
    publish();
    if (state.lastEvent?.kind === 'miss') {
      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => { state = reduce(state, { type: 'hide' }); publish(); }, 900);
    }
  }

  function startRound(themeId) {
    clearTimeout(hideTimer);
    const locked = state?.studentLocked ?? false;
    roundId += 1;
    state = { ...newRound(themeById(themeId)), studentLocked: locked };
    lastSeen.roundId = roundId;
    publish(true);
  }

  const sel = $('#theme');
  sel.replaceChildren(...content.themes.map((t) => new Option(t.title, t.id)));
  sel.onchange = () => startRound(sel.value);
  $('#reset').onclick = () => startRound(sel.value);
  $('#lock').onclick = () => dispatch({ type: 'lock', value: !state.studentLocked });
  $('#copy').onclick = async () => { await navigator.clipboard.writeText($('#invite').value); $('#copy').textContent = 'Copied'; setTimeout(() => ($('#copy').textContent = 'Copy'), 1200); };
  $('#board').onclick = (e) => { const c = e.target.closest('.card'); if (c) dispatch({ type: 'flip', idx: +c.dataset.idx, by: 'therapist' }); };
  $('#again').onclick = () => startRound(sel.value);

  startRound(content.themes[0].id);
}

// ---------- student (renders host snapshots, sends intents) ----------
if (role === 'student') {
  const labels = { connected: 'Connected', reconnecting: 'Reconnecting…', 'no-session': 'Session not found. Ask your therapist for a new link.', error: 'Connection problem' };
  const client = joinSession(joinId, {
    onStatus: (s) => { $('#status').textContent = labels[s] ?? s; $('#status').dataset.ok = s === 'connected'; },
    onSnapshot: (next, rid) => {
      // Drop stale or duplicated snapshots (ordering guard).
      if (rid < lastSeen.roundId || (rid === lastSeen.roundId && next.seq <= lastSeen.seq)) return;
      const isNewRound = rid !== lastSeen.roundId;
      lastSeen = { roundId: rid, seq: next.seq };
      roundId = rid;
      onState(next, isNewRound);
    },
  });
  $('#board').onclick = (e) => {
    const c = e.target.closest('.card');
    if (c && !c.disabled) client.send({ type: 'flip', idx: +c.dataset.idx });
  };
}
