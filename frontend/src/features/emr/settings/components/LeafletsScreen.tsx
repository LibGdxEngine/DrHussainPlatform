"use client";

import { useEffect, useRef, useState } from "react";
import { contentApi, type Leaflet } from "@/lib/api/emr/content";
import { formatBytes, formatDay } from "../../format";
import { ActionButton } from "../../ui/Action";
import { Field, TextInput } from "../../ui/Fields";
import { Panel } from "../../ui/Panel";
import { Pill } from "../../ui/Pill";
import { settingsError } from "../errors";
import { Notice, type NoticeState } from "./Notice";
import { SettingsHeader } from "./SettingsHeader";

async function openLeaflet(leaflet: Leaflet) {
  const blob = await contentApi.leaflets.file(leaflet.id);
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank", "noopener");
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Leaflets the doctor can attach to results emails. Replacing a file keeps the earlier ones. */
export function LeafletsScreen() {
  const [leaflets, setLeaflets] = useState<Leaflet[] | null>(null);
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<NoticeState>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    contentApi.leaflets.list(true).then(
      (list) => !cancelled && setLeaflets(list),
      (err: unknown) => {
        if (!cancelled) setNotice({ tone: "error", text: settingsError(err, "Could not load the leaflets.") });
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const replace = (next: Leaflet) => setLeaflets((prev) => (prev ?? []).map((l) => (l.id === next.id ? next : l)));

  async function act(run: () => Promise<Leaflet>, done: (l: Leaflet) => string) {
    setBusy(true);
    setNotice(null);
    try {
      const saved = await run();
      setNotice({ tone: "ok", text: done(saved) });
      return saved;
    } catch (err) {
      setNotice({ tone: "error", text: settingsError(err, "Could not save the leaflet.") });
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function upload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    const created = await act(() => contentApi.leaflets.upload(title, file), (l) => `Added ${l.title}.`);
    if (created) {
      setLeaflets((prev) => [...(prev ?? []), created]);
      setTitle("");
      setFile(null);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  return (
    <>
      <SettingsHeader
        tab="leaflets"
        title="Leaflets"
        description="PDF leaflets such as the HPV information sheet or the recurrent thrush leaflet. Templates can attach them by default, and the doctor adds or removes them in review. Every file ever used is kept."
      />
      <Notice notice={notice} />
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Panel aria-label="Leaflets" className="flex flex-col gap-3 p-5">
          {!leaflets ? <p className="m-0 text-[13px] text-muted">Loading…</p> : null}
          {leaflets && !leaflets.length ? <p className="m-0 text-[13px] text-muted">No leaflets yet.</p> : null}
          {(leaflets ?? []).map((l) => (
            <div key={l.id} className="flex flex-wrap items-center gap-2 rounded-2xl border border-line p-3.5 text-[13px]">
              <div className="flex flex-col gap-0.5">
                <strong className="font-semibold">{l.title}</strong>
                <span className="text-xs text-muted">
                  v{l.current?.number} · {l.current?.original_filename} · {formatBytes(l.current?.size ?? 0)} ·{" "}
                  {formatDay(l.current?.created_at)}
                </span>
              </div>
              {l.archived ? <Pill tone="neutral" size="xs">Archived</Pill> : null}
              <span className="ms-auto flex flex-wrap gap-2">
                <ActionButton variant="quiet" size="sm" onClick={() => void openLeaflet(l)}>Open</ActionButton>
                <label className="inline-flex">
                  <span className="sr-only">Replace {l.title}</span>
                  <input
                    type="file"
                    accept="application/pdf"
                    className="hidden"
                    disabled={busy}
                    onChange={async (e) => {
                      const next = e.target.files?.[0];
                      e.target.value = "";
                      if (!next) return;
                      const saved = await act(() => contentApi.leaflets.replace(l.id, next), (x) => `Replaced ${x.title} (now v${x.current?.number}).`);
                      if (saved) replace(saved);
                    }}
                  />
                  <span className="inline-flex min-h-9 cursor-pointer items-center rounded-full border border-line-strong px-3.5 text-[13px] font-semibold text-ink hover:border-brand hover:text-brand">
                    Replace file
                  </span>
                </label>
                <ActionButton
                  variant="quiet"
                  size="sm"
                  disabled={busy}
                  onClick={async () => {
                    const saved = await act(() => contentApi.leaflets.update(l.id, { archived: !l.archived }),
                      (x) => (x.archived ? `Archived ${x.title}.` : `Restored ${x.title}.`));
                    if (saved) replace(saved);
                  }}
                >
                  {l.archived ? "Restore" : "Archive"}
                </ActionButton>
              </span>
            </div>
          ))}
        </Panel>
        <Panel aria-labelledby="nl" className="flex flex-col gap-3 p-5">
          <h2 id="nl" className="m-0 text-lg font-semibold">Add a leaflet</h2>
          <form className="flex flex-col gap-3" onSubmit={upload}>
            <Field label="Title">
              <TextInput required value={title} onChange={(e) => setTitle(e.target.value)} />
            </Field>
            <Field label="PDF file">
              <input
                ref={fileInput}
                type="file"
                accept="application/pdf"
                required
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="text-[13px]"
              />
            </Field>
            <ActionButton type="submit" disabled={busy || !file} className="self-start">Upload</ActionButton>
          </form>
        </Panel>
      </div>
    </>
  );
}
