"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { getAuth, onAuthStateChanged, signOut, type User } from "firebase/auth";
import { ArrowLeft, Check, CheckCircle2, FileText, BookOpen, Video, Loader2, LogOut, MessageSquare, Send, Sparkles } from "lucide-react";
import { publisherApp } from "@/services/firebase";
import { API_BASE_URL } from "@/services/api";
import { CONTENT_ERRORS, CONTENT_TYPES, ERRORS, EXTRA_ERRORS, Lang, tr } from "./aiPublishingText";
import { RT, rt, type RKey } from "./reviewText";

/* eslint-disable @typescript-eslint/no-explicit-any */

type Row = { id: string; type: string; title: string; status: string; wordCount?: number; currentVersion?: number; updatedAt?: string; coverUrl?: string; providerName?: string };

const ICONS: Record<string, any> = { article: FileText, whitepaper: BookOpen, webinar: Video };

const TONE: Record<string, string> = {
  company_review: "blue", pending_admin_review: "amber", changes_requested: "amber", rejected: "red", approved: "green", published: "green",
};

const fmt = (iso: string | undefined, lang: Lang) =>
  iso
    ? new Date(iso).toLocaleString(lang === "de" ? "de-DE" : "en-GB", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
    : "";

const statusText = (status: string, lang: Lang) => {
  const key = `st_${status}`;
  return (key in RT ? RT[key as RKey] : RT.st_draft)[lang];
};

function Inline({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
        part.startsWith("**") && part.endsWith("**") ? <strong key={i}>{part.slice(2, -2)}</strong> : <Fragment key={i}>{part}</Fragment>)}
    </>
  );
}

const CHIPS: { de: string; en: string }[] = [
  { de: "Kürzer", en: "Shorter" },
  { de: "Einfacher", en: "Simpler" },
  { de: "Fachlicher", en: "More technical" },
  { de: "Stärkerer Einstieg", en: "Stronger intro" },
];

const CHIP_TEXT: Record<string, { de: string; en: string }> = {
  Kürzer: { de: "Fasse den Text deutlich kürzer, ohne wichtige Inhalte zu verlieren.", en: "Make the text noticeably shorter without losing key content." },
  Einfacher: { de: "Formuliere einfacher und verständlicher.", en: "Use simpler, clearer wording." },
  Fachlicher: { de: "Schreibe fachlicher und technischer.", en: "Write in a more technical tone." },
  "Stärkerer Einstieg": { de: "Überarbeite die Einleitung, sodass sie schneller auf den Punkt kommt.", en: "Rework the introduction so it gets to the point faster." },
};

export default function CompanyReview() {
  const auth = getAuth(publisherApp);

  const [lang, setLang] = useState<Lang>("de");
  const t = (key: RKey, vars?: Record<string, string | number>) => rt(key, lang, vars);

  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [detail, setDetail] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sessionLost, setSessionLost] = useState(false);

  const [instruction, setInstruction] = useState("");
  const [comment, setComment] = useState("");
  const [note, setNote] = useState("");
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [busy, setBusy] = useState("");
  const [jobId, setJobId] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  const openId = useRef<string | null>(null);

  useEffect(() => onAuthStateChanged(auth, (u) => setUser(u)), [auth]);

  const api = useCallback(
    async (path: string, init?: RequestInit) => {
      try {
        const token = user ? await user.getIdToken() : null;
        if (!token) return { ok: false, status: 401, data: null as any, code: "denied" };

        const res = await fetch(`${API_BASE_URL}${path}`, {
          ...init,
          cache: "no-store",
          headers: { Authorization: `Bearer ${token}`, ...(init?.body ? { "Content-Type": "application/json" } : {}) },
        });

        const data = res.status === 204 ? null : await res.json().catch(() => null);
        return { ok: res.ok, status: res.status, data, code: data?.code as string | undefined };
      } catch {
        return { ok: false, status: 0, data: null as any, code: "network" };
      }
    },
    [user],
  );

  const errorText = useCallback((res: { status: number; code?: string }) => {
    if (res.status === 0) return rt("c_err_network", lang);
    if (res.status === 401 || res.status === 403) return rt("c_err_session", lang);
    return tr(res.code ? CONTENT_ERRORS[res.code] || ERRORS[res.code] || EXTRA_ERRORS[res.code] : undefined, lang, rt("c_err_generic", lang));
  }, [lang]);

  const loadList = useCallback(async () => {
    const res = await api("/api/ai/company/contents");
    if (res.ok) { setRows(res.data || []); return; }
    if (res.status === 401 || res.status === 403) setSessionLost(true);
    setError(errorText(res));
  }, [api, errorText]);

  const loadDetail = useCallback(async (id: string) => {
    const res = await api(`/api/ai/company/contents/${id}`);
    if (res.ok && openId.current === id) setDetail(res.data);
    return res;
  }, [api]);

  useEffect(() => {
    if (!user) return;
    const timer = setTimeout(() => { void loadList(); }, 0);
    return () => clearTimeout(timer);
  }, [user, loadList]);

  const open = async (id: string) => {
    openId.current = id;
    setLoading(true);
    setError("");
    setMessage("");
    const res = await loadDetail(id);
    setLoading(false);
    if (!res.ok) { openId.current = null; setError(errorText(res)); }
  };

  const back = () => {
    openId.current = null;
    setDetail(null);
    setJobId(null);
    setError("");
    setMessage("");
    void loadList();
  };

  // While an AI improvement runs: ask for its state every 3 seconds, then load the new version.
  useEffect(() => {
    if (!jobId) return;

    const timer = setInterval(async () => {
      if (document.visibilityState !== "visible") return;
      const res = await api(`/api/ai/company/jobs/${jobId}`);
      if (!res.ok) { setJobId(null); setError(errorText(res)); return; }
      if (!res.data.done) return;

      setJobId(null);
      if (res.data.failed) setError(rt("c_improveFailed", lang));
      else setMessage(rt("c_improveDone", lang));
      if (openId.current) await loadDetail(openId.current);
    }, 3000);

    return () => clearInterval(timer);
  }, [jobId, api, errorText, lang, loadDetail]);

  const run = async (key: string, path: string, body: unknown, after?: (data: any) => void) => {
    setBusy(key);
    setError("");
    setMessage("");
    const res = await api(path, { method: "POST", body: JSON.stringify(body) });
    setBusy("");

    if (!res.ok) { setError(errorText(res)); return false; }
    after?.(res.data);
    return true;
  };

  const improve = async () => {
    if (!detail || instruction.trim().length < 3) return;
    await run("improve", `/api/ai/company/contents/${detail.id}/revise`, { instruction }, (data) => {
      setInstruction("");
      setJobId(data.jobId);
      setDetail((d: any) => (d ? { ...d, revisionsLeft: data.revisionsLeft, canRevise: false } : d));
    });
  };

  const sendComment = async () => {
    if (!detail || !comment.trim()) return;
    if (await run("comment", `/api/ai/company/contents/${detail.id}/comments`, { text: comment }, () => setComment("")))
      await loadDetail(detail.id);
  };

  const submit = async () => {
    if (!detail) return;
    setConfirmSubmit(false);
    if (await run("submit", `/api/ai/company/contents/${detail.id}/submit`, { note }, () => { setNote(""); setMessage(rt("c_submitted", lang)); }))
      await loadDetail(detail.id);
  };

  const logout = async () => {
    await signOut(auth);
    window.location.assign("/publisher/login");
  };

  /* ───────────── render ───────────── */

  const shell = (children: React.ReactNode) => (
    <div className="cr-root">
      <style>{CSS}</style>
      <header className="cr-top">
        <div>
          <h1 className="cr-h1">{t("c_title")}</h1>
          <p className="cr-sub">{t("c_sub")}</p>
        </div>
        <div className="cr-top-right">
          <div className="cr-lang" role="group" aria-label="Language">
            <button className={lang === "de" ? "on" : ""} onClick={() => setLang("de")}>DE</button>
            <button className={lang === "en" ? "on" : ""} onClick={() => setLang("en")}>EN</button>
          </div>
          {user && (
            <button className="cr-btn ghost" onClick={logout}><LogOut size={14} /> <span>{t("c_signOut")}</span></button>
          )}
        </div>
      </header>
      {user && <div className="cr-meta">{t("c_signedAs")} {user.email}</div>}
      {children}
    </div>
  );

  if (user === undefined) return shell(<div className="cr-card"><Loader2 size={16} className="cr-spin" /> <span>{t("c_loading")}</span></div>);

  if (user === null || sessionLost) {
    return shell(
      <div className="cr-card">
        <p>{sessionLost ? t("c_err_session") : t("c_signInNeeded")}</p>
        <a className="cr-btn" href="/publisher/login?next=/publisher/ai-review"><span>{t("c_signIn")}</span></a>
      </div>,
    );
  }

  /* detail view */
  if (detail) {
    const Icon = ICONS[detail.type] || FileText;
    const data = detail.data || {};
    const lastDecision = [...(detail.comments || [])].reverse().find((c: any) => c.kind === "decision");

    return shell(
      <>
        <button className="cr-back" onClick={back}><ArrowLeft size={14} /> <span>{t("c_back")}</span></button>

        <div className="cr-card">
          <div className="cr-row">
            <span className="cr-pill blue"><Icon size={12} /> <span>{tr(CONTENT_TYPES[detail.type], lang, detail.type)}</span></span>
            <span className={`cr-pill ${TONE[detail.status] || "gray"}`}><span>{statusText(detail.status, lang)}</span></span>
            <span className="cr-pill gray"><span>{t("c_version")} {detail.currentVersion}</span></span>
            <span className="cr-pill gray"><span>{detail.wordCount} {t("c_words")}</span></span>
          </div>
          <h2 className="cr-h2">{detail.title}</h2>
          {detail.subtitle && <p className="cr-lead">{detail.subtitle}</p>}
          <div className="cr-meta">{detail.providerName} · {fmt(detail.updatedAt, lang)}</div>

          <div className={`cr-banner ${TONE[detail.status] || "gray"}`}>
            <span>{t((`c_banner_${detail.status}` in RT ? `c_banner_${detail.status}` : "c_banner_company_review") as RKey)}</span>
          </div>

          {detail.status === "changes_requested" && lastDecision && (
            <div className="cr-note"><strong>{lastDecision.text}</strong></div>
          )}
          {message && <div className="cr-ok"><Check size={14} /> <span>{message}</span></div>}
          {error && <div className="cr-error">{error}</div>}
        </div>

        <div className="cr-card">
          {(detail.media || []).find((m: any) => m.url === detail.coverUrl) && (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="cr-cover" src={detail.coverUrl} alt={detail.coverAlt || ""} />
          )}

          {detail.excerpt && (
            <>
              <div className="cr-label">{t("c_excerpt")}</div>
              <p className="cr-excerpt">{detail.excerpt}</p>
            </>
          )}

          <div className="cr-body">
            {(detail.blocks || []).map((b: any, i: number) => {
              if (b.type === "heading") return b.level === 3 ? <h4 key={i}>{b.text}</h4> : <h3 key={i}>{b.text}</h3>;
              if (b.type === "list") {
                const Tag = b.ordered ? "ol" : "ul";
                return <Tag key={i}>{(b.items || []).map((li: string, j: number) => <li key={j}><Inline text={li} /></li>)}</Tag>;
              }
              if (b.type === "quote") return <blockquote key={i}><Inline text={b.text} /></blockquote>;
              return <p key={i}><Inline text={b.text} /></p>;
            })}
          </div>

          {detail.type === "whitepaper" && data.callToAction && (
            <><div className="cr-label">{t("c_whitepaperCta")}</div><p>{data.callToAction}</p></>
          )}

          {detail.type === "webinar" && (
            <div className="cr-grid">
              {data.targetAudience && <div><div className="cr-label">{t("c_webinarAudience")}</div><p>{data.targetAudience}</p></div>}
              {Array.isArray(data.learningObjectives) && data.learningObjectives.length > 0 && (
                <div><div className="cr-label">{t("c_webinarObjectives")}</div><ul>{data.learningObjectives.map((x: string, i: number) => <li key={i}>{x}</li>)}</ul></div>
              )}
              {Array.isArray(data.agenda) && data.agenda.length > 0 && (
                <div><div className="cr-label">{t("c_webinarAgenda")}</div>
                  <ul>{data.agenda.map((a: any, i: number) => <li key={i}><strong>{a.minutes ? `${a.minutes} ${t("c_minutes")} · ` : ""}{a.title}</strong>{a.description ? ` – ${a.description}` : ""}</li>)}</ul></div>
              )}
              {Array.isArray(data.discussionPoints) && data.discussionPoints.length > 0 && (
                <div><div className="cr-label">{t("c_webinarDiscussion")}</div><ul>{data.discussionPoints.map((x: string, i: number) => <li key={i}>{x}</li>)}</ul></div>
              )}
            </div>
          )}

          {(detail.seoTitle || detail.metaDescription) && (
            <>
              <div className="cr-label">{t("c_seo")}</div>
              <div className="cr-seo"><strong>{detail.seoTitle}</strong><span>{detail.metaDescription}</span></div>
            </>
          )}

          {(detail.sources || []).length > 0 && (
            <>
              <div className="cr-label">{t("c_sources")}</div>
              <ul className="cr-sources">{detail.sources.map((s: any) => <li key={s.number}>{(s.title || s.url).toString()}</li>)}</ul>
            </>
          )}
        </div>

        {/* improve with AI */}
        {detail.status === "company_review" && (
          <div className="cr-card">
            <h3 className="cr-h3"><Sparkles size={15} /> <span>{t("c_improveTitle")}</span></h3>
            <p className="cr-help">{t("c_improveHelp")}</p>
            <div className="cr-chips">
              {CHIPS.map((c) => (
                <button key={c.de} className="cr-chip" disabled={!detail.canRevise || !!jobId}
                  onClick={() => setInstruction(CHIP_TEXT[c.de][lang])}>{c[lang]}</button>
              ))}
            </div>
            <textarea className="cr-input" rows={3} maxLength={600} value={instruction} placeholder={t("c_improvePh")}
              disabled={!detail.canRevise || !!jobId} onChange={(e) => setInstruction(e.target.value)} />
            <div className="cr-row" style={{ marginTop: 10 }}>
              <button className="cr-btn" disabled={!detail.canRevise || !!jobId || instruction.trim().length < 3 || busy === "improve"} onClick={improve}>
                {jobId || busy === "improve" ? <Loader2 size={14} className="cr-spin" /> : <Sparkles size={14} />}
                <span>{jobId ? t("c_improveRunning") : t("c_improveSend")}</span>
              </button>
              <span className="cr-meta">{t("c_revisionsLeft", { n: detail.revisionsLeft, max: detail.maxRevisions })}</span>
            </div>
            {detail.revisionsLeft === 0 && <div className="cr-note" style={{ marginTop: 10 }}>{t("c_limitReached")}</div>}
          </div>
        )}

        {/* comments */}
        <div className="cr-card">
          <h3 className="cr-h3"><MessageSquare size={15} /> <span>{t("c_commentsTitle")}</span></h3>
          <div className="cr-chat">
            {(detail.comments || []).map((c: any) => (
              <div key={c.id} className={`cr-bubble ${c.authorRole === "admin" ? "admin" : "me"}`}>
                <div className="cr-who">{c.authorRole === "admin" ? t("byAdmin") : t("byCompany")} · {fmt(c.createdAt, lang)}</div>
                <span>{c.text}</span>
              </div>
            ))}
          </div>
          {detail.canComment && (
            <div className="cr-row" style={{ marginTop: 10 }}>
              <input className="cr-input" style={{ flex: 1 }} maxLength={1500} value={comment} placeholder={t("c_commentPh")}
                onChange={(e) => setComment(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void sendComment(); }} />
              <button className="cr-btn ghost" disabled={!comment.trim() || busy === "comment"} onClick={sendComment}>
                {busy === "comment" ? <Loader2 size={14} className="cr-spin" /> : <Send size={14} />} <span>{t("c_commentSend")}</span>
              </button>
            </div>
          )}
        </div>

        {/* submit */}
        {detail.canSubmit && (
          <div className="cr-card">
            <h3 className="cr-h3"><CheckCircle2 size={15} /> <span>{t("c_submitTitle")}</span></h3>
            <p className="cr-help">{t("c_submitHelp")}</p>
            <label className="cr-label">{t("c_submitNote")}</label>
            <textarea className="cr-input" rows={2} maxLength={1500} value={note} onChange={(e) => setNote(e.target.value)} />
            {confirmSubmit ? (
              <div className="cr-note" style={{ marginTop: 10 }}>
                <p style={{ margin: "0 0 8px" }}>{t("c_submitConfirm")}</p>
                <div className="cr-row">
                  <button className="cr-btn" disabled={busy === "submit" || !!jobId} onClick={submit}>{busy === "submit" ? <Loader2 size={14} className="cr-spin" /> : <Check size={14} />} <span>{t("c_submit")}</span></button>
                  <button className="cr-btn ghost" onClick={() => setConfirmSubmit(false)}><span>×</span></button>
                </div>
              </div>
            ) : (
              <button className="cr-btn" style={{ marginTop: 10 }} disabled={!!jobId} onClick={() => setConfirmSubmit(true)}><span>{t("c_submit")}</span></button>
            )}
          </div>
        )}

        {/* history */}
        <div className="cr-card">
          <h3 className="cr-h3"><span>{t("c_versions")}</span></h3>
          <ul className="cr-versions">
            {[...(detail.versions || [])].sort((a: any, b: any) => b.versionNumber - a.versionNumber).map((v: any) => {
              const instr: string = v.revisionInstruction || "";
              const label = v.versionNumber === 1 ? t("c_firstVersion")
                : instr === "manual_edit" ? t("c_manual")
                : instr.startsWith("restored:") ? t("c_restored")
                : `${t("c_aiVersion")}${instr ? `: ${instr}` : ""}`;
              return <li key={v.versionNumber}><strong>{t("c_version")} {v.versionNumber}</strong> · {fmt(v.createdAt, lang)} · {label}</li>;
            })}
          </ul>
        </div>
      </>,
    );
  }

  /* list view */
  return shell(
    <>
      {error && <div className="cr-error">{error}</div>}
      {rows === null ? (
        <div className="cr-card"><Loader2 size={16} className="cr-spin" /> <span>{t("c_loading")}</span></div>
      ) : rows.length === 0 ? (
        <div className="cr-card"><p>{t("c_empty")}</p></div>
      ) : (
        <div className="cr-list">
          {rows.map((r) => {
            const Icon = ICONS[r.type] || FileText;
            return (
              <button key={r.id} className="cr-item" onClick={() => open(r.id)} disabled={loading}>
                <span className="cr-item-icon"><Icon size={18} /></span>
                <span className="cr-item-main">
                  <strong>{r.title}</strong>
                  <span>{r.providerName} · {tr(CONTENT_TYPES[r.type], lang, r.type)} · {r.wordCount} {t("c_words")} · {t("c_version")} {r.currentVersion}</span>
                </span>
                <span className={`cr-pill ${TONE[r.status] || "gray"}`}><span>{statusText(r.status, lang)}</span></span>
              </button>
            );
          })}
        </div>
      )}
    </>,
  );
}

const CSS = `
.cr-root { font-family:"Plus Jakarta Sans",system-ui,sans-serif; color:#111827; max-width:860px; margin:0 auto; padding:32px 16px 64px; }
.cr-top { display:flex; justify-content:space-between; align-items:flex-start; gap:16px; flex-wrap:wrap; margin-bottom:8px; }
.cr-top-right { display:flex; align-items:center; gap:10px; }
.cr-h1 { font-size:26px; font-weight:800; letter-spacing:-.02em; margin:0; }
.cr-sub { margin:6px 0 0; color:#6b7280; font-size:14px; max-width:560px; line-height:1.5; }
.cr-h2 { font-size:24px; font-weight:800; letter-spacing:-.02em; margin:12px 0 6px; line-height:1.25; }
.cr-h3 { font-size:15px; font-weight:800; margin:0 0 6px; display:flex; align-items:center; gap:8px; }
.cr-lead { font-size:15px; color:#4b5563; margin:0 0 8px; }
.cr-meta { font-size:12px; color:#9ca3af; margin:2px 0 14px; }
.cr-help { font-size:13px; color:#6b7280; line-height:1.5; margin:0 0 12px; }
.cr-card { background:#fff; border:1px solid #e5e7eb; border-radius:18px; padding:22px; margin-bottom:16px; box-shadow:0 1px 3px rgba(15,23,42,.04); }
.cr-row { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
.cr-lang { display:inline-flex; background:#f3f4f6; border-radius:999px; padding:3px; }
.cr-lang button { border:0; background:transparent; padding:6px 12px; border-radius:999px; font-size:12px; font-weight:800; color:#6b7280; cursor:pointer; font-family:inherit; }
.cr-lang button.on { background:#fff; color:#111827; box-shadow:0 1px 3px rgba(0,0,0,.12); }
.cr-btn { display:inline-flex; align-items:center; justify-content:center; gap:7px; height:40px; padding:0 18px; border-radius:999px; border:1px solid #111; background:#111; color:#fff; font-family:inherit; font-size:13px; font-weight:700; cursor:pointer; text-decoration:none; }
.cr-btn:hover:not(:disabled) { background:#222; }
.cr-btn:disabled { opacity:.45; cursor:not-allowed; }
.cr-btn.ghost { background:#fff; color:#374151; border-color:#e5e7eb; }
.cr-back { display:inline-flex; align-items:center; gap:6px; border:0; background:transparent; color:#4b5563; font-family:inherit; font-size:13px; font-weight:700; cursor:pointer; margin:8px 0 14px; padding:0; }
.cr-pill { display:inline-flex; align-items:center; gap:5px; padding:4px 10px; border-radius:999px; font-size:11.5px; font-weight:800; background:#f3f4f6; color:#4b5563; white-space:nowrap; }
.cr-pill.blue { background:#e0f2fe; color:#075985; } .cr-pill.green { background:#dcfce7; color:#166534; }
.cr-pill.amber { background:#fef3c7; color:#92400e; } .cr-pill.red { background:#fee2e2; color:#991b1b; }
.cr-list { display:flex; flex-direction:column; gap:10px; }
.cr-item { display:flex; align-items:center; gap:14px; text-align:left; width:100%; background:#fff; border:1px solid #e5e7eb; border-radius:16px; padding:16px 18px; cursor:pointer; font-family:inherit; }
.cr-item:hover:not(:disabled) { border-color:#bae6fd; background:#fafdff; }
.cr-item-icon { width:42px; height:42px; display:flex; align-items:center; justify-content:center; border-radius:12px; background:#f3f4f6; color:#374151; flex:none; }
.cr-item-main { flex:1; display:flex; flex-direction:column; gap:3px; min-width:0; }
.cr-item-main strong { font-size:15px; color:#111827; }
.cr-item-main span { font-size:12.5px; color:#6b7280; }
.cr-banner { margin-top:14px; padding:11px 14px; border-radius:12px; font-size:13px; font-weight:700; background:#f3f4f6; color:#374151; }
.cr-banner.blue { background:#f0f9ff; color:#075985; } .cr-banner.amber { background:#fffbeb; color:#92400e; }
.cr-banner.green { background:#f0fdf4; color:#166534; } .cr-banner.red { background:#fef2f2; color:#991b1b; }
.cr-note { margin-top:12px; padding:12px 14px; border-radius:12px; background:#fffbeb; border:1px solid #fde68a; color:#78350f; font-size:13.5px; line-height:1.55; }
.cr-ok { display:flex; align-items:center; gap:6px; margin-top:12px; color:#059669; font-weight:700; font-size:13px; }
.cr-error { margin:12px 0; color:#dc2626; font-weight:700; font-size:13px; }
.cr-cover { width:100%; aspect-ratio:3/2; object-fit:cover; border-radius:14px; margin-bottom:18px; background:#f3f4f6; }
.cr-label { font-size:11px; font-weight:800; letter-spacing:.05em; text-transform:uppercase; color:#6b7280; margin:18px 0 6px; display:block; }
.cr-excerpt { font-size:15px; color:#374151; line-height:1.7; margin:0 0 6px; font-weight:500; }
.cr-body { font-size:15px; line-height:1.8; color:#1f2937; max-width:720px; }
.cr-body h3 { font-size:19px; font-weight:800; margin:26px 0 8px; } .cr-body h4 { font-size:16px; font-weight:800; margin:18px 0 6px; }
.cr-body p { margin:0 0 14px; } .cr-body blockquote { margin:14px 0; padding:4px 16px; border-left:4px solid #cbd5e1; color:#4b5563; }
.cr-body ul, .cr-body ol { margin:0 0 14px; padding-left:22px; }
.cr-grid { display:grid; grid-template-columns:1fr 1fr; gap:6px 24px; } @media (max-width:640px) { .cr-grid { grid-template-columns:1fr; } }
.cr-seo { display:flex; flex-direction:column; gap:3px; padding:12px 14px; border:1px solid #eef0f3; border-radius:12px; font-size:13px; } .cr-seo strong { color:#1d4ed8; } .cr-seo span { color:#4b5563; }
.cr-sources { margin:0; padding-left:20px; color:#4b5563; font-size:13px; line-height:1.7; }
.cr-chips { display:flex; flex-wrap:wrap; gap:8px; margin-bottom:12px; }
.cr-chip { border:1px solid #e5e7eb; background:#fff; border-radius:999px; padding:6px 13px; font-family:inherit; font-size:12.5px; font-weight:700; color:#374151; cursor:pointer; }
.cr-chip:hover:not(:disabled) { background:#f0f9ff; border-color:#7dd3fc; } .cr-chip:disabled { opacity:.45; cursor:not-allowed; }
.cr-input { width:100%; border:1.5px solid #e5e7eb; border-radius:12px; padding:10px 14px; font-family:inherit; font-size:14px; color:#111827; background:#fff; box-sizing:border-box; resize:vertical; }
.cr-input:focus { outline:none; border-color:#78d2f5; box-shadow:0 0 0 3px rgba(120,210,245,.22); }
.cr-chat { display:flex; flex-direction:column; gap:10px; }
.cr-bubble { max-width:86%; padding:10px 14px; border-radius:16px; font-size:13.5px; line-height:1.5; }
.cr-bubble.me { margin-left:auto; background:#111827; color:#fff; border-bottom-right-radius:4px; }
.cr-bubble.admin { background:#f3f4f6; border-bottom-left-radius:4px; }
.cr-who { font-size:11px; font-weight:800; opacity:.7; margin-bottom:3px; }
.cr-versions { list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:8px; font-size:13px; color:#4b5563; }
.cr-spin { animation:crspin 1s linear infinite; } @keyframes crspin { to { transform:rotate(360deg); } }
`;
