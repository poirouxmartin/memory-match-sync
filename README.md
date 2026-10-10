# Memory Match: shared-session game template

A small, data-driven browser game where a **therapist (host)** and a **student** play the same board in real time.
Built as a working sample for a "reusable game templates" brief.

**Live demo:** open the page, then click *Open student view in a new tab* (or send the invite link to another device).

## What it shows

- **Template + content separation**: the board is generated from `content.json` (themes, words, emoji/images).
  One template, many games: switching theme is a data change, not a code change.
- **Host-authoritative sync**: the therapist's browser owns the game state. The student only sends *intents*
  (`flip card 3`); the host validates them (`game.js`, a pure reducer) and broadcasts a full snapshot.
  Late join, reload and reconnect are handled by re-sending the latest snapshot; stale snapshots are dropped by `(roundId, seq)`.
- **Therapist controls**: new round, theme switch, lock/unlock the student's input.
- **Kid-friendly feedback**: card flips, the matched word shown big (a speech target the therapist can prompt), WebAudio sounds, confetti.
- Runs on laptops and tablets, no install, no build step.

## Files

| File | Role |
|---|---|
| `game.js` | Pure game logic (state + reducer), no DOM, no network. Unit tested in `game.test.mjs`. |
| `sync.js` | Transport: host/join session, intent and snapshot messages. |
| `app.js` | Rendering, sounds, role-specific wiring. |
| `content.json` | Themes and items, the part an admin team would generate. |

## Transport note

For a zero-infrastructure demo, `sync.js` uses WebRTC data channels (PeerJS for signaling).
In production the same two messages (`intent`, `snapshot`) would go through the platform's own
WebSocket server (Socket.IO or Colyseus room per session), which also removes NAT/firewall issues
of peer-to-peer and lets the server persist session state.

## Run locally

```
python -m http.server 8788   # then open http://localhost:8788
node game.test.mjs           # logic tests
```
