import { newRound, reduce } from './game.js';
import assert from 'node:assert/strict';
const theme = { id: 't', items: 'abcdef'.split('').map((id) => ({ id })) };
let s = newRound(theme, { seed: 1 });
assert.equal(s.deck.length, 12);
const pairOf = (i) => s.deck.findIndex((x, j) => j !== i && x === s.deck[i]);
const other = (i) => s.deck.findIndex((x) => x !== s.deck[i]);
// miss then third flip rejected until hide
s = reduce(s, { type: 'flip', idx: 0, by: 'student' }); s = reduce(s, { type: 'flip', idx: other(0), by: 'student' });
assert.equal(s.lastEvent.kind, 'miss'); assert.equal(reduce(s, { type: 'flip', idx: pairOf(0), by: 'student' }), s);
s = reduce(s, { type: 'hide' }); assert.deepEqual(s.open, []);
// lock blocks student only
s = reduce(s, { type: 'lock', value: true });
assert.equal(reduce(s, { type: 'flip', idx: 0, by: 'student' }), s);
assert.notEqual(reduce(s, { type: 'flip', idx: 0, by: 'therapist' }), s);
s = reduce(s, { type: 'lock', value: false });
// solve all
const done = new Set();
for (let i = 0; i < 12; i++) { if (done.has(i)) continue; const j = pairOf(i); s = reduce(s, { type: 'flip', idx: i, by: 'student' }); s = reduce(s, { type: 'flip', idx: j, by: 'student' }); done.add(i); done.add(j); }
assert.equal(s.status, 'won'); assert.equal(s.lastEvent.kind, 'win'); assert.equal(s.moves, 7);
// deterministic shuffle
assert.deepEqual(newRound(theme, { seed: 5 }).deck, newRound(theme, { seed: 5 }).deck);
console.log('game tests OK');
