/**
 * Loopback-Mock für RTCPeerConnection + RTCDataChannel.
 * Bildet den realen Ablauf nach (Offer -> Answer -> ICE -> ondatachannel -> open)
 * und stellt eine echte Zustellung zwischen zwei Peers her, damit sich
 * WebRTCManager und NetworkManager ohne Browser testen lassen.
 */
const REGISTRY = new Map();
let nextId = 1;
export const NETSTATS = { sent: 0, dropped: 0, dropRate: 0 };

const soon = (fn) => setTimeout(fn, 0);

class FakeChannel {
  constructor(label, opts = {}) {
    this.label = label;
    this.ordered = opts.ordered !== false;
    this.maxRetransmits = opts.maxRetransmits;
    this.readyState = 'connecting';
    this.peer = null;
    this.binaryType = '';
    this.onopen = null; this.onclose = null; this.onmessage = null;
  }
  get reliable() { return this.maxRetransmits === undefined; }
  send(data) {
    if (this.readyState !== 'open') throw new Error('channel not open');
    NETSTATS.sent++;
    if (!this.reliable && Math.random() < NETSTATS.dropRate) { NETSTATS.dropped++; return; }
    const p = this.peer;
    soon(() => { if (p && p.readyState === 'open') p.onmessage?.({ data }); });
  }
  close() {
    if (this.readyState === 'closed') return;
    this.readyState = 'closed';
    soon(() => this.onclose?.({}));
    const p = this.peer;
    if (p && p.readyState !== 'closed') { p.readyState = 'closed'; soon(() => p.onclose?.({})); }
  }
  _open() { this.readyState = 'open'; soon(() => this.onopen?.({})); }
}

export class FakeRTCPeerConnection {
  constructor() {
    this.id = nextId++;
    REGISTRY.set(this.id, this);
    this.localDescription = null;
    this.remoteDescription = null;
    this.iceGatheringState = 'new';
    this.connectionState = 'new';
    this.signalingState = 'stable';
    this._created = [];
    this._peer = null;
    this._linked = false;
    this.onicecandidate = null;
    this.onicegatheringstatechange = null;
    this.onconnectionstatechange = null;
    this.ondatachannel = null;
  }

  createDataChannel(label, opts) {
    const ch = new FakeChannel(label, opts);
    this._created.push(ch);
    return ch;
  }

  async createOffer() { return { type: 'offer', sdp: `v=0 from=${this.id}` }; }
  async createAnswer() { return { type: 'answer', sdp: `v=0 from=${this.id}` }; }

  async setLocalDescription(d) {
    this.localDescription = { type: d.type, sdp: d.sdp };
    // ICE-Kandidaten trickeln, danach ist das Gathering abgeschlossen
    soon(() => {
      this.onicecandidate?.({ candidate: { toJSON: () => ({ candidate: 'fake', sdpMLineIndex: 0 }) } });
      this.iceGatheringState = 'complete';
      this.onicegatheringstatechange?.({});
      this.onicecandidate?.({ candidate: null });
    });
  }

  async setRemoteDescription(d) {
    this.remoteDescription = { type: d.type, sdp: d.sdp };
    const m = /from=(\d+)/.exec(d.sdp);
    if (m) {
      this._peer = REGISTRY.get(Number(m[1]));
      if (this._peer) this._peer._peer = this;
    }
    if (this.localDescription && this._peer?.localDescription) this._link();
  }

  async addIceCandidate() { /* no-op */ }

  _link() {
    const a = this._peer, b = this;
    if (a._linked || b._linked) return;
    a._linked = b._linked = true;
    // Der Initiator hat die Channels erzeugt -> Gegenstelle bekommt ondatachannel
    const [origin, target] = a._created.length ? [a, b] : [b, a];
    for (const ch of origin._created) {
      const mirror = new FakeChannel(ch.label, { ordered: ch.ordered, maxRetransmits: ch.maxRetransmits });
      ch.peer = mirror; mirror.peer = ch;
      soon(() => {
        target.ondatachannel?.({ channel: mirror });
        ch._open();
        mirror._open();
      });
    }
    soon(() => {
      a.connectionState = b.connectionState = 'connected';
      a.onconnectionstatechange?.({}); b.onconnectionstatechange?.({});
    });
  }

  close() {
    if (this.connectionState === 'closed') return;
    this.connectionState = 'closed';
    for (const ch of this._created) ch.close();
    REGISTRY.delete(this.id);
    soon(() => this.onconnectionstatechange?.({}));
  }
}

export function installWebRTCMock() {
  globalThis.RTCPeerConnection = FakeRTCPeerConnection;
  globalThis.RTCSessionDescription = class { constructor(d) { this.type = d.type; this.sdp = d.sdp; } };
  globalThis.RTCIceCandidate = class { constructor(c) { Object.assign(this, c); } };
}
