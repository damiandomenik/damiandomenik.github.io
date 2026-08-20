# Signaling

Arena Rumble has no game server. Once two browsers are connected, every packet
travels directly between them over a WebRTC DataChannel.

WebRTC still needs a rendezvous point to swap connection details before that
channel exists. That is all "signaling" means here: room lookup, SDP offer,
SDP answer, ICE candidates. No game state passes through it.

## Default: nothing to run

Out of the box the game uses the public PeerJS broker. Push the site to GitHub
Pages and it works. This is the right choice for a private game between
friends.

The trade-off: it is a free shared service with no uptime guarantee, and it
sees your room codes (not your gameplay). If it is ever down, nobody can join a
new room — but matches already in progress keep running, because they no longer
need it.

## Self-hosting

```bash
npm install --save-dev peer
npm run signaling            # listens on :9000
```

Point the build at it:

```bash
VITE_PEER_HOST=your.domain VITE_PEER_PORT=9000 VITE_PEER_SECURE=true npm run build
```

Browsers refuse insecure WebSockets from an HTTPS page, so a self-hosted broker
serving a GitHub Pages site needs TLS. Put it behind a reverse proxy.
