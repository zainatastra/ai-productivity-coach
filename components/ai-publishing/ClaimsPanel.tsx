"use client";

import { useCallback, useEffect, useState } from "react";
import { BadgeCheck, Check, Loader2, X } from "lucide-react";
import { CONTENT_ERRORS, ERRORS, EXTRA_ERRORS, Lang, tr } from "./aiPublishingText";
import { rt, type RKey } from "./reviewText";
import type { Api } from "./DraftWorkspace";

type Claim = {
  id: string; companyName?: string; name?: string; email?: string; position?: string; phone?: string; message?: string; createdAt?: string;
};

const fmt = (iso: string | undefined, lang: Lang) =>
  iso ? new Date(iso).toLocaleString(lang === "de" ? "de-DE" : "en-GB", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "";

const errorOf = (res: { status: number; code?: string }, lang: Lang) => {
  if (res.status === 0) return rt("c_err_network", lang);
  if (res.status === 401 || res.status === 403) return rt("c_err_session", lang);
  return tr(res.code ? CONTENT_ERRORS[res.code] || ERRORS[res.code] || EXTRA_ERRORS[res.code] : undefined, lang, rt("c_err_generic", lang));
};

export default function ClaimsPanel({ lang, api }: { lang: Lang; api: Api }) {
  const t = (key: RKey) => rt(key, lang);

  const [open, setOpen] = useState(false);
  const [claims, setClaims] = useState<Claim[] | null>(null);
  const [rejecting, setRejecting] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [hint, setHint] = useState(false);

  const load = useCallback(async () => {
    const res = await api("/api/ai/claims");
    if (res.ok) setClaims(res.data || []);
    else setError(errorOf(res, lang));
  }, [api, lang]);

  // Loaded when the page opens so the number of open requests is visible without opening the panel.
  useEffect(() => {
    const timer = setTimeout(() => { void load(); }, 0);
    return () => clearTimeout(timer);
  }, [load]);

  const decide = async (claim: Claim, decision: "approve" | "reject") => {
    setBusy(`${decision}-${claim.id}`);
    setError("");
    setInfo("");
    setHint(false);

    const res = await api(`/api/ai/claims/${claim.id}/decision`, { method: "POST", body: JSON.stringify({ decision, note: reason }) });
    setBusy("");

    if (!res.ok) {
      setError(errorOf(res, lang));
      if (res.code === "no_publisher_account") setHint(true);
      return;
    }

    setRejecting("");
    setReason("");
    setInfo(decision === "approve" ? t("cl_approved") : t("cl_rejected"));
    await load();
  };

  const count = claims?.length ?? 0;

  return (
    <div className="aip-card">
      <div className="aip-card-head">
        <div>
          <h3 className="aip-h3">
            <BadgeCheck size={16} /> <span>{t("cl_title")}</span>
            {count > 0 && <span className="aip-pill amber"><span>{count}</span></span>}
          </h3>
          <p className="aip-help">{t("cl_help")}</p>
        </div>
        <button className="aip-btn ghost" onClick={() => setOpen((v) => !v)}><span>{open ? t("es_close") : t("es_open")}</span></button>
      </div>

      {open && (
        <>
          {claims === null && !error && <div className="aip-meta"><Loader2 size={13} className="aip-spin" /></div>}
          {claims !== null && claims.length === 0 && <div className="aip-meta">{t("cl_none")}</div>}

          <div className="aip-jobs">
            {(claims || []).map((c) => (
              <div key={c.id} className="aip-job" style={{ display: "block" }}>
                <strong><span>{c.companyName}</span></strong>
                <div className="aip-meta">
                  {c.name} · {c.email} · {t("cl_position")}: {c.position}{c.phone ? ` · ${t("cl_phone")}: ${c.phone}` : ""} · {fmt(c.createdAt, lang)}
                </div>
                {c.message && <div className="aip-meta" style={{ marginTop: 4 }}>{c.message}</div>}

                {rejecting === c.id ? (
                  <div style={{ marginTop: 10 }}>
                    <label className="aip-label">{t("cl_reason")}</label>
                    <textarea className="aip-input aip-area" rows={2} maxLength={1500} value={reason} onChange={(e) => setReason(e.target.value)} />
                    <div className="aip-row wrap" style={{ marginTop: 8 }}>
                      <button className="aip-btn danger" disabled={!!busy || reason.trim().length < 3} onClick={() => decide(c, "reject")}>
                        {busy === `reject-${c.id}` ? <Loader2 size={13} className="aip-spin" /> : null}
                        <span>{t("cl_confirmReject")}</span>
                      </button>
                      <button className="aip-btn ghost" aria-label="cancel" onClick={() => { setRejecting(""); setReason(""); }}><X size={14} /></button>
                    </div>
                  </div>
                ) : (
                  <div className="aip-row wrap" style={{ marginTop: 10 }}>
                    <button className="aip-btn" disabled={!!busy} onClick={() => decide(c, "approve")}>
                      {busy === `approve-${c.id}` ? <Loader2 size={13} className="aip-spin" /> : <Check size={13} />}
                      <span>{t("cl_approve")}</span>
                    </button>
                    <button className="aip-btn ghost danger-text" disabled={!!busy} onClick={() => { setReason(""); setRejecting(c.id); }}><span>{t("cl_reject")}</span></button>
                  </div>
                )}
              </div>
            ))}
          </div>

          {error && <div className="aip-error-text" style={{ marginTop: 10 }}>{error}</div>}
          {hint && <div className="aip-banner warn" style={{ marginTop: 8 }}><span>{t("cl_noAccount")}</span></div>}
          {info && <div className="aip-ok-text" style={{ marginTop: 10 }}><Check size={13} /> <span>{info}</span></div>}
        </>
      )}
    </div>
  );
}
