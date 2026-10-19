"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle, ArchiveRestore, Archive, ArrowLeft, Bell, Building2, CheckCircle2,
  ExternalLink, Globe, Link2, Loader2, Plus, RefreshCw, RotateCcw, Trash2, XCircle, Ban, X,
} from "lucide-react";
import { API_BASE_URL } from "@/services/api";
import {
  ERRORS, JOB_STATUS, JOB_TYPES, Lang, SOURCE_ERRORS, SOURCE_STATUS, SOURCE_TYPES, TEXT, tr,
} from "./aiPublishingText";

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
}

const ACTIVE_JOB = ["queued", "researching", "indexing", "planning", "generating", "generating_media"];

/* ───────────── component ───────────── */

export default function AiPublishingWorkspace({ getToken, language }: Props) {
  const lang: Lang = language === "en" ? "en" : "de";
  const t = (key: keyof typeof TEXT) => TEXT[key][lang];

  const [providers, setProviders] = useState<Provider[]>([]);
  const [listLoading, setListLoading] = useState(true);
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
        return { ok: false, status: 0, data: null as any, code: "network" };
      }
    },
    [getToken]
  );

  const errorText = (res: { status: number; code?: string }) => {
    if (res.code === "network" || res.status === 0) return t("networkError");
    if (res.status === 401 || res.status === 403) return t("denied");
    return tr(res.code ? ERRORS[res.code] : undefined, lang, t("genericError"));
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

      const [p, s, j] = await Promise.all([
        api(`/api/ai/providers/${id}`),
        api(`/api/ai/providers/${id}/sources`),
        api(`/api/ai/providers/${id}/jobs`),
      ]);

      if (selectedRef.current !== id) return;

      if (p.ok) {
        setProvider(p.data);
        setSources(s.ok ? s.data || [] : []);
        setJobs(j.ok ? j.data || [] : []);
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
    const timer = setInterval(loadNotifications, 30000);
    return () => clearInterval(timer);
  }, [loadNotifications]);

  useEffect(() => {
    if (selectedId) loadDetail(selectedId);
  }, [selectedId, loadDetail]);

  /* ── poll while a job is running ── */
  const activeJob = jobs.find((job) => ACTIVE_JOB.includes(job.status));

  useEffect(() => {
    if (!selectedId || !activeJob) return;

    const timer = setInterval(async () => {
      await loadDetail(selectedId, true);
      loadNotifications();
    }, 2000);

    return () => clearInterval(timer);
  }, [selectedId, activeJob?.id, activeJob?.status, loadDetail, loadNotifications]);

  /* ── when a job ends, refresh once more so final source states are shown ── */
  const prevActiveJobRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    const current = activeJob?.id;
    const previous = prevActiveJobRef.current;
    prevActiveJobRef.current = current;

    if (previous && !current && selectedId) {
      const timer = setTimeout(() => loadDetail(selectedId, true), 1500);
      return () => clearTimeout(timer);
    }
  }, [activeJob?.id, selectedId, loadDetail]);

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
    <div className="aip-root">
      <style>{CSS}</style>

      {/* ── header ── */}
      <div className="aip-head">
        <div>
          <h2 className="aip-title">{t("title")}</h2>
          <p className="aip-sub">{t("subtitle")}</p>
        </div>

        <div className="aip-bell-wrap" ref={bellRef}>
          <button
            className="aip-bell"
            onClick={() => { setBellOpen((v) => !v); loadNotifications(); }}
            aria-label={t("notifications")}
          >
            <Bell size={16} />
            {unread > 0 && <span className="aip-badge">{unread > 9 ? "9+" : unread}</span>}
          </button>

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
                        {lang === "de" ? n.messageDe : n.messageEn}
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

      {/* ═══════════ DETAIL VIEW ═══════════ */}
      {selectedId ? (
        <div>
          <button className="aip-back" onClick={closeProvider}>
            <ArrowLeft size={14} /> {t("back")}
          </button>

          {detailLoading && !provider ? (
            <div className="aip-card aip-muted">{t("loading")}</div>
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
                        {provider.name}
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
                      onClick={startCheck}
                      disabled={archived || startingCheck || !!activeJob}
                    >
                      {activeJob ? <Loader2 size={14} className="aip-spin" /> : <RefreshCw size={14} />}
                      {activeJob ? t("checking") : t("checkSources")}
                    </button>
                    <span className="aip-hint">{t("checkHelp")}</span>
                  </div>
                </div>

                {/* active job progress */}
                {activeJob && (
                  <div className="aip-progress">
                    <div className="aip-progress-top">
                      <span>{tr(JOB_TYPES[activeJob.type], lang, activeJob.type)} · {tr(JOB_STATUS[activeJob.status], lang)}</span>
                      <span>{activeJob.progress}%</span>
                    </div>
                    <div className="aip-bar"><div style={{ width: `${activeJob.progress}%` }} /></div>
                    {(activeJob.steps || []).map((step) => (
                      <div key={step.key} className="aip-step">
                        {step.status === "running" ? <Loader2 size={12} className="aip-spin" />
                          : step.status === "done" ? <CheckCircle2 size={12} color="#059669" />
                          : <span className="aip-dot" />}
                        {lang === "de" ? step.labelDe : step.labelEn}
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
                              {tr(SOURCE_STATUS[source.status], lang, source.status)}
                            </span>
                            {source.status === "unavailable" && source.errorCode && (
                              <div className="aip-reason">{tr(SOURCE_ERRORS[source.errorCode], lang, source.errorCode)}</div>
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

              {/* job history */}
              <div className="aip-card">
                <h3 className="aip-h3">{t("jobs")}</h3>
                {jobs.length === 0 ? (
                  <div className="aip-muted">{t("noJobs")}</div>
                ) : (
                  <div className="aip-jobs">
                    {jobs.map((job) => (
                      <div key={job.id} className="aip-job">
                        <div>
                          <strong>{tr(JOB_TYPES[job.type], lang, job.type)}</strong>
                          <span className={`aip-pill ${job.status === "completed" ? "green" : job.status === "partially_completed" ? "amber" : job.status === "failed" ? "red" : job.status === "cancelled" ? "gray" : "blue"}`}>
                            {tr(JOB_STATUS[job.status], lang, job.status)}
                          </span>
                          <div className="aip-meta">
                            {fmt(job.createdAt)}
                            {(lang === "de" ? job.messageDe : job.messageEn) ? ` · ${lang === "de" ? job.messageDe : job.messageEn}` : ""}
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
                {creating ? t("creating") : t("create")}
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
              <div className="aip-muted">{t("loading")}</div>
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
                      {p.lastSourceCheckAt ? (
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
        </>
      )}

      {/* ── confirm dialog ── */}
      {confirm && (
        <div className="aip-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) setConfirm(null); }}>
          <div className="aip-dialog">
            <p>{confirm.kind === "source" ? t("confirmRemove") : t("confirmArchive")}</p>
            <div className="aip-row">
              <button
                className="aip-btn danger"
                onClick={() => (confirm.kind === "source" && confirm.id ? removeSource(confirm.id) : setArchived(true))}
              >
                {confirm.kind === "source" ? t("remove") : t("archive")}
              </button>
              <button className="aip-btn ghost" onClick={() => setConfirm(null)}>{t("cancel")}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ───────────── styles (scoped by the aip- prefix) ───────────── */

const CSS = `
.aip-root { font-family: "Plus Jakarta Sans", sans-serif; color:#111827; max-width: 1080px; width:100%; margin:0 auto; padding-bottom:40px; }
.aip-head { display:flex; justify-content:space-between; align-items:flex-start; gap:16px; margin-bottom:18px; }
.aip-title { font-size:22px; font-weight:800; letter-spacing:-.03em; margin:0; color:#0d1117; }
.aip-sub { font-size:12.5px; color:#6b7280; margin:4px 0 0; line-height:1.5; }
.aip-card { background:#fff; border:1px solid #e8eaee; border-radius:20px; padding:20px; margin-bottom:16px; box-shadow:0 8px 28px rgba(15,23,42,.04); }
.aip-card-head { display:flex; justify-content:space-between; align-items:flex-start; gap:14px; flex-wrap:wrap; margin-bottom:14px; }
.aip-h3 { display:flex; align-items:center; gap:8px; font-size:14px; font-weight:800; margin:0 0 12px; color:#0d1117; }
.aip-card-head .aip-h3 { margin-bottom:4px; }
.aip-help { font-size:12px; color:#6b7280; margin:0; max-width:560px; line-height:1.55; }
.aip-muted { color:#9ca3af; font-size:13px; padding:8px 0; }
.aip-label { display:block; font-size:11px; font-weight:700; letter-spacing:.04em; text-transform:uppercase; color:#6b7280; margin:0 0 6px; }
.aip-input { width:100%; height:42px; padding:0 14px; border:1.5px solid #e5e7eb; border-radius:12px; font-family:inherit; font-size:13px; color:#111827; background:#fff; outline:none; transition:border-color .15s, box-shadow .15s; }
.aip-input:focus { border-color:#78d2f5; box-shadow:0 0 0 3px rgba(120,210,245,.22); }
.aip-select { width:auto; min-width:160px; }
.aip-create-grid { display:grid; grid-template-columns:1fr 1fr auto; gap:12px; align-items:end; }
.aip-create-btn { height:42px; }
.aip-btn { display:inline-flex; align-items:center; justify-content:center; gap:7px; height:38px; padding:0 16px; border-radius:999px; border:1px solid #111; background:#111; color:#fff; font-family:inherit; font-size:12.5px; font-weight:700; cursor:pointer; white-space:nowrap; transition:background .15s, opacity .15s; }
.aip-btn:hover:not(:disabled) { background:#222; }
.aip-btn:disabled { opacity:.45; cursor:not-allowed; }
.aip-btn.ghost { background:#fff; color:#374151; border-color:#e5e7eb; }
.aip-btn.ghost:hover:not(:disabled) { background:#f5f5f5; }
.aip-btn.danger { background:#dc2626; border-color:#dc2626; }
.aip-btn.danger:hover { background:#b91c1c; }
.aip-row { display:flex; gap:8px; align-items:center; margin-top:4px; }
.aip-row.wrap { flex-wrap:wrap; margin-top:0; }
.aip-error-text { color:#dc2626; font-size:12.5px; font-weight:600; margin-top:10px; }
.aip-error { color:#dc2626; }
.aip-list { display:flex; flex-direction:column; gap:8px; }
.aip-item { display:flex; align-items:center; gap:14px; width:100%; text-align:left; padding:12px 14px; border:1px solid #eef0f3; border-radius:16px; background:#fafbfc; cursor:pointer; font-family:inherit; transition:background .15s, border-color .15s, transform .15s; }
.aip-item:hover { background:#fff; border-color:#d9dee5; transform:translateY(-1px); }
.aip-item-main { display:flex; flex-direction:column; min-width:0; flex:1; }
.aip-item-main strong { font-size:14px; color:#0d1117; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.aip-item-main span { font-size:12px; color:#6b7280; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.aip-item-side { display:flex; gap:6px; flex-wrap:wrap; justify-content:flex-end; }
.aip-logo { width:48px; height:48px; border-radius:14px; background:#f3f4f6; border:1px solid #e5e7eb; display:flex; align-items:center; justify-content:center; color:#6b7280; flex-shrink:0; }
.aip-logo.sm { width:38px; height:38px; border-radius:12px; }
.aip-pill { display:inline-flex; align-items:center; gap:5px; height:22px; padding:0 9px; border-radius:999px; font-size:10.5px; font-weight:700; margin-left:6px; white-space:nowrap; }
.aip-item-side .aip-pill, .aip-card-head .aip-pill { margin-left:0; }
.aip-pill.green { background:#dcfce7; color:#166534; }
.aip-pill.red { background:#fee2e2; color:#991b1b; }
.aip-pill.amber { background:#fef3c7; color:#92400e; }
.aip-pill.blue { background:#e0f2fe; color:#075985; }
.aip-pill.gray { background:#f3f4f6; color:#4b5563; }
.aip-tabs { display:inline-flex; background:#f3f4f6; border-radius:999px; padding:3px; }
.aip-tabs button { border:none; background:transparent; font-family:inherit; font-size:12px; font-weight:700; color:#6b7280; padding:6px 14px; border-radius:999px; cursor:pointer; }
.aip-tabs button.on { background:#fff; color:#111; box-shadow:0 1px 4px rgba(0,0,0,.08); }
.aip-back { display:inline-flex; align-items:center; gap:7px; height:34px; padding:0 14px; border-radius:999px; border:1px solid #e5e7eb; background:#fff; color:#4b5563; font-family:inherit; font-size:12px; font-weight:700; cursor:pointer; margin-bottom:14px; }
.aip-back:hover { background:#f5f5f5; }
.aip-provider-top { display:flex; align-items:center; gap:16px; flex-wrap:wrap; }
.aip-provider-main { flex:1; min-width:200px; }
.aip-provider-name { font-size:19px; font-weight:800; letter-spacing:-.03em; margin:0 0 4px; display:flex; align-items:center; flex-wrap:wrap; gap:6px; }
.aip-site { display:inline-flex; align-items:center; gap:6px; font-size:12.5px; color:#0369a1; text-decoration:none; font-weight:600; }
.aip-site:hover { text-decoration:underline; }
.aip-meta { font-size:11.5px; color:#9ca3af; margin-top:4px; }
.aip-edit { display:flex; flex-direction:column; gap:4px; max-width:520px; }
.aip-edit .aip-label { margin-top:8px; }
.aip-check { display:flex; flex-direction:column; align-items:flex-end; gap:5px; }
.aip-hint { font-size:11px; color:#9ca3af; max-width:240px; text-align:right; }
.aip-add { display:flex; gap:8px; flex-wrap:wrap; margin-bottom:6px; }
.aip-add .aip-input:first-child { flex:1; min-width:220px; }
.aip-table-wrap { overflow-x:auto; margin-top:10px; border:1px solid #eef0f3; border-radius:14px; }
.aip-table { width:100%; border-collapse:collapse; }
.aip-table th { text-align:left; font-size:10.5px; font-weight:700; letter-spacing:.06em; text-transform:uppercase; color:#9ca3af; padding:10px 14px; background:#fafafa; }
.aip-table td { padding:11px 14px; font-size:13px; border-top:1px solid #f3f4f6; vertical-align:top; }
.aip-url { color:#111827; font-weight:600; text-decoration:none; word-break:break-all; }
.aip-url:hover { text-decoration:underline; }
.aip-reason { font-size:11.5px; color:#b45309; margin-top:5px; line-height:1.45; max-width:340px; }
.aip-title-cell { color:#6b7280; max-width:240px; }
.aip-actions { text-align:right; width:44px; }
.aip-icon { border:none; background:transparent; color:#9ca3af; cursor:pointer; padding:6px; border-radius:8px; }
.aip-icon:hover { background:#fee2e2; color:#dc2626; }
.aip-summary { font-size:12px; color:#6b7280; margin-top:12px; }
.aip-progress { background:#f0f9ff; border:1px solid #bae6fd; border-radius:14px; padding:12px 14px; margin-bottom:14px; }
.aip-progress-top { display:flex; justify-content:space-between; font-size:12.5px; font-weight:700; color:#075985; margin-bottom:8px; }
.aip-bar { height:7px; border-radius:999px; background:#e0f2fe; overflow:hidden; }
.aip-bar div { height:100%; background:linear-gradient(90deg,#78d2f5,#4bbde8); border-radius:999px; transition:width .4s ease; }
.aip-step { display:flex; align-items:center; gap:7px; font-size:12px; color:#374151; margin-top:8px; }
.aip-step em { color:#6b7280; font-style:normal; }
.aip-dot { width:8px; height:8px; border-radius:50%; background:#cbd5e1; display:inline-block; margin:0 2px; }
.aip-link { display:inline-flex; align-items:center; gap:5px; border:none; background:none; font-family:inherit; font-size:12px; font-weight:700; color:#0369a1; cursor:pointer; padding:8px 0 0; }
.aip-link.danger { color:#dc2626; }
.aip-jobs { display:flex; flex-direction:column; gap:8px; }
.aip-job { display:flex; justify-content:space-between; align-items:center; gap:12px; padding:10px 12px; border:1px solid #eef0f3; border-radius:14px; background:#fafbfc; font-size:13px; }
.aip-bell-wrap { position:relative; }
.aip-bell { position:relative; width:40px; height:40px; border-radius:999px; border:1px solid #e5e7eb; background:#fff; display:flex; align-items:center; justify-content:center; cursor:pointer; color:#374151; }
.aip-bell:hover { background:#f5f5f5; }
.aip-badge { position:absolute; top:-4px; right:-4px; min-width:18px; height:18px; padding:0 5px; border-radius:999px; background:#dc2626; color:#fff; font-size:10px; font-weight:800; display:flex; align-items:center; justify-content:center; }
.aip-pop { position:absolute; right:0; top:48px; width:340px; max-width:calc(100vw - 32px); background:#fff; border:1px solid #e5e7eb; border-radius:16px; box-shadow:0 18px 48px rgba(15,23,42,.16); z-index:60; padding:12px; }
.aip-pop-head { display:flex; justify-content:space-between; align-items:center; font-size:13px; margin-bottom:8px; }
.aip-x { border:none; background:none; cursor:pointer; color:#9ca3af; }
.aip-pop-empty { color:#9ca3af; font-size:12.5px; padding:14px 4px; text-align:center; }
.aip-pop-list { max-height:320px; overflow-y:auto; display:flex; flex-direction:column; gap:4px; }
.aip-notice { display:flex; gap:10px; align-items:flex-start; text-align:left; width:100%; padding:9px 10px; border:none; border-radius:12px; background:transparent; font-family:inherit; font-size:12.5px; line-height:1.45; color:#374151; cursor:pointer; }
.aip-notice:hover { background:#f5f7fa; }
.aip-notice.unread { background:#f0f9ff; }
.aip-notice em { display:block; font-style:normal; font-size:11px; color:#9ca3af; margin-top:3px; }
.aip-overlay { position:fixed; inset:0; background:rgba(15,23,42,.45); z-index:100; display:flex; align-items:center; justify-content:center; padding:16px; }
.aip-dialog { background:#fff; border-radius:18px; padding:22px; max-width:380px; width:100%; box-shadow:0 24px 64px rgba(0,0,0,.25); }
.aip-dialog p { font-size:14px; font-weight:600; color:#111827; margin:0 0 14px; line-height:1.5; }
.aip-spin { animation:aip-spin 1s linear infinite; }
@keyframes aip-spin { to { transform:rotate(360deg); } }
@media (max-width: 760px) {
  .aip-create-grid { grid-template-columns:1fr; }
  .aip-create-btn { width:100%; }
  .aip-check { align-items:flex-start; }
  .aip-hint { text-align:left; }
  .aip-table .hide-mob { display:none; }
  .aip-item { flex-wrap:wrap; }
  .aip-item-side { justify-content:flex-start; }
}
`;
