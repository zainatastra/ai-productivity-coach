"use client";

import { FormSkeleton } from "@/components/loading/Skeleton";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle, ArrowLeft, BookOpen, CheckCircle2, ExternalLink, FileText, Loader2, Lock,
  RefreshCw, Sparkles, Trash2, Video, XCircle, Eye, Check, RotateCcw, ImageIcon,
} from "lucide-react";
import { EditPanel, RevisionPanel, ComparePanel, type DraftDoc } from "./DraftWorkspace";
import { ReviewTab, STATUS_TONE, statusLabel } from "./ReviewPanels";
import { rt } from "./reviewText";
import {
  CONTENT_ERRORS, CONTENT_TYPES, ERRORS, EXTRA_ERRORS, GATE_REASONS, GATE_STATES, Lang,
  QUALITY_CHECKS, QUALITY_STATES, TEXT, tr,
} from "./aiPublishingText";

/* eslint-disable @typescript-eslint/no-explicit-any */

type Api = (path: string, init?: RequestInit) => Promise<{ ok: boolean; status: number; data: any; code?: string }>;

type Engine = { provider: string; configured: boolean; writingModel: string; lightModel: string };

type PlanItem = {
  type: string;
  title: string;
  angle: string;
  audience: string;
  keyPoints: string[];
  instruction: string;
  status: string;
  contentId: string | null;
  gate?: { state: string; reasons: string[] } | null;
};

type Plan = {
  exists: boolean;
  hasKnowledge: boolean;
  status?: "draft" | "approved";
  version?: number;
  engine: Engine;
  items: PlanItem[];
};

type ContentRow = {
  id: string;
  type: string;
  title: string;
  status: string;
  wordCount?: number;
  currentVersion?: number;
  updatedAt?: string;
  model?: string;
  quality?: { state: string };
};

type Block = { type: string; level: number; text: string; ordered: boolean; items: string[] };

type MediaItem = {
  id: string;
  url: string;
  altText: string;
  prompt: string;
  model: string;
  instruction?: string;
  createdAt?: string;
};

type ContentDetail = ContentRow & {
  media?: MediaItem[];
  coverMediaId?: string;
  subtitle?: string;
  excerpt?: string;
  seoTitle?: string;
  metaDescription?: string;
  blocks: Block[];
  data?: Record<string, any>;
  notes?: string;
  llmProvider?: string;
  sources?: { number: number; url: string; title: string; used: boolean }[];
  quality?: { state: string; checks: { code: string; severity: string; detail: string }[]; metrics?: Record<string, number> };
  versions?: { id: string; versionNumber: number; createdAt?: string; revisionInstruction?: string; model?: string; llmProvider?: string; createdByAI?: boolean }[];
};

type Draft = { title: string; angle: string; audience: string; points: string; instruction: string };

interface Props {
  lang: Lang;
  providerId: string;
  api: Api;
  archived: boolean;
  generationRunning: boolean;
  refreshKey: string;
  onJobStarted: (kind?: "documents" | "image" | "revision") => void;
}

const ICONS: Record<string, any> = { article: FileText, whitepaper: BookOpen, webinar: Video, tutorial: Lock };

const fmt = (iso: string | undefined, lang: Lang) =>
  iso
    ? new Date(iso).toLocaleString(lang === "de" ? "de-DE" : "en-GB", {
        day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
      })
    : "";

const hostOf = (url: string) => url.replace(/^https?:\/\//, "");

const toDraft = (item: PlanItem): Draft => ({
  title: item.title,
  angle: item.angle,
  audience: item.audience,
  points: item.keyPoints.join("\n"),
  instruction: item.instruction,
});

const pointsOf = (text: string) =>
  text.split("\n").map((p) => p.trim()).filter((p) => p.length > 0);

export default function ContentPanels({ lang, providerId, api, archived, generationRunning, refreshKey, onJobStarted }: Props) {
  const t = (key: keyof typeof TEXT) => TEXT[key][lang];

  const [initialLoaded, setInitialLoaded] = useState(false);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [docs, setDocs] = useState<ContentRow[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const serverDrafts = useRef<Record<string, Draft>>({});
  const [busy, setBusy] = useState<string>("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [wishOpen, setWishOpen] = useState<string | null>(null);
  const [wish, setWish] = useState("");
  const [openDoc, setOpenDoc] = useState<ContentDetail | null>(null);
  const [docLoading, setDocLoading] = useState(false);
  const [confirm, setConfirm] = useState<null | { kind: "delete" | "rewriteAll"; id?: string }>(null);

  const errorText = (res: { status: number; code?: string }) => {
    if (res.status === 0) return t("networkError");
    if (res.status === 401 || res.status === 403) return t("denied");
    const code = res.code;
    return tr(code ? CONTENT_ERRORS[code] || ERRORS[code] || EXTRA_ERRORS[code] : undefined, lang, t("genericError"));
  };

  const load = useCallback(async () => {
    const [p, c] = await Promise.all([
      api(`/api/ai/providers/${providerId}/content-plan`),
      api(`/api/ai/providers/${providerId}/content`),
    ]);

    if (p.ok) {
      setPlan(p.data);

      // Refresh the cards from the server, but never overwrite text the admin is still editing.
      const previous = serverDrafts.current;
      const fresh: Record<string, Draft> = {};
      for (const item of p.data.items as PlanItem[]) fresh[item.type] = toDraft(item);
      serverDrafts.current = fresh;

      setDrafts((current) => {
        const next: Record<string, Draft> = {};
        for (const type of Object.keys(fresh)) {
          const local = current[type];
          const untouched = !local || !previous[type] || JSON.stringify(local) === JSON.stringify(previous[type]);
          next[type] = untouched ? fresh[type] : local;
        }
        return next;
      });
    }

    if (c.ok) setDocs(c.data || []);
    setInitialLoaded(true);
  }, [api, providerId]);

  useEffect(() => {
    // Deferred so the state updates inside load() never run synchronously in the effect body.
    const timer = setTimeout(() => { void load(); }, 0);
    return () => clearTimeout(timer);
  }, [load, refreshKey]);

  /* ── plan actions ── */
  const run = async (key: string, action: () => Promise<{ ok: boolean; status: number; data: any; code?: string }>, onOk?: (data: any) => void) => {
    setBusy(key);
    setError("");
    setNotice("");

    const res = await action();
    setBusy("");

    if (!res.ok) {
      setError(errorText(res));
      return false;
    }

    onOk?.(res.data);
    return true;
  };

  const applyPlan = (data: Plan) => {
    setPlan(data);
    const next: Record<string, Draft> = {};
    for (const item of data.items) next[item.type] = toDraft(item);
    serverDrafts.current = next;
    setDrafts(next);
  };

  const createPlan = () =>
    run("plan", () => api(`/api/ai/providers/${providerId}/content-plan/generate`, { method: "POST", body: JSON.stringify({}) }), applyPlan);

  const saveItem = (type: string) => {
    const d = drafts[type];
    return run(`save-${type}`, () =>
      api(`/api/ai/providers/${providerId}/content-plan/items/${type}`, {
        method: "PATCH",
        body: JSON.stringify({ title: d.title, angle: d.angle, audience: d.audience, keyPoints: pointsOf(d.points), instruction: d.instruction }),
      }), (data) => { applyPlan(data); setNotice(t("saved")); });
  };

  const toggleRemoved = (item: PlanItem) =>
    run(`remove-${item.type}`, () =>
      api(`/api/ai/providers/${providerId}/content-plan/items/${item.type}`, {
        method: "PATCH",
        body: JSON.stringify({ removed: item.status !== "removed" }),
      }), applyPlan);

  const regenerateItem = (type: string) =>
    run(`regen-${type}`, () =>
      api(`/api/ai/providers/${providerId}/content-plan/items/${type}/regenerate`, {
        method: "POST",
        body: JSON.stringify({ instruction: wish }),
      }), (data) => { applyPlan(data); setWishOpen(null); setWish(""); });

  const approve = () =>
    run("approve", () => api(`/api/ai/providers/${providerId}/content-plan/approve`, { method: "POST", body: JSON.stringify({}) }), applyPlan);

  const generate = async (types?: string[], regenerate = false) => {
    const ok = await run("generate", () =>
      api(`/api/ai/providers/${providerId}/content/generate`, {
        method: "POST",
        body: JSON.stringify({ types, regenerate }),
      }));

    if (ok) onJobStarted("documents");
  };

  /* ── documents ── */
  const open = async (id: string) => {
    setDocLoading(true);
    setError("");

    const res = await api(`/api/ai/content/${id}`);
    setDocLoading(false);

    if (!res.ok) {
      setError(errorText(res));
      return;
    }

    setOpenDoc(res.data);
  };

  const remove = async (id: string) => {
    setConfirm(null);

    const ok = await run("delete", () => api(`/api/ai/content/${id}`, { method: "DELETE" }));
    if (ok) {
      setOpenDoc(null);
      await load();
    }
  };

  const reloadDoc = useCallback(async (id: string) => {
    const res = await api(`/api/ai/content/${id}`);
    if (res.ok) setOpenDoc(res.data);
  }, [api]);

  // After an image job ends (the job list changes), show the new picture without leaving the draft.
  const openId = openDoc?.id;
  useEffect(() => {
    if (!openId) return;
    const timer = setTimeout(() => { void reloadDoc(openId); }, 0);
    return () => clearTimeout(timer);
  }, [refreshKey, openId, reloadDoc]);

  const createImage = async (id: string, instruction: string) => {
    const ok = await run("image", () =>
      api(`/api/ai/content/${id}/media/generate`, { method: "POST", body: JSON.stringify({ instruction }) }));
    if (ok) onJobStarted("image");
    return ok;
  };

  const [reviseError, setReviseError] = useState("");

  const reviseDoc = async (id: string, instruction: string) => {
    setReviseError("");
    const res = await api(`/api/ai/content/${id}/revise`, { method: "POST", body: JSON.stringify({ instruction }) });

    if (!res.ok) {
      setReviseError(errorText(res));
      return false;
    }

    onJobStarted("revision");
    return true;
  };

  const restoreDoc = async (id: string, version: number) => {
    const ok = await run("restore", () => api(`/api/ai/content/${id}/versions/${version}/restore`, { method: "POST" }),
      () => setNotice(t("restored")));
    if (ok) await reloadDoc(id);
    return ok;
  };

  const makeCover = async (id: string, mediaId: string) => {
    const ok = await run(`cover-${mediaId}`, () => api(`/api/ai/content/${id}/media/${mediaId}/cover`, { method: "PUT" }));
    if (ok) await reloadDoc(id);
  };

  const removeImage = async (id: string, mediaId: string) => {
    const ok = await run(`img-del-${mediaId}`, () => api(`/api/ai/content/${id}/media/${mediaId}`, { method: "DELETE" }));
    if (ok) await reloadDoc(id);
  };

  const dirty = (type: string) => {
    const item = plan?.items.find((i) => i.type === type);
    const d = drafts[type];
    return !!item && !!d && JSON.stringify(d) !== JSON.stringify(toDraft(item));
  };

  const anyDirty = plan?.items.some((i) => i.type !== "tutorial" && dirty(i.type)) ?? false;
  const generatable = plan?.items.filter((i) => i.type !== "tutorial" && i.status === "proposed") ?? [];
  const missing = generatable.filter((i) => !i.contentId);
  const approved = plan?.status === "approved";
  const locked = archived || generationRunning || busy !== "";

  if (!initialLoaded || docLoading) return <FormSkeleton />;

  /* ═══════════ document viewer ═══════════ */
  if (openDoc) {
    return (
      <DocumentViewer
        lang={lang}
        doc={openDoc}
        approved={!!approved}
        locked={locked}
        error={error}
        onBack={() => { setOpenDoc(null); setError(""); load(); }}
        onRewrite={() => generate([openDoc.type], true).then(() => setOpenDoc(null))}
        onDelete={() => setConfirm({ kind: "delete", id: openDoc.id })}
        api={api}
        revising={generationRunning}
        reviseError={reviseError}
        onRevise={(instruction) => reviseDoc(openDoc.id, instruction)}
        onRestore={(version) => restoreDoc(openDoc.id, version)}
        onSaved={() => { void reloadDoc(openDoc.id); void load(); }}
        imageBusy={busy}
        onCreateImage={(instruction) => createImage(openDoc.id, instruction)}
        onMakeCover={(mediaId) => makeCover(openDoc.id, mediaId)}
        onDeleteImage={(mediaId) => removeImage(openDoc.id, mediaId)}
        confirm={confirm}
        onConfirm={() => confirm?.id && remove(confirm.id)}
        onCancelConfirm={() => setConfirm(null)}
      />
    );
  }

  /* ═══════════ plan + list ═══════════ */
  return (
    <>
      <div className="aip-card">
        <div className="aip-card-head">
          <div>
            <h3 className="aip-h3"><Sparkles size={16} /> <span>{t("contentTitle")}</span></h3>
            <p className="aip-help">{t("contentHelp")}</p>
          </div>

          {plan && (
            <div className="aip-engine">
              <span className={`aip-pill ${plan.engine.configured ? (plan.engine.provider === "anthropic" ? "blue" : "amber") : "red"}`}>
                <span>
                  {plan.engine.configured
                    ? `${t("engineLabel")}: ${plan.engine.provider === "anthropic" ? "Claude" : "OpenAI"} · ${plan.engine.writingModel}`
                    : t("engineMissing")}
                </span>
              </span>
              {plan.engine.configured && plan.engine.provider !== "anthropic" && (
                <span className="aip-hint">{t("engineFallback")}</span>
              )}
            </div>
          )}
        </div>

        {error && <div className="aip-error-text" style={{ marginBottom: 10 }}>{error}</div>}
        {notice && <div className="aip-ok-text">{notice}</div>}

        {plan && !plan.hasKnowledge ? (
          <div className="aip-muted">{t("needResearch")}</div>
        ) : !plan?.exists ? (
          <button className="aip-btn" onClick={createPlan} disabled={locked || !plan || !plan.engine.configured}>
            {busy === "plan" ? <Loader2 size={14} className="aip-spin" /> : <Sparkles size={14} />}
            <span>{busy === "plan" ? t("creatingPlan") : t("createPlan")}</span>
          </button>
        ) : (
          <>
            <div className="aip-plan-bar">
              <span className={`aip-pill ${approved ? "green" : "amber"}`}>
                <span>{approved ? t("planApproved") : t("planDraft")}</span>
              </span>
              <div className="aip-row wrap">
                <button className="aip-btn ghost" onClick={createPlan} disabled={locked}>
                  {busy === "plan" ? <Loader2 size={13} className="aip-spin" /> : <RefreshCw size={13} />}
                  <span>{busy === "plan" ? t("creatingPlan") : t("rebuildPlan")}</span>
                </button>
                {!approved && (
                  <button className="aip-btn" onClick={approve} disabled={locked || anyDirty || generatable.length === 0} title={anyDirty ? t("saveFirst") : undefined}>
                    {busy === "approve" ? <Loader2 size={13} className="aip-spin" /> : <Check size={13} />}
                    <span>{busy === "approve" ? t("approving") : t("approvePlan")}</span>
                  </button>
                )}
                {approved && missing.length > 0 && (
                  <button className="aip-btn" onClick={() => generate()} disabled={locked}>
                    {generationRunning || busy === "generate" ? <Loader2 size={13} className="aip-spin" /> : <Sparkles size={13} />}
                    <span>{generationRunning || busy === "generate" ? t("generatingContent") : t("generateContent")}</span>
                  </button>
                )}
                {approved && missing.length === 0 && generatable.length > 0 && (
                  <button className="aip-btn ghost" onClick={() => setConfirm({ kind: "rewriteAll" })} disabled={locked}>
                    <RotateCcw size={13} /> <span>{t("generateAgain")}</span>
                  </button>
                )}
              </div>
            </div>

            <div className="aip-plan-grid">
              {plan.items.map((item) => (
                <PlanCard
                  key={item.type}
                  lang={lang}
                  item={item}
                  draft={drafts[item.type]}
                  dirty={dirty(item.type)}
                  busy={busy}
                  locked={locked}
                  wishOpen={wishOpen === item.type}
                  wish={wish}
                  onDraft={(d) => setDrafts((cur) => ({ ...cur, [item.type]: d }))}
                  onSave={() => saveItem(item.type)}
                  onToggleRemoved={() => toggleRemoved(item)}
                  onOpenWish={() => { setWishOpen(wishOpen === item.type ? null : item.type); setWish(""); }}
                  onWish={setWish}
                  onSuggest={() => regenerateItem(item.type)}
                  onOpenDoc={() => item.contentId && open(item.contentId)}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {docs.length > 0 && (
        <div className="aip-card aip-focus-target" id="aip-docs">
          <h3 className="aip-h3"><FileText size={16} /> <span>{t("docsTitle")}</span> <span className="aip-pill gray">{docs.length}</span></h3>
          <p className="aip-help" style={{ marginBottom: 12 }}>{t("privateNote")}</p>

          <div className="aip-list">
            {docs.map((doc) => {
              const Icon = ICONS[doc.type] || FileText;
              return (
                <button key={doc.id} className="aip-item" onClick={() => open(doc.id)} disabled={docLoading}>
                  <div className="aip-logo sm"><Icon size={17} /></div>
                  <div className="aip-item-main">
                    <strong><span>{doc.title}</span></strong>
                    <span>
                      {tr(CONTENT_TYPES[doc.type], lang, doc.type)} · {doc.wordCount ?? 0} {t("words")} · {t("version")} {doc.currentVersion ?? 1} · {fmt(doc.updatedAt, lang)}
                    </span>
                  </div>
                  <div className="aip-item-side">
                    <span className={`aip-pill ${STATUS_TONE[doc.status] || "gray"}`}><span>{statusLabel(doc.status, lang)}</span></span>
                    {doc.quality && (
                      <span className={`aip-pill ${doc.quality.state === "ok" ? "green" : doc.quality.state === "warnings" ? "amber" : "red"}`}>
                        <span>{tr(QUALITY_STATES[doc.quality.state], lang, doc.quality.state)}</span>
                      </span>
                    )}
                    <Eye size={15} color="#9ca3af" />
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {confirm?.kind === "rewriteAll" && (
        <div className="aip-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) setConfirm(null); }}>
          <div className="aip-dialog">
            <p><span>{t("confirmRewriteAll")}</span></p>
            <div className="aip-row">
              <button className="aip-btn" onClick={() => { setConfirm(null); generate(undefined, true); }}><span>{t("generateAgain")}</span></button>
              <button className="aip-btn ghost" onClick={() => setConfirm(null)}><span>{t("cancel")}</span></button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ═════════════ one plan card ═════════════ */

function PlanCard(props: {
  lang: Lang;
  item: PlanItem;
  draft?: Draft;
  dirty: boolean;
  busy: string;
  locked: boolean;
  wishOpen: boolean;
  wish: string;
  onDraft: (d: Draft) => void;
  onSave: () => void;
  onToggleRemoved: () => void;
  onOpenWish: () => void;
  onWish: (v: string) => void;
  onSuggest: () => void;
  onOpenDoc: () => void;
}) {
  const { lang, item, draft, dirty, busy, locked } = props;
  const t = (key: keyof typeof TEXT) => TEXT[key][lang];
  const Icon = ICONS[item.type] || FileText;
  const label = tr(CONTENT_TYPES[item.type], lang, item.type);

  if (item.type === "tutorial") {
    return (
      <div className="aip-plan-card soon">
        <div className="aip-plan-head">
          <span className="aip-plan-type"><Icon size={15} /> <span>{label}</span></span>
          <span className="aip-pill blue"><span>{t("comingSoon")}</span></span>
        </div>
        <p className="aip-help">{t("tutorialSoonText")}</p>
      </div>
    );
  }

  const removed = item.status === "removed";
  const gate = item.gate;

  return (
    <div className={`aip-plan-card ${removed ? "removed" : ""}`}>
      <div className="aip-plan-head">
        <span className="aip-plan-type"><Icon size={15} /> <span>{label}</span></span>
        <span className="aip-row wrap" style={{ margin: 0 }}>
          {item.contentId && <span className="aip-pill green"><span>{t("hasDocument")}</span></span>}
          {gate && gate.state !== "ready" && (
            <span className={`aip-pill ${gate.state === "blocked" ? "red" : "amber"}`} title={gate.reasons.map((r) => tr(GATE_REASONS[r], lang, r)).join(", ")}>
              {gate.state === "blocked" ? <XCircle size={10} /> : <AlertTriangle size={10} />}
              <span>{tr(GATE_STATES[gate.state], lang, gate.state)}</span>
            </span>
          )}
        </span>
      </div>

      {removed ? (
        <div className="aip-muted">{t("removedItem")}</div>
      ) : (
        draft && (
          <>
            <label className="aip-label">{t("planFieldTitle")}</label>
            <input className="aip-input" value={draft.title} maxLength={180} disabled={locked}
              onChange={(e) => props.onDraft({ ...draft, title: e.target.value })} />

            <label className="aip-label">{t("planFieldAngle")}</label>
            <textarea className="aip-input aip-area" rows={3} value={draft.angle} maxLength={500} disabled={locked}
              onChange={(e) => props.onDraft({ ...draft, angle: e.target.value })} />

            <label className="aip-label">{t("planFieldAudience")}</label>
            <input className="aip-input" value={draft.audience} maxLength={200} disabled={locked}
              onChange={(e) => props.onDraft({ ...draft, audience: e.target.value })} />

            <label className="aip-label">{t("planFieldPoints")}</label>
            <textarea className="aip-input aip-area" rows={4} value={draft.points} disabled={locked}
              onChange={(e) => props.onDraft({ ...draft, points: e.target.value })} />

            <label className="aip-label">{t("planFieldInstruction")}</label>
            <textarea className="aip-input aip-area" rows={2} value={draft.instruction} maxLength={1000} disabled={locked}
              placeholder={t("planInstructionPh")}
              onChange={(e) => props.onDraft({ ...draft, instruction: e.target.value })} />
          </>
        )
      )}

      {props.wishOpen && !removed && (
        <div className="aip-wish">
          <label className="aip-label">{t("suggestWish")}</label>
          <input className="aip-input" value={props.wish} placeholder={t("suggestWishPh")} maxLength={600}
            onChange={(e) => props.onWish(e.target.value)} />
          <button className="aip-btn" onClick={props.onSuggest} disabled={locked}>
            {busy === `regen-${item.type}` ? <Loader2 size={13} className="aip-spin" /> : <Sparkles size={13} />}
            <span>{busy === `regen-${item.type}` ? t("suggesting") : t("suggest")}</span>
          </button>
        </div>
      )}

      <div className="aip-row wrap" style={{ marginTop: 12 }}>
        {!removed && (
          <button className="aip-btn" onClick={props.onSave} disabled={locked || !dirty}>
            {busy === `save-${item.type}` ? <Loader2 size={13} className="aip-spin" /> : <Check size={13} />}
            <span>{t("savePlanItem")}</span>
          </button>
        )}
        {!removed && (
          <button className="aip-btn ghost" onClick={props.onOpenWish} disabled={locked}>
            <Sparkles size={13} /> <span>{t("suggestAgain")}</span>
          </button>
        )}
        <button className="aip-btn ghost" onClick={props.onToggleRemoved} disabled={locked}>
          {removed ? <RotateCcw size={13} /> : <Trash2 size={13} />}
          <span>{removed ? t("restoreItem") : t("removeItem")}</span>
        </button>
        {item.contentId && (
          <button className="aip-btn ghost" onClick={props.onOpenDoc}>
            <Eye size={13} /> <span>{t("openDoc")}</span>
          </button>
        )}
      </div>
    </div>
  );
}

/* ═════════════ document viewer ═════════════ */

function Inline({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
        part.startsWith("**") && part.endsWith("**") ? <strong key={i}>{part.slice(2, -2)}</strong> : <Fragment key={i}>{part}</Fragment>
      )}
    </>
  );
}

function DocumentViewer(props: {
  lang: Lang;
  doc: ContentDetail;
  approved: boolean;
  locked: boolean;
  error: string;
  confirm: null | { kind: "delete" | "rewriteAll"; id?: string };
  onBack: () => void;
  onRewrite: () => void;
  onDelete: () => void;
  api: Api;
  revising: boolean;
  reviseError: string;
  onRevise: (instruction: string) => Promise<boolean>;
  onRestore: (version: number) => Promise<boolean>;
  onSaved: () => void;
  imageBusy: string;
  onCreateImage: (instruction: string) => Promise<boolean>;
  onMakeCover: (mediaId: string) => void;
  onDeleteImage: (mediaId: string) => void;
  onConfirm: () => void;
  onCancelConfirm: () => void;
}) {
  const { lang, doc } = props;
  const t = (key: keyof typeof TEXT) => TEXT[key][lang];
  const data = doc.data || {};
  const quality = doc.quality;
  const [imageWish, setImageWish] = useState("");
  const images = doc.media || [];

  const [tab, setTab] = useState<"read" | "edit" | "ai" | "compare" | "review">("read");
  const editable = doc.status === "draft" || doc.status === "changes_requested";
  const [dirty, setDirty] = useState(false);

  // Leaving a tab with typed-in changes asks first, so nothing is lost by accident.
  const guard = (action: () => void) => {
    if (dirty && !window.confirm(t("editLeaveConfirm"))) return;
    if (dirty) setDirty(false);
    action();
  };

  const tabs: { id: typeof tab; label: keyof typeof TEXT }[] = [
    { id: "read", label: "tabRead" }, { id: "edit", label: "tabEdit" }, { id: "ai", label: "tabAi" }, { id: "compare", label: "tabCompare" },
  ];

  const draft = doc as unknown as DraftDoc;
  const manual = doc.llmProvider === "manual";

  return (
    <>
      <button className="aip-back" onClick={() => guard(props.onBack)}><ArrowLeft size={14} /> <span>{t("closeDoc")}</span></button>

      <div className="aip-card aip-focus-target" id="aip-doc-head">
        <div className="aip-doc-top">
          <div>
            <div className="aip-row wrap" style={{ margin: "0 0 8px" }}>
              <span className="aip-pill blue"><span>{tr(CONTENT_TYPES[doc.type], lang, doc.type)}</span></span>
              <span className={`aip-pill ${STATUS_TONE[doc.status] || "gray"}`}><span>{statusLabel(doc.status, lang)}</span></span>
              <span className="aip-pill gray"><span>{t("version")} {doc.currentVersion ?? 1}</span></span>
              <span className="aip-pill gray"><span>{doc.wordCount ?? 0} {t("words")}</span></span>
              {quality && (
                <span className={`aip-pill ${quality.state === "ok" ? "green" : quality.state === "warnings" ? "amber" : "red"}`}>
                  <span>{tr(QUALITY_STATES[quality.state], lang, quality.state)}</span>
                </span>
              )}
            </div>
            <h2 className="aip-doc-title"><span>{doc.title}</span></h2>
            {doc.subtitle && <p className="aip-doc-sub"><span>{doc.subtitle}</span></p>}
            <div className="aip-meta">
              {t("privateNote")} · {manual ? t("editedByAdmin") : `${t("writtenBy")} ${doc.llmProvider === "anthropic" ? "Claude" : "OpenAI"} ${doc.model}`} · {fmt(doc.updatedAt, lang)}
            </div>
          </div>

          <div className="aip-row wrap">
            <button className="aip-btn ghost" onClick={props.onRewrite} disabled={props.locked || !props.approved || doc.status !== "draft"}
              title={!props.approved ? t("approvePlanFirst") : undefined}>
              <RefreshCw size={13} /> <span>{t("rewriteDoc")}</span>
            </button>
            <button className="aip-btn ghost danger-text" onClick={props.onDelete} disabled={props.locked || doc.status !== "draft"}>
              <Trash2 size={13} /> <span>{t("deleteDoc")}</span>
            </button>
          </div>
        </div>
        {props.error && <div className="aip-error-text">{props.error}</div>}
      </div>

      <div className="aip-tabs" role="tablist">
        {tabs.map((x) => (
          <button key={x.id} role="tab" aria-selected={tab === x.id} className={`aip-tab ${tab === x.id ? "on" : ""}`}
            onClick={() => { if (x.id !== tab) guard(() => setTab(x.id)); }}>
            <span>{t(x.label)}</span>
          </button>
        ))}
        <button role="tab" aria-selected={tab === "review"} className={`aip-tab ${tab === "review" ? "on" : ""}`}
          onClick={() => { if (tab !== "review") guard(() => setTab("review")); }}>
          <span>{rt("tabReview", lang)}</span>
        </button>
      </div>

      {tab === "edit" && (
        <EditPanel lang={lang} doc={draft} api={props.api} locked={props.locked || !editable} onDirty={setDirty}
          onSaved={() => { setDirty(false); props.onSaved(); }} />
      )}

      {tab === "ai" && (
        <RevisionPanel lang={lang} doc={draft} locked={props.locked || !editable} running={props.revising}
          error={props.reviseError} onRevise={props.onRevise} />
      )}

      {tab === "compare" && (
        <ComparePanel lang={lang} doc={draft} api={props.api} locked={props.locked || !editable} onRestore={props.onRestore} />
      )}

      {tab === "review" && (
        <ReviewTab lang={lang} contentId={doc.id} status={doc.status} api={props.api} locked={props.locked}
          onChanged={props.onSaved} />
      )}

      {(tab === "read" || tab === "ai") && (
        <>
      <div className="aip-card">
        {doc.excerpt && (
          <div className="aip-doc-section">
            <div className="aip-label">{t("docExcerpt")}</div>
            <p className="aip-doc-excerpt"><span>{doc.excerpt}</span></p>
          </div>
        )}

        <div className="aip-label">{t("docBody")}</div>
        <div className="aip-doc-body">
          {doc.blocks.map((block, i) => {
            if (block.type === "heading") {
              return block.level === 3
                ? <h5 key={i}><span>{block.text}</span></h5>
                : <h4 key={i}><span>{block.text}</span></h4>;
            }
            if (block.type === "list") {
              const Tag = block.ordered ? "ol" : "ul";
              return <Tag key={i}>{block.items.map((li, j) => <li key={j}><Inline text={li} /></li>)}</Tag>;
            }
            if (block.type === "quote") return <blockquote key={i}><Inline text={block.text} /></blockquote>;
            return <p key={i}><Inline text={block.text} /></p>;
          })}
        </div>

        {doc.type === "whitepaper" && data.callToAction && (
          <div className="aip-doc-section">
            <div className="aip-label">{t("whitepaperCta")}</div>
            <p className="aip-doc-excerpt"><span>{data.callToAction}</span></p>
          </div>
        )}

        {doc.type === "webinar" && (
          <div className="aip-doc-grid">
            {Array.isArray(data.learningObjectives) && data.learningObjectives.length > 0 && (
              <div>
                <div className="aip-label">{t("webinarObjectives")}</div>
                <ul className="aip-doc-list">{data.learningObjectives.map((x: string, i: number) => <li key={i}>{x}</li>)}</ul>
              </div>
            )}
            {data.targetAudience && (
              <div>
                <div className="aip-label">{t("webinarAudience")}</div>
                <p className="aip-doc-excerpt"><span>{data.targetAudience}</span></p>
              </div>
            )}
            {Array.isArray(data.agenda) && data.agenda.length > 0 && (
              <div className="wide">
                <div className="aip-label">{t("webinarAgenda")} · {data.durationMinutes} {t("minutes")}</div>
                <div className="aip-agenda">
                  {data.agenda.map((a: any, i: number) => (
                    <div key={i} className="aip-agenda-row">
                      <span className="aip-pill gray"><span>{a.minutes ? `${a.minutes} ${t("minutes")}` : `${i + 1}`}</span></span>
                      <div><strong><span>{a.title}</span></strong>{a.description && <div className="aip-reason" style={{ color: "#6b7280" }}><span>{a.description}</span></div>}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {data.speakerInfo && (
              <div>
                <div className="aip-label">{t("webinarSpeaker")}</div>
                <p className="aip-doc-excerpt"><span>{data.speakerInfo}</span></p>
              </div>
            )}
            {data.registrationCopy && (
              <div>
                <div className="aip-label">{t("webinarRegistration")}</div>
                <p className="aip-doc-excerpt"><span>{data.registrationCopy}</span></p>
              </div>
            )}
            {Array.isArray(data.discussionPoints) && data.discussionPoints.length > 0 && (
              <div>
                <div className="aip-label">{t("webinarDiscussion")}</div>
                <ul className="aip-doc-list">{data.discussionPoints.map((x: string, i: number) => <li key={i}>{x}</li>)}</ul>
              </div>
            )}
            {data.bannerText && (
              <div>
                <div className="aip-label">{t("webinarBanner")}</div>
                <p className="aip-doc-excerpt"><span>{data.bannerText}</span></p>
              </div>
            )}
          </div>
        )}

        {(doc.seoTitle || doc.metaDescription) && (
          <div className="aip-doc-section">
            <div className="aip-label">{t("docSeo")}</div>
            {doc.seoTitle && <div className="aip-seo"><strong><span>{doc.seoTitle}</span></strong></div>}
            {doc.metaDescription && <div className="aip-seo-desc"><span>{doc.metaDescription}</span></div>}
          </div>
        )}

        {doc.notes && (
          <div className="aip-banner warn"><AlertTriangle size={14} /> <span>{t("docNotes")}: {doc.notes}</span></div>
        )}
      </div>


      <div className="aip-card aip-focus-target" id="aip-images">
        <div className="aip-card-head">
          <div>
            <h3 className="aip-h3"><ImageIcon size={16} /> <span>{t("imagesTitle")}</span> <span className="aip-pill gray">{images.length}</span></h3>
            <p className="aip-help">{t("imagesHelp")}</p>
          </div>
        </div>

        <div className="aip-row wrap" style={{ margin: "0 0 12px" }}>
          <input
            className="aip-input"
            style={{ flex: 1, minWidth: 220 }}
            maxLength={300}
            value={imageWish}
            placeholder={t("imageWish")}
            onChange={(e) => setImageWish(e.target.value)}
            disabled={props.locked}
          />
          <button
            className="aip-btn"
            disabled={props.locked || images.length >= 6}
            onClick={async () => { if (await props.onCreateImage(imageWish)) setImageWish(""); }}
          >
            {props.locked && props.imageBusy === "image" ? <Loader2 size={13} className="aip-spin" /> : <Sparkles size={13} />}
            <span>{t("generateImage")}</span>
          </button>
        </div>

        {images.length === 0 ? (
          <div className="aip-help"><span>{t("noImages")}</span></div>
        ) : (
          <div className="aip-images">
            {images.map((img) => (
              <figure key={img.id} className={`aip-image ${doc.coverMediaId === img.id ? "cover" : ""}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img.url} alt={img.altText} loading="lazy" />
                <figcaption>
                  <div className="aip-row wrap" style={{ margin: "0 0 6px" }}>
                    {doc.coverMediaId === img.id && <span className="aip-pill green"><span>{t("coverBadge")}</span></span>}
                    <span className="aip-pill gray"><span>{img.model}</span></span>
                  </div>
                  <div className="aip-meta"><span>{t("imageAlt")}: {img.altText}</span></div>
                  <details className="aip-meta">
                    <summary>{t("imagePrompt")}</summary>
                    <span>{img.prompt}</span>
                  </details>
                  <div className="aip-row wrap" style={{ margin: "8px 0 0" }}>
                    {doc.coverMediaId !== img.id && (
                      <button className="aip-btn ghost" disabled={props.locked} onClick={() => props.onMakeCover(img.id)}>
                        <Check size={13} /> <span>{t("makeCover")}</span>
                      </button>
                    )}
                    <button className="aip-btn ghost danger-text" disabled={props.locked} onClick={() => props.onDeleteImage(img.id)}>
                      <Trash2 size={13} /> <span>{t("deleteImage")}</span>
                    </button>
                  </div>
                </figcaption>
              </figure>
            ))}
          </div>
        )}
      </div>

      {quality && (
        <div className="aip-card">
          <h3 className="aip-h3"><span>{t("docQuality")}</span></h3>
          {quality.checks.length === 0 ? (
            <div className="aip-ok-text"><CheckCircle2 size={14} /> <span>{t("qualityOk")}</span></div>
          ) : (
            <div className="aip-recs">
              {quality.checks.map((c, i) => (
                <div key={i} className="aip-rec">
                  <AlertTriangle size={13} />
                  <span>
                    {tr(QUALITY_CHECKS[c.code], lang, c.code)}
                    {c.detail ? ` – ${c.detail}` : ""}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {doc.sources && doc.sources.length > 0 && (
        <div className="aip-card">
          <h3 className="aip-h3"><span>{t("docSources")}</span> <span className="aip-pill gray">{doc.sources.filter((s) => s.used).length}/{doc.sources.length}</span></h3>
          <div className="aip-sources">
            {doc.sources.map((s) => (
              <div key={s.number} className={`aip-source ${s.used ? "used" : ""}`}>
                <span className="aip-pill gray"><span>S{s.number}</span></span>
                <a className="aip-url" href={s.url} target="_blank" rel="noreferrer">{hostOf(s.url)} <ExternalLink size={10} /></a>
                <span className="aip-reason" style={{ color: s.used ? "#166534" : "#9ca3af" }}>
                  <span>{s.used ? t("sourceUsed") : t("sourceAvailable")}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {doc.versions && doc.versions.length > 0 && (
        <div className="aip-card">
          <h3 className="aip-h3"><span>{t("docVersions")}</span></h3>
          <div className="aip-jobs">
            {doc.versions.map((v) => (
              <div key={v.id} className="aip-job">
                <div>
                  <strong><span>{t("version")} {v.versionNumber}</span></strong>
                  <div className="aip-meta">{fmt(v.createdAt, lang)} · {v.model}{v.revisionInstruction ? ` · ${v.revisionInstruction}` : ""}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

        </>
      )}

      {props.confirm?.kind === "delete" && (
        <div className="aip-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) props.onCancelConfirm(); }}>
          <div className="aip-dialog">
            <p><span>{t("confirmDeleteDoc")}</span></p>
            <div className="aip-row">
              <button className="aip-btn danger" onClick={props.onConfirm}><span>{t("deleteDoc")}</span></button>
              <button className="aip-btn ghost" onClick={props.onCancelConfirm}><span>{t("cancel")}</span></button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
