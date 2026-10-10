// Memory-match template: pure state + reducer, no DOM, no network.
// The host (therapist) is the only one who runs `reduce`; clients only render snapshots.

export function mulberry32(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function newRound(theme, { pairs = 6, seed = Date.now() } = {}) {
  const rand = mulberry32(seed);
  const items = theme.items.slice(0, pairs);
  const deck = items.flatMap((it) => [it.id, it.id]);
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return {
    seq: 0,
    themeId: theme.id,
    deck,                 // item id per card
    open: [],             // indices currently face up and not matched (0..2)
    matched: [],          // indices already matched
    moves: 0,
    status: 'playing',    // 'playing' | 'won'
    studentLocked: false, // therapist can freeze the student's input
    lastEvent: null,      // { kind: 'match' | 'miss' | 'win', by }
  };
}

// Returns the next state, or the same object if the action is rejected.
export function reduce(state, action) {
  switch (action.type) {
    case 'flip': {
      const { idx, by } = action;
      if (state.status !== 'playing') return state;
      if (by === 'student' && state.studentLocked) return state;
      if (idx < 0 || idx >= state.deck.length) return state;
      if (state.matched.includes(idx) || state.open.includes(idx)) return state;
      // Two cards already showing a miss: wait for the host's 'hide'.
      if (state.open.length >= 2) return state;

      const open = [...state.open, idx];
      let { matched, moves, status } = state;
      let lastEvent = null;
      if (open.length === 2) {
        moves += 1;
        const [a, b] = open;
        if (state.deck[a] === state.deck[b]) {
          matched = [...matched, a, b];
          lastEvent = { kind: 'match', by, itemId: state.deck[a] };
          if (matched.length === state.deck.length) {
            status = 'won';
            lastEvent = { kind: 'win', by, itemId: state.deck[a] };
          }
          return { ...state, seq: state.seq + 1, open: [], matched, moves, status, lastEvent };
        }
        lastEvent = { kind: 'miss', by };
      }
      return { ...state, seq: state.seq + 1, open, moves, lastEvent };
    }
    case 'hide':
      if (state.open.length < 2) return state;
      return { ...state, seq: state.seq + 1, open: [], lastEvent: null };
    case 'lock':
      return { ...state, seq: state.seq + 1, studentLocked: !!action.value, lastEvent: null };
    default:
      return state;
  }
}
