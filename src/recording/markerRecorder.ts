/**
 * Records the mic through the shared AudioContext with MediaRecorder, and stamps a short marker
 * tone into the recording at a known audio-clock time. Finding the marker in the decoded file
 * tells us exactly how the file lines up with the beat — regardless of recorder start-up delay or
 * encoder padding, which differ between browsers.
 */

const MARKER_FREQ = 3000;
const MARKER_SECONDS = 0.004;
const MARKER_LEVEL = 0.8;
/** Mic stays muted until just after the marker so it is the first sound in the file. */
const MIC_OPEN_AFTER_MARKER = 0.03;
const MARKER_SEARCH_SECONDS = 3;
const MARKER_THRESHOLD = 0.25;

const MIME_PREFERENCE = [
  "audio/mp4;codecs=mp4a.40.2", // AAC — iPhone, and plays everywhere
  "audio/mp4",
  "audio/webm;codecs=opus", // Chrome on Linux, Firefox
  "audio/webm",
  "audio/ogg;codecs=opus",
];

export function pickRecordingMimeType(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  return MIME_PREFERENCE.find((m) => MediaRecorder.isTypeSupported(m)) ?? null;
}

/** Content type without codec parameters, for storage. */
export function baseMimeType(mime: string): string {
  return mime.split(";")[0].trim();
}

export function extensionFor(mime: string): string {
  const base = baseMimeType(mime);
  if (base === "audio/mp4") return "m4a";
  if (base === "audio/webm") return "webm";
  if (base === "audio/ogg") return "ogg";
  return "audio";
}

export interface RecordingResult {
  blob: Blob;
  mimeType: string;
  markerContextTime: number;
}

export class MarkerRecorder {
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private nodes: AudioNode[] = [];
  private markerTime = 0;
  private mimeType = "";

  constructor(
    private readonly ctx: AudioContext,
    private readonly stream: MediaStream,
  ) {}

  /** Starts recording; resolves once capture is running and the marker is scheduled. */
  async start(): Promise<{ markerContextTime: number }> {
    const mime = pickRecordingMimeType();
    if (!mime) throw new Error("Recording isn't supported in this browser.");
    this.mimeType = mime;

    const ctx = this.ctx;
    const destination = ctx.createMediaStreamDestination();
    const mic = ctx.createMediaStreamSource(this.stream);
    const micGate = ctx.createGain();
    micGate.gain.value = 0;
    mic.connect(micGate).connect(destination);
    this.nodes.push(mic, micGate, destination);

    const recorder = new MediaRecorder(destination.stream, { mimeType: mime, audioBitsPerSecond: 128_000 });
    this.recorder = recorder;
    this.chunks = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };
    await new Promise<void>((resolve, reject) => {
      recorder.onstart = () => resolve();
      recorder.onerror = () => reject(new Error("Recorder failed to start."));
      recorder.start(1000);
    });

    // Marker goes only into the recording, never to the speakers.
    const at = ctx.currentTime + 0.05;
    const osc = ctx.createOscillator();
    const markerGain = ctx.createGain();
    osc.frequency.value = MARKER_FREQ;
    markerGain.gain.value = MARKER_LEVEL;
    osc.connect(markerGain).connect(destination);
    osc.start(at);
    osc.stop(at + MARKER_SECONDS);
    this.nodes.push(osc, markerGain);

    micGate.gain.setValueAtTime(0, ctx.currentTime);
    micGate.gain.setValueAtTime(1, at + MARKER_SECONDS + MIC_OPEN_AFTER_MARKER);

    this.markerTime = at;
    return { markerContextTime: at };
  }

  async stop(): Promise<RecordingResult> {
    const recorder = this.recorder;
    if (!recorder) throw new Error("Not recording.");
    if (recorder.state !== "inactive") {
      await new Promise<void>((resolve) => {
        recorder.onstop = () => resolve();
        recorder.stop();
      });
    }
    this.dispose();
    return {
      blob: new Blob(this.chunks, { type: baseMimeType(this.mimeType) }),
      mimeType: this.mimeType,
      markerContextTime: this.markerTime,
    };
  }

  /** Abandon the recording (e.g. leaving the page). */
  cancel() {
    if (this.recorder && this.recorder.state !== "inactive") {
      this.recorder.onstop = null;
      this.recorder.stop();
    }
    this.dispose();
  }

  private dispose() {
    for (const n of this.nodes) n.disconnect();
    this.nodes = [];
    this.recorder = null;
  }
}

/** Seconds into the decoded recording where the marker tone starts (null if not found). */
export function findMarker(buffer: AudioBuffer): number | null {
  const data = buffer.getChannelData(0);
  const limit = Math.min(data.length, Math.round(MARKER_SEARCH_SECONDS * buffer.sampleRate));
  for (let i = 0; i < limit; i++) {
    if (Math.abs(data[i]) >= MARKER_THRESHOLD) return i / buffer.sampleRate;
  }
  return null;
}

export async function decodeRecording(ctx: AudioContext, blob: Blob): Promise<AudioBuffer> {
  return ctx.decodeAudioData(await blob.arrayBuffer());
}
