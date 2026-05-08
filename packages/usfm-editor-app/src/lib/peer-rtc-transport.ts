/**
 * peer-rtc-transport — serverless WebRTC peer sync for Phase 7b.
 *
 * Two devices pair by exchanging an offer/answer SDP blob (shown as a QR code
 * or copyable text — no relay server required).  Once paired the devices
 * stream a project snapshot zip over an RTCDataChannel.
 *
 * ## Pairing flow
 *
 *   Device A (initiator)                  Device B (responder)
 *   ────────────────────                  ────────────────────
 *   createOffer() → offerCode             ─────────────────────────────→
 *                                         acceptOffer(offerCode) → answerCode
 *   finalizeAnswer(answerCode)            ←─────────────────────────────
 *   ── data channel opens ──
 *   sendSnapshot(blob)                    ─────── chunks ──────────────→
 *                                         onSnapshot(blob) fires
 *
 * ## No-server guarantee
 *
 * ICE gathering waits for `complete` before exposing the SDP so that all
 * host (LAN IP) candidates are embedded in the code.  For same-LAN devices
 * no STUN server is required; the single Google STUN entry handles NAT
 * traversal for internet peers (optional).
 *
 * ## Data-channel protocol
 *
 *   → "HEADER:<totalBytes>:<filename>"  — announces incoming transfer
 *   → ArrayBuffer (repeated chunks)     — raw zip bytes, CHUNK_SIZE each
 *   → "DONE"                            — transfer complete
 *   ← "ACK:<importedCount>:<conflicts>" — responder reports merge result
 */

const CHUNK_SIZE = 16 * 1024; // 16 KB per chunk
const ICE_TIMEOUT_MS = 10_000; // max wait for ICE gathering

const ICE_SERVERS: RTCIceServer[] = [
  // Google STUN — only used for NAT traversal; no data passes through it.
  // Remove if you want a fully self-contained LAN-only deployment.
  { urls: 'stun:stun.l.google.com:19302' },
];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PeerRTCRole = 'initiator' | 'responder';

export type PeerRTCState =
  | 'idle'
  | 'gathering'      // waiting for ICE candidates
  | 'waiting-answer' // initiator waiting for responder's answer code
  | 'connecting'     // ICE/DTLS handshake in progress
  | 'open'           // data channel open, ready to send/receive
  | 'sending'        // transfer in progress (initiator)
  | 'receiving'      // transfer in progress (responder)
  | 'done'           // transfer complete
  | 'error';

export type PeerRTCProgress = {
  state: PeerRTCState;
  /** 0–1 during sending/receiving, undefined otherwise. */
  progress?: number;
  /** Human-readable status message. */
  message: string;
  /** Set when state === 'error'. */
  error?: string;
};

export type PeerRTCAckPayload = { importedCount: number; conflictCount: number };

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------

export class PeerRTCTransport {
  private readonly pc: RTCPeerConnection;
  private channel: RTCDataChannel | null = null;
  private onProgress: (p: PeerRTCProgress) => void;

  // Receiving state
  private _recvTotalBytes = 0;
  private _recvFilename = '';
  private _recvChunks: ArrayBuffer[] = [];
  private _recvBytes = 0;
  private _onSnapshot: ((blob: Blob, filename: string) => void) | null = null;

  // Ack callback (initiator)
  private _onAck: ((ack: PeerRTCAckPayload) => void) | null = null;

  constructor(onProgress: (p: PeerRTCProgress) => void) {
    this.onProgress = onProgress;
    this.pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    this.pc.addEventListener('connectionstatechange', () => {
      if (this.pc.connectionState === 'failed') {
        this._emit({ state: 'error', message: 'Connection failed.', error: 'ICE/DTLS connection failed' });
      }
    });
  }

  // ── Initiator ─────────────────────────────────────────────────────────────

  /**
   * Step 1 (initiator): create an offer and wait for ICE gathering to finish.
   * Returns a compact base64 string safe for QR codes / text sharing.
   */
  async createOffer(): Promise<string> {
    this._emit({ state: 'gathering', message: 'Setting up connection…' });

    this.channel = this.pc.createDataChannel('sync', { ordered: true });
    this._wireChannel(this.channel);

    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    await this._waitICE();

    const code = this._encode(this.pc.localDescription!);
    this._emit({ state: 'waiting-answer', message: 'Share the offer code with the other device.' });
    return code;
  }

  /**
   * Step 3 (initiator): apply the answer code received from the responder.
   * The data channel will open shortly after.
   */
  async finalizeAnswer(answerCode: string): Promise<void> {
    this._emit({ state: 'connecting', message: 'Connecting to peer…' });
    const desc = this._decode(answerCode);
    await this.pc.setRemoteDescription(desc);
  }

  // ── Responder ─────────────────────────────────────────────────────────────

  /**
   * Step 2 (responder): accept the initiator's offer and return an answer code.
   * Also registers `onSnapshot` — called when the transfer is complete.
   */
  async acceptOffer(
    offerCode: string,
    onSnapshot: (blob: Blob, filename: string) => void,
  ): Promise<string> {
    this._emit({ state: 'gathering', message: 'Preparing answer…' });
    this._onSnapshot = onSnapshot;

    this.pc.addEventListener('datachannel', (ev) => {
      this.channel = ev.channel;
      this._wireChannel(this.channel);
    });

    const desc = this._decode(offerCode);
    await this.pc.setRemoteDescription(desc);
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    await this._waitICE();

    const code = this._encode(this.pc.localDescription!);
    this._emit({ state: 'connecting', message: 'Answer ready — waiting for initiator to connect.' });
    return code;
  }

  // ── Data transfer (initiator → responder) ─────────────────────────────────

  /**
   * Send a project snapshot zip over the open data channel.
   * Resolves with the ACK payload once the responder confirms the import.
   */
  sendSnapshot(blob: Blob, filename: string): Promise<PeerRTCAckPayload> {
    return new Promise((resolve, reject) => {
      if (!this.channel || this.channel.readyState !== 'open') {
        reject(new Error('Data channel is not open'));
        return;
      }
      this._onAck = resolve;

      const total = blob.size;
      this.channel.send(`HEADER:${total}:${filename}`);
      this._emit({ state: 'sending', message: 'Sending snapshot…', progress: 0 });

      let offset = 0;
      const send = () => {
        const slice = blob.slice(offset, offset + CHUNK_SIZE);
        slice.arrayBuffer().then((buf) => {
          this.channel!.send(buf);
          offset += buf.byteLength;
          const pct = offset / total;
          this._emit({ state: 'sending', message: `Sending… ${Math.round(pct * 100)}%`, progress: pct });
          if (offset < total) {
            if (this.channel!.bufferedAmount > CHUNK_SIZE * 4) {
              // Back-pressure: wait for buffer to drain
              this.channel!.addEventListener('bufferedamountlow', send, { once: true });
              this.channel!.bufferedAmountLowThreshold = CHUNK_SIZE;
            } else {
              send();
            }
          } else {
            this.channel!.send('DONE');
            this._emit({ state: 'sending', message: 'Transfer complete — waiting for merge result…', progress: 1 });
          }
        }).catch(reject);
      };
      send();
    });
  }

  // ── Cleanup ───────────────────────────────────────────────────────────────

  destroy() {
    this.channel?.close();
    this.pc.close();
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private _wireChannel(ch: RTCDataChannel) {
    ch.binaryType = 'arraybuffer';
    ch.addEventListener('open', () => {
      this._emit({ state: 'open', message: 'Connected — ready to sync.' });
    });
    ch.addEventListener('message', (ev) => this._handleMessage(ev));
    ch.addEventListener('error', (ev) => {
      const msg = (ev as RTCErrorEvent).error?.message ?? 'Data channel error';
      this._emit({ state: 'error', message: msg, error: msg });
    });
  }

  private _handleMessage(ev: MessageEvent) {
    if (typeof ev.data === 'string') {
      if (ev.data.startsWith('HEADER:')) {
        const [, totalStr, ...rest] = ev.data.split(':');
        this._recvTotalBytes = parseInt(totalStr!, 10);
        this._recvFilename = rest.join(':');
        this._recvChunks = [];
        this._recvBytes = 0;
        this._emit({ state: 'receiving', message: 'Receiving snapshot…', progress: 0 });
      } else if (ev.data === 'DONE') {
        const merged = new Blob(this._recvChunks, { type: 'application/zip' });
        this._emit({ state: 'receiving', message: 'Transfer complete — merging…', progress: 1 });
        this._onSnapshot?.(merged, this._recvFilename);
      } else if (ev.data.startsWith('ACK:')) {
        const [, imported, conflicts] = ev.data.split(':');
        const ack: PeerRTCAckPayload = {
          importedCount: parseInt(imported!, 10),
          conflictCount: parseInt(conflicts!, 10),
        };
        this._emit({ state: 'done', message: `Sync complete — ${ack.importedCount} file(s) merged, ${ack.conflictCount} conflict(s).` });
        this._onAck?.(ack);
      }
    } else if (ev.data instanceof ArrayBuffer) {
      this._recvChunks.push(ev.data);
      this._recvBytes += ev.data.byteLength;
      const pct = this._recvTotalBytes > 0 ? this._recvBytes / this._recvTotalBytes : 0;
      this._emit({ state: 'receiving', message: `Receiving… ${Math.round(pct * 100)}%`, progress: pct });
    }
  }

  /** Send ACK back to initiator after a successful import (called by UI layer). */
  sendAck(ack: PeerRTCAckPayload) {
    this.channel?.send(`ACK:${ack.importedCount}:${ack.conflictCount}`);
    this._emit({ state: 'done', message: `Merged ${ack.importedCount} file(s), ${ack.conflictCount} conflict(s).` });
  }

  private _emit(p: PeerRTCProgress) {
    this.onProgress(p);
  }

  private _encode(desc: RTCSessionDescription | RTCSessionDescriptionInit): string {
    return btoa(JSON.stringify({ type: desc.type, sdp: desc.sdp }));
  }

  private _decode(code: string): RTCSessionDescriptionInit {
    return JSON.parse(atob(code)) as RTCSessionDescriptionInit;
  }

  private _waitICE(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.pc.iceGatheringState === 'complete') { resolve(); return; }
      const timer = setTimeout(() => {
        // Timeout: proceed with whatever candidates we have
        resolve();
      }, ICE_TIMEOUT_MS);
      const handler = () => {
        if (this.pc.iceGatheringState === 'complete') {
          clearTimeout(timer);
          this.pc.removeEventListener('icegatheringstatechange', handler);
          resolve();
        }
      };
      this.pc.addEventListener('icegatheringstatechange', handler);
    });
  }
}
