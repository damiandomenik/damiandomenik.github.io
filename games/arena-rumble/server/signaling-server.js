#!/usr/bin/env node
/**
 * Optional self-hosted signaling server.
 *
 * Arena Rumble uses WebRTC DataChannels for all match traffic, but WebRTC
 * still needs somewhere to exchange SDP offers, answers and ICE candidates
 * before a connection exists. By default the game uses the public PeerJS
 * broker, which needs no setup at all.
 *
 * Run this if you would rather own that piece:
 *
 *   npm install --save-dev peer
 *   npm run signaling
 *
 * Then build the game with the broker pointed at your host:
 *
 *   VITE_PEER_HOST=your.domain VITE_PEER_PORT=9000 VITE_PEER_SECURE=false npm run build
 *
 * This process never sees game state. It only introduces peers to each other.
 */

const PORT = Number(process.env.PORT ?? 9000);

let PeerServer;
try {
  ({ PeerServer } = await import('peer'));
} catch {
  console.error(
    'The "peer" package is not installed.\n' +
      'Install it first:  npm install --save-dev peer\n' +
      'Or skip this entirely and use the public broker (the default).',
  );
  process.exit(1);
}

const server = PeerServer({
  port: PORT,
  path: '/',
  allow_discovery: false,
  proxied: true,
});

server.on('connection', (client) => console.log(`+ ${client.getId()}`));
server.on('disconnect', (client) => console.log(`- ${client.getId()}`));

console.log(`Arena Rumble signaling server listening on port ${PORT}`);
