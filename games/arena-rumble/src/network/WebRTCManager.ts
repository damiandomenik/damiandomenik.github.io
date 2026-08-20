import type { DataConnection } from 'peerjs';
import { EventBus } from '../core/EventBus';
import { GAME_CONFIG } from '../config/gameConfig';
import {
  SignalingClient,
  peerIdForRoom,
  translateError,
} from './SignalingClient';
import type { ClientMessage, HostMessage, NetMessage } from './NetworkMessages';

export type NetRole = 'host' | 'client' | 'offline';

export interface NetEvents {
  /** A remote peer's DataChannel opened (host side). */
  'peer:open': { peerId: string };
  'peer:close': { peerId: string };
  /** Any message that arrived, tagged with who sent it. */
  message: { from: string; message: NetMessage };
  /** The client lost the host, or the host's broker connection died. */
  disconnected: { reason: string };
  reconnecting: { attempt: number };
  error: { error: Error };
}

/**
 * Host-and-spoke DataChannel mesh.
 *
 * The host registers a deterministic peer id derived from the room code, so
 * joining is "type six characters" rather than "paste this 40 character id".
 * Clients hold exactly one connection: to the host. Nobody connects to anybody
 * else, which is the whole point of the topology at eight players.
 */
export class WebRTCManager {
  readonly events = new EventBus<NetEvents>();

  private signaling = new SignalingClient();
  private connections = new Map<string, DataConnection>();
  private hostConnection: DataConnection | null = null;
  private roleValue: NetRole = 'offline';
  private selfId = '';
  private roomCodeValue = '';
  private reconnectAttempt = 0;
  private intentionalClose = false;

  get role(): NetRole {
    return this.roleValue;
  }

  get id(): string {
    return this.selfId;
  }

  get roomCode(): string {
    return this.roomCodeValue;
  }

  get peerCount(): number {
    return this.connections.size;
  }

  get isHost(): boolean {
    return this.roleValue === 'host';
  }

  // ------------------------------------------------------------------ host

  async host(roomCode: string): Promise<void> {
    this.intentionalClose = false;
    this.roomCodeValue = roomCode;
    const peer = await this.signaling.open(peerIdForRoom(roomCode));

    this.roleValue = 'host';
    this.selfId = 'host';

    peer.on('connection', (connection) => this.acceptConnection(connection));
    peer.on('error', (err) => {
      this.events.emit('error', { error: translateError(err) });
    });
    peer.on('disconnected', () => {
      if (this.intentionalClose) return;
      // The broker link dropped. Existing DataChannels survive; we only need
      // the broker again for *new* joins, so reconnect quietly.
      try {
        peer.reconnect();
      } catch {
        /* peer was destroyed in the meantime */
      }
    });
  }

  private acceptConnection(connection: DataConnection): void {
    if (this.connections.size >= GAME_CONFIG.maxPlayers - 1) {
      connection.on('open', () => {
        connection.send({
          type: 'join_rejected',
          reason: 'full',
          message: 'This room is full (8 players).',
        } satisfies HostMessage);
        window.setTimeout(() => connection.close(), 200);
      });
      return;
    }

    connection.on('open', () => {
      this.connections.set(connection.peer, connection);
      this.events.emit('peer:open', { peerId: connection.peer });
    });

    connection.on('data', (data) => {
      const message = parse(data);
      if (message) {
        this.events.emit('message', { from: connection.peer, message });
      }
    });

    const drop = () => {
      if (!this.connections.delete(connection.peer)) return;
      this.events.emit('peer:close', { peerId: connection.peer });
    };
    connection.on('close', drop);
    connection.on('error', drop);
  }

  // ---------------------------------------------------------------- client

  async join(roomCode: string): Promise<void> {
    this.intentionalClose = false;
    this.roomCodeValue = roomCode;
    const peer = await this.signaling.open();

    this.roleValue = 'client';
    this.selfId = peer.id;

    peer.on('error', (err) => {
      this.events.emit('error', { error: translateError(err) });
    });

    await this.openHostConnection(roomCode);
  }

  private openHostConnection(roomCode: string): Promise<void> {
    const peer = this.signaling.current;
    if (!peer) return Promise.reject(new Error('Not connected to the signaling server.'));

    const connection = peer.connect(peerIdForRoom(roomCode), {
      reliable: true,
      serialization: 'json',
      metadata: { game: 'arena-rumble' },
    });

    return new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        reject(new Error('The host did not answer. Check the room code.'));
      }, GAME_CONFIG.network.connectionTimeoutMs);

      connection.on('open', () => {
        window.clearTimeout(timeout);
        this.hostConnection = connection;
        this.reconnectAttempt = 0;
        this.events.emit('peer:open', { peerId: connection.peer });
        resolve();
      });

      connection.on('data', (data) => {
        const message = parse(data);
        if (message) this.events.emit('message', { from: 'host', message });
      });

      connection.on('close', () => {
        window.clearTimeout(timeout);
        this.hostConnection = null;
        this.handleHostLoss(roomCode);
      });

      connection.on('error', (err) => {
        window.clearTimeout(timeout);
        reject(translateError(err as Error & { type?: string }));
      });
    });
  }

  private handleHostLoss(roomCode: string): void {
    if (this.intentionalClose || this.roleValue !== 'client') return;

    if (this.reconnectAttempt >= GAME_CONFIG.network.reconnectAttempts) {
      this.events.emit('disconnected', { reason: 'Lost connection to the host.' });
      return;
    }

    this.reconnectAttempt++;
    this.events.emit('reconnecting', { attempt: this.reconnectAttempt });
    window.setTimeout(() => {
      if (this.intentionalClose) return;
      this.openHostConnection(roomCode).catch(() => this.handleHostLoss(roomCode));
    }, GAME_CONFIG.network.reconnectDelayMs * this.reconnectAttempt);
  }

  // ----------------------------------------------------------------- send

  /** Client -> host. */
  sendToHost(message: ClientMessage): void {
    if (!this.hostConnection?.open) return;
    try {
      this.hostConnection.send(message);
    } catch (err) {
      console.warn('[WebRTC] send failed', err);
    }
  }

  /** Host -> one peer. */
  sendTo(peerId: string, message: HostMessage): void {
    const connection = this.connections.get(peerId);
    if (!connection?.open) return;
    try {
      connection.send(message);
    } catch (err) {
      console.warn('[WebRTC] send failed', err);
    }
  }

  /** Host -> everyone. */
  broadcast(message: HostMessage, exceptPeerId?: string): void {
    for (const [peerId, connection] of this.connections) {
      if (peerId === exceptPeerId) continue;
      if (!connection.open) continue;
      try {
        connection.send(message);
      } catch (err) {
        console.warn('[WebRTC] broadcast failed', err);
      }
    }
  }

  disconnectPeer(peerId: string): void {
    this.connections.get(peerId)?.close();
    this.connections.delete(peerId);
  }

  close(): void {
    this.intentionalClose = true;
    if (this.roleValue === 'host') {
      this.broadcast({ type: 'host_closing', reason: 'The host left.' });
    }
    for (const connection of this.connections.values()) connection.close();
    this.connections.clear();
    this.hostConnection?.close();
    this.hostConnection = null;
    this.signaling.close();
    this.roleValue = 'offline';
    this.selfId = '';
    this.roomCodeValue = '';
  }
}

function parse(data: unknown): NetMessage | null {
  if (typeof data === 'string') {
    try {
      return JSON.parse(data) as NetMessage;
    } catch {
      return null;
    }
  }
  if (data && typeof data === 'object' && 'type' in (data as Record<string, unknown>)) {
    return data as NetMessage;
  }
  return null;
}
