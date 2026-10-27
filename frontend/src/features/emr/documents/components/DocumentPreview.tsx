"use client";

import { useEffect, useState } from "react";
import { apiErrorMessage } from "@/lib/api/emr/errors";
import { documentsApi, type PatientDocument } from "@/lib/api/emr/documents";

/** The loaded file for one document id, so a stale result is never shown for another document. */
type Loaded = { id: string; url?: string; error?: string };

/** Shows the original file, fetched with the staff session (files have no public URL). */
export function DocumentPreview({ document }: { document: PatientDocument }) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    documentsApi
      .file(document.id)
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setLoaded({ id: document.id, url: objectUrl });
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoaded({ id: document.id, error: apiErrorMessage(err, "Could not open the file.") });
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [document.id]);

  const current = loaded?.id === document.id ? loaded : null;
  const frame = "aspect-[3/3.4] w-full rounded-2xl border border-line bg-canvas";
  if (!current?.url) {
    return (
      <div className={`${frame} flex items-center justify-center text-[13px] text-subtle`}>
        {current?.error ?? "Loading preview…"}
      </div>
    );
  }
  if (document.content_type === "application/pdf") {
    return <iframe title={`Preview of ${document.title}`} src={current.url} className={frame} />;
  }
  // eslint-disable-next-line @next/next/no-img-element -- a local object URL cannot go through next/image.
  return <img src={current.url} alt={document.title} className={`${frame} object-contain`} />;
}
