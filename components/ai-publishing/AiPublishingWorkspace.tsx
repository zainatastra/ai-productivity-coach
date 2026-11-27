"use client";

import { FormSkeleton, ListSkeleton, SkeletonSurface } from "@/components/loading/Skeleton";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle, ArchiveRestore, Archive, ArrowLeft, Bell, Building2, CheckCircle2,
  ExternalLink, Globe, Link2, Loader2, Plus, RefreshCw, RotateCcw, Search, Trash2, XCircle, Ban, X,
} from "lucide-react";
import { API_BASE_URL } from "@/services/api";
import {
  ERRORS, EXTRA_ERRORS, JOB_STATUS, JOB_TYPES, JOB_TYPES_EXTRA, JOB_TYPES_P3, Lang, SOURCE_ERRORS, SOURCE_STATUS,
  SOURCE_TYPES, TEXT, EXTRA_SOURCE_ERRORS, tr,
} from "./aiPublishingText";
import { KnowledgeData, PageRow, PagesCard, ProfileCard, ReadinessCard, SearchCard } from "./KnowledgePanels";
import ContentPanels from "./ContentPanels";
import { AccessPanel, ReviewQueue } from "./ReviewPanels";
import ProfileBuilderPanel from "./ProfileBuilderPanel";
import { AIP_CSS } from "./aipStyles";
import EmailSettingsPanel from "./EmailSettingsPanel";
import { PricingPanel } from "./BookingPanels";

/* ───────────── types ───────────── */

type Provider = {
  id: string;
  name: string;
  slug: string;
  website: string;
  status: "created" | "archived";
  sourceCount?: number;
  sourceSummary?: { total: number; available: number; unavailable: number };
  lastSourceCheckAt?: string;
  readiness?: { score: number };
  createdAt?: string;
};

type Source = {
  id: string;
  url: string;
  type: string;
  isPrimary: boolean;
  status: string;
  title?: string;
  httpStatus?: number;
  errorCode?: string;
  checkedAt?: string;
};

type JobStep = { key: string; labelDe: string; labelEn: string; status: string; detail?: string };

type Job = {
  id: string;
  type: string;
  status: string;
  progress: number;
  steps?: JobStep[];
  error?: string;
  messageDe?: string;
  messageEn?: string;
  createdAt?: string;
  completedAt?: string;
};

type Notice = {
  id: string;
  providerId: string;
  severity: "success" | "warning" | "error";
  messageDe: string;
  messageEn: string;
  read: boolean;
  createdAt: string;
};

interface Props {
  getToken: () => Promise<string | null>;
  language: Lang;
  onLanguageChange?: (lang: Lang) => void;
}

const ACTIVE_JOB = ["queued", "researching", "indexing", "planning", "generating", "generating_media"];

/* ───────────── component ───────────── */

export default function AiPublishingWorkspace({ getToken, language, onLanguageChange }: Props) {
  const lang: Lang = language === "en" ? "en" : "de";
  const t = (key: keyof typeof TEXT) => TEXT[key][lang];

  const [providers, setProviders] = useState<Provider[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [accessKey, setAccessKey] = useState(0);
  const [filter, setFilter] = useState<"created" | "archived">("created");
  const [name, setName] = useState("");
  const [website, setWebsite] = useState("");
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState("");
  const [pageError, setPageError] = useState("");

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [provider, setProvider] = useState<Provider | null>(null);
  const [sources, setSources] = useState<Source[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [knowledge, setKnowledge] = useState<KnowledgeData | null>(null);
  const [pages, setPages] = useState<PageRow[]>([]);
  const [startingResearch, setStartingResearch] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");

  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editWebsite, setEditWebsite] = useState("");
  const [editError, setEditError] = useState("");

  const [newUrl, setNewUrl] = useState("");
  const [newType, setNewType] = useState("other");
  const [sourceError, setSourceError] = useState("");
  const [addingSource, setAddingSource] = useState(false);
  const [startingCheck, setStartingCheck] = useState(false);
  const [confirm, setConfirm] = useState<null | { kind: "source" | "archive"; id?: string }>(null);
  const [deleteDialog, setDeleteDialog] = useState<null | { typed: string; busy: boolean; error: string }>(null);

  const [notices, setNotices] = useState<Notice[]>([]);
  const [unread, setUnread] = useState(0);
  const [bellOpen, setBellOpen] = useState(false);

  const bellRef = useRef<HTMLDivElement | null>(null);
  const selectedRef = useRef<string | null>(null);
  selectedRef.current = selectedId;

  /* ── close the notification popover when clicking elsewhere ── */
  useEffect(() => {
    if (!bellOpen) return;

    const onDown = (e: MouseEvent) => {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) setBellOpen(false);
    };

    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [bellOpen]);

  /* ── api helper ── */
  const api = useCallback(
    async (path: string, init?: RequestInit) => {
      try {
        const token = await getToken();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (!token) return { ok: false, status: 401, data: null as any, code: "denied" };

        const res = await fetch(`${API_BASE_URL}${path}`, {
          ...init,
          cache: "no-store",
          headers: {
            Authorization: `Bearer ${token}`,
            ...(init?.body ? { "Content-Type": "application/json" } : {}),
            ...(init?.headers || {}),
          },
        });

        const data = res.status === 204 ? null : await res.json().catch(() => null);
        return { ok: res.ok, status: res.status, data, code: data?.code as string | undefined };
      } catch {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return { ok: false, status: 0, data: null as any, code: "network" };
      }
    },
    [getToken]
  );

  const errorText = (res: { status: number; code?: string }) => {
    if (res.code === "network" || res.status === 0) return t("networkError");
    if (res.status === 401 || res.status === 403) return t("denied");
    return tr(res.code ? ERRORS[res.code] || EXTRA_ERRORS[res.code] : undefined, lang, t("genericError"));
  };

  /* ── loaders ── */
  const loadProviders = useCallback(async () => {
    const res = await api(`/api/ai/providers?status=${filter}`);
    if (res.ok) {
      setProviders(res.data || []);
      setPageError("");
    } else {
      setPageError(errorText(res));
    }
    setListLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, filter, lang]);

  const loadNotifications = useCallback(async () => {
    const res = await api("/api/ai/notifications?limit=30");
    if (res.ok) {
      setNotices(res.data?.items || []);
      setUnread(res.data?.unread || 0);
    }
  }, [api]);

  const loadDetail = useCallback(
    async (id: string, silent = false) => {
      if (!silent) setDetailLoading(true);

      const [p, s, j, k, pg] = await Promise.all([
        api(`/api/ai/providers/${id}`),
        api(`/api/ai/providers/${id}/sources`),
        api(`/api/ai/providers/${id}/jobs`),
        api(`/api/ai/providers/${id}/knowledge`),
        api(`/api/ai/providers/${id}/knowledge/pages`),
      ]);

      if (selectedRef.current !== id) return;

      if (p.ok) {
        setProvider(p.data);
        setSources(s.ok ? s.data || [] : []);
        setJobs(j.ok ? j.data || [] : []);
        setKnowledge(k.ok ? k.data : null);
        setPages(pg.ok ? pg.data || [] : []);
        setDetailError("");
      } else {
        setDetailError(errorText(p));
      }

      setDetailLoading(false);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [api, lang]
  );

  useEffect(() => {
    setListLoading(true);
    loadProviders();
  }, [loadProviders]);

  useEffect(() => {
    loadNotifications();
    // Every refresh reads the database: poll slowly and only while this tab is visible.
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") loadNotifications();
    }, 120000);
    return () => clearInterval(timer);
  }, [loadNotifications]);

  useEffect(() => {
    if (selectedId) loadDetail(selectedId);
  }, [selectedId, loadDetail]);

  /* ── poll while a job is running ── */
  const activeJob = jobs.find((job) => ACTIVE_JOB.includes(job.status));

  // While a job runs only the data that job changes is reloaded (every call reads the database).
  const loadLive = useCallback(
    async (id: string, jobType: string) => {
      const needsSources = jobType === "source.check" || jobType === "research";

      const [j, s, k] = await Promise.all([
        api(`/api/ai/providers/${id}/jobs`),
        needsSources ? api(`/api/ai/providers/${id}/sources`) : Promise.resolve(null),
        needsSources ? api(`/api/ai/providers/${id}/knowledge`) : Promise.resolve(null),
      ]);

      if (selectedRef.current !== id) return;

      if (j.ok) setJobs(j.data || []);
      if (s?.ok) setSources(s.data || []);
      if (k?.ok) setKnowledge(k.data);
    },
    [api],
  );

  useEffect(() => {
    if (!selectedId || !activeJob) return;

    const jobType = activeJob.type;

    const timer = setInterval(async () => {
      if (document.visibilityState !== "visible") return;
      await loadLive(selectedId, jobType);
    }, 4000);

    return () => clearInterval(timer);
  }, [selectedId, activeJob?.id, activeJob?.status, activeJob?.type, loadLive]);

  /* ── guide the admin: scroll to the relevant section and flash it for 2 seconds ── */
  const jobsRef = useRef<Job[]>([]);
  useEffect(() => { jobsRef.current = jobs; }, [jobs]);

  const pendingFocus = useRef<"documents" | "image" | "revision" | null>(null);

  const focusSection = useCallback((id: string, tone: "info" | "ok" | "error") => {
    const el = document.getElementById(id);
    if (!el) return;

    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });

    // Restart the animation even when the same section is flashed twice in a row.
    el.classList.remove("aip-glow-info", "aip-glow-ok", "aip-glow-error");
    void el.offsetWidth;
    el.classList.add(`aip-glow-${tone}`);
    window.setTimeout(() => el.classList.remove(`aip-glow-${tone}`), 2100);
  }, []);

  // Job started by the admin -> show where the progress is.
  const activeId = activeJob?.id;
  useEffect(() => {
    if (!activeId || pendingFocus.current !== "documents") return;
    pendingFocus.current = null;
    const timer = setTimeout(() => focusSection("aip-progress", "info"), 150);
    return () => clearTimeout(timer);
  }, [activeId, focusSection]);

  /* ── when a job ends, refresh once more so final source states are shown ── */
  const prevActiveJobRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    const current = activeJob?.id;
    const previous = prevActiveJobRef.current;
    prevActiveJobRef.current = current;

    // A document or image job just ended -> scroll to the result or to the error.
    if (previous && !current) {
      const finished = jobsRef.current.find((job) => job.id === previous);

      if (finished && (finished.type === "content.generate" || finished.type === "media.generate" || finished.type === "content.revise")) {
        const failed = finished.status === "failed" || finished.status === "partially_completed";
        const target = failed
          ? `aip-job-${finished.id}`
          : finished.type === "media.generate" ? "aip-images" : finished.type === "content.revise" ? "aip-doc-head" : "aip-docs";

        setTimeout(() => focusSection(target, failed ? "error" : "ok"), 700);
      }
    }

    if (previous && !current && selectedId) {
      const timer = setTimeout(() => {
        void loadDetail(selectedId, true);
        loadNotifications();
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [activeJob?.id, selectedId, loadDetail, loadNotifications, focusSection]);

  /* ── actions ── */
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (creating) return;

    setFormError("");
    setCreating(true);

    const res = await api("/api/ai/providers", {
      method: "POST",
      body: JSON.stringify({ name, website }),
    });

    setCreating(false);

    if (!res.ok) {
      setFormError(errorText(res));
      return;
    }

    setName("");
    setWebsite("");
    setFilter("created");
    await loadProviders();
    openProvider(res.data.id);
  };

  const openProvider = (id: string) => {
    setProvider(null);
    setSources([]);
    setJobs([]);
    setKnowledge(null);
    setPages([]);
    setEditing(false);
    setSourceError("");
    setSelectedId(id);
  };

  const closeProvider = () => {
    setSelectedId(null);
    setProvider(null);
    loadProviders();
  };

  const startEdit = () => {
    if (!provider) return;
    setEditName(provider.name);
    setEditWebsite(provider.website);
    setEditError("");
    setEditing(true);
  };

  const saveEdit = async () => {
    if (!provider) return;

    const body: Record<string, string> = {};
    if (editName.trim() !== provider.name) body.name = editName;
    if (editWebsite.trim() !== provider.website) body.website = editWebsite;

    if (Object.keys(body).length === 0) {
      setEditing(false);
      return;
    }

    const res = await api(`/api/ai/providers/${provider.id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      setEditError(errorText(res));
      return;
    }

    setEditing(false);
    await loadDetail(provider.id, true);
  };

  const deleteProvider = async () => {
    if (!provider || !deleteDialog || deleteDialog.busy) return;

    setDeleteDialog({ ...deleteDialog, busy: true, error: "" });

    const res = await api(`/api/ai/providers/${provider.id}`, {
      method: "DELETE",
      body: JSON.stringify({ name: deleteDialog.typed }),
    });

    if (!res.ok) {
      setDeleteDialog({ typed: deleteDialog.typed, busy: false, error: errorText(res) });
      return;
    }

    setDeleteDialog(null);
    closeProvider();
  };

  const setArchived = async (archive: boolean) => {
    if (!provider) return;

    const res = await api(`/api/ai/providers/${provider.id}/${archive ? "archive" : "restore"}`, {
      method: "POST",
    });

    setConfirm(null);

    if (!res.ok) {
      setDetailError(errorText(res));
      return;
    }

    await loadProviders();
    await loadDetail(provider.id, true);
  };

  const addSource = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!provider || addingSource) return;

    setSourceError("");
    setAddingSource(true);

    const res = await api(`/api/ai/providers/${provider.id}/sources`, {
      method: "POST",
      body: JSON.stringify({ url: newUrl, type: newType }),
    });

    setAddingSource(false);

    if (!res.ok) {
      setSourceError(errorText(res));
      return;
    }

    setNewUrl("");
    setNewType("other");
    await loadDetail(provider.id, true);
  };

  const removeSource = async (sourceId: string) => {
    if (!provider) return;

    const res = await api(`/api/ai/providers/${provider.id}/sources/${sourceId}`, { method: "DELETE" });
    setConfirm(null);

    if (!res.ok) {
      setSourceError(errorText(res));
      return;
    }

    await loadDetail(provider.id, true);
  };

  const startCheck = async () => {
    if (!provider || startingCheck) return;

    setStartingCheck(true);
    setSourceError("");

    const res = await api(`/api/ai/providers/${provider.id}/sources/check`, {
      method: "POST",
      body: JSON.stringify({}),
    });

    setStartingCheck(false);

    if (!res.ok) {
      setSourceError(errorText(res));
      return;
    }

    await loadDetail(provider.id, true);
  };

  const startResearch = async () => {
    if (!provider || startingResearch) return;

    setStartingResearch(true);
    setSourceError("");

    const res = await api(`/api/ai/providers/${provider.id}/research`, {
      method: "POST",
      body: JSON.stringify({}),
    });

    setStartingResearch(false);

    if (!res.ok) {
      setSourceError(errorText(res));
      return;
    }

    await loadDetail(provider.id, true);
  };

  const cancelJob = async (jobId: string) => {
    const res = await api(`/api/ai/jobs/${jobId}/cancel`, { method: "POST" });
    if (!res.ok) setSourceError(errorText(res));
    if (provider) await loadDetail(provider.id, true);
  };

  const retryJob = async (jobId: string) => {
    const res = await api(`/api/ai/jobs/${jobId}/retry`, { method: "POST" });
    if (!res.ok) setSourceError(errorText(res));
    if (provider) await loadDetail(provider.id, true);
  };

  const markAllRead = async () => {
    await api("/api/ai/notifications/read", { method: "POST", body: JSON.stringify({}) });
    loadNotifications();
  };

  /* ── formatting ── */
  const fmt = (iso?: string) =>
    iso
      ? new Date(iso).toLocaleString(lang === "de" ? "de-DE" : "en-GB", {
          day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
        })
      : "";

  const hostOf = (url: string) => url.replace(/^https?:\/\//, "");

  const archived = provider?.status === "archived";

  /* ───────────── render ───────────── */
  return (
    <SkeletonSurface loading={listLoading && !selectedId} className="aip-root" translate="no">
      <style>{CSS}</style>

      {/* ── header ── */}
      <div className="aip-head">
        <div>
          <h2 className="aip-title">{t("title")}</h2>
          <p className="aip-sub">{t("subtitle")}</p>
        </div>

        <div className="aip-head-right">
          {onLanguageChange && (
            <div className="aip-lang" role="group" aria-label="Language">
              <button className={lang === "de" ? "on" : ""} onClick={() => onLanguageChange("de")}>DE</button>
              <button className={lang === "en" ? "on" : ""} onClick={() => onLanguageChange("en")}>EN</button>
            </div>
          )}

        <div className="aip-bell-wrap" ref={bellRef}>
          <button
            className="aip-bell"
            onClick={() => { setBellOpen((v) => !v); loadNotifications(); }}
            aria-label={t("notifications")}
          >
            <Bell size={16} />
          </button>
          {unread > 0 && <span className="aip-badge">{unread > 9 ? "9+" : unread}</span>}

          {bellOpen && (
            <div className="aip-pop">
              <div className="aip-pop-head">
                <strong>{t("notifications")}</strong>
                <button className="aip-x" onClick={() => setBellOpen(false)}><X size={14} /></button>
              </div>

              {notices.length === 0 ? (
                <div className="aip-pop-empty">{t("noNotifications")}</div>
              ) : (
                <div className="aip-pop-list">
                  {notices.map((n) => (
                    <button
                      key={n.id}
                      className={`aip-notice ${n.read ? "" : "unread"}`}
                      onClick={() => {
                        setBellOpen(false);
                        if (n.providerId) openProvider(n.providerId);
                      }}
                    >
                      {n.severity === "success" ? <CheckCircle2 size={15} color="#059669" />
                        : n.severity === "warning" ? <AlertTriangle size={15} color="#d97706" />
                        : <XCircle size={15} color="#dc2626" />}
                      <span>
                        <span>{lang === "de" ? n.messageDe : n.messageEn}</span>
                        <em>{fmt(n.createdAt)}</em>
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {unread > 0 && (
                <button className="aip-link" onClick={markAllRead}>{t("markAllRead")}</button>
              )}
            </div>
          )}
        </div>
        </div>
      </div>

      {/* ═══════════ DETAIL VIEW ═══════════ */}
      {selectedId ? (
        <div>
          <button className="aip-back" onClick={closeProvider}>
            <ArrowLeft size={14} /> {t("back")}
          </button>

          {detailLoading && !provider ? (
            <FormSkeleton />
          ) : detailError && !provider ? (
            <div className="aip-card aip-error">{detailError}</div>
          ) : provider ? (
            <>
              {/* provider card */}
              <div className="aip-card">
                {editing ? (
                  <div className="aip-edit">
                    <label className="aip-label">{t("providerName")}</label>
                    <input className="aip-input" value={editName} onChange={(e) => setEditName(e.target.value)} maxLength={160} />
                    <label className="aip-label">{t("website")}</label>
                    <input className="aip-input" value={editWebsite} onChange={(e) => setEditWebsite(e.target.value)} />
                    {editError && <div className="aip-error-text">{editError}</div>}
                    <div className="aip-row">
                      <button className="aip-btn" onClick={saveEdit}>{t("save")}</button>
                      <button className="aip-btn ghost" onClick={() => setEditing(false)}>{t("cancel")}</button>
                    </div>
                  </div>
                ) : (
                  <div className="aip-provider-top">
                    <div className="aip-logo"><Building2 size={22} /></div>
                    <div className="aip-provider-main">
                      <h3 className="aip-provider-name">
                        <span>{provider.name}</span>
                        {archived && <span className="aip-pill gray">{t("archived")}</span>}
                      </h3>
                      <a className="aip-site" href={provider.website} target="_blank" rel="noreferrer">
                        <Globe size={12} /> {hostOf(provider.website)} <ExternalLink size={11} />
                      </a>
                      <div className="aip-meta">{t("createdOn")}: {fmt(provider.createdAt)}</div>
                    </div>
                    <div className="aip-row wrap">
                      {!archived && <button className="aip-btn ghost" onClick={startEdit}>{t("edit")}</button>}
                      {archived ? (
                        <button className="aip-btn ghost" onClick={() => setArchived(false)}>
                          <ArchiveRestore size={14} /> {t("restore")}
                        </button>
                      ) : (
                        <button className="aip-btn ghost" onClick={() => setConfirm({ kind: "archive" })}>
                          <Archive size={14} /> {t("archive")}
                        </button>
                      )}
                      <button
                        className="aip-btn ghost danger-text"
                        onClick={() => setDeleteDialog({ typed: "", busy: false, error: "" })}
                        disabled={!!activeJob}
                      >
                        <Trash2 size={14} /> {t("deleteProvider")}
                      </button>
                    </div>
                  </div>
                )}
                {detailError && <div className="aip-error-text" style={{ marginTop: 10 }}>{detailError}</div>}
              </div>

              {/* sources */}
              <div className="aip-card">
                <div className="aip-card-head">
                  <div>
                    <h3 className="aip-h3"><Link2 size={16} /> {t("sourcesTitle")}</h3>
                    <p className="aip-help">{t("sourcesHelp")}</p>
                  </div>

                  <div className="aip-check">
                    <button
                      className="aip-btn"
                      onClick={startResearch}
                      disabled={archived || startingResearch || !!activeJob}
                    >
                      {activeJob ? <Loader2 size={14} className="aip-spin" /> : <Search size={14} />}
                      <span>{activeJob ? t("researching") : t("research")}</span>
                    </button>
                    <span className="aip-hint">{t("researchHelp")}</span>
                    <button
                      className="aip-link"
                      onClick={startCheck}
                      disabled={archived || startingCheck || !!activeJob}
                    >
                      <RefreshCw size={12} /> <span>{t("quickCheck")}</span>
                    </button>
                  </div>
                </div>

                {/* active job progress */}
                {activeJob && (
                  <div className="aip-progress aip-focus-target" id="aip-progress">
                    <div className="aip-progress-top">
                      <span>{tr(JOB_TYPES[activeJob.type] || JOB_TYPES_EXTRA[activeJob.type] || JOB_TYPES_P3[activeJob.type], lang, activeJob.type)} · {tr(JOB_STATUS[activeJob.status], lang)}</span>
                      <span>{activeJob.progress}%</span>
                    </div>
                    <div className="aip-bar"><div style={{ width: `${activeJob.progress}%` }} /></div>
                    {(activeJob.steps || []).map((step) => (
                      <div key={step.key} className="aip-step">
                        {step.status === "running" ? <Loader2 size={12} className="aip-spin" />
                          : step.status === "done" ? <CheckCircle2 size={12} color="#059669" />
                          : step.status === "failed" ? <XCircle size={12} color="#dc2626" />
                          : <span className="aip-dot" />}
                        <span>{lang === "de" ? step.labelDe : step.labelEn}</span>
                        {step.detail ? <em> · {step.detail}</em> : null}
                      </div>
                    ))}
                    <button className="aip-link danger" onClick={() => cancelJob(activeJob.id)}>
                      <Ban size={12} /> {t("stop")}
                    </button>
                  </div>
                )}

                {/* add source */}
                {!archived && (
                  <form className="aip-add" onSubmit={addSource}>
                    <input
                      className="aip-input"
                      placeholder={t("sourceUrlPh")}
                      aria-label={t("sourceUrl")}
                      value={newUrl}
                      onChange={(e) => setNewUrl(e.target.value)}
                    />
                    <select className="aip-input aip-select" value={newType} onChange={(e) => setNewType(e.target.value)} aria-label={t("sourceType")}>
                      {Object.keys(SOURCE_TYPES).filter((k) => k !== "homepage").map((k) => (
                        <option key={k} value={k}>{tr(SOURCE_TYPES[k], lang)}</option>
                      ))}
                    </select>
                    <button className="aip-btn" type="submit" disabled={addingSource || !newUrl.trim()}>
                      <Plus size={14} /> {t("add")}
                    </button>
                  </form>
                )}
                {sourceError && <div className="aip-error-text">{sourceError}</div>}

                {/* sources table */}
                <div className="aip-table-wrap">
                  <table className="aip-table">
                    <thead>
                      <tr>
                        <th>{t("linkCol")}</th>
                        <th className="hide-mob">{t("sourceType")}</th>
                        <th>{t("statusCol")}</th>
                        <th className="hide-mob">{t("titleCol")}</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {sources.map((source) => (
                        <tr key={source.id}>
                          <td>
                            <a href={source.url} target="_blank" rel="noreferrer" className="aip-url">{hostOf(source.url)}</a>
                            {source.isPrimary && <span className="aip-pill blue">{t("primary")}</span>}
                          </td>
                          <td className="hide-mob">{tr(SOURCE_TYPES[source.type], lang, source.type)}</td>
                          <td>
                            <span className={`aip-pill ${source.status === "available" ? "green" : source.status === "unavailable" ? "red" : source.status === "checking" ? "amber" : "gray"}`}>
                              {source.status === "checking" && <Loader2 size={10} className="aip-spin" />}
                              <span>{tr(SOURCE_STATUS[source.status], lang, source.status)}</span>
                            </span>
                            {source.status === "unavailable" && source.errorCode && (
                              <div className="aip-reason">{tr(SOURCE_ERRORS[source.errorCode] || EXTRA_SOURCE_ERRORS[source.errorCode], lang, source.errorCode)}</div>
                            )}
                          </td>
                          <td className="hide-mob aip-title-cell">{source.title || "—"}</td>
                          <td className="aip-actions">
                            {!source.isPrimary && !archived && (
                              <button className="aip-icon" title={t("remove")} onClick={() => setConfirm({ kind: "source", id: source.id })}>
                                <Trash2 size={14} />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {provider.sourceSummary && provider.lastSourceCheckAt && (
                  <div className="aip-summary">
                    {provider.sourceSummary.available} {t("sourcesAvailable")} · {provider.sourceSummary.unavailable} {t("sourcesUnavailable")} · {fmt(provider.lastSourceCheckAt)}
                  </div>
                )}
              </div>

              {/* knowledge: readiness, AI findings, pages, search */}
              <ReadinessCard lang={lang} knowledge={knowledge} />
              <ProfileCard lang={lang} knowledge={knowledge} />
              <PagesCard lang={lang} pages={pages} />
              {knowledge?.readiness && <SearchCard lang={lang} providerId={provider.id} api={api} />}

              {/* Phase 2: profile builder (About fields, logo, AI header, preview link) */}
              <ProfileBuilderPanel lang={lang} providerId={provider.id} api={api} archived={archived} onSent={() => setAccessKey((k) => k + 1)} />

              {/* Phase 6: company access */}
              <AccessPanel lang={lang} providerId={provider.id} api={api} archived={archived} refreshKey={accessKey} />

              {/* Phase 3: content plan, drafts and viewer */}
              {knowledge?.readiness && (
                <ContentPanels
                  lang={lang}
                  providerId={provider.id}
                  api={api}
                  getToken={getToken}
                  archived={archived}
                  generationRunning={!!activeJob && (activeJob.type === "content.generate" || activeJob.type === "media.generate" || activeJob.type === "content.revise")}
                  refreshKey={`${jobs[0]?.id ?? ""}-${jobs[0]?.status ?? ""}`}
                  onJobStarted={(kind) => { pendingFocus.current = kind ?? null; void loadDetail(provider.id, true); }}
                />
              )}

              {/* job history */}
              <div className="aip-card">
                <h3 className="aip-h3">{t("jobs")}</h3>
                {jobs.length === 0 ? (
                  <div className="aip-muted">{t("noJobs")}</div>
                ) : (
                  <div className="aip-jobs">
                    {jobs.map((job) => (
                      <div key={job.id} id={`aip-job-${job.id}`} className="aip-job aip-focus-target">
                        <div>
                          <strong>{tr(JOB_TYPES[job.type] || JOB_TYPES_EXTRA[job.type] || JOB_TYPES_P3[job.type], lang, job.type)}</strong>
                          <span className={`aip-pill ${job.status === "completed" ? "green" : job.status === "partially_completed" ? "amber" : job.status === "failed" ? "red" : job.status === "cancelled" ? "gray" : "blue"}`}>
                            {tr(JOB_STATUS[job.status], lang, job.status)}
                          </span>
                          <div className="aip-meta">
                            {fmt(job.createdAt)}
                            <span>{(lang === "de" ? job.messageDe : job.messageEn) ? ` · ${lang === "de" ? job.messageDe : job.messageEn}` : ""}</span>
                          </div>
                        </div>
                        {["failed", "partially_completed", "cancelled"].includes(job.status) && !archived && (
                          <button className="aip-btn ghost" onClick={() => retryJob(job.id)}>
                            <RotateCcw size={13} /> {t("retry")}
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : null}
        </div>
      ) : (
        /* ═══════════ LIST VIEW ═══════════ */
        <>
          <ReviewQueue lang={lang} api={api} refreshKey={`${filter}-${providers.length}`} onOpenProvider={(id) => openProvider(id)} />

          {/* create form (spec: name + website + Create) */}
          <form className="aip-card" onSubmit={handleCreate}>
            <h3 className="aip-h3"><Plus size={16} /> {t("createTitle")}</h3>
            <div className="aip-create-grid">
              <div>
                <label className="aip-label">{t("providerName")}</label>
                <input className="aip-input" placeholder={t("providerNamePh")} value={name} onChange={(e) => setName(e.target.value)} maxLength={160} />
              </div>
              <div>
                <label className="aip-label">{t("website")}</label>
                <input className="aip-input" placeholder={t("websitePh")} value={website} onChange={(e) => setWebsite(e.target.value)} />
              </div>
              <button className="aip-btn aip-create-btn" type="submit" disabled={creating || !name.trim() || !website.trim()}>
                {creating ? <Loader2 size={14} className="aip-spin" /> : <Plus size={14} />}
                <span>{creating ? t("creating") : t("create")}</span>
              </button>
            </div>
            {formError && <div className="aip-error-text">{formError}</div>}
          </form>

          {/* provider list */}
          <div className="aip-card">
            <div className="aip-card-head">
              <h3 className="aip-h3"><Building2 size={16} /> {t("providers")}</h3>
              <div className="aip-tabs">
                <button className={filter === "created" ? "on" : ""} onClick={() => setFilter("created")}>{t("active")}</button>
                <button className={filter === "archived" ? "on" : ""} onClick={() => setFilter("archived")}>{t("archived")}</button>
              </div>
            </div>

            {pageError && <div className="aip-error-text">{pageError}</div>}

            {listLoading ? (
              <ListSkeleton />
            ) : providers.length === 0 ? (
              <div className="aip-muted">{filter === "created" ? t("noProviders") : t("noArchived")}</div>
            ) : (
              <div className="aip-list">
                {providers.map((p) => (
                  <button key={p.id} className="aip-item" onClick={() => openProvider(p.id)}>
                    <div className="aip-logo sm"><Building2 size={17} /></div>
                    <div className="aip-item-main">
                      <strong>{p.name}</strong>
                      <span>{hostOf(p.website)}</span>
                    </div>
                    <div className="aip-item-side">
                      <span className="aip-pill gray">
                        {p.sourceCount ?? 0} {t("sources")}
                      </span>
                      {p.readiness ? (
                        <span className={`aip-pill ${p.readiness.score >= 70 ? "green" : p.readiness.score >= 40 ? "amber" : "red"}`}>
                          {t("readinessLabel")} {p.readiness.score}%
                        </span>
                      ) : p.lastSourceCheckAt ? (
                        <span className={`aip-pill ${p.sourceSummary && p.sourceSummary.unavailable > 0 ? "amber" : "green"}`}>
                          {p.sourceSummary?.available ?? 0} {t("sourcesAvailable")}
                        </span>
                      ) : (
                        <span className="aip-pill gray">{t("notChecked")}</span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Phase 1 improvement: editable email texts */}
          <EmailSettingsPanel lang={lang} api={api} />
          <PricingPanel lang={lang} api={api} />
        </>
      )}

      {/* ── delete provider dialog ── */}
      {deleteDialog && provider && (
        <div className="aip-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget && !deleteDialog.busy) setDeleteDialog(null); }}>
          <div className="aip-dialog" style={{ maxWidth: 460 }}>
            <p><strong>{t("deleteProviderTitle")}</strong></p>
            <p style={{ fontWeight: 500, color: "#4b5563" }}><span>{t("deleteProviderWarning")}</span></p>
            <p style={{ marginBottom: 6 }}><span>{t("deleteProviderType")} <strong>{provider.name}</strong></span></p>
            <input
              className="aip-input"
              style={{ width: "100%", marginBottom: 12 }}
              value={deleteDialog.typed}
              autoFocus
              disabled={deleteDialog.busy}
              onChange={(e) => setDeleteDialog({ ...deleteDialog, typed: e.target.value, error: "" })}
            />
            {deleteDialog.error && <div className="aip-error-text" style={{ marginBottom: 10 }}>{deleteDialog.error}</div>}
            <div className="aip-row">
              <button
                className="aip-btn danger"
                disabled={deleteDialog.busy || deleteDialog.typed.trim() !== provider.name.trim()}
                onClick={deleteProvider}
              >
                {deleteDialog.busy ? <Loader2 size={13} className="aip-spin" /> : <Trash2 size={13} />}
                <span>{deleteDialog.busy ? t("deletingProvider") : t("deleteProviderConfirm")}</span>
              </button>
              <button className="aip-btn ghost" disabled={deleteDialog.busy} onClick={() => setDeleteDialog(null)}>{t("cancel")}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── confirm dialog ── */}
      {confirm && (
        <div className="aip-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) setConfirm(null); }}>
          <div className="aip-dialog">
            <p><span>{confirm.kind === "source" ? t("confirmRemove") : t("confirmArchive")}</span></p>
            <div className="aip-row">
              <button
                className="aip-btn danger"
                onClick={() => (confirm.kind === "source" && confirm.id ? removeSource(confirm.id) : setArchived(true))}
              >
                <span>{confirm.kind === "source" ? t("remove") : t("archive")}</span>
              </button>
              <button className="aip-btn ghost" onClick={() => setConfirm(null)}>{t("cancel")}</button>
            </div>
          </div>
        </div>
      )}
    </SkeletonSurface>
  );
}

/* ───────────── styles (scoped by the aip- prefix) ───────────── */

const CSS = AIP_CSS;
