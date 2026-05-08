/**
 * PeerRTCSyncPanel — WebRTC QR-code pairing UI for Phase 7b.
 *
 * Lets two devices on any network (LAN or internet) sync project state
 * peer-to-peer without a relay server.  The only coordination required is
 * exchanging two short codes (offer + answer) — shown as QR codes for
 * easy mobile scanning.
 *
 * ## Initiator flow (Device A — sends the snapshot)
 *   1. Click "Start sharing" → offer QR + code appear.
 *   2. Other device scans / copies the offer code and pastes their answer.
 *   3. Paste the answer code here → connection opens → snapshot sent.
 *
 * ## Responder flow (Device B — receives the snapshot)
 *   1. Click "Receive from device" → paste-offer text area appears.
 *   2. Paste the offer code from Device A → answer QR + code appear.
 *   3. Device A scans / pastes the answer → snapshot arrives automatically.
 */

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { getProjectStorage } from '@/lib/project-storage';
import { exportPeerSnapshot, importPeerSnapshot } from '@/lib/peer-snapshot';
import {
  PeerRTCTransport,
  type PeerRTCProgress,
  type PeerRTCRole,
} from '@/lib/peer-rtc-transport';
import { cn } from '@/lib/utils';
import { Radio, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import QRCode from 'qrcode';
import { useCallback, useEffect, useRef, useState } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type WizardStep =
  | 'choose-role'
  | 'initiator-offer'    // show offer QR, waiting for answer
  | 'initiator-answer'   // paste answer, connecting
  | 'initiator-sending'  // transferring + done
  | 'responder-offer'    // paste offer code
  | 'responder-answer'   // show answer QR, waiting for data
  | 'responder-done';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function renderQR(text: string, canvas: HTMLCanvasElement) {
  await QRCode.toCanvas(canvas, text, {
    width: 220,
    margin: 2,
    errorCorrectionLevel: 'M',
    color: { dark: '#000000', light: '#ffffff' },
  });
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function QRBlock({ code, label }: { code: string; label: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [qrErr, setQrErr] = useState(false);

  useEffect(() => {
    if (!canvasRef.current || !code) return;
    renderQR(code, canvasRef.current).catch(() => setQrErr(true));
  }, [code]);

  return (
    <div className="flex flex-col items-center gap-3">
      {qrErr ? (
        <p className="text-muted-foreground text-xs">QR too large — copy the code below.</p>
      ) : (
        <canvas ref={canvasRef} className="rounded-md border" />
      )}
      <p className="text-muted-foreground text-xs text-center">{label}</p>
      <Textarea
        readOnly
        value={code}
        rows={3}
        className="font-mono text-[10px] resize-none"
        onClick={(e) => (e.target as HTMLTextAreaElement).select()}
        aria-label="Connection code (read-only)"
      />
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="w-full"
        onClick={async () => {
          try { await navigator.clipboard.writeText(code); } catch { /* ignore */ }
        }}
      >
        Copy code
      </Button>
    </div>
  );
}

function ProgressBar({ value }: { value: number }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
      <div
        className="h-full bg-primary transition-all"
        style={{ width: `${Math.round(value * 100)}%` }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------

export type PeerRTCSyncPanelProps = {
  projectId: string;
  displayName: string;
  onImported?: () => void;
  className?: string;
};

export function PeerRTCSyncPanel({
  projectId,
  displayName,
  onImported,
  className,
}: PeerRTCSyncPanelProps) {
  const storage = getProjectStorage();

  const [step, setStep] = useState<WizardStep>('choose-role');
  const [progress, setProgress] = useState<PeerRTCProgress | null>(null);
  const [offerCode, setOfferCode] = useState('');
  const [answerCode, setAnswerCode] = useState('');
  const [pasteCode, setPasteCode] = useState('');

  const transportRef = useRef<PeerRTCTransport | null>(null);
  const roleRef = useRef<PeerRTCRole>('initiator');

  const onProg = useCallback((p: PeerRTCProgress) => setProgress(p), []);

  // Cleanup on unmount
  useEffect(() => () => { transportRef.current?.destroy(); }, []);

  // ── Initiator ─────────────────────────────────────────────────────────────

  const startInitiator = useCallback(async () => {
    roleRef.current = 'initiator';
    const t = new PeerRTCTransport(onProg);
    transportRef.current = t;
    setStep('initiator-offer');
    try {
      const code = await t.createOffer();
      setOfferCode(code);
    } catch (e) {
      setProgress({ state: 'error', message: 'Failed to create offer.', error: String(e) });
    }
  }, [onProg]);

  const submitAnswer = useCallback(async () => {
    if (!pasteCode.trim() || !transportRef.current) return;
    setStep('initiator-answer');
    try {
      await transportRef.current.finalizeAnswer(pasteCode.trim());
      // Wait for channel open (progress will emit state === 'open')
      // Then send snapshot automatically
    } catch (e) {
      setProgress({ state: 'error', message: 'Invalid answer code.', error: String(e) });
    }
  }, [pasteCode]);

  // When channel opens (initiator side), send the snapshot automatically
  useEffect(() => {
    if (progress?.state !== 'open' || roleRef.current !== 'initiator') return;
    setStep('initiator-sending');
    void (async () => {
      try {
        const { blob, filename } = await exportPeerSnapshot({ storage, projectId, displayName });
        const ack = await transportRef.current!.sendSnapshot(blob, filename);
        setProgress({
          state: 'done',
          message: `Peer merged ${ack.importedCount} file(s), ${ack.conflictCount} conflict(s).`,
        });
      } catch (e) {
        setProgress({ state: 'error', message: 'Snapshot transfer failed.', error: String(e) });
      }
    })();
  }, [progress?.state]);

  // ── Responder ─────────────────────────────────────────────────────────────

  const startResponder = useCallback(() => {
    roleRef.current = 'responder';
    setStep('responder-offer');
  }, []);

  const submitOffer = useCallback(async () => {
    if (!pasteCode.trim()) return;
    const t = new PeerRTCTransport(onProg);
    transportRef.current = t;
    setStep('responder-answer');

    const onSnapshot = async (blob: Blob) => {
      try {
        const { importedPaths, conflicts } = await importPeerSnapshot({ storage, projectId, file: blob });
        if (conflicts.length > 0) {
          await storage.updateProject(projectId, { pendingConflicts: conflicts });
        }
        t.sendAck({ importedCount: importedPaths.length, conflictCount: conflicts.length });
        onImported?.();
        setStep('responder-done');
      } catch (e) {
        setProgress({ state: 'error', message: 'Merge failed.', error: String(e) });
      }
    };

    try {
      const code = await t.acceptOffer(pasteCode.trim(), onSnapshot);
      setAnswerCode(code);
    } catch (e) {
      setProgress({ state: 'error', message: 'Invalid offer code.', error: String(e) });
    }
  }, [pasteCode, onProg, storage, projectId, onImported]);

  // ── Reset ──────────────────────────────────────────────────────────────────

  const reset = useCallback(() => {
    transportRef.current?.destroy();
    transportRef.current = null;
    setStep('choose-role');
    setProgress(null);
    setOfferCode('');
    setAnswerCode('');
    setPasteCode('');
  }, []);

  // ── Render ─────────────────────────────────────────────────────────────────

  const isError = progress?.state === 'error';
  const isDone = progress?.state === 'done' || step === 'responder-done';

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex items-center gap-2">
        <Radio className="size-4 text-muted-foreground shrink-0" aria-hidden />
        <h3 className="text-sm font-semibold">Real-time device sync (WebRTC)</h3>
        <span className="ml-auto rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-900 dark:text-amber-200">
          Beta
        </span>
      </div>

      <p className="text-muted-foreground text-sm leading-relaxed">
        Sync directly with another device over Wi-Fi or the internet — no
        server required. Exchange two short codes (or QR scans) once to pair,
        then the snapshot transfers peer-to-peer.
      </p>

      {/* ── Step: choose role ── */}
      {step === 'choose-role' && (
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="secondary" className="gap-2" onClick={() => void startInitiator()}>
            Send my edits to another device
          </Button>
          <Button type="button" size="sm" variant="outline" className="gap-2" onClick={startResponder}>
            Receive edits from another device
          </Button>
        </div>
      )}

      {/* ── Initiator: show offer QR, collect answer ── */}
      {step === 'initiator-offer' && (
        <div className="space-y-4">
          <p className="text-sm font-medium">Step 1 — Share this code with the other device</p>
          {offerCode ? (
            <QRBlock code={offerCode} label="Scan with the other device or copy the code below" />
          ) : (
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Loader2 className="size-4 animate-spin" /> Gathering connection info…
            </div>
          )}
          {offerCode && (
            <>
              <p className="text-sm font-medium">Step 2 — Paste the answer code from the other device</p>
              <Textarea
                value={pasteCode}
                onChange={(e) => setPasteCode(e.target.value)}
                rows={3}
                placeholder="Paste answer code here…"
                className="font-mono text-[10px] resize-none"
              />
              <Button type="button" size="sm" disabled={!pasteCode.trim()} onClick={() => void submitAnswer()}>
                Connect &amp; send snapshot
              </Button>
            </>
          )}
          <Button type="button" size="sm" variant="ghost" onClick={reset}>Cancel</Button>
        </div>
      )}

      {/* ── Initiator: connecting + sending ── */}
      {(step === 'initiator-answer' || step === 'initiator-sending') && (
        <div className="space-y-3">
          {progress?.progress !== undefined && <ProgressBar value={progress.progress} />}
          <p className="text-sm text-muted-foreground">{progress?.message ?? 'Connecting…'}</p>
          {!isDone && !isError && <Button type="button" size="sm" variant="ghost" onClick={reset}>Cancel</Button>}
        </div>
      )}

      {/* ── Responder: paste offer ── */}
      {step === 'responder-offer' && (
        <div className="space-y-3">
          <p className="text-sm font-medium">Paste the offer code from the other device</p>
          <Textarea
            value={pasteCode}
            onChange={(e) => setPasteCode(e.target.value)}
            rows={3}
            placeholder="Paste offer code here…"
            className="font-mono text-[10px] resize-none"
          />
          <div className="flex gap-2">
            <Button type="button" size="sm" disabled={!pasteCode.trim()} onClick={() => void submitOffer()}>
              Generate answer &amp; connect
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={reset}>Cancel</Button>
          </div>
        </div>
      )}

      {/* ── Responder: show answer QR + wait for data ── */}
      {step === 'responder-answer' && (
        <div className="space-y-4">
          {answerCode ? (
            <>
              <p className="text-sm font-medium">Share this answer code with the other device</p>
              <QRBlock code={answerCode} label="Scan or copy — then wait for the snapshot to arrive" />
            </>
          ) : (
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Loader2 className="size-4 animate-spin" /> Preparing answer…
            </div>
          )}
          {progress && (
            <>
              {progress.progress !== undefined && <ProgressBar value={progress.progress} />}
              <p className="text-sm text-muted-foreground">{progress.message}</p>
            </>
          )}
          {!isError && <Button type="button" size="sm" variant="ghost" onClick={reset}>Cancel</Button>}
        </div>
      )}

      {/* ── Responder done ── */}
      {step === 'responder-done' && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">{progress?.message ?? 'Sync complete.'}</p>
          <Button type="button" size="sm" variant="secondary" onClick={reset}>Done</Button>
        </div>
      )}

      {/* ── Shared: error / done banners ── */}
      {isError && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          <XCircle className="size-4 shrink-0 mt-0.5" aria-hidden />
          <div>
            <p className="font-medium">Connection error</p>
            <p>{progress?.error}</p>
          </div>
        </div>
      )}

      {isDone && !isError && (
        <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
          <CheckCircle2 className="size-4 shrink-0" aria-hidden />
          {progress?.message ?? 'Sync complete.'}
        </div>
      )}

      {isDone && (
        <Button type="button" size="sm" variant="ghost" onClick={reset}>
          Start another sync
        </Button>
      )}
    </div>
  );
}
