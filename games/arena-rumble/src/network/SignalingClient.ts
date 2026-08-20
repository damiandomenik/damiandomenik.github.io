import Peer, { type PeerOptions } from 'peerjs';
import { GAME_CONFIG } from '../config/gameConfig';

/**
 * WebRTC needs a rendezvous service to exchange SDP offers/answers and ICE
 * candidates. GitHub Pages is static hosting, so we cannot ship one with the
 * game.
 *
 * Rather than inventing an API, this uses PeerJS: its public broker does
 * *only* signaling (room discovery, offer, answer, ICE) and then gets out of
 * the way — all match traffic afterwards runs peer to peer over real
 * RTCDataChannels. Anyone who wants to own that piece can run `peerjs-server`
 * themselves and point `VITE_PEER_HOST` at it; see server/README.md.
 */

export interface SignalingOptions {
  /** Optional self hosted PeerServer. Falls back to the public broker. */
  host?: string;
  port?: number;
  path?: string;
  secure?: boolean;
}

function optionsFromEnv(): SignalingOptions {
  const env = import.meta.env as Record<string, string | undefined>;
  if (!env.VITE_PEER_HOST) return {};
  return {
    host: env.VITE_PEER_HOST,
    port: env.VITE_PEER_PORT ? Number(env.VITE_PEER_PORT) : 443,
    path: env.VITE_PEER_PATH ?? '/',
    secure: env.VITE_PEER_SECURE !== 'false',
  };
}

/** Room code -> the peer id the host registers under. */
export function peerIdForRoom(code: string): string {
  return `${GAME_CONFIG.network.peerPrefix}${code.trim().toUpperCase()}`;
}

export function normaliseRoomCode(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, GAME_CONFIG.network.codeLength);
}

export class SignalingClient {
  private peer: Peer | null = null;

  /**
   * Opens a connection to the broker.
   * @param preferredId `undefined` lets the broker assign a random id, which
   *        is what joining clients want. Hosts pass the room's derived id.
   */
  open(preferredId?: string, options: SignalingOptions = optionsFromEnv()): Promise<Peer> {
    this.close();

    const peerOptions: PeerOptions = {
      debug: 1,
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:global.stun.twilio.com:3478' },
        ],
      },
    };
    if (options.host) {
      peerOptions.host = options.host;
      peerOptions.port = options.port;
      peerOptions.path = options.path;
      peerOptions.secure = options.secure;
    }

    const peer = preferredId ? new Peer(preferredId, peerOptions) : new Peer(peerOptions);
    this.peer = peer;

    return new Promise<Peer>((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        cleanup();
        peer.destroy();
        reject(new Error('The signaling server did not answer. Check your connection.'));
      }, GAME_CONFIG.network.connectionTimeoutMs);

      const onOpen = () => {
        cleanup();
        resolve(peer);
      };
      const onError = (err: Error & { type?: string }) => {
        cleanup();
        peer.destroy();
        reject(translateError(err));
      };
      const cleanup = () => {
        window.clearTimeout(timeout);
        peer.off('open', onOpen);
        peer.off('error', onError);
      };

      peer.on('open', onOpen);
      peer.on('error', onError);
    });
  }

  get current(): Peer | null {
    return this.peer;
  }

  close(): void {
    if (this.peer && !this.peer.destroyed) this.peer.destroy();
    this.peer = null;
  }
}

export function translateError(err: Error & { type?: string }): Error {
  switch (err.type) {
    case 'unavailable-id':
      return new Error('That room code is already in use. Create a new room.');
    case 'peer-unavailable':
      return new Error('No room with that code is open right now.');
    case 'network':
      return new Error('Lost contact with the signaling server.');
    case 'browser-incompatible':
      return new Error('This browser does not support WebRTC. Try Chrome, Edge or Firefox.');
    case 'ssl-unavailable':
      return new Error('The signaling server refused a secure connection.');
    default:
      return err instanceof Error ? err : new Error(String(err));
  }
}
