const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:global.stun.twilio.com:3478' },
];

/**
 * Verwaltet alle RTCPeerConnections (Full Mesh, bis 8 Spieler).
 * Pro Peer zwei DataChannels:
 *   - "state"  unreliable/unordered -> Positions-Snapshots (20 Hz)
 *   - "main"   reliable/ordered     -> Lobby, Match-Events, Treffer
 */
export class WebRTCManager {
  constructor(signaling) {
    this.signaling = signaling;
    this.peers = new Map();   // id -> { pc, state, main, ready }
    this.onOpen = () => {};
    this.onClose = () => {};
    this.onMessage = () => {};
    this.onStatus = () => {};

    signaling.onPeerJoined = (id, initiate) => this.connect(id, initiate);
    signaling.onPeerLeft = (id) => this.disconnect(id);
    signaling.onSignal = (from, data) => this.handleSignal(from, data);
  }

  get peerIds() { return [...this.peers.keys()]; }
  get openCount() { return [...this.peers.values()].filter((p) => p.ready).length; }

  connect(id, initiate) {
    if (this.peers.has(id)) return this.peers.get(id);
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    const peer = { id, pc, state: null, main: null, ready: false, initiate, queue: [] };
    this.peers.set(id, peer);

    pc.onicecandidate = (e) => {
      if (this.signaling.needsBundledIce) return;
      if (e.candidate) this.signaling.send(id, { type: 'candidate', candidate: e.candidate.toJSON() });
    };
    pc.onicegatheringstatechange = () => {
      if (this.signaling.needsBundledIce && pc.iceGatheringState === 'complete' && pc.localDescription) {
        this.signaling.send(id, { type: 'sdp', sdp: pc.localDescription.toJSON ? pc.localDescription.toJSON() : { type: pc.localDescription.type, sdp: pc.localDescription.sdp } });
      }
    };
    pc.onconnectionstatechange = () => {
      this.onStatus(`${id}: ${pc.connectionState}`);
      // "disconnected" ist häufig nur ein kurzer ICE-Aussetzer und erholt sich
      // wieder — nur endgültige Zustände trennen die Verbindung.
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') this.disconnect(id);
    };
    pc.ondatachannel = (e) => this._bindChannel(peer, e.channel);

    if (initiate) {
      const st = pc.createDataChannel('state', { ordered: false, maxRetransmits: 0 });
      const mn = pc.createDataChannel('main', { ordered: true });
      this._bindChannel(peer, st);
      this._bindChannel(peer, mn);
      this._makeOffer(peer);
    }
    return peer;
  }

  async _makeOffer(peer) {
    try {
      const offer = await peer.pc.createOffer();
      await peer.pc.setLocalDescription(offer);
      if (!this.signaling.needsBundledIce) {
        this.signaling.send(peer.id, { type: 'sdp', sdp: { type: offer.type, sdp: offer.sdp } });
      }
    } catch (e) { this.onStatus('Offer-Fehler: ' + e.message); }
  }

  async handleSignal(from, data) {
    let peer = this.peers.get(from);
    if (!peer) peer = this.connect(from, false);
    const pc = peer.pc;
    try {
      if (data.type === 'sdp') {
        await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
        for (const c of peer.queue) await pc.addIceCandidate(new RTCIceCandidate(c));
        peer.queue.length = 0;
        if (data.sdp.type === 'offer') {
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          if (!this.signaling.needsBundledIce) {
            this.signaling.send(from, { type: 'sdp', sdp: { type: answer.type, sdp: answer.sdp } });
          }
        }
      } else if (data.type === 'candidate') {
        if (pc.remoteDescription && pc.remoteDescription.type) {
          await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
        } else peer.queue.push(data.candidate);
      }
    } catch (e) { this.onStatus('Signal-Fehler: ' + e.message); }
  }

  _bindChannel(peer, ch) {
    if (ch.label === 'state') peer.state = ch; else peer.main = ch;
    const opened = () => {
      if (peer.main?.readyState === 'open' && !peer.ready) {
        peer.ready = true;
        this.onOpen(peer.id);
      }
    };
    ch.onopen = opened;
    // Kanäle aus ondatachannel können bereits offen sein -> onopen käme nie
    if (ch.readyState === 'open') opened();
    ch.onclose = () => {
      if (peer.ready && peer.main?.readyState !== 'open') {
        peer.ready = false;
        this.onClose(peer.id);
      }
    };
    ch.onmessage = (e) => {
      let msg; try { msg = JSON.parse(e.data); } catch { return; }
      this.onMessage(peer.id, msg);
    };
  }

  send(id, msg, reliable = true) {
    const peer = this.peers.get(id);
    if (!peer) return;
    const ch = reliable ? peer.main : (peer.state || peer.main);
    if (ch && ch.readyState === 'open') {
      try { ch.send(JSON.stringify(msg)); } catch {}
    }
  }

  broadcast(msg, reliable = true) {
    for (const id of this.peers.keys()) this.send(id, msg, reliable);
  }

  disconnect(id) {
    const peer = this.peers.get(id);
    if (!peer) return;
    const wasReady = peer.ready;
    peer.ready = false;              // verhindert ein zweites Close-Event aus ch.onclose
    this.peers.delete(id);
    try { peer.pc.close(); } catch {}
    if (wasReady) this.onClose(id);
  }

  closeAll() {
    for (const id of [...this.peers.keys()]) this.disconnect(id);
  }
}
