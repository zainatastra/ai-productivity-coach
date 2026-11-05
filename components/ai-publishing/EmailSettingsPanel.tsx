"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Loader2, Mail, RotateCcw, Save, Send } from "lucide-react";
import { CONTENT_ERRORS, ERRORS, EXTRA_ERRORS, Lang, TEXT, tr } from "./aiPublishingText";
import { rt, type RKey } from "./reviewText";
import type { Api } from "./DraftWorkspace";

/* eslint-disable @typescript-eslint/no-explicit-any */

type Fields = { subject: string; heading: string; intro: string; bulletsTitle: string; bullets: string[]; button: string; notes: string[] };
type KindInfo = { kind: string; placeholders: string[]; languages: Record<string, { defaults: Fields; effective: Fields; customized: boolean }> };
type Settings = { senderName: string; defaultSenderName: string; fromAddress: string; emailConfigured: boolean; kinds: KindInfo[] };

type Form = { subject: string; heading: string; intro: string; bulletsTitle: string; bullets: string; button: string; notes: string };

const toForm = (f: Fields): Form => ({
  subject: f.subject, heading: f.heading, intro: f.intro, bulletsTitle: f.bulletsTitle,
  bullets: f.bullets.join("\n"), button: f.button, notes: f.notes.join("\n"),
});

const toPayload = (f: Form) => ({
  subject: f.subject, heading: f.heading, intro: f.intro, bulletsTitle: f.bulletsTitle,
  bullets: f.bullets.split("\n"), button: f.button, notes: f.notes.split("\n"),
});

const errorOf = (res: { status: number; code?: string }, lang: Lang) => {
  if (res.status === 0) return rt("c_err_network", lang);
  if (res.status === 401 || res.status === 403) return rt("c_err_session", lang);
  return tr(res.code ? CONTENT_ERRORS[res.code] || ERRORS[res.code] || EXTRA_ERRORS[res.code] : undefined, lang, rt("c_err_generic", lang));
};

export default function EmailSettingsPanel({ lang, api }: { lang: Lang; api: Api }) {
  const t = (key: RKey) => rt(key, lang);

  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [kind, setKind] = useState("invitation");
  const [tplLang, setTplLang] = useState<"de" | "en">("de");
  const [form, setForm] = useState<Form | null>(null);
  const [base, setBase] = useState<Form | null>(null);
  const [sender, setSender] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [preview, setPreview] = useState<{ subject: string; html: string; unknown: string[] } | null>(null);

  const focused = useRef<{ key: keyof Form; el: HTMLInputElement | HTMLTextAreaElement } | null>(null);

  const load = useCallback(async () => {
    const res = await api("/api/ai/settings/email");
    if (res.ok) {
      setSettings(res.data);
      setSender(res.data.senderName);
    } else {
      setError(errorOf(res, lang));
    }
  }, [api, lang]);

  useEffect(() => {
    if (!open || settings) return;
    const timer = setTimeout(() => { void load(); }, 0);
    return () => clearTimeout(timer);
  }, [open, settings, load]);

  // Fill the form whenever another template or language is selected (or the settings were reloaded).
  useEffect(() => {
    if (!settings) return;
    const info = settings.kinds.find((k) => k.kind === kind)?.languages[tplLang];
    if (!info) return;

    const next = toForm(info.effective);
    const timer = setTimeout(() => { setForm(next); setBase(next); setPreview(null); }, 0);
    return () => clearTimeout(timer);
  }, [settings, kind, tplLang]);

  // Live preview of what is typed (debounced; nothing is saved or sent).
  useEffect(() => {
    if (!open || !form) return;
    let cancelled = false;

    const timer = setTimeout(async () => {
      const res = await api("/api/ai/settings/email/preview", {
        method: "POST",
        body: JSON.stringify({ kind, lang: tplLang, template: toPayload(form) }),
      });
      if (!cancelled && res.ok) setPreview({ subject: res.data.subject, html: res.data.html, unknown: res.data.unknownPlaceholders || [] });
    }, 500);

    return () => { cancelled = true; clearTimeout(timer); };
  }, [api, open, form, kind, tplLang]);

  const dirty = !!form && !!base && JSON.stringify(form) !== JSON.stringify(base);
  const current = settings?.kinds.find((k) => k.kind === kind);
  const customized = current?.languages[tplLang]?.customized;

  const set = (key: keyof Form, value: string) => { setInfo(""); setForm((f) => (f ? { ...f, [key]: value } : f)); };

  // Inserts a placeholder where the cursor was in the last text field, or at the end of the intro.
  const insert = (name: string) => {
    const token = `{${name}}`;
    const f = focused.current;

    if (!f || !form) { set("intro", `${form?.intro ?? ""} ${token}`.trim()); return; }

    const value = form[f.key];
    const start = f.el.selectionStart ?? value.length;
    const end = f.el.selectionEnd ?? value.length;
    set(f.key, value.slice(0, start) + token + value.slice(end));
  };

  const run = async (key: string, action: () => Promise<{ ok: boolean; status: number; data: any; code?: string }>, onOk?: (data: any) => void) => {
    setBusy(key);
    setError("");
    setInfo("");
    const res = await action();
    setBusy("");

    if (!res.ok) { setError(errorOf(res, lang)); return; }
    onOk?.(res.data);
  };

  const save = () =>
    run("save", () => api(`/api/ai/settings/email/templates/${kind}/${tplLang}`, { method: "PUT", body: JSON.stringify(toPayload(form!)) }),
      async () => { await load(); setInfo(t("es_saved")); });

  const reset = () =>
    run("reset", () => api(`/api/ai/settings/email/templates/${kind}/${tplLang}`, { method: "DELETE" }),
      async () => { await load(); setInfo(t("es_resetDone")); });

  const saveSender = () =>
    run("sender", () => api("/api/ai/settings/email/sender", { method: "PUT", body: JSON.stringify({ name: sender }) }),
      async () => { await load(); setInfo(t("es_saved")); });

  const sendTest = () =>
    run("test", () => api("/api/ai/settings/email/test", { method: "POST", body: JSON.stringify({ kind, lang: tplLang }) }),
      (data) => setInfo(`${t("es_testSent")} ${data.to}`));

  const field = (key: keyof Form, label: RKey, rows = 0, max = 200) => {
    const common = {
      value: form?.[key] ?? "",
      maxLength: max,
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => set(key, e.target.value),
      onFocus: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => { focused.current = { key, el: e.target }; },
      disabled: !!busy,
    };

    return (
      <div>
        <label className="aip-label">{t(label)}</label>
        {rows > 0
          ? <textarea className="aip-input aip-area" rows={rows} {...common} />
          : <input className="aip-input" {...common} />}
      </div>
    );
  };

  return (
    <div className="aip-card">
      <div className="aip-card-head">
        <div>
          <h3 className="aip-h3"><Mail size={16} /> <span>{t("es_title")}</span></h3>
          <p className="aip-help">{t("es_help")}</p>
        </div>
        <button className="aip-btn ghost" onClick={() => setOpen((v) => !v)}><span>{open ? t("es_close") : t("es_open")}</span></button>
      </div>

      {open && !settings && !error && <div className="aip-meta"><Loader2 size={13} className="aip-spin" /></div>}
      {error && <div className="aip-error-text">{error}</div>}

      {open && settings && form && (
        <>
          <div className="aip-two" style={{ marginBottom: 14 }}>
            <div>
              <label className="aip-label">{t("es_sender")}</label>
              <div className="aip-row" style={{ margin: 0 }}>
                <input className="aip-input" style={{ flex: 1 }} value={sender} maxLength={60} onChange={(e) => setSender(e.target.value)} disabled={!!busy} />
                <button className="aip-btn ghost" onClick={saveSender} disabled={!!busy || sender.trim() === settings.senderName}>
                  {busy === "sender" ? <Loader2 size={13} className="aip-spin" /> : <Save size={13} />}
                  <span>{t("es_saveSender")}</span>
                </button>
              </div>
              <div className="aip-meta">{t("es_senderHelp")} {settings.fromAddress}</div>
            </div>
            {!settings.emailConfigured && <div className="aip-banner warn"><span>{t("es_notConfigured")}</span></div>}
          </div>

          <div className="aip-row wrap" style={{ margin: "0 0 14px" }}>
            <div className="aip-tabs" style={{ margin: 0 }} role="tablist">
              {settings.kinds.map((k) => (
                <button key={k.kind} role="tab" aria-selected={kind === k.kind} className={`aip-tab ${kind === k.kind ? "on" : ""}`}
                  onClick={() => { if (!dirty || window.confirm(TEXT.editLeaveConfirm[lang])) setKind(k.kind); }}>
                  <span>{t(`es_kind_${k.kind}` as RKey)}</span>
                </button>
              ))}
            </div>
            <div className="aip-tabs" style={{ margin: 0 }} role="tablist">
              {(["de", "en"] as const).map((l) => (
                <button key={l} role="tab" aria-selected={tplLang === l} className={`aip-tab ${tplLang === l ? "on" : ""}`}
                  onClick={() => { if (!dirty || window.confirm(TEXT.editLeaveConfirm[lang])) setTplLang(l); }}>
                  <span>{l.toUpperCase()}</span>
                </button>
              ))}
            </div>
            <span className={`aip-pill ${customized ? "amber" : "gray"}`}><span>{customized ? t("es_customized") : t("es_default")}</span></span>
            {dirty && <span className="aip-pill amber"><span>{t("es_unsaved")}</span></span>}
          </div>

          <div className="aip-email-grid">
            <div>
              {field("subject", "es_subject", 0, 150)}
              <div style={{ height: 10 }} />
              {field("heading", "es_heading", 0, 120)}
              <div style={{ height: 10 }} />
              {field("intro", "es_intro", 4, 1000)}
              <div style={{ height: 10 }} />
              {field("bulletsTitle", "es_bulletsTitle", 0, 80)}
              <div style={{ height: 10 }} />
              {field("bullets", "es_bullets", 4, 1600)}
              <div style={{ height: 10 }} />
              {field("button", "es_button", 0, 40)}
              <div style={{ height: 10 }} />
              {field("notes", "es_notes", 3, 1500)}

              <div className="aip-label" style={{ marginTop: 14 }}>{t("es_placeholders")}</div>
              <div className="aip-chips">
                {(current?.placeholders || []).map((name) => (
                  <button key={name} type="button" className="aip-chip" onClick={() => insert(name)}>{`{${name}}`}</button>
                ))}
              </div>
              <div className="aip-meta">{t("es_boldHint")}</div>

              <div className="aip-row wrap" style={{ marginTop: 14 }}>
                <button className="aip-btn" onClick={save} disabled={!!busy || !dirty}>
                  {busy === "save" ? <Loader2 size={13} className="aip-spin" /> : <Save size={13} />}
                  <span>{t("es_save")}</span>
                </button>
                <button className="aip-btn ghost" onClick={reset} disabled={!!busy || !customized}>
                  <RotateCcw size={13} /> <span>{t("es_reset")}</span>
                </button>
                <button className="aip-btn ghost" onClick={sendTest} disabled={!!busy || dirty || !settings.emailConfigured} title={dirty ? t("es_unsaved") : undefined}>
                  {busy === "test" ? <Loader2 size={13} className="aip-spin" /> : <Send size={13} />}
                  <span>{t("es_test")}</span>
                </button>
              </div>
              {info && <div className="aip-ok-text" style={{ marginTop: 10 }}><Check size={13} /> <span>{info}</span></div>}
            </div>

            <div>
              <div className="aip-label">{t("es_preview")}</div>
              {preview ? (
                <>
                  <div className="aip-meta" style={{ marginBottom: 6 }}><strong>{t("es_subjectPreview")}:</strong> {preview.subject}</div>
                  {preview.unknown.length > 0 && (
                    <div className="aip-banner warn"><span>{t("es_unknown")} {preview.unknown.map((n) => `{${n}}`).join(", ")}</span></div>
                  )}
                  <iframe className="aip-email-frame" title={t("es_preview")} sandbox="" srcDoc={preview.html} />
                </>
              ) : (
                <div className="aip-meta"><Loader2 size={13} className="aip-spin" /></div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
