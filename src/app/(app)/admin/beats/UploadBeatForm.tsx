"use client";

import { startTransition, useActionState, useState } from "react";
import { detectLeadingSilence, formatDuration } from "@lib/beats/library";
import { getAudioContext } from "@/audio/context";
import { buttonClass, inputClass, labelClass } from "@/components/ui";
import { createClient } from "@/supabase/browser";
import { createBeat, type BeatFormState } from "./actions";
import { BeatFields } from "./BeatFields";

const EXTENSIONS: Record<string, string> = {
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  aac: "audio/aac",
  wav: "audio/wav",
  ogg: "audio/ogg",
};

interface FileInfo {
  file: File;
  ext: string;
  duration: number;
  downbeat: number;
}

export function UploadBeatForm({ genres, moods }: { genres: string[]; moods: string[] }) {
  const [state, formAction, saving] = useActionState<BeatFormState, FormData>(createBeat, {});
  const [info, setInfo] = useState<FileInfo | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [handledSuccess, setHandledSuccess] = useState<string | undefined>(undefined);

  // Clear the form after each successful upload.
  if (state.success && state.success !== handledSuccess) {
    setHandledSuccess(state.success);
    setInfo(null);
    setFormKey((k) => k + 1);
  }

  async function onFileChange(file: File | undefined) {
    setInfo(null);
    setFileError(null);
    if (!file) return;
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!EXTENSIONS[ext]) return setFileError("Use an MP3, M4A, AAC, WAV or OGG file.");
    if (file.size > 50 * 1024 * 1024) return setFileError("That file is over 50 MB.");

    setReading(true);
    try {
      const buffer = await getAudioContext().decodeAudioData(await file.arrayBuffer());
      const downbeat = Math.round(detectLeadingSilence(buffer.getChannelData(0), buffer.sampleRate) * 1000) / 1000;
      setInfo({ file, ext, duration: buffer.duration, downbeat });
    } catch {
      setFileError("Couldn't read that audio file. Try exporting it as MP3.");
    } finally {
      setReading(false);
    }
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!info) return setFileError("Choose an audio file first.");
    const formData = new FormData(event.currentTarget);

    setUploading(true);
    const path = `${crypto.randomUUID()}.${info.ext}`;
    const { error } = await createClient()
      .storage.from("beats")
      .upload(path, info.file, { contentType: info.file.type || EXTENSIONS[info.ext], upsert: false });
    setUploading(false);
    if (error) return setFileError(`Upload failed: ${error.message}`);

    formData.set("audioPath", path);
    formData.set("durationSeconds", String(info.duration));
    formData.delete("file");
    startTransition(() => formAction(formData));
  }

  const busy = reading || uploading || saving;

  return (
    <form key={formKey} onSubmit={onSubmit} className="flex flex-col gap-4">
      <div>
        <label htmlFor="beat-file" className={labelClass}>Audio file</label>
        <input id="beat-file" name="file" type="file" required accept=".mp3,.m4a,.aac,.wav,.ogg,audio/*"
          onChange={(e) => onFileChange(e.target.files?.[0])}
          className={`${inputClass} py-2.5 file:mr-3 file:rounded-lg file:border-0 file:bg-gold file:px-3 file:py-1.5 file:font-bold file:text-ink`} />
        {reading && <p className="mt-1 text-sm text-dim">Reading audio…</p>}
        {info && (
          <p className="mt-1 text-sm text-dim">
            Length {formatDuration(info.duration)} · first sound at {info.downbeat.toFixed(3)} s
          </p>
        )}
      </div>

      <BeatFields
        idPrefix="new"
        values={{ title: "", producer: "", bpm: "", genre: "", mood: "", firstDownbeatSeconds: info?.downbeat ?? 0, isPremium: false }}
        genres={genres}
        moods={moods}
      />

      {(fileError || state.error) && <p role="alert" className="text-sm font-semibold text-danger">{fileError ?? state.error}</p>}
      {state.success && !busy && <p role="status" className="text-sm font-semibold text-gold">{state.success}</p>}

      <button type="submit" disabled={busy || !info} className={buttonClass("primary", "w-full")}>
        {uploading ? "Uploading…" : saving ? "Saving…" : "Upload beat"}
      </button>
    </form>
  );
}
