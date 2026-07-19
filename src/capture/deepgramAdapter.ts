/**
 * Live mic capture → server-side STT.
 *
 * getUserMedia constraints are LOAD-BEARING (BUILD_SPEC): all three of
 * echoCancellation / noiseSuppression / autoGainControl are OFF so Chrome does not
 * strip the ambient chaos we deliberately stress-test. MediaRecorder accumulates the
 * whole take; every few seconds the growing blob is re-POSTed to the STT function
 * (each blob is self-contained, so no chunk-boundary word loss) and the returned
 * word-timed transcript replaces the utterance list. The vendor key stays server-side.
 */

import type { Utterance } from '../types.ts';
import { postStt } from './adapter.ts';

const REPOST_MS = 5000;

export interface MicCaptureOpts {
  onUtterances: (u: Utterance[]) => void;
  onError: (msg: string) => void;
}

export class MicCapture {
  private stream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private busy = false;
  private opts: MicCaptureOpts;

  constructor(opts: MicCaptureOpts) {
    this.opts = opts;
  }

  async start(): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
    const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm';
    this.recorder = new MediaRecorder(this.stream, { mimeType: mime });
    this.recorder.ondataavailable = (e) => { if (e.data.size) this.chunks.push(e.data); };
    this.recorder.start(1000); // gather in 1s slices; we always re-POST the full blob
    this.timer = setInterval(() => void this.flush(mime), REPOST_MS);
  }

  private async flush(mime: string): Promise<void> {
    if (this.busy || !this.chunks.length) return;
    this.busy = true;
    try {
      const blob = new Blob(this.chunks, { type: mime });
      const utterances = await postStt(blob);
      this.opts.onUtterances(utterances);
    } catch (e) {
      this.opts.onError(e instanceof Error ? e.message : String(e));
    } finally {
      this.busy = false;
    }
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.recorder?.stop();
    this.stream?.getTracks().forEach((t) => t.stop());
    // one final transcription of the complete take
    const mime = this.recorder?.mimeType ?? 'audio/webm';
    await this.flush(mime);
    this.recorder = null;
    this.stream = null;
  }
}
