"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Copy, Loader2, Mail, MessageSquare, Send, ShieldCheck, Trash2, UserPlus, X } from "lucide-react";
import { CONTENT_ERRORS, ERRORS, EXTRA_ERRORS, Lang, tr } from "./aiPublishingText";
import { RT, rt, type RKey } from "./reviewText";
import type { Api } from "./DraftWorkspace";


const fmt = (iso: string | undefined, lang: Lang) =>
  iso
    ? new Date(iso).toLocaleString(lang === "de" ? "de-DE" : "en-GB", {
        day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
      })
    : "";

const errorOf = (res: { status: number; code?: string }, lang: Lang) => {
  if (res.status === 0) return rt("c_err_network", lang);
  if (res.status === 401 || res.status === 403) return rt("c_err_session", lang);
  return tr(res.code ? CONTENT_ERRORS[res.code] || ERRORS[res.code] || EXTRA_ERRORS[res.code] : undefined, lang, rt("c_err_generic", lang));
};

export const STATUS_TONE: Record<string, string> = {
  draft: "gray",
  company_review: "blue",
  pending_admin_review: "amber",
  changes_requested: "amber",
  rejected: "red",
  approved: "green",
  published: "green",
  unpublished: "gray",
  archived: "gray",
};

export const statusLabel = (status: string | undefined, lang: Lang) => {
  const key = `st_${status || "draft"}`;
  return (key in RT ? RT[key as RKey] : RT.st_draft)[lang];
};

/* ═══════════════════════════ company access (provider page) ═══════════════════════════ */

type Invitation = { id: string; email: string; status: string; createdAt?: string; expiresAt?: string };
type Member = { uid: string; email: string; createdAt?: string };

export function AccessPanel(props: { lang: Lang; providerId: string; api: Api; archived: boolean }) {
  const { lang, providerId, api, archived } = props;
  const t = (key: RKey) => rt(key, lang);

  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [emailConfigured, setEmailConfigured] = useState(true);
  const [email, setEmail] = useState("");
  const [sendMail, setSendMail] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [created, setCreated] = useState<null | { email: string; url: string; emailSent: boolean; emailError?: string | null }>(null);
  const [copied, setCopied] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await api(`/api/ai/providers/${providerId}/access`);
    if (res.ok) {
      setInvitations(res.data.invitations || []);
      setMembers(res.data.members || []);
      setEmailConfigured(!!res.data.emailConfigured);
    }
  }, [api, providerId]);

  useEffect(() => {
    // Deferred so the state updates inside load() never run synchronously in the effect body.
    const timer = setTimeout(() => { void load(); }, 0);
    return () => clearTimeout(timer);
  }, [load]);

  const invite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || !email.trim()) return;

    setBusy("invite");
    setError("");
    setCreated(null);

    const res = await api(`/api/ai/providers/${providerId}/invitations`, {
      method: "POST",
      body: JSON.stringify({ email: email.trim(), sendEmail: sendMail && emailConfigured }),
    });
    setBusy("");

    if (!res.ok) { setError(errorOf(res, lang)); return; }

    setCreated({ email: res.data.email, url: res.data.acceptUrl, emailSent: !!res.data.emailSent, emailError: res.data.emailError });
    setEmail("");
    setCopied(false);
    await load();
  };

  const copy = async () => {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.url);
      setCopied(true);
    } catch {
      // The link stays visible in the box; the admin can copy it by hand.
    }
  };

  const revoke = async (id: string) => {
    setBusy(`revoke-${id}`);
    const res = await api(`/api/ai/providers/${providerId}/invitations/${id}/revoke`, { method: "POST" });
    setBusy("");
    if (!res.ok) setError(errorOf(res, lang)); else await load();
  };

  const removeMember = async (uid: string) => {
    setConfirmRemove(null);
    setBusy(`member-${uid}`);
    const res = await api(`/api/ai/providers/${providerId}/members/${uid}`, { method: "DELETE" });
    setBusy("");
    if (!res.ok) setError(errorOf(res, lang)); else await load();
  };

  const stateOf = (inv: Invitation) =>
    inv.status === "pending" && inv.expiresAt && new Date(inv.expiresAt) < new Date() ? "expired" : inv.status;

  return (
    <div className="aip-card">
      <h3 className="aip-h3"><ShieldCheck size={16} /> <span>{t("accessTitle")}</span></h3>
      <p className="aip-help">{t("accessHelp")}</p>

      {!archived && (
        <form onSubmit={invite}>
          <label className="aip-label">{t("inviteEmail")}</label>
          <div className="aip-row wrap" style={{ margin: 0 }}>
            <input className="aip-input" style={{ flex: 1, minWidth: 220 }} type="email" value={email} maxLength={200}
              onChange={(e) => setEmail(e.target.value)} disabled={!!busy} placeholder="name@firma.de" />
            <button className="aip-btn" type="submit" disabled={!!busy || !email.trim()}>
              {busy === "invite" ? <Loader2 size={13} className="aip-spin" /> : <UserPlus size={13} />}
              <span>{t("inviteButton")}</span>
            </button>
          </div>
          <label className="aip-checkbox" style={{ marginTop: 10 }}>
            <input type="checkbox" checked={sendMail && emailConfigured} disabled={!emailConfigured || !!busy} onChange={(e) => setSendMail(e.target.checked)} />
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Mail size={13} /> {t("inviteSendMail")}</span>
          </label>
          {!emailConfigured && <div className="aip-meta" style={{ marginTop: 4 }}>{t("mailNotConfigured")}</div>}
        </form>
      )}

      {error && <div className="aip-error-text">{error}</div>}

      {created && (
        <div className="aip-invite-box">
          <strong>{t("inviteLinkTitle")}</strong>
          <p className="aip-meta" style={{ margin: "4px 0 8px" }}>{created.email} · {t("inviteLinkHelp")}</p>
          <div className="aip-row wrap" style={{ margin: 0 }}>
            <input className="aip-input" readOnly value={created.url} style={{ flex: 1, minWidth: 220 }} onFocus={(e) => e.currentTarget.select()} />
            <button type="button" className="aip-btn ghost" onClick={copy}>
              {copied ? <Check size={13} /> : <Copy size={13} />}
              <span>{copied ? t("copied") : t("copyLink")}</span>
            </button>
          </div>
          <div className={created.emailSent ? "aip-ok-text" : "aip-meta"} style={{ marginTop: 8, marginBottom: 0 }}>
            {created.emailSent ? <><Check size={13} /> <span>{t("mailSent")}</span></>
              : created.emailError ? <span>{t("mailFailed")}</span> : null}
          </div>
        </div>
      )}

      <div className="aip-two" style={{ marginTop: 16 }}>
        <div>
          <div className="aip-label">{t("members")}</div>
          {members.length === 0 ? <div className="aip-meta">{t("noMembers")}</div> : (
            <div className="aip-jobs">
              {members.map((m) => (
                <div key={m.uid} className="aip-job">
                  <div>
                    <strong><span>{m.email}</span></strong>
                    <div className="aip-meta">{t("accessSince")} {fmt(m.createdAt, lang)}</div>
                  </div>
                  {!archived && (
                    confirmRemove === m.uid ? (
                      <div className="aip-row" style={{ margin: 0 }}>
                        <button className="aip-btn danger" onClick={() => removeMember(m.uid)}><span>{t("removeAccess")}</span></button>
                        <button className="aip-icon-btn" aria-label="cancel" onClick={() => setConfirmRemove(null)}><X size={14} /></button>
                      </div>
                    ) : (
                      <button className="aip-btn ghost danger-text" disabled={!!busy} onClick={() => setConfirmRemove(m.uid)}>
                        <Trash2 size={13} /> <span>{t("removeAccess")}</span>
                      </button>
                    )
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="aip-label">{t("invitations")}</div>
          {invitations.length === 0 ? <div className="aip-meta">{t("noInvitations")}</div> : (
            <div className="aip-jobs">
              {invitations.map((inv) => {
                const state = stateOf(inv);
                return (
                  <div key={inv.id} className="aip-job">
                    <div>
                      <strong><span>{inv.email}</span></strong>{" "}
                      <span className={`aip-pill ${state === "accepted" ? "green" : state === "pending" ? "blue" : "gray"}`}>
                        <span>{t(`inv_${state}` as RKey)}</span>
                      </span>
                      <div className="aip-meta">{fmt(inv.createdAt, lang)}</div>
                    </div>
                    {state === "pending" && !archived && (
                      <button className="aip-btn ghost" disabled={!!busy} onClick={() => revoke(inv.id)}><span>{t("revoke")}</span></button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════ review tab of a draft ═══════════════════════════ */

type ReviewData = {
  status: string;
  reviewRound: number;
  companyRevisions: number;
  maxCompanyRevisions: number;
  comments: { id: string; kind: string; authorRole: string; authorLabel?: string; text: string; createdAt?: string }[];
  statusLog: { id: string; from: string; to: string; byRole: string; note?: string; at?: string }[];
};

export function ReviewTab(props: {
  lang: Lang;
  contentId: string;
  status: string;
  api: Api;
  locked: boolean;
  onChanged: () => void;
}) {
  const { lang, contentId, status, api, locked } = props;
  const t = (key: RKey) => rt(key, lang);

  const [data, setData] = useState<ReviewData | null>(null);
  const [comment, setComment] = useState("");
  const [note, setNote] = useState("");
  const [notify, setNotify] = useState(true);
  const [decision, setDecision] = useState<null | "request_changes" | "reject">(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const load = useCallback(async () => {
    const res = await api(`/api/ai/content/${contentId}/review`);
    if (res.ok) setData(res.data);
  }, [api, contentId]);

  useEffect(() => {
    const timer = setTimeout(() => { void load(); }, 0);
    return () => clearTimeout(timer);
  }, [load, status]);

  const act = async (key: string, path: string, body: unknown, after?: () => void) => {
    setBusy(key);
    setError("");
    setInfo("");
    const res = await api(path, { method: "POST", body: JSON.stringify(body) });
    setBusy("");

    if (!res.ok) { setError(errorOf(res, lang)); return false; }

    after?.();
    await load();
    props.onChanged();
    return true;
  };

  const handover = () =>
    act("handover", `/api/ai/content/${contentId}/send-to-company`, { notify, note }, () => { setNote(""); setInfo(t("statusChanged")); });

  const decide = (kind: "approve" | "request_changes" | "reject" | "reopen") =>
    act(kind, `/api/ai/content/${contentId}/decision`, { decision: kind, note }, () => { setNote(""); setDecision(null); setInfo(t("statusChanged")); });

  const sendComment = async () => {
    if (!comment.trim()) return;
    await act("comment", `/api/ai/content/${contentId}/comments`, { text: comment }, () => { setComment(""); setInfo(t("commentSaved")); });
  };

  const roleLabel = (role: string) => (role === "admin" ? t("byAdmin") : t("byCompany"));

  return (
    <div className="aip-card aip-focus-target" id="aip-review">
      <div className="aip-row wrap" style={{ margin: "0 0 12px" }}>
        <span className="aip-label" style={{ margin: 0 }}>{t("reviewStatus")}</span>
        <span className={`aip-pill ${STATUS_TONE[status] || "gray"}`}><span>{statusLabel(status, lang)}</span></span>
        {data && status === "company_review" && (
          <span className="aip-pill gray"><span>{t("companyRevisionsUsed")}: {data.companyRevisions}/{data.maxCompanyRevisions}</span></span>
        )}
      </div>

      {status === "company_review" && <div className="aip-banner warn"><span>{t("waitingCompany")}</span></div>}

      {/* actions by status */}
      {(status === "draft" || status === "changes_requested") && (
        <div className="aip-review-action">
          <strong>{t("sendToCompany")}</strong>
          <p className="aip-help" style={{ margin: "4px 0 8px" }}>{t("sendToCompanyHelp")}</p>
          <label className="aip-label">{t("handoverNote")}</label>
          <textarea className="aip-input aip-area" rows={2} maxLength={1500} value={note} disabled={locked || !!busy} onChange={(e) => setNote(e.target.value)} />
          <label className="aip-checkbox" style={{ margin: "8px 0" }}>
            <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Mail size={13} /> {t("notifyByMail")}</span>
          </label>
          <div className="aip-row wrap" style={{ margin: 0 }}>
            <button className="aip-btn" onClick={handover} disabled={locked || !!busy}>
              {busy === "handover" ? <Loader2 size={13} className="aip-spin" /> : <Send size={13} />}
              <span>{t("sendToCompany")}</span>
            </button>
            {status === "draft" && (
              <button className="aip-btn ghost" onClick={() => decide("approve")} disabled={locked || !!busy}>
                <Check size={13} /> <span>{t("approveDirect")}</span>
              </button>
            )}
          </div>
        </div>
      )}

      {status === "pending_admin_review" && (
        <div className="aip-review-action">
          {decision ? (
            <>
              <label className="aip-label">{t("decisionNote")}</label>
              <textarea className="aip-input aip-area" rows={3} maxLength={1500} value={note} onChange={(e) => setNote(e.target.value)} />
              <div className="aip-row wrap" style={{ marginTop: 10 }}>
                <button className={`aip-btn ${decision === "reject" ? "danger" : ""}`} disabled={!!busy || note.trim().length < 3} onClick={() => decide(decision)}>
                  {busy === decision ? <Loader2 size={13} className="aip-spin" /> : null}
                  <span>{decision === "reject" ? t("reject") : t("requestChanges")}</span>
                </button>
                <button className="aip-btn ghost" aria-label="cancel" onClick={() => setDecision(null)}><X size={14} /></button>
              </div>
            </>
          ) : (
            <div className="aip-row wrap" style={{ margin: 0 }}>
              <button className="aip-btn" disabled={!!busy} onClick={() => decide("approve")}>
                {busy === "approve" ? <Loader2 size={13} className="aip-spin" /> : <Check size={13} />}
                <span>{t("approve")}</span>
              </button>
              <button className="aip-btn ghost" disabled={!!busy} onClick={() => { setNote(""); setDecision("request_changes"); }}><span>{t("requestChanges")}</span></button>
              <button className="aip-btn ghost danger-text" disabled={!!busy} onClick={() => { setNote(""); setDecision("reject"); }}><span>{t("reject")}</span></button>
            </div>
          )}
        </div>
      )}

      {status === "rejected" && (
        <div className="aip-review-action">
          <button className="aip-btn ghost" disabled={!!busy} onClick={() => decide("reopen")}><span>{t("reopen")}</span></button>
        </div>
      )}

      {["approved", "published"].includes(status) && <div className="aip-meta">{t("readOnlyStatus")}</div>}

      {error && <div className="aip-error-text">{error}</div>}
      {info && <div className="aip-ok-text" style={{ marginTop: 10 }}><Check size={13} /> <span>{info}</span></div>}

      {/* comments */}
      <div className="aip-label" style={{ marginTop: 20 }}><MessageSquare size={12} style={{ verticalAlign: -1 }} /> {t("reviewComments")}</div>
      <div className="aip-chat">
        {(data?.comments || []).length === 0 && <div className="aip-meta">{t("noComments")}</div>}
        {(data?.comments || []).map((c) => (
          <div key={c.id} className={`aip-bubble ${c.authorRole === "admin" ? "you" : "ai"}`}>
            <div className="aip-bubble-who"><span>{roleLabel(c.authorRole)}</span><span className="aip-meta">· {fmt(c.createdAt, lang)}</span></div>
            <span>{c.text}</span>
          </div>
        ))}
      </div>

      <div className="aip-row wrap" style={{ marginTop: 10 }}>
        <input className="aip-input" style={{ flex: 1, minWidth: 220 }} maxLength={1500} value={comment} placeholder={t("commentPh")}
          onChange={(e) => setComment(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void sendComment(); }} />
        <button className="aip-btn ghost" disabled={!!busy || !comment.trim()} onClick={sendComment}>
          {busy === "comment" ? <Loader2 size={13} className="aip-spin" /> : <Send size={13} />}
          <span>{t("commentSend")}</span>
        </button>
      </div>

      {/* history */}
      <div className="aip-label" style={{ marginTop: 20 }}>{t("reviewTimeline")}</div>
      <div className="aip-jobs">
        {(data?.statusLog || []).slice().reverse().map((l) => (
          <div key={l.id} className="aip-job">
            <div>
              <span className={`aip-pill ${STATUS_TONE[l.to] || "gray"}`}><span>{statusLabel(l.to, lang)}</span></span>
              <div className="aip-meta">{roleLabel(l.byRole)} · {fmt(l.at, lang)}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════ review queue (overview) ═══════════════════════════ */

export function ReviewQueue(props: { lang: Lang; api: Api; refreshKey: string; onOpenProvider: (providerId: string) => void }) {
  const { lang, api } = props;
  const t = (key: RKey) => rt(key, lang);
  const [rows, setRows] = useState<{ id: string; providerId: string; providerName: string; title: string; type: string; updatedAt?: string }[]>([]);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      const res = await api("/api/ai/review-queue");
      if (!cancelled && res.ok) setRows(res.data || []);
    }, 0);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [api, props.refreshKey]);

  if (rows.length === 0) return null;

  return (
    <div className="aip-card aip-queue">
      <h3 className="aip-h3"><span>{t("reviewQueueTitle")}</span> <span className="aip-pill amber"><span>{rows.length}</span></span></h3>
      <p className="aip-help">{t("reviewQueueHelp")}</p>
      <div className="aip-jobs">
        {rows.map((r) => (
          <div key={r.id} className="aip-job">
            <div>
              <strong><span>{r.title}</span></strong>
              <div className="aip-meta">{r.providerName} · {fmt(r.updatedAt, lang)}</div>
            </div>
            <button className="aip-btn ghost" onClick={() => props.onOpenProvider(r.providerId)}><span>{t("openProviderBtn")}</span></button>
          </div>
        ))}
      </div>
    </div>
  );
}
