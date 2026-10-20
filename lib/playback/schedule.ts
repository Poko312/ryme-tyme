/**
 * How to start a beat + vocal mix from a point on the beat timeline (0 = first downbeat).
 * Shared by the review screen, Recordings page, editor and share page.
 */
export interface MixTrack {
  beatFirstDownbeat: number;
  beatDuration: number;
  /** Beat-timeline position of vocal file t=0 (usually negative: recording starts in the count-in). */
  vocalOffset: number;
  vocalDuration: number;
}

export interface PlaybackPlan {
  /** Where on the beat timeline this mix ends (end of vocal or beat, whichever is first). */
  end: number;
  beat: { delay: number; fileOffset: number; duration: number } | null;
  vocal: { delay: number; fileOffset: number; duration: number } | null;
}

/** Playable length of the mix on the beat timeline. */
export function mixDuration(t: MixTrack): number {
  const beatEnd = t.beatDuration - t.beatFirstDownbeat;
  const vocalEnd = t.vocalOffset + t.vocalDuration;
  return Math.max(0, Math.min(beatEnd, vocalEnd));
}

/**
 * Start playing at beat-timeline position `from`. `delay` is seconds after the chosen start time
 * to begin each source; `fileOffset` is where in each file to begin.
 */
export function planPlayback(t: MixTrack, from: number): PlaybackPlan {
  const end = mixDuration(t);
  const start = Math.min(Math.max(0, from), end);
  const length = end - start;
  if (length <= 0) return { end, beat: null, vocal: null };

  const beat = { delay: 0, fileOffset: t.beatFirstDownbeat + start, duration: length };

  // Vocal file time that corresponds to `start`:
  const vocalPos = start - t.vocalOffset;
  let vocal: PlaybackPlan["vocal"];
  if (vocalPos >= 0) {
    vocal = vocalPos < t.vocalDuration ? { delay: 0, fileOffset: vocalPos, duration: Math.min(length, t.vocalDuration - vocalPos) } : null;
  } else {
    // vocal starts later than `start`
    const delay = -vocalPos;
    vocal = delay < length ? { delay, fileOffset: 0, duration: Math.min(length - delay, t.vocalDuration) } : null;
  }
  return { end, beat, vocal };
}
