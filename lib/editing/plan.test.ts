import { describe, expect, it } from "vitest";
import type { MixTrack } from "../playback/schedule";
import { DEFAULT_EDITS } from "./edits";
import { CUT_FADE, EDGE_FADE, planEditedPlayback } from "./plan";

// Beat starts 0.5 s into its file; vocal file starts 2 s before bar 0 (count-in).
const mix: MixTrack = { beatFirstDownbeat: 0.5, beatDuration: 60.5, vocalOffset: -2, vocalDuration: 42 }; // mix = 40 s

describe("planEditedPlayback", () => {
  it("without edits plays one beat clip and one vocal clip", () => {
    const plan = planEditedPlayback(mix, DEFAULT_EDITS, 0);
    expect(plan.duration).toBe(40);
    expect(plan.clips).toEqual([
      expect.objectContaining({ track: "beat", delay: 0, fileOffset: 0.5, duration: 40 }),
      expect.objectContaining({ track: "vocal", delay: 0, fileOffset: 2, duration: 40 }),
    ]);
  });

  it("splits around a cut, keeping beat and vocal in step, with short fades", () => {
    const edits = { ...DEFAULT_EDITS, cuts: [{ start: 10, end: 14 }] };
    const plan = planEditedPlayback(mix, edits, 0);
    expect(plan.duration).toBe(36);
    const [beatA, vocalA, beatB, vocalB] = plan.clips;
    expect(beatA).toMatchObject({ delay: 0, fileOffset: 0.5, duration: 10, fadeOut: CUT_FADE });
    expect(vocalA).toMatchObject({ delay: 0, fileOffset: 2, duration: 10 });
    expect(beatB).toMatchObject({ delay: 10, fileOffset: 14.5, duration: 26, fadeIn: CUT_FADE });
    expect(vocalB).toMatchObject({ delay: 10, fileOffset: 16, duration: 26 });
  });

  it("starting mid-way skips earlier segments", () => {
    const edits = { ...DEFAULT_EDITS, cuts: [{ start: 10, end: 14 }] };
    const plan = planEditedPlayback(mix, edits, 12); // output 12 = beat timeline 16
    expect(plan.clips).toHaveLength(2);
    expect(plan.clips[0]).toMatchObject({ track: "beat", delay: 0, fileOffset: 16.5, duration: 24 });
    expect(plan.clips[1]).toMatchObject({ track: "vocal", delay: 0, fileOffset: 18 });
  });

  it("applies trim, with soft edges", () => {
    const plan = planEditedPlayback(mix, { ...DEFAULT_EDITS, trim: { start: 4, end: 20 } }, 0);
    expect(plan.duration).toBe(16);
    expect(plan.clips[0]).toMatchObject({ fileOffset: 4.5, duration: 16, fadeIn: EDGE_FADE, fadeOut: EDGE_FADE });
    expect(plan.clips[1]).toMatchObject({ fileOffset: 6, duration: 16 });
  });

  it("delays a vocal that starts after the beat", () => {
    const plan = planEditedPlayback({ ...mix, vocalOffset: 3, vocalDuration: 10 }, DEFAULT_EDITS, 0);
    expect(plan.duration).toBe(13);
    expect(plan.clips[1]).toMatchObject({ track: "vocal", delay: 3, fileOffset: 0, duration: 10 });
  });

  it("returns nothing past the end", () => {
    expect(planEditedPlayback(mix, DEFAULT_EDITS, 99).clips).toEqual([]);
  });
});
