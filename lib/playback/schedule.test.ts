import { describe, expect, it } from "vitest";
import { mixDuration, planPlayback, type MixTrack } from "./schedule";

const track: MixTrack = { beatFirstDownbeat: 0.5, beatDuration: 60.5, vocalOffset: -2, vocalDuration: 32 };

describe("mixDuration", () => {
  it("ends with the vocal when it is shorter than the beat", () => {
    expect(mixDuration(track)).toBe(30);
  });

  it("ends with the beat when the vocal runs past it", () => {
    expect(mixDuration({ ...track, vocalDuration: 100 })).toBe(60);
  });
});

describe("planPlayback", () => {
  it("from the top: beat from its first downbeat, vocal skips the count-in part", () => {
    const plan = planPlayback(track, 0);
    expect(plan.beat).toEqual({ delay: 0, fileOffset: 0.5, duration: 30 });
    expect(plan.vocal).toEqual({ delay: 0, fileOffset: 2, duration: 30 });
  });

  it("from the middle keeps beat and vocal in step", () => {
    const plan = planPlayback(track, 10);
    expect(plan.beat?.fileOffset).toBe(10.5);
    expect(plan.vocal?.fileOffset).toBe(12);
    expect(plan.vocal?.duration).toBe(20);
  });

  it("delays a vocal that starts after the playback point", () => {
    const plan = planPlayback({ ...track, vocalOffset: 3, vocalDuration: 10 }, 0);
    expect(plan.end).toBe(13);
    expect(plan.vocal).toEqual({ delay: 3, fileOffset: 0, duration: 10 });
  });

  it("returns nothing past the end", () => {
    expect(planPlayback(track, 40)).toEqual({ end: 30, beat: null, vocal: null });
  });
});
