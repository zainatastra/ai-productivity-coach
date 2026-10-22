"use client";

import { useState } from "react";
import {
  AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, Circle, CircleDot, ExternalLink,
  Loader2, Mail, MapPin, Phone, Search, XCircle,
} from "lucide-react";
import {
  CATEGORIES, EXTRA_ERRORS, EXTRA_SOURCE_ERRORS, ERRORS, GATE_LABELS, GATE_REASONS, GATE_STATES,
  Lang, RECOMMENDATIONS, SOURCE_ERRORS, TEXT, tr,
} from "./aiPublishingText";

/* eslint-disable @typescript-eslint/no-explicit-any */

export type KnowledgeData = {
  readiness?: {
    score: number;
    categories: { key: string; status: string; evidence: number; needed: number; weight: number }[];
    recommendations: { code: string; category: string }[];
    gates: Record<string, { state: string; reasons: string[] }>;
    evaluatedAt?: string;
  } | null;
  profile?: {
    description?: string;
    products?: { name: string; summary: string }[];
    topics?: string[];
    industries?: string[];
    contact?: { email?: string; phone?: string; address?: string };
    hasSoftwareProduct?: boolean;
    model?: string;
  } | null;
  pageSummary?: { total: number; ok: number; unavailable: number; chunks: number } | null;
  usage?: { totalTokens?: number } | null;
  stale?: boolean;
  updatedAt?: string;
};

export type PageRow = {
  id: string;
  url: string;
  title?: string;
  status: string;
  errorCode?: string;
  lastError?: string;
  categories?: string[];
  textLength?: number;
  chunkCount?: number;
  isSeed?: boolean;
};

type Api = (path: string, init?: RequestInit) => Promise<{ ok: boolean; status: number; data: any; code?: string }>;

const fmtDate = (iso: string | undefined, lang: Lang) =>
  iso
    ? new Date(iso).toLocaleString(lang === "de" ? "de-DE" : "en-GB", {
        day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
      })
    : "";

const hostOf = (url: string) => url.replace(/^https?:\/\//, "");

/* ═════════════ readiness ═════════════ */

export function ReadinessCard({ lang, knowledge }: { lang: Lang; knowledge: KnowledgeData | null }) {
  const t = (key: keyof typeof TEXT) => TEXT[key][lang];
  const readiness = knowledge?.readiness;

  return (
    <div className="aip-card">
      <h3 className="aip-h3">{t("knowledgeTitle")}</h3>

      {knowledge?.stale && readiness && (
        <div className="aip-banner warn"><AlertTriangle size={14} /> <span>{t("staleKnowledge")}</span></div>
      )}

      {!readiness ? (
        <div className="aip-muted">{t("noKnowledge")}</div>
      ) : (
        <>
          <div className="aip-ready-top">
            <ScoreRing score={readiness.score} />
            <div className="aip-ready-text">
              <div className="aip-ready-label">{t("readinessLabel")}</div>
              <div className="aip-ready-verdict">
                <span>
                  {readiness.score >= 70 ? t("readinessReady") : readiness.score >= 40 ? t("readinessPartial") : t("readinessLow")}
                </span>
              </div>
              {knowledge?.pageSummary && (
                <div className="aip-meta">
                  <span>
                    {knowledge.pageSummary.ok} {t("pagesRead")} · {knowledge.pageSummary.chunks} {t("chunksLabel")}
                    {knowledge.pageSummary.unavailable > 0 ? ` · ${knowledge.pageSummary.unavailable} ${t("pagesFailed")}` : ""}
                  </span>
                </div>
              )}
              <div className="aip-meta">
                <span>{t("updatedOn")}: {fmtDate(knowledge?.updatedAt || readiness.evaluatedAt, lang)}</span>
              </div>
              {knowledge?.usage?.totalTokens ? (
                <div className="aip-meta">
                  <span>{t("tokensUsed")}: {knowledge.usage.totalTokens.toLocaleString(lang === "de" ? "de-DE" : "en-GB")} {t("tokens")}</span>
                </div>
              ) : null}
            </div>
          </div>

          <div className="aip-cats">
            {readiness.categories.map((c) => (
              <div key={c.key} className={`aip-cat ${c.status}`}>
                {c.status === "ok" ? <CheckCircle2 size={15} /> : c.status === "partial" ? <CircleDot size={15} /> : <Circle size={15} />}
                <span className="aip-cat-name">{tr(CATEGORIES[c.key], lang, c.key)}</span>
                <span className="aip-cat-count">{Math.min(c.evidence, c.needed)}/{c.needed}</span>
              </div>
            ))}
          </div>

          {readiness.recommendations.length > 0 && (
            <div className="aip-recs">
              <div className="aip-label">{t("recommendations")}</div>
              {readiness.recommendations.map((r) => (
                <div key={r.code} className="aip-rec">
                  <AlertTriangle size={13} />
                  <span>{tr(RECOMMENDATIONS[r.code], lang, r.code)}</span>
                </div>
              ))}
            </div>
          )}

          <div className="aip-gates">
            <div className="aip-label">{t("generationReadiness")}</div>
            <div className="aip-gate-row">
              {["article", "whitepaper", "webinar", "tutorial"].map((key) => {
                const gate = readiness.gates?.[key];
                if (!gate) return null;

                return (
                  <div key={key} className={`aip-gate ${gate.state}`}>
                    <strong>{tr(GATE_LABELS[key], lang, key)}</strong>
                    {key === "tutorial" && <em className="aip-soon">{t("comingSoon")}</em>}
                    <span className="aip-gate-state">
                      {gate.state === "ready" ? <CheckCircle2 size={12} /> : gate.state === "warn" ? <AlertTriangle size={12} /> : <XCircle size={12} />}
                      {tr(GATE_STATES[gate.state], lang, gate.state)}
                    </span>
                    {gate.reasons.length > 0 && (
                      <small>{gate.reasons.map((r) => tr(GATE_REASONS[r], lang, r)).join(", ")}</small>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function ScoreRing({ score }: { score: number }) {
  const radius = 34;
  const circumference = 2 * Math.PI * radius;
  const color = score >= 70 ? "#059669" : score >= 40 ? "#d97706" : "#dc2626";

  return (
    <div className="aip-ring" aria-label={`${score}%`}>
      <svg width="86" height="86" viewBox="0 0 86 86">
        <circle cx="43" cy="43" r={radius} fill="none" stroke="#eef0f3" strokeWidth="8" />
        <circle
          cx="43" cy="43" r={radius} fill="none" stroke={color} strokeWidth="8" strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={circumference * (1 - Math.min(100, score) / 100)}
          transform="rotate(-90 43 43)"
        />
      </svg>
      <div className="aip-ring-num" style={{ color }}><span>{score}%</span></div>
    </div>
  );
}

/* ═════════════ AI findings ═════════════ */

export function ProfileCard({ lang, knowledge }: { lang: Lang; knowledge: KnowledgeData | null }) {
  const t = (key: keyof typeof TEXT) => TEXT[key][lang];
  const profile = knowledge?.profile;

  if (!knowledge?.readiness) return null;

  return (
    <div className="aip-card">
      <h3 className="aip-h3">{t("profileTitle")}</h3>
      <p className="aip-help" style={{ marginBottom: 12 }}>{t("profileNote")}</p>

      {!profile ? (
        <div className="aip-muted">{t("profileMissing")}</div>
      ) : (
        <div className="aip-profile">
          {profile.description && (
            <div>
              <div className="aip-label">{t("profileDescription")}</div>
              <p className="aip-profile-text"><span>{profile.description}</span></p>
            </div>
          )}

          <div>
            <div className="aip-label">{t("profileProducts")}</div>
            {profile.products && profile.products.length > 0 ? (
              <div className="aip-products">
                {profile.products.map((p) => (
                  <div key={p.name} className="aip-product">
                    <strong><span>{p.name}</span></strong>
                    {p.summary && <span className="aip-product-sum">{p.summary}</span>}
                  </div>
                ))}
              </div>
            ) : (
              <div className="aip-muted">{t("profileNoProducts")}</div>
            )}
          </div>

          {profile.topics && profile.topics.length > 0 && (
            <div>
              <div className="aip-label">{t("profileTopics")}</div>
              <div className="aip-chips">{profile.topics.map((x) => <span key={x} className="aip-chip">{x}</span>)}</div>
            </div>
          )}

          {profile.industries && profile.industries.length > 0 && (
            <div>
              <div className="aip-label">{t("profileIndustries")}</div>
              <div className="aip-chips">{profile.industries.map((x) => <span key={x} className="aip-chip">{x}</span>)}</div>
            </div>
          )}

          {(profile.contact?.email || profile.contact?.phone || profile.contact?.address) && (
            <div>
              <div className="aip-label">{t("profileContact")}</div>
              <div className="aip-contact">
                {profile.contact?.email && <span><Mail size={13} /> <span>{profile.contact.email}</span></span>}
                {profile.contact?.phone && <span><Phone size={13} /> <span>{profile.contact.phone}</span></span>}
                {profile.contact?.address && <span><MapPin size={13} /> <span>{profile.contact.address}</span></span>}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ═════════════ pages read ═════════════ */

export function PagesCard({ lang, pages }: { lang: Lang; pages: PageRow[] }) {
  const t = (key: keyof typeof TEXT) => TEXT[key][lang];
  const [open, setOpen] = useState(false);

  if (pages.length === 0) return null;

  return (
    <div className="aip-card">
      <div className="aip-card-head">
        <div>
          <h3 className="aip-h3">{t("pagesTitle")} <span className="aip-pill gray">{pages.length}</span></h3>
          <p className="aip-help">{t("pagesHelp")}</p>
        </div>
        <button className="aip-btn ghost" onClick={() => setOpen((v) => !v)}>
          {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          <span>{open ? t("hidePages") : t("showPages")}</span>
        </button>
      </div>

      {open && (
        <div className="aip-table-wrap">
          <table className="aip-table">
            <thead>
              <tr>
                <th>{t("pageCol")}</th>
                <th className="hide-mob">{t("topicCol")}</th>
                <th className="hide-mob">{t("sizeCol")}</th>
                <th>{t("statusCol")}</th>
              </tr>
            </thead>
            <tbody>
              {pages.map((p) => {
                const reason = p.status !== "ok" ? p.errorCode : p.lastError;
                return (
                  <tr key={p.id}>
                    <td>
                      <a className="aip-url" href={p.url} target="_blank" rel="noreferrer">
                        {hostOf(p.url)} <ExternalLink size={10} />
                      </a>
                      {p.title && <div className="aip-reason" style={{ color: "#6b7280" }}><span>{p.title}</span></div>}
                    </td>
                    <td className="hide-mob">
                      <div className="aip-chips">
                        {(p.categories || []).slice(0, 3).map((c) => (
                          <span key={c} className="aip-chip sm">{tr(CATEGORIES[c], lang, c)}</span>
                        ))}
                      </div>
                    </td>
                    <td className="hide-mob">
                      {p.status === "ok" ? <span>{(p.textLength || 0).toLocaleString(lang === "de" ? "de-DE" : "en-GB")} {t("chars")} · {p.chunkCount || 0}</span> : "—"}
                    </td>
                    <td>
                      <span className={`aip-pill ${p.status === "ok" ? "green" : "red"}`}>
                        <span>{p.status === "ok" ? (lang === "de" ? "Gelesen" : "Read") : (lang === "de" ? "Nicht lesbar" : "Unreadable")}</span>
                      </span>
                      {reason && (
                        <div className="aip-reason">
                          <span>{tr(SOURCE_ERRORS[reason] || EXTRA_SOURCE_ERRORS[reason], lang, reason)}</span>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ═════════════ knowledge search ═════════════ */

type Hit = { chunkId: string; url: string; title: string; heading: string; text: string; score: number };

export function SearchCard({ lang, providerId, api }: { lang: Lang; providerId: string; api: Api }) {
  const t = (key: keyof typeof TEXT) => TEXT[key][lang];
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [error, setError] = useState("");

  const run = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    setLoading(true);
    setError("");

    const res = await api(`/api/ai/providers/${providerId}/knowledge/search?q=${encodeURIComponent(query)}&limit=5`);
    setLoading(false);

    if (!res.ok) {
      const pair = res.code ? EXTRA_ERRORS[res.code] || ERRORS[res.code] : undefined;
      setError(tr(pair, lang, res.status === 0 ? t("networkError") : t("genericError")));
      setHits(null);
      return;
    }

    setHits(res.data || []);
  };

  return (
    <div className="aip-card">
      <h3 className="aip-h3"><Search size={16} /> {t("searchTitle")}</h3>
      <p className="aip-help" style={{ marginBottom: 12 }}>{t("searchHelp")}</p>

      <form className="aip-add" onSubmit={run}>
        <input className="aip-input" placeholder={t("searchPh")} value={query} onChange={(e) => setQuery(e.target.value)} maxLength={300} />
        <button className="aip-btn" type="submit" disabled={loading || query.trim().length < 2}>
          {loading ? <Loader2 size={14} className="aip-spin" /> : <Search size={14} />}
          <span>{loading ? t("searching") : t("search")}</span>
        </button>
      </form>

      {error && <div className="aip-error-text">{error}</div>}

      {hits && (
        <div className="aip-hits">
          {hits.length === 0 ? (
            <div className="aip-muted">{t("noHits")}</div>
          ) : (
            hits.map((h) => (
              <div key={h.chunkId} className="aip-hit">
                <div className="aip-hit-top">
                  <a className="aip-url" href={h.url} target="_blank" rel="noreferrer">
                    {h.heading || h.title || hostOf(h.url)} <ExternalLink size={10} />
                  </a>
                  <span className="aip-pill blue"><span>{Math.round(h.score * 100)}% {t("relevance")}</span></span>
                </div>
                <div className="aip-hit-url">{hostOf(h.url)}</div>
                <p className="aip-hit-text"><span>{h.text.length > 420 ? h.text.slice(0, 420).trimEnd() + " …" : h.text}</span></p>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
