# Arena Rumble

A browser 1v1 elimination arena show for up to 8 friends. Everyone starts in
the stands. Two names get drawn, they fight, the loser is out for good, the
winner goes back to the stands and can be drawn again. Last player standing is
the champion.

Three.js · TypeScript · WebRTC DataChannels · Vite · GitHub Pages.

---

## Quick start

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # typecheck + production build into dist/
npm run preview    # serve the production build locally
```

One player picks **Create room** and gets a six character code. Everyone else
types that code into **Join room**. The host starts the match and fights in it
like anybody else.

---

## Deploying to GitHub Pages

The project is configured for `https://damiandomenik.github.io/games/arenarumble`.

1. Push this folder to the repository that serves that path.
2. In **Settings → Pages**, set the source to **GitHub Actions**.
3. Push to `main`. `.github/workflows/deploy.yml` builds and publishes `dist/`.

`vite.config.ts` sets `base: '/games/arenarumble/'`, and every asset URL in the
code goes through `src/core/paths.ts`, which prefixes `import.meta.env.BASE_URL`.
Nothing depends on the site living at `/`.

**If you deploy somewhere else**, change `base` in `vite.config.ts` to match.
That is the only place the path appears.

---

## Controls

| | |
|---|---|
| `W` `A` `S` `D` | Move |
| Mouse | Look |
| `Space` | Jump |
| `Shift` | Sprint |
| Left mouse | Attack |
| `R` | Reload |
| `Q` / `E` / wheel | Switch spectated player (once eliminated) |
| `Shift` + wheel | Spectator camera distance |

Click the canvas to capture the mouse.

### The camera rule

This one is absolute, and the code enforces it in one place
(`Game.applyLocalState`):

- Alive in the stands → **first person**
- Fighting → **first person**
- Eliminated → **third person**, following a living player

---

## Adding content

Everything is data driven. Drop a file in `public/assets/…` and add one entry
to the matching config. No game code changes.

### An arena

1. Put `my_arena.glb` in `public/assets/arenas/`.
2. Add an entry to `src/config/arenas.ts`:

```ts
{
  id: 'my_arena',
  name: 'My Arena',
  model: 'assets/arenas/my_arena.glb',
  scale: 1.0,
  weaponClass: 'melee',   // 'melee' | 'ranged' | 'any'
  mood: { /* sky, fog and light colours */ },
}
```

You do **not** need to author spawn points, collision, or a grandstand:

- The loader casts a grid of rays down through the model and takes the modal
  hit height as the floor, then re-centres the arena so that floor sits at
  `y = 0`.
- `GrandstandGenerator` wraps a stadium around whatever footprint it finds.
- `SpawnManager` probes the floor for standable cells and hands the two most
  distant ones to the round's fighters.

`weaponClass` is what makes one arena a knife fight and the next one a
firefight. Tight maps are set to `melee`, open ones to `ranged`.

### A weapon

Put the GLB in `public/assets/weapons/` with the grip at the origin and the
muzzle pointing down `-Z` (blades point up `+Y`), then add an entry to
`src/config/weapons.ts`. `view.position` / `view.rotation` place it in first
person; nudge those until it sits right in your hands.

### A character

`public/assets/characters/` plus an entry in `src/config/characters.ts`. The
loader rescales any model to about 1.8 m and drops its feet onto `y = 0`, and
`clips` maps logical states onto whatever the clips are actually called in the
GLB. A model with no animations still works — it just stands still.

---

## Shipped assets

Sliced out of the supplied kits by a build step, not shipped whole:

- **Firearms** (`pistol`, `revolver`, `smg`, `rifle`, `shotgun`, `sniper`,
  `launcher`) were recovered from one merged mesh sheet via connected-component
  analysis, then re-oriented and scaled to real world lengths.
- **Melee** (`sword`, `greatsword`, `battleaxe`, `warhammer`, `mace`, `dagger`)
  came out of the glass weapons kit as individually named nodes.
- **Arenas**: Foundry and Shuret Ruins are melee-only, Neon Yard is mixed,
  Crossfire Deck and Sector District are ranged.
- **Character**: textures re-encoded from 18 MB down to 4 MB.

---

## Architecture

### No dedicated server

One player is the **host**. They run the authoritative simulation *and* play in
it. Everyone else connects straight to them.

```
                    HOST
                     │
       ┌──────┬──────┼──────┬──────┐
       P2     P3     P4     P5   … P8
```

Host-and-spoke, not a full mesh: at 8 players a mesh would mean 28 connections
to keep alive for no benefit, since the host has to see everything anyway.

### What the host owns

Match phase, round flow, arena choice, weapon choice, fighter draw, health,
damage, death, elimination, the winner, and the champion. A client cannot
assert any of it. There is no code path anywhere that lets a client say
"I killed player 4" — clients send a `fire_request`, and the host re-runs the
raycast itself.

### What clients own

Their own movement. Each client simulates its own capsule and reports the
result; the host checks that the reported position is reachable from the last
one at the maximum possible speed, and rejects and re-snaps anything that is
not (`HostAuthority.handleInput`).

This is a deliberate trade. Full server-side movement with prediction and
rollback is the textbook answer, but it costs every player noticeable input
latency, and the cheat it prevents — position hacking — is not a real threat in
a private room with your friends. Everything that decides *who wins* is still
host-authoritative.

### Message flow

`src/network/NetworkMessages.ts` is the whole protocol. Client to host:
`join_request`, `player_input` (30 Hz), `fire_request`, `reload_request`.
Host to clients: `match_update` on every transition, `world_snapshot` (20 Hz),
plus `fire_event`, `damage_event`, `ammo_update`, `round_event`.

Remote bodies are rendered 110 ms in the past and interpolated between the two
snapshots bracketing that time, which is what stops everyone else stuttering.

### Signaling

WebRTC needs a rendezvous point before a peer connection exists. GitHub Pages
is static hosting, so the game uses the PeerJS broker for that introduction and
nothing else — all match traffic afterwards is peer to peer. See
`server/README.md` to self-host it instead.

---

## Debug mode

Open the game with `?debug=true`:

```
http://localhost:5173/games/arenarumble/?debug=true
```

You get a panel to walk any arena solo, force the next round's arena and
weapon, start a match, kill a fighter, toggle audio, and watch draw calls,
spawn counts and the current phase. It is invisible without the flag.

---

## Project layout

```
src/
  config/      arenas, weapons, characters, tunable constants
  core/        event bus, seeded RNG, math, asset paths
  game/        Game, GameState, MatchManager, RoundManager
  network/     WebRTCManager, SignalingClient, HostAuthority, messages
  player/      controller, remote avatars, input
  combat/      weapon system, hit detection, damage, effects
  arena/       loader, grandstand generator, collision, spawns
  camera/      first person, third person spectator
  spectator/   follow target switching
  assets/      GLTF cache, character and weapon loaders
  render/      renderer, sky and lighting
  ui/          every screen, plain DOM
  audio/       synthesised sound
  debug/       developer panel
```

---

## Known limitations

These are real, and worth knowing before you invite seven people:

- **The host leaving ends the match.** There is no host migration. Clients see
  "the host ended the match" and return to the menu. Migrating authority
  mid-match is doable but was out of scope for the MVP.
- **Joining mid-match is not possible.** The lobby closes when the match
  starts. Late arrivals wait for the next one.
- **A dropped client is eliminated.** Otherwise a round with a disconnected
  fighter could never resolve. Reconnect is attempted four times first.
- **One reliable DataChannel per peer.** Snapshots share the channel with
  control messages, so a lost packet briefly stalls both. Splitting into a
  second unreliable channel is the obvious next step if you see rubber banding.
- **Audio is synthesised**, not sampled. It sounds like a game, not like a
  broadcast. Real files can go in `public/assets/audio/`.
- **The launcher does not fire a real projectile.** It is a heavy, slow hitscan
  weapon with no splash damage.
- **The character has a single animation clip.** Locomotion states all resolve
  to it at different playback rates.
- **Rounds have a 4 minute cap.** If two players hide from each other, the one
  with less health loses so the show continues.

## Licensing

The GLB assets came from third party kits. Check their original licences before
publishing this anywhere public — the code here is yours, the models may not be.
