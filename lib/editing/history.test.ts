import { describe, expect, it } from "vitest";
import { DEFAULT_EDITS, type RecordingEdits } from "./edits";
import { EMPTY_HISTORY, MAX_UNDO, recordChange, undo, UNDO_GROUP_MS } from "./history";

const withVocal = (v: number): RecordingEdits => ({ ...DEFAULT_EDITS, mix: { ...DEFAULT_EDITS.mix, vocalGain: v } });

describe("edit history", () => {
  it("undoes back to the previous state", () => {
    const h = recordChange(EMPTY_HISTORY, withVocal(1), 0);
    const r = undo(h);
    expect(r.edits).toEqual(withVocal(1));
    expect(undo(r.history).edits).toBeNull();
  });

  it("groups a fast drag into a single undo step", () => {
    let h = EMPTY_HISTORY;
    h = recordChange(h, withVocal(1), 1000); // drag starts from 1.0
    h = recordChange(h, withVocal(1.1), 1050);
    h = recordChange(h, withVocal(1.2), 1100);
    expect(h.past).toEqual([withVocal(1)]);
    expect(undo(h).edits).toEqual(withVocal(1));
  });

  it("separate changes become separate steps", () => {
    let h = recordChange(EMPTY_HISTORY, withVocal(1), 0);
    h = recordChange(h, withVocal(1.5), UNDO_GROUP_MS + 1);
    expect(h.past).toHaveLength(2);
    const first = undo(h);
    expect(first.edits).toEqual(withVocal(1.5));
    expect(undo(first.history).edits).toEqual(withVocal(1));
  });

  it("caps the history length", () => {
    let h = EMPTY_HISTORY;
    for (let i = 0; i < MAX_UNDO + 10; i++) h = recordChange(h, withVocal(i / 100), i * 1000);
    expect(h.past).toHaveLength(MAX_UNDO);
  });
});
