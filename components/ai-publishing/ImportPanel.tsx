"use client";

import { useRef, useState } from "react";
import { Check, FileUp, Loader2 } from "lucide-react";
import { CONTENT_ERRORS, ERRORS, EXTRA_ERRORS, Lang, tr } from "./aiPublishingText";
import { rt, type RKey } from "./reviewText";
import type { Api } from "./DraftWorkspace";

type Row = { line: number; name: string; website: string; host: string; status: string; error?: string | null };
type Preview = { rows: Row[]; ignoredColumns: string[]; encodingIssue: boolean; counts: { total: number; ok: number; invalid: number; duplicates: number }; maxBatch: number; aiConfigured: boolean };
type Outcome = { line: number; ok: boolean; error?: string; researchQueued?: boolean };

const TONE: Record<string, string> = { ok: "green", invalid: "red", duplicate_in_file: "amber", exists: "amber" };

const reason = (code: string | null | undefined, lang: Lang) =>
  code ? tr(CONTENT_ERRORS[code] || ERRORS[code] || EXTRA_ERRORS[code], lang, code) : "";

const errorOf = (res: { status: number; code?: string }, lang: Lang) => {
  if (res.status === 0) return rt("c_err_network", lang);
  if (res.status === 401 || res.status === 403) return rt("c_err_session", lang);
  return reason(res.code, lang) || rt("c_err_generic", lang);
};

export default function ImportPanel({ lang, api, onImported }: { lang: Lang; api: Api; onImported: () => void }) {
  const t = (key: RKey) => rt(key, lang);

  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [startResearch, setStartResearch] = useState(false);
  const [busy, setBusy] = useState("");
  const [done, setDone] = useState(0);
  const [outcomes, setOutcomes] = useState<Outcome[] | null>(null);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setPreview(null);
    setOutcomes(null);
    setError("");
    setDone(0);
    setStartResearch(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  const choose = async (file: File | undefined) => {
    if (!file) return;
    reset();
    setBusy("read");

    const text = await file.text();
    const res = await api("/api/ai/providers/import/preview", { method: "POST", body: JSON.stringify({ csv: text }) });
    setBusy("");

    if (!res.ok) { setError(errorOf(res, lang)); return; }
    setPreview(res.data);
  };

  // Rows go in small batches, so no single request runs long; a failing row only fails itself.
  const run = async () => {
    if (!preview) return;

    const ready = preview.rows.filter((r) => r.status === "ok");
    const size = preview.maxBatch || 10;
    const all: Outcome[] = [];

    setBusy("import");
    setError("");
    setDone(0);

    for (let i = 0; i < ready.length; i += size) {
      const slice = ready.slice(i, i + size);
      const res = await api("/api/ai/providers/import/batch", {
        method: "POST",
        body: JSON.stringify({ rows: slice.map((r) => ({ line: r.line, name: r.name, website: r.website })), startResearch }),
      });

      if (!res.ok) {
        // The whole request failed (network, session): remember the rows as not created and stop.
        slice.forEach((r) => all.push({ line: r.line, ok: false, error: res.code || "import_failed" }));
        setError(errorOf(res, lang));
        break;
      }

      all.push(...(res.data.results as Outcome[]));
      setDone(all.length);
    }

    setBusy("");
    setOutcomes(all);
    onImported();
  };

  const created = outcomes?.filter((o) => o.ok).length ?? 0;
  const failed = (outcomes || []).filter((o) => !o.ok);
  const queued = outcomes?.filter((o) => o.researchQueued).length ?? 0;
  const nameOf = (line: number) => preview?.rows.find((r) => r.line === line)?.name ?? `${t("im_line")} ${line}`;

  return (
    <div className="aip-card">
      <div className="aip-card-head">
        <div>
          <h3 className="aip-h3"><FileUp size={16} /> <span>{t("im_title")}</span></h3>
          <p className="aip-help">{t("im_help")}</p>
        </div>
        <button className="aip-btn ghost" onClick={() => setOpen((v) => !v)}><span>{open ? t("es_close") : t("es_open")}</span></button>
      </div>

      {open && (
        <>
          {!outcomes && (
            <div className="aip-row wrap" style={{ margin: 0 }}>
              <input ref={fileRef} type="file" accept=".csv,text/csv,text/plain" disabled={!!busy}
                onChange={(e) => { void choose(e.target.files?.[0]); }} aria-label={t("im_choose")} />
              {busy === "read" && <span className="aip-meta"><Loader2 size={13} className="aip-spin" /> {t("im_reading")}</span>}
            </div>
          )}

          {error && <div className="aip-error-text" style={{ marginTop: 10 }}>{error}</div>}

          {preview && !outcomes && (
            <>
              <div className="aip-row wrap" style={{ marginTop: 14 }}>
                <span className="aip-pill gray"><span>{t("im_counts")}: {preview.counts.total}</span></span>
                <span className="aip-pill green"><span>{preview.counts.ok} {t("im_ok")}</span></span>
                {preview.counts.invalid > 0 && <span className="aip-pill red"><span>{preview.counts.invalid} {t("im_invalid")}</span></span>}
                {preview.counts.duplicates > 0 && <span className="aip-pill amber"><span>{preview.counts.duplicates} {t("im_duplicates")}</span></span>}
              </div>

              {preview.ignoredColumns.length > 0 && <div className="aip-meta" style={{ marginTop: 8 }}>{t("im_ignored")}: {preview.ignoredColumns.join(", ")}</div>}
              {preview.encodingIssue && <div className="aip-banner warn" style={{ marginTop: 8 }}><span>{t("im_encoding")}</span></div>}

              <div className="aip-jobs" style={{ marginTop: 12, maxHeight: 320, overflowY: "auto" }}>
                {preview.rows.map((r) => (
                  <div key={r.line} className="aip-job">
                    <div>
                      <strong><span>{r.name || "–"}</span></strong>{" "}
                      <span className={`aip-pill ${TONE[r.status] || "gray"}`}><span>{rt(`im_status_${r.status}` as RKey, lang)}</span></span>
                      <div className="aip-meta">{t("im_line")} {r.line} · {r.website || "–"}{r.status !== "ok" && r.error ? ` · ${reason(r.error, lang)}` : ""}</div>
                    </div>
                  </div>
                ))}
              </div>

              <label className="aip-checkbox" style={{ margin: "14px 0 8px" }}>
                <input type="checkbox" checked={startResearch} disabled={!preview.aiConfigured || !!busy} onChange={(e) => setStartResearch(e.target.checked)} />
                <span>{t("im_research")}</span>
              </label>

              <div className="aip-row wrap" style={{ margin: 0 }}>
                <button className="aip-btn" onClick={run} disabled={!!busy || preview.counts.ok === 0}>
                  {busy === "import" ? <Loader2 size={13} className="aip-spin" /> : <Check size={13} />}
                  <span>{preview.counts.ok} {t("im_importBtn")}</span>
                </button>
                {busy === "import" && <span className="aip-meta">{t("im_progress")} {done} / {preview.counts.ok}</span>}
              </div>
            </>
          )}

          {outcomes && (
            <div style={{ marginTop: 14 }}>
              <div className="aip-ok-text"><Check size={13} /> <span>{t("im_done")}</span></div>
              <div className="aip-row wrap" style={{ marginTop: 8 }}>
                <span className="aip-pill green"><span>{created} {t("im_created")}</span></span>
                {failed.length > 0 && <span className="aip-pill red"><span>{failed.length} {t("im_failed")}</span></span>}
                {queued > 0 && <span className="aip-pill gray"><span>{queued} {t("im_queued")}</span></span>}
              </div>
              {failed.map((o) => (
                <div key={o.line} className="aip-meta">{nameOf(o.line)} ({t("im_line")} {o.line}): {reason(o.error, lang)}</div>
              ))}
              <button className="aip-btn ghost" style={{ marginTop: 12 }} onClick={reset}><span>{t("im_again")}</span></button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
