"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowDown, ArrowUp, Check, Loader2, Plus, RotateCcw, Save, Send, Sparkles, Trash2, User,
} from "lucide-react";
import { CONTENT_ERRORS, ERRORS, EXTRA_ERRORS, Lang, TEXT, tr } from "./aiPublishingText";

/* eslint-disable @typescript-eslint/no-explicit-any */

export type Api = (path: string, init?: RequestInit) => Promise<{ ok: boolean; status: number; data: any; code?: string }>;

export type Block = { type: string; level: number; text: string; ordered: boolean; items: string[] };

export type VersionRow = {
  id: string;
  versionNumber: number;
  createdAt?: string;
  revisionInstruction?: string;
  model?: string;
  llmProvider?: string;
  createdByAI?: boolean;
};

export type DraftDoc = {
  id: string;
  type: string;
  title: string;
  subtitle?: string;
  excerpt?: string;
  seoTitle?: string;
  metaDescription?: string;
  blocks: Block[];
  data?: Record<string, any>;
  currentVersion?: number;
  versions?: VersionRow[];
};

const fmt = (iso: string | undefined, lang: Lang) =>
  iso
    ? new Date(iso).toLocaleString(lang === "de" ? "de-DE" : "en-GB", {
        day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
      })
    : "";

const words = (text: string) => (text.match(/[\p{L}\p{N}][\p{L}\p{N}\-.']*/gu) || []).length;

const errorOf = (res: { status: number; code?: string }, lang: Lang) => {
  if (res.status === 0) return TEXT.networkError[lang];
  if (res.status === 401 || res.status === 403) return TEXT.denied[lang];
  return tr(res.code ? CONTENT_ERRORS[res.code] || ERRORS[res.code] || EXTRA_ERRORS[res.code] : undefined, lang, TEXT.genericError[lang]);
};

/* ═══════════════════════════════ editor ═══════════════════════════════ */

type EditBlock = { key: number; type: "heading" | "paragraph" | "list" | "quote"; level: number; text: string; ordered: boolean };
type AgendaRow = { key: number; title: string; description: string; minutes: number };

let keyCounter = 1;
const nextKey = () => keyCounter++;

const toEditBlocks = (blocks: Block[]): EditBlock[] =>
  blocks.map((b) => ({
    key: nextKey(),
    type: (["heading", "paragraph", "list", "quote"].includes(b.type) ? b.type : "paragraph") as EditBlock["type"],
    level: b.level === 3 ? 3 : 2,
    text: b.type === "list" ? (b.items || []).join("\n") : b.text || "",
    ordered: !!b.ordered,
  }));

const toLines = (value: unknown): string => (Array.isArray(value) ? value.map(String).join("\n") : "");

const linesOf = (text: string) => text.split("\n").map((l) => l.trim()).filter(Boolean);

type EditState = {
  title: string; subtitle: string; excerpt: string; seoTitle: string; metaDescription: string;
  blocks: EditBlock[];
  cta: string;
  duration: number; audience: string; objectives: string; agenda: AgendaRow[];
  speaker: string; registration: string; discussion: string; banner: string;
};

const initialState = (doc: DraftDoc): EditState => {
  const d = doc.data || {};
  return {
    title: doc.title || "", subtitle: doc.subtitle || "", excerpt: doc.excerpt || "",
    seoTitle: doc.seoTitle || "", metaDescription: doc.metaDescription || "",
    blocks: toEditBlocks(doc.blocks || []),
    cta: d.callToAction || "",
    duration: Number(d.durationMinutes) || 60,
    audience: d.targetAudience || "",
    objectives: toLines(d.learningObjectives),
    agenda: (Array.isArray(d.agenda) ? d.agenda : []).map((a: any) => ({
      key: nextKey(), title: a.title || "", description: a.description || "", minutes: Number(a.minutes) || 0,
    })),
    speaker: d.speakerInfo || "", registration: d.registrationCopy || "",
    discussion: toLines(d.discussionPoints), banner: d.bannerText || "",
  };
};

// Compared without the generated keys, so only real edits count as "unsaved".
const signature = (s: EditState) =>
  JSON.stringify({
    ...s,
    blocks: s.blocks.map((b) => [b.type, b.level, b.text, b.ordered]),
    agenda: s.agenda.map((a) => [a.title, a.description, a.minutes]),
  });

const payloadOf = (s: EditState, type: string) => ({
  title: s.title, subtitle: s.subtitle, excerpt: s.excerpt, seoTitle: s.seoTitle, metaDescription: s.metaDescription,
  blocks: s.blocks.map((b) => ({
    type: b.type,
    level: b.level,
    text: b.type === "list" ? "" : b.text,
    ordered: b.ordered,
    items: b.type === "list" ? linesOf(b.text) : [],
  })),
  data:
    type === "whitepaper" ? { callToAction: s.cta }
    : type === "webinar" ? {
        durationMinutes: s.duration, targetAudience: s.audience, learningObjectives: linesOf(s.objectives),
        agenda: s.agenda.map((a) => ({ title: a.title, description: a.description, minutes: a.minutes })),
        speakerInfo: s.speaker, registrationCopy: s.registration, discussionPoints: linesOf(s.discussion), bannerText: s.banner,
      }
    : {},
});

export function EditPanel(props: {
  lang: Lang;
  doc: DraftDoc;
  api: Api;
  locked: boolean;
  onSaved: () => void;
  onDirty: (dirty: boolean) => void;
}) {
  const { lang, doc, api, locked } = props;
  const t = (key: keyof typeof TEXT) => TEXT[key][lang];

  // Re-initialised whenever the draft moves to another version (e.g. after saving).
  const base = useMemo(() => initialState(doc), [doc.id, doc.currentVersion]); // eslint-disable-line react-hooks/exhaustive-deps
  const [state, setState] = useState<EditState>(base);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => { setState(base); }, [base]);

  const dirty = signature(state) !== signature(base);
  const { onDirty } = props;
  useEffect(() => { onDirty(dirty); }, [dirty, onDirty]);

  const set = <K extends keyof EditState>(key: K, value: EditState[K]) => { setSaved(false); setState((s) => ({ ...s, [key]: value })); };

  const patchBlock = (key: number, patch: Partial<EditBlock>) =>
    set("blocks", state.blocks.map((b) => (b.key === key ? { ...b, ...patch } : b)));

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= state.blocks.length) return;
    const next = [...state.blocks];
    [next[index], next[target]] = [next[target], next[index]];
    set("blocks", next);
  };

  const addBlock = (type: EditBlock["type"], level = 2) =>
    set("blocks", [...state.blocks, { key: nextKey(), type, level, text: "", ordered: false }]);

  const bodyWords = words(state.blocks.map((b) => b.text).join(" "));

  const save = async () => {
    if (saving || !dirty) return;
    setSaving(true);
    setError("");

    const res = await api(`/api/ai/content/${doc.id}`, { method: "PUT", body: JSON.stringify(payloadOf(state, doc.type)) });
    setSaving(false);

    if (!res.ok) {
      setError(errorOf(res, lang));
      return;
    }

    setSaved(true);
    props.onSaved();
  };

  const area = (value: string, onChange: (v: string) => void, rows: number, max?: number) => (
    <textarea className="aip-input aip-area" rows={rows} value={value} maxLength={max} disabled={locked || saving}
      onChange={(e) => onChange(e.target.value)} />
  );

  return (
    <div className="aip-card aip-focus-target" id="aip-editor">
      <p className="aip-help" style={{ marginTop: 0 }}>{t("editHelp")}</p>
      {locked && <div className="aip-banner warn"><span>{t("lockedHint")}</span></div>}

      <label className="aip-label">{t("fieldTitle")}</label>
      <input className="aip-input" value={state.title} maxLength={180} disabled={locked || saving} onChange={(e) => set("title", e.target.value)} />

      <label className="aip-label aip-gap">{t("fieldSubtitle")}</label>
      <input className="aip-input" value={state.subtitle} maxLength={320} disabled={locked || saving} onChange={(e) => set("subtitle", e.target.value)} />

      <label className="aip-label aip-gap">{t("fieldExcerpt")}</label>
      {area(state.excerpt, (v) => set("excerpt", v), 3, 500)}

      <div className="aip-label aip-gap">{t("fieldBody")} · {bodyWords} {t("words")} <span className="aip-hint-inline">· {t("boldHint")}</span></div>

      <div className="aip-blocks">
        {state.blocks.map((b, index) => (
          <div key={b.key} className={`aip-block aip-block-${b.type}`}>
            <div className="aip-block-bar">
              <select className="aip-select" value={b.type === "heading" ? `h${b.level}` : b.type} disabled={locked || saving}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === "h2" || v === "h3") patchBlock(b.key, { type: "heading", level: v === "h3" ? 3 : 2 });
                  else patchBlock(b.key, { type: v as EditBlock["type"] });
                }}>
                <option value="h2">{t("blockHeading2")}</option>
                <option value="h3">{t("blockHeading3")}</option>
                <option value="paragraph">{t("blockParagraph")}</option>
                <option value="list">{t("blockList")}</option>
                <option value="quote">{t("blockQuote")}</option>
              </select>

              {b.type === "list" && (
                <label className="aip-checkbox">
                  <input type="checkbox" checked={b.ordered} disabled={locked || saving} onChange={(e) => patchBlock(b.key, { ordered: e.target.checked })} />
                  <span>{t("orderedList")}</span>
                </label>
              )}

              <div className="aip-block-tools">
                <button type="button" className="aip-icon-btn" title={t("moveUp")} aria-label={t("moveUp")}
                  disabled={locked || saving || index === 0} onClick={() => move(index, -1)}><ArrowUp size={14} /></button>
                <button type="button" className="aip-icon-btn" title={t("moveDown")} aria-label={t("moveDown")}
                  disabled={locked || saving || index === state.blocks.length - 1} onClick={() => move(index, 1)}><ArrowDown size={14} /></button>
                <button type="button" className="aip-icon-btn danger" title={t("removeBlock")} aria-label={t("removeBlock")}
                  disabled={locked || saving} onClick={() => set("blocks", state.blocks.filter((x) => x.key !== b.key))}><Trash2 size={14} /></button>
              </div>
            </div>

            {b.type === "heading" ? (
              <input className="aip-input" value={b.text} maxLength={200} disabled={locked || saving} onChange={(e) => patchBlock(b.key, { text: e.target.value })} />
            ) : (
              <textarea className="aip-input aip-area" rows={b.type === "list" ? 4 : b.type === "quote" ? 2 : 5}
                value={b.text} maxLength={b.type === "paragraph" ? 2500 : b.type === "quote" ? 600 : 6000}
                placeholder={b.type === "list" ? t("listOnePerLine") : undefined} disabled={locked || saving}
                onChange={(e) => patchBlock(b.key, { text: e.target.value })} />
            )}
          </div>
        ))}
      </div>

      <div className="aip-row wrap" style={{ margin: "10px 0 4px" }}>
        <span className="aip-label" style={{ margin: 0 }}>{t("addBlock")}:</span>
        <button type="button" className="aip-btn ghost" disabled={locked || saving} onClick={() => addBlock("heading", 2)}><Plus size={13} /> <span>{t("blockHeading2")}</span></button>
        <button type="button" className="aip-btn ghost" disabled={locked || saving} onClick={() => addBlock("paragraph")}><Plus size={13} /> <span>{t("blockParagraph")}</span></button>
        <button type="button" className="aip-btn ghost" disabled={locked || saving} onClick={() => addBlock("list")}><Plus size={13} /> <span>{t("blockList")}</span></button>
        <button type="button" className="aip-btn ghost" disabled={locked || saving} onClick={() => addBlock("quote")}><Plus size={13} /> <span>{t("blockQuote")}</span></button>
      </div>

      {doc.type === "whitepaper" && (
        <>
          <label className="aip-label aip-gap">{t("dataCta")}</label>
          <input className="aip-input" value={state.cta} maxLength={300} disabled={locked || saving} onChange={(e) => set("cta", e.target.value)} />
        </>
      )}

      {doc.type === "webinar" && (
        <div className="aip-webinar-edit">
          <div className="aip-two">
            <div>
              <label className="aip-label aip-gap">{t("dataDuration")}</label>
              <input className="aip-input" type="number" min={15} max={240} value={state.duration} disabled={locked || saving}
                onChange={(e) => set("duration", Number(e.target.value) || 0)} />
            </div>
            <div>
              <label className="aip-label aip-gap">{t("dataAudience")}</label>
              <input className="aip-input" value={state.audience} maxLength={400} disabled={locked || saving} onChange={(e) => set("audience", e.target.value)} />
            </div>
          </div>

          <label className="aip-label aip-gap">{t("dataObjectives")}</label>
          {area(state.objectives, (v) => set("objectives", v), 4)}

          <label className="aip-label aip-gap">{t("dataAgenda")}</label>
          <div className="aip-agenda-edit">
            {state.agenda.map((a) => (
              <div key={a.key} className="aip-agenda-edit-row">
                <input className="aip-input" style={{ width: 72 }} type="number" min={0} max={240} value={a.minutes} placeholder={t("agendaMinutes")} disabled={locked || saving}
                  onChange={(e) => set("agenda", state.agenda.map((x) => (x.key === a.key ? { ...x, minutes: Number(e.target.value) || 0 } : x)))} />
                <input className="aip-input" value={a.title} placeholder={t("agendaTitle")} maxLength={120} disabled={locked || saving}
                  onChange={(e) => set("agenda", state.agenda.map((x) => (x.key === a.key ? { ...x, title: e.target.value } : x)))} />
                <input className="aip-input" value={a.description} placeholder={t("agendaDesc")} maxLength={400} disabled={locked || saving}
                  onChange={(e) => set("agenda", state.agenda.map((x) => (x.key === a.key ? { ...x, description: e.target.value } : x)))} />
                <button type="button" className="aip-icon-btn danger" aria-label={t("removeBlock")} disabled={locked || saving}
                  onClick={() => set("agenda", state.agenda.filter((x) => x.key !== a.key))}><Trash2 size={14} /></button>
              </div>
            ))}
            <button type="button" className="aip-btn ghost" disabled={locked || saving || state.agenda.length >= 12}
              onClick={() => set("agenda", [...state.agenda, { key: nextKey(), title: "", description: "", minutes: 10 }])}>
              <Plus size={13} /> <span>{t("addAgenda")}</span>
            </button>
          </div>

          <label className="aip-label aip-gap">{t("dataSpeaker")}</label>
          {area(state.speaker, (v) => set("speaker", v), 2, 600)}

          <label className="aip-label aip-gap">{t("dataRegistration")}</label>
          {area(state.registration, (v) => set("registration", v), 3, 1200)}

          <label className="aip-label aip-gap">{t("dataDiscussion")}</label>
          {area(state.discussion, (v) => set("discussion", v), 4)}

          <label className="aip-label aip-gap">{t("dataBanner")}</label>
          <input className="aip-input" value={state.banner} maxLength={120} disabled={locked || saving} onChange={(e) => set("banner", e.target.value)} />
        </div>
      )}

      {doc.type !== "webinar" && (
        <div className="aip-two">
          <div>
            <label className="aip-label aip-gap">{t("fieldSeoTitle")}</label>
            <input className="aip-input" value={state.seoTitle} maxLength={70} disabled={locked || saving} onChange={(e) => set("seoTitle", e.target.value)} />
          </div>
          <div>
            <label className="aip-label aip-gap">{t("fieldMeta")}</label>
            <input className="aip-input" value={state.metaDescription} maxLength={160} disabled={locked || saving} onChange={(e) => set("metaDescription", e.target.value)} />
          </div>
        </div>
      )}

      {error && <div className="aip-error-text">{error}</div>}

      <div className="aip-row wrap aip-sticky-actions">
        <button className="aip-btn" onClick={save} disabled={locked || saving || !dirty}>
          {saving ? <Loader2 size={13} className="aip-spin" /> : <Save size={13} />}
          <span>{t("editSave")}</span>
        </button>
        <button className="aip-btn ghost" onClick={() => { setState(base); setError(""); }} disabled={saving || !dirty}>
          <RotateCcw size={13} /> <span>{t("editCancel")}</span>
        </button>
        {dirty && <span className="aip-pill amber"><span>{t("editDirty")}</span></span>}
        {saved && !dirty && <span className="aip-ok-text" style={{ margin: 0 }}><Check size={13} /> <span>{t("editSaved")}</span></span>}
      </div>
    </div>
  );
}

/* ═══════════════════════════════ AI revision ═══════════════════════════════ */

const CHIPS: { label: keyof typeof TEXT; text: keyof typeof TEXT }[] = [
  { label: "chipShorter", text: "chipShorterText" },
  { label: "chipSimple", text: "chipSimpleText" },
  { label: "chipTechnical", text: "chipTechnicalText" },
  { label: "chipFormal", text: "chipFormalText" },
  { label: "chipIntro", text: "chipIntroText" },
  { label: "chipExamples", text: "chipExamplesText" },
];

export function instructionLabel(v: VersionRow, lang: Lang): string {
  const t = (key: keyof typeof TEXT) => TEXT[key][lang];
  const instruction = v.revisionInstruction || "";
  if (instruction === "manual_edit") return t("aiManual");
  if (instruction.startsWith("restored:")) return `${t("aiRestored")} ${instruction.slice(9)}`;
  return instruction;
}

export function RevisionPanel(props: {
  lang: Lang;
  doc: DraftDoc;
  locked: boolean;
  running: boolean;
  error: string;
  onRevise: (instruction: string) => Promise<boolean>;
}) {
  const { lang, doc, locked, running } = props;
  const t = (key: keyof typeof TEXT) => TEXT[key][lang];
  const [text, setText] = useState("");

  const send = async () => {
    const instruction = text.trim();
    if (instruction.length < 3 || locked) return;
    if (await props.onRevise(instruction)) setText("");
  };

  const history = [...(doc.versions || [])].sort((a, b) => a.versionNumber - b.versionNumber);

  return (
    <div className="aip-card aip-focus-target" id="aip-revision">
      <p className="aip-help" style={{ marginTop: 0 }}>{t("aiHelp")}</p>

      <div className="aip-label">{t("aiChipsLabel")}</div>
      <div className="aip-chips">
        {CHIPS.map((chip) => (
          <button key={chip.label} type="button" className="aip-chip" disabled={locked}
            onClick={() => setText(t(chip.text))}>{t(chip.label)}</button>
        ))}
      </div>

      <textarea className="aip-input aip-area" rows={3} maxLength={600} value={text} disabled={locked}
        placeholder={t("aiPlaceholder")} onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") void send(); }} />

      <div className="aip-row wrap" style={{ marginTop: 10 }}>
        <button className="aip-btn" onClick={send} disabled={locked || text.trim().length < 3}>
          {running ? <Loader2 size={13} className="aip-spin" /> : <Send size={13} />}
          <span>{running ? t("aiRunning") : t("aiSend")}</span>
        </button>
        <span className="aip-meta">{text.length}/600</span>
      </div>

      {locked && !running && <div className="aip-meta" style={{ marginTop: 8 }}>{t("lockedHint")}</div>}
      {props.error && <div className="aip-error-text">{props.error}</div>}

      <div className="aip-label" style={{ marginTop: 18 }}>{t("aiHistory")}</div>
      <div className="aip-chat">
        {history.map((v) => {
          const instruction = instructionLabel(v, lang);
          const initial = v.versionNumber === 1;
          const manual = v.llmProvider === "manual" || v.revisionInstruction === "manual_edit";
          const restored = (v.revisionInstruction || "").startsWith("restored:");
          const isUserMessage = !initial && !manual && !restored && instruction.length > 0;

          return (
            <div key={v.id}>
              {isUserMessage && (
                <div className="aip-bubble you">
                  <div className="aip-bubble-who"><User size={11} /> <span>{t("aiYou")}</span></div>
                  <span>{instruction}</span>
                </div>
              )}
              <div className="aip-bubble ai">
                <div className="aip-bubble-who">
                  {manual || restored ? <User size={11} /> : <Sparkles size={11} />}
                  <span>{manual || restored ? t("aiYou") : t("aiAssistant")}</span>
                  <span className="aip-meta">· {t("version")} {v.versionNumber} · {fmt(v.createdAt, lang)}</span>
                </div>
                <span>{initial ? t("aiInitial") : manual || restored ? instruction : `${t("aiResultVersion")} ${v.versionNumber}`}</span>
                {v.versionNumber === doc.currentVersion && <span className="aip-pill green" style={{ marginLeft: 8 }}><span>{t("currentVersionTag")}</span></span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ═══════════════════════════════ version compare ═══════════════════════════════ */

type Row = { kind: "same" | "added" | "removed" | "changed"; a?: string; b?: string };
type Piece = { k: "same" | "add" | "del"; t: string };

export const blockText = (b: Block): string =>
  b.type === "heading" ? `${b.level === 3 ? "###" : "##"} ${b.text}`
  : b.type === "list" ? (b.items || []).map((item, i) => `${b.ordered ? `${i + 1}.` : "•"} ${item}`).join("\n")
  : b.type === "quote" ? `„${b.text}“`
  : b.text;

/** Longest-common-subsequence diff of two lists of strings. */
export function diffLists(a: string[], b: string[]): Row[] {
  const n = a.length;
  const m = b.length;
  const table: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));

  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      table[i][j] = a[i] === b[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);

  const rows: Row[] = [];
  let i = 0;
  let j = 0;

  while (i < n && j < m) {
    if (a[i] === b[j]) { rows.push({ kind: "same", a: a[i], b: b[j] }); i++; j++; }
    else if (table[i + 1][j] >= table[i][j + 1]) rows.push({ kind: "removed", a: a[i++] });
    else rows.push({ kind: "added", b: b[j++] });
  }
  while (i < n) rows.push({ kind: "removed", a: a[i++] });
  while (j < m) rows.push({ kind: "added", b: b[j++] });

  return pairChanges(rows);
}

const tokens = (text: string) => text.split(/(\s+)/).filter((x) => x.length > 0);

const similarity = (x: string, y: string) => {
  const a = new Set(x.toLowerCase().split(/\s+/));
  const b = new Set(y.toLowerCase().split(/\s+/));
  let common = 0;
  a.forEach((w) => { if (b.has(w)) common++; });
  return common / Math.max(1, Math.min(a.size, b.size));
};

/** A removed block directly followed by an added block that is mostly the same text is one edit. */
function pairChanges(rows: Row[]): Row[] {
  const out: Row[] = [];
  let index = 0;

  while (index < rows.length) {
    if (rows[index].kind !== "removed") { out.push(rows[index++]); continue; }

    const removed: Row[] = [];
    while (index < rows.length && rows[index].kind === "removed") removed.push(rows[index++]);
    const added: Row[] = [];
    while (index < rows.length && rows[index].kind === "added") added.push(rows[index++]);

    const used = new Set<number>();
    const merged: Row[] = [];

    removed.forEach((r, ri) => {
      let best = -1;
      let bestScore = 0.45;
      added.forEach((ad, ai) => {
        if (used.has(ai)) return;
        const score = similarity(r.a || "", ad.b || "");
        if (score > bestScore) { best = ai; bestScore = score; }
      });
      if (best >= 0) { used.add(best); merged[ri] = { kind: "changed", a: r.a, b: added[best].b }; }
      else merged[ri] = r;
    });

    out.push(...merged);
    added.forEach((ad, ai) => { if (!used.has(ai)) out.push(ad); });
  }

  return out;
}

/** Word-level diff for one changed text. */
export function diffWords(a: string, b: string): Piece[] {
  const x = tokens(a);
  const y = tokens(b);

  // Very long texts: fall back to a whole-text replacement instead of an O(n²) table.
  if (x.length * y.length > 400_000) return [{ k: "del", t: a }, { k: "add", t: b }];

  const table: number[][] = Array.from({ length: x.length + 1 }, () => new Array(y.length + 1).fill(0));
  for (let i = x.length - 1; i >= 0; i--)
    for (let j = y.length - 1; j >= 0; j--)
      table[i][j] = x[i] === y[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);

  const out: Piece[] = [];
  const push = (k: Piece["k"], text: string) => {
    const last = out[out.length - 1];
    if (last && last.k === k) last.t += text; else out.push({ k, t: text });
  };

  let i = 0;
  let j = 0;
  while (i < x.length && j < y.length) {
    if (x[i] === y[j]) { push("same", x[i]); i++; j++; }
    else if (table[i + 1][j] >= table[i][j + 1]) push("del", x[i++]);
    else push("add", y[j++]);
  }
  while (i < x.length) push("del", x[i++]);
  while (j < y.length) push("add", y[j++]);

  return out;
}

const dataLines = (data: Record<string, any> | undefined): [string, string][] => {
  if (!data) return [];
  return Object.entries(data).map(([key, value]) => {
    if (key === "agenda" && Array.isArray(value))
      return [key, value.map((a: any) => `${a.minutes || 0} min · ${a.title}${a.description ? ` – ${a.description}` : ""}`).join("\n")];
    if (Array.isArray(value)) return [key, value.map(String).join("\n")];
    return [key, String(value ?? "")];
  });
};

const FIELD_LABELS: Record<string, keyof typeof TEXT> = {
  title: "fieldTitle", subtitle: "fieldSubtitle", excerpt: "fieldExcerpt", seoTitle: "fieldSeoTitle", metaDescription: "fieldMeta",
  callToAction: "dataCta", durationMinutes: "dataDuration", targetAudience: "dataAudience", learningObjectives: "dataObjectives",
  agenda: "dataAgenda", speakerInfo: "dataSpeaker", registrationCopy: "dataRegistration", discussionPoints: "dataDiscussion", bannerText: "dataBanner",
};

function WordDiff({ a, b }: { a: string; b: string }) {
  const pieces = diffWords(a, b);

  // Mostly rewritten text is unreadable word by word: show the old and the new text one above the other.
  const sameLength = pieces.filter((p) => p.k === "same").reduce((n, p) => n + p.t.length, 0);
  const total = pieces.reduce((n, p) => n + p.t.length, 0) || 1;

  if (a && b && sameLength / total < 0.5) {
    return (
      <>
        <del className="aip-del aip-stack">{a}</del>
        <ins className="aip-ins aip-stack">{b}</ins>
      </>
    );
  }

  return (
    <>
      {pieces.map((p, i) =>
        p.k === "same" ? <span key={i}>{p.t}</span>
        : p.k === "add" ? <ins key={i} className="aip-ins">{p.t}</ins>
        : <del key={i} className="aip-del">{p.t}</del>)}
    </>
  );
}

export function ComparePanel(props: {
  lang: Lang;
  doc: DraftDoc;
  api: Api;
  locked: boolean;
  onRestore: (version: number) => Promise<boolean>;
}) {
  const { lang, doc, api, locked } = props;
  const t = (key: keyof typeof TEXT) => TEXT[key][lang];

  const versions = useMemo(() => [...(doc.versions || [])].sort((a, b) => b.versionNumber - a.versionNumber), [doc.versions]);
  const current = doc.currentVersion ?? versions[0]?.versionNumber ?? 1;
  const previous = versions.find((v) => v.versionNumber < current)?.versionNumber ?? current;

  const [left, setLeft] = useState<number>(previous);
  const [right, setRight] = useState<number>(current);
  const [onlyChanges, setOnlyChanges] = useState(true);
  const [loaded, setLoaded] = useState<{ a: any; b: any } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [confirmRestore, setConfirmRestore] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const timer = setTimeout(async () => {
      setLoading(true);
      setError("");

      const [a, b] = await Promise.all([
        api(`/api/ai/content/${doc.id}/versions/${left}`),
        api(`/api/ai/content/${doc.id}/versions/${right}`),
      ]);

      if (cancelled) return;
      setLoading(false);

      if (!a.ok || !b.ok) { setError(errorOf(a.ok ? b : a, lang)); setLoaded(null); return; }
      setLoaded({ a: a.data, b: b.data });
    }, 0);

    return () => { cancelled = true; clearTimeout(timer); };
  }, [api, doc.id, left, right, lang]);

  const label = (v: VersionRow) => {
    const who = v.llmProvider === "manual" ? t("manualVersion") : v.llmProvider === "anthropic" ? "Claude" : "OpenAI";
    return `${t("version")} ${v.versionNumber}${v.versionNumber === current ? ` (${t("currentVersionTag")})` : ""} · ${fmt(v.createdAt, lang)} · ${who}`;
  };

  const analysis = useMemo(() => {
    if (!loaded) return null;

    const rows = diffLists((loaded.a.blocks || []).map(blockText), (loaded.b.blocks || []).map(blockText));

    const fieldKeys = ["title", "subtitle", "excerpt", "seoTitle", "metaDescription"];
    const fields = fieldKeys
      .map((key) => ({ key, a: String(loaded.a[key] || ""), b: String(loaded.b[key] || "") }))
      .filter((f) => f.a !== f.b);

    const dataA = Object.fromEntries(dataLines(loaded.a.data));
    const dataB = Object.fromEntries(dataLines(loaded.b.data));
    Object.keys({ ...dataA, ...dataB }).forEach((key) => {
      if ((dataA[key] || "") !== (dataB[key] || "")) fields.push({ key, a: dataA[key] || "", b: dataB[key] || "" });
    });

    const changes = rows.filter((r) => r.kind !== "same").length + fields.length;
    return { rows, fields, changes };
  }, [loaded]);

  const doRestore = async () => {
    setConfirmRestore(false);
    await props.onRestore(left);
  };

  const canRestore = left !== current && !locked;

  return (
    <div className="aip-card aip-focus-target" id="aip-compare">
      <p className="aip-help" style={{ marginTop: 0 }}>{t("compareHelp")}</p>

      <div className="aip-two">
        <div>
          <label className="aip-label">{t("compareOlder")}</label>
          <select className="aip-select wide" value={left} onChange={(e) => setLeft(Number(e.target.value))}>
            {versions.map((v) => <option key={v.id} value={v.versionNumber}>{label(v)}</option>)}
          </select>
        </div>
        <div>
          <label className="aip-label">{t("compareNewer")}</label>
          <select className="aip-select wide" value={right} onChange={(e) => setRight(Number(e.target.value))}>
            {versions.map((v) => <option key={v.id} value={v.versionNumber}>{label(v)}</option>)}
          </select>
        </div>
      </div>

      <div className="aip-row wrap" style={{ margin: "12px 0" }}>
        <label className="aip-checkbox">
          <input type="checkbox" checked={onlyChanges} onChange={(e) => setOnlyChanges(e.target.checked)} />
          <span>{t("compareOnlyChanges")}</span>
        </label>
        {analysis && <span className="aip-pill gray"><span>{t("compareStats")}: {analysis.changes}</span></span>}
        <button className="aip-btn ghost" disabled={!canRestore} onClick={() => setConfirmRestore(true)}>
          <RotateCcw size={13} /> <span>{t("restoreVersion")} ({t("version")} {left})</span>
        </button>
      </div>

      {confirmRestore && (
        <div className="aip-banner warn" style={{ flexWrap: "wrap" }}>
          <span>{t("restoreConfirm")}</span>
          <button className="aip-btn" onClick={doRestore}><span>{t("restoreVersion")}</span></button>
          <button className="aip-btn ghost" onClick={() => setConfirmRestore(false)}><span>{t("cancel")}</span></button>
        </div>
      )}

      {error && <div className="aip-error-text">{error}</div>}
      {loading && <div className="aip-meta"><Loader2 size={13} className="aip-spin" /> <span>{t("compareLoading")}</span></div>}

      {analysis && !loading && (
        analysis.changes === 0 ? (
          <div className="aip-ok-text"><Check size={14} /> <span>{t("compareSame")}</span></div>
        ) : (
          <div className="aip-diff">
            {analysis.fields.map((f) => (
              <div key={f.key} className="aip-diff-row changed">
                <div className="aip-diff-tag">{t(FIELD_LABELS[f.key] || "versionFieldLabel")}</div>
                <div className="aip-diff-text"><WordDiff a={f.a} b={f.b} /></div>
              </div>
            ))}

            {analysis.rows
              .filter((r) => !onlyChanges || r.kind !== "same")
              .map((r, i) => (
                <div key={i} className={`aip-diff-row ${r.kind}`}>
                  {r.kind !== "same" && <div className="aip-diff-tag">{t(r.kind === "added" ? "diffAdded" : r.kind === "removed" ? "diffRemoved" : "diffChanged")}</div>}
                  <div className="aip-diff-text">
                    {r.kind === "changed" ? <WordDiff a={r.a || ""} b={r.b || ""} /> : (r.kind === "added" ? r.b : r.a)}
                  </div>
                </div>
              ))}
          </div>
        )
      )}
    </div>
  );
}
