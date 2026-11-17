"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Copy, ExternalLink, Image as ImageIcon, Link2, Loader2, RefreshCw, Save, Send, Sparkles, Trash2, UserCircle2 } from "lucide-react";
import { CONTENT_ERRORS, ERRORS, EXTRA_ERRORS, Lang, tr } from "./aiPublishingText";
import { rt, type RKey } from "./reviewText";
import type { Api } from "./DraftWorkspace";

/* eslint-disable @typescript-eslint/no-explicit-any */

type Fields = {
  shortDescription: string; headline: string; overview: string; headquarters: string;
  foundedYear: string; employeeRange: string; specialties: string[]; categories: string[];
  email: string; phone: string; address: string;
};

type Form = {
  shortDescription: string; headline: string; overview: string; headquarters: string;
  foundedYear: string; employeeRange: string; specialties: string; categories: string;
  email: string; phone: string; address: string;
};

const toForm = (f: Fields): Form => ({
  shortDescription: f.shortDescription, headline: f.headline, overview: f.overview, headquarters: f.headquarters,
  foundedYear: f.foundedYear, employeeRange: f.employeeRange,
  specialties: f.specialties.join("\n"), categories: f.categories.join("\n"),
  email: f.email, phone: f.phone, address: f.address,
});

const toPayload = (f: Form) => ({
  shortDescription: f.shortDescription, headline: f.headline, overview: f.overview, headquarters: f.headquarters,
  foundedYear: f.foundedYear, employeeRange: f.employeeRange,
  specialties: f.specialties.split("\n"), categories: f.categories.split("\n"),
  email: f.email, phone: f.phone, address: f.address,
});

type Candidate = { url: string; kind: string };
type Logo = { url: string; source: string; candidates: Candidate[] };
type Header = { url: string; model: string };

type GetResponse = {
  ai: Fields; overrides: Fields; effective: Fields;
  hasResearch: boolean; logo: Logo; header: Header;
  headerConfigured: boolean; logoStorageConfigured: boolean;
};

const errorOf = (res: { status: number; code?: string }, lang: Lang) => {
  if (res.status === 0) return rt("c_err_network", lang);
  if (res.status === 401 || res.status === 403) return rt("c_err_session", lang);
  return tr(res.code ? CONTENT_ERRORS[res.code] || ERRORS[res.code] || EXTRA_ERRORS[res.code] : undefined, lang, rt("c_err_generic", lang));
};

export default function ProfileBuilderPanel({ lang, providerId, api, archived }: { lang: Lang; providerId: string; api: Api; archived: boolean }) {
  const t = (key: RKey) => rt(key, lang);

  const [open, setOpen] = useState(false);
  const [data, setData] = useState<GetResponse | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [base, setBase] = useState<Form | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const [logoUrlInput, setLogoUrlInput] = useState("");
  const [previewLink, setPreviewLink] = useState<{ active: boolean; createdAt: string | null } | null>(null);
  const [newPreviewUrl, setNewPreviewUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [confirmLogoRemove, setConfirmLogoRemove] = useState(false);
  const [sendStatus, setSendStatus] = useState<{ sent: boolean; companyId: string; slug: string; sentAt: string | null } | null>(null);
  const [confirmSend, setConfirmSend] = useState(false);
  const [midrangeSendStatus, setMidrangeSendStatus] = useState<{ sent: boolean; companyId: string; slug: string; sentAt: string | null } | null>(null);
  const [confirmMidrangeSend, setConfirmMidrangeSend] = useState(false);
  const [acceptedMembers, setAcceptedMembers] = useState<{ email: string }[]>([]);
  const [midrangeLinkEmail, setMidrangeLinkEmail] = useState("");
  const [confirmMidrangeLink, setConfirmMidrangeLink] = useState(false);
  const [midrangeLinked, setMidrangeLinked] = useState<{ email: string; linkedAt: string } | null>(null);

  const load = useCallback(async () => {
    const [profileRes, linkRes, sendRes, midrangeSendRes, accessRes] = await Promise.all([
      api(`/api/ai/providers/${providerId}/profile`),
      api(`/api/ai/providers/${providerId}/profile/preview-link`),
      api(`/api/ai/providers/${providerId}/profile/send-status/eyeric`),
      api(`/api/ai/providers/${providerId}/profile/send-status/midrange`),
      api(`/api/ai/providers/${providerId}/access`),
    ]);

    if (profileRes.ok) {
      setData(profileRes.data);
      const next = toForm(profileRes.data.effective);
      setForm(next);
      setBase(next);
    } else {
      setError(errorOf(profileRes, lang));
    }

    if (linkRes.ok) setPreviewLink({ active: linkRes.data.active, createdAt: linkRes.data.createdAt });
    if (sendRes.ok) setSendStatus(sendRes.data);
    if (midrangeSendRes.ok) setMidrangeSendStatus(midrangeSendRes.data);
    if (accessRes.ok) setAcceptedMembers(accessRes.data.members || []);
  }, [api, providerId, lang]);

  useEffect(() => {
    if (!open || data) return;
    const timer = setTimeout(() => { void load(); }, 0);
    return () => clearTimeout(timer);
  }, [open, data, load]);

  const dirty = !!form && !!base && JSON.stringify(form) !== JSON.stringify(base);
  const set = (key: keyof Form, value: string) => { setInfo(""); setForm((f) => (f ? { ...f, [key]: value } : f)); };

  const run = async (key: string, action: () => Promise<{ ok: boolean; status: number; data: any; code?: string }>, onOk?: (data: any) => void) => {
    setBusy(key);
    setError("");
    setInfo("");
    const res = await action();
    setBusy("");

    if (!res.ok) { setError(errorOf(res, lang)); return false; }
    onOk?.(res.data);
    return true;
  };

  const save = () =>
    run("save", () => api(`/api/ai/providers/${providerId}/profile`, { method: "PUT", body: JSON.stringify(toPayload(form!)) }),
      async () => { await load(); setInfo(t("pb_saved")); });

  const refreshLogo = () => run("logo-refresh", () => api(`/api/ai/providers/${providerId}/profile/logo/refresh`, { method: "POST" }), () => load());
  const pickCandidate = (index: number) => run(`logo-pick-${index}`, () => api(`/api/ai/providers/${providerId}/profile/logo/candidates/${index}`, { method: "PUT" }), () => load());
  const applyManualLogo = () =>
    run("logo-apply", () => api(`/api/ai/providers/${providerId}/profile/logo`, { method: "PUT", body: JSON.stringify({ url: logoUrlInput }) }),
      async () => { setLogoUrlInput(""); await load(); });
  const removeLogo = () => { setConfirmLogoRemove(false); void run("logo-remove", () => api(`/api/ai/providers/${providerId}/profile/logo`, { method: "DELETE" }), () => load()); };

  const generateHeader = () => run("header", () => api(`/api/ai/providers/${providerId}/profile/header/generate`, { method: "POST" }), () => load());
  const removeHeader = () => run("header-remove", () => api(`/api/ai/providers/${providerId}/profile/header`, { method: "DELETE" }), () => load());

  const createPreviewLink = () =>
    run("preview-create", () => api(`/api/ai/providers/${providerId}/profile/preview-link`, { method: "POST" }),
      async (d) => { setNewPreviewUrl(d.url); setCopied(false); await load(); });
  const revokePreviewLink = () => {
    setConfirmRevoke(false);
    void run("preview-revoke", () => api(`/api/ai/providers/${providerId}/profile/preview-link`, { method: "DELETE" }),
      async () => { setNewPreviewUrl(null); await load(); });
  };
  const copyLink = async () => {
    if (!newPreviewUrl) return;
    try { await navigator.clipboard.writeText(newPreviewUrl); setCopied(true); } catch { /* link stays visible to copy by hand */ }
  };

  const sendAndPreview = () => {
    setConfirmSend(false);
    void run("send", () => api(`/api/ai/providers/${providerId}/profile/send/eyeric`, { method: "POST" }), async () => {
      await load();
      const linkRes = await api(`/api/ai/providers/${providerId}/profile/preview-link`, { method: "POST" });
      if (linkRes.ok) {
        setNewPreviewUrl(linkRes.data.url);
        setCopied(false);
        await load();
        window.open(linkRes.data.url, "_blank", "noopener,noreferrer");
      }
    });
  };

  const sendToMidrange = () => {
    setConfirmMidrangeSend(false);
    void run("send-midrange", () => api(`/api/ai/providers/${providerId}/profile/send/midrange`, { method: "POST" }), async () => {
      await load();
    });
  };

  const linkMidrangeUser = () => {
    setConfirmMidrangeLink(false);
    void run(
      "link-midrange-user",
      () => api(`/api/ai/providers/${providerId}/profile/midrange/link-user`, { method: "POST", body: JSON.stringify({ email: midrangeLinkEmail }) }),
      async (result) => {
        setMidrangeLinked({ email: result.email, linkedAt: new Date().toISOString() });
      }
    );
  };

  const field = (key: keyof Form, label: RKey, rows = 0, max = 300) => {
    const aiValue = data ? (data.ai as any)[key === "overview" ? "overview" : key] : "";
    const showAiHint = typeof aiValue === "string" && aiValue.length > 0 && form?.[key] !== aiValue && key !== "specialties" && key !== "categories";

    const common = {
      value: form?.[key] ?? "",
      maxLength: max,
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => set(key, e.target.value),
      disabled: !!busy,
    };

    return (
      <div>
        <label className="aip-label">{t(label)}</label>
        {rows > 0 ? <textarea className="aip-input aip-area" rows={rows} {...common} /> : <input className="aip-input" {...common} />}
        {showAiHint && <div className="aip-meta">{t("pb_aiValue")}: {aiValue}</div>}
      </div>
    );
  };

  return (
    <div className="aip-card">
      <div className="aip-card-head">
        <div>
          <h3 className="aip-h3"><UserCircle2 size={16} /> <span>{t("pb_title")}</span></h3>
          <p className="aip-help">{t("pb_help")}</p>
        </div>
        <button className="aip-btn ghost" onClick={() => setOpen((v) => !v)}><span>{open ? t("pb_close") : t("pb_open")}</span></button>
      </div>

      {open && !data && !error && <div className="aip-meta"><Loader2 size={13} className="aip-spin" /></div>}
      {error && <div className="aip-error-text">{error}</div>}

      {open && data && form && (
        <>
          {!data.hasResearch && <div className="aip-banner warn"><span>{t("pb_noResearch")}</span></div>}

          <div className="aip-plan-fields" style={{ marginBottom: 14 }}>
            <div>
              {field("headline", "pb_headline", 0, 180)}
              <div style={{ height: 10 }} />
              {field("shortDescription", "pb_shortDescription", 3, 200)}
              <div style={{ height: 10 }} />
              {field("headquarters", "pb_headquarters", 0, 200)}
              <div className="aip-two" style={{ marginTop: 10 }}>
                {field("foundedYear", "pb_foundedYear", 0, 4)}
                {field("employeeRange", "pb_employeeRange", 0, 80)}
              </div>
            </div>
            <div>{field("overview", "pb_overview", 10, 4000)}</div>
            <div>{field("specialties", "pb_specialties", 5, 1600)}</div>
            <div>{field("categories", "pb_categories", 5, 800)}</div>
            <div>
              {field("email", "pb_email", 0, 254)}
              <div style={{ height: 10 }} />
              {field("phone", "pb_phone", 0, 50)}
              <div style={{ height: 10 }} />
              {field("address", "pb_address", 0, 300)}
            </div>
          </div>

          <div className="aip-row wrap" style={{ marginBottom: 20 }}>
            <button className="aip-btn" onClick={save} disabled={!!busy || !dirty || archived}>
              {busy === "save" ? <Loader2 size={13} className="aip-spin" /> : <Save size={13} />}
              <span>{t("pb_save")}</span>
            </button>
            {dirty && <span className="aip-pill amber"><span>{t("es_unsaved" as RKey)}</span></span>}
            {info && <span className="aip-ok-text" style={{ margin: 0 }}><Check size={13} /> <span>{info}</span></span>}
          </div>

          {/* ───── logo ───── */}
          <div className="aip-subsection">
            <h4 className="aip-h4"><ImageIcon size={14} /> <span>{t("pb_logo")}</span></h4>
            <p className="aip-help">{t("pb_logoHelp")}</p>

            <div className="aip-row wrap" style={{ margin: "0 0 12px" }}>
              {data.logo.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={data.logo.url} alt="Logo" className="aip-logo-preview" />
              ) : (
                <div className="aip-meta">{t("pb_logoNone")}</div>
              )}
              {data.logo.url && (
                <span className="aip-pill gray">
                  <span>{data.logo.source === "manual" ? t("pb_logoSourceManual") : t("pb_logoSourceWebsite")}</span>
                </span>
              )}
            </div>

            <div className="aip-row wrap" style={{ marginBottom: 12 }}>
              <button className="aip-btn ghost" onClick={refreshLogo} disabled={!!busy || archived || !data.logoStorageConfigured}>
                {busy === "logo-refresh" ? <Loader2 size={13} className="aip-spin" /> : <RefreshCw size={13} />}
                <span>{t("pb_logoRefresh")}</span>
              </button>
              {data.logo.url && (
                confirmLogoRemove ? (
                  <span className="aip-row" style={{ margin: 0 }}>
                    <button className="aip-btn danger" onClick={removeLogo}><span>{t("pb_logoRemove")}</span></button>
                    <button className="aip-btn ghost" onClick={() => setConfirmLogoRemove(false)}><span>×</span></button>
                  </span>
                ) : (
                  <button className="aip-btn ghost danger-text" onClick={() => setConfirmLogoRemove(true)} disabled={!!busy || archived}>
                    <Trash2 size={13} /> <span>{t("pb_logoRemove")}</span>
                  </button>
                )
              )}
            </div>

            {data.logo.candidates.length > 0 && (
              <>
                <div className="aip-label">{t("pb_logoCandidates")}</div>
                <div className="aip-logo-candidates">
                  {data.logo.candidates.map((c, i) => (
                    <div key={c.url} className="aip-logo-candidate">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={c.url} alt={c.kind} onError={(e) => { (e.target as HTMLImageElement).style.visibility = "hidden"; }} />
                      <button className="aip-btn ghost" style={{ height: 30, fontSize: 11 }} onClick={() => pickCandidate(i)} disabled={!!busy || archived}>
                        {busy === `logo-pick-${i}` ? <Loader2 size={11} className="aip-spin" /> : null}
                        <span>{t("pb_logoUse")}</span>
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}

            <div className="aip-row wrap" style={{ marginTop: 12 }}>
              <input className="aip-input" style={{ flex: 1, minWidth: 220 }} value={logoUrlInput} placeholder={t("pb_logoUrlPh")}
                disabled={!!busy || archived} onChange={(e) => setLogoUrlInput(e.target.value)} />
              <button className="aip-btn ghost" onClick={applyManualLogo} disabled={!!busy || archived || !logoUrlInput.trim()}>
                {busy === "logo-apply" ? <Loader2 size={13} className="aip-spin" /> : null}
                <span>{t("pb_logoUrlUse")}</span>
              </button>
            </div>
          </div>

          {/* ───── header ───── */}
          <div className="aip-subsection">
            <h4 className="aip-h4"><Sparkles size={14} /> <span>{t("pb_header")}</span></h4>
            <p className="aip-help">{t("pb_headerHelp")}</p>

            {!data.headerConfigured && <div className="aip-banner warn"><span>{t("pb_headerNotConfigured")}</span></div>}

            {data.header.url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={data.header.url} alt="Header" className="aip-header-preview" />
            ) : (
              <div className="aip-meta" style={{ marginBottom: 10 }}>{t("pb_headerNone")}</div>
            )}

            <div className="aip-row wrap" style={{ marginTop: 12 }}>
              <button className="aip-btn ghost" onClick={generateHeader} disabled={!!busy || archived || !data.headerConfigured}>
                {busy === "header" ? <Loader2 size={13} className="aip-spin" /> : <Sparkles size={13} />}
                <span>{data.header.url ? t("pb_headerRegenerate") : t("pb_headerGenerate")}</span>
              </button>
              {data.header.url && (
                <button className="aip-btn ghost danger-text" onClick={removeHeader} disabled={!!busy || archived}>
                  {busy === "header-remove" ? <Loader2 size={13} className="aip-spin" /> : <Trash2 size={13} />}
                  <span>{t("pb_headerRemove")}</span>
                </button>
              )}
            </div>
          </div>

          {/* ───── preview link ───── */}
          <div className="aip-subsection">
            <h4 className="aip-h4"><Link2 size={14} /> <span>{t("pb_previewLink")}</span></h4>
            <p className="aip-help">{t("pb_previewHelp")}</p>

            {newPreviewUrl ? (
              <div className="aip-invite-box">
                <strong>{t("pb_previewShown")}</strong>
                <div className="aip-row wrap" style={{ margin: "8px 0 0" }}>
                  <input className="aip-input" readOnly value={newPreviewUrl} style={{ flex: 1, minWidth: 220 }} onFocus={(e) => e.currentTarget.select()} />
                  <button type="button" className="aip-btn ghost" onClick={copyLink}>
                    {copied ? <Check size={13} /> : <Copy size={13} />}
                    <span>{copied ? t("pb_previewCopied") : t("pb_previewCopy")}</span>
                  </button>
                </div>
              </div>
            ) : previewLink?.active ? (
              <div className="aip-meta">{t("pb_previewActive")} {previewLink.createdAt ? new Date(previewLink.createdAt).toLocaleString(lang === "de" ? "de-DE" : "en-GB") : ""}</div>
            ) : (
              <div className="aip-meta">{t("pb_previewNone")}</div>
            )}

            <div className="aip-row wrap" style={{ marginTop: 12 }}>
              <button className="aip-btn ghost" onClick={createPreviewLink} disabled={!!busy || archived}>
                {busy === "preview-create" ? <Loader2 size={13} className="aip-spin" /> : <Link2 size={13} />}
                <span>{previewLink?.active ? t("pb_previewRotate") : t("pb_previewCreate")}</span>
              </button>
              {previewLink?.active && (
                confirmRevoke ? (
                  <span className="aip-row" style={{ margin: 0 }}>
                    <button className="aip-btn danger" onClick={revokePreviewLink}><span>{t("pb_previewRevoke")}</span></button>
                    <button className="aip-btn ghost" onClick={() => setConfirmRevoke(false)}><span>×</span></button>
                  </span>
                ) : (
                  <button className="aip-btn ghost danger-text" onClick={() => setConfirmRevoke(true)} disabled={!!busy || archived}>
                    <span>{t("pb_previewRevoke")}</span>
                  </button>
                )
              )}
            </div>
          </div>

          {/* ───── send to EY ERIC ───── */}
          <div className="aip-subsection">
            <h4 className="aip-h4"><Send size={14} /> <span>{t("pb_send")}</span></h4>
            <p className="aip-help">{t("pb_sendHelp")}</p>

            {sendStatus?.sent ? (
              <div className="aip-meta">
                {t("pb_sendSentAt")} {sendStatus.sentAt ? new Date(sendStatus.sentAt).toLocaleString(lang === "de" ? "de-DE" : "en-GB") : ""}
              </div>
            ) : (
              <div className="aip-meta">{t("pb_sendNone")}</div>
            )}

            <div className="aip-row wrap" style={{ marginTop: 12 }}>
              {confirmSend ? (
                <span className="aip-row" style={{ margin: 0 }}>
                  <button className="aip-btn" onClick={sendAndPreview}>
                    {busy === "send" ? <Loader2 size={13} className="aip-spin" /> : null}
                    <span>{t("pb_sendConfirm")}</span>
                  </button>
                  <button className="aip-btn ghost" onClick={() => setConfirmSend(false)}><span>×</span></button>
                </span>
              ) : (
                <button className="aip-btn ghost" onClick={() => setConfirmSend(true)} disabled={!!busy || archived}>
                  <ExternalLink size={13} />
                  <span>{sendStatus?.sent ? t("pb_sendAgain") : t("pb_sendCreate")}</span>
                </button>
              )}
            </div>
          </div>

          {/* ───── send to MIDRANGE ───── */}
          <div className="aip-subsection">
            <h4 className="aip-h4"><Send size={14} /> <span>{t("pb_sendMidrange")}</span></h4>
            <p className="aip-help">{t("pb_sendMidrangeHelp")}</p>

            {midrangeSendStatus?.sent ? (
              <div className="aip-meta">
                {t("pb_sendSentAt")} {midrangeSendStatus.sentAt ? new Date(midrangeSendStatus.sentAt).toLocaleString(lang === "de" ? "de-DE" : "en-GB") : ""}
              </div>
            ) : (
              <div className="aip-meta">{t("pb_sendNone")}</div>
            )}

            <div className="aip-row wrap" style={{ marginTop: 12 }}>
              {confirmMidrangeSend ? (
                <span className="aip-row" style={{ margin: 0 }}>
                  <button className="aip-btn" onClick={sendToMidrange}>
                    {busy === "send-midrange" ? <Loader2 size={13} className="aip-spin" /> : null}
                    <span>{t("pb_sendConfirm")}</span>
                  </button>
                  <button className="aip-btn ghost" onClick={() => setConfirmMidrangeSend(false)}><span>×</span></button>
                </span>
              ) : (
                <button className="aip-btn ghost" onClick={() => setConfirmMidrangeSend(true)} disabled={!!busy || archived}>
                  <ExternalLink size={13} />
                  <span>{midrangeSendStatus?.sent ? t("pb_sendMidrangeAgain") : t("pb_sendMidrangeCreate")}</span>
                </button>
              )}
            </div>
          </div>

          {/* ───── grant MIDRANGE account access ───── */}
          {midrangeSendStatus?.sent && (
            <div className="aip-subsection">
              <h4 className="aip-h4"><UserCircle2 size={14} /> <span>{t("pb_midrangeAccess")}</span></h4>
              <p className="aip-help">{t("pb_midrangeAccessHelp")}</p>

              {midrangeLinked ? (
                <div className="aip-meta">{t("pb_midrangeAccessGranted")} {midrangeLinked.email}</div>
              ) : (
                <div className="aip-meta">{t("pb_midrangeAccessNone")}</div>
              )}

              {acceptedMembers.length === 0 ? (
                <p className="aip-help" style={{ marginTop: 8 }}>{t("pb_midrangeAccessNoMembers")}</p>
              ) : (
                <div className="aip-row wrap" style={{ marginTop: 12 }}>
                  {confirmMidrangeLink ? (
                    <span className="aip-row" style={{ margin: 0 }}>
                      <button className="aip-btn" onClick={linkMidrangeUser} disabled={!midrangeLinkEmail}>
                        {busy === "link-midrange-user" ? <Loader2 size={13} className="aip-spin" /> : null}
                        <span>{t("pb_sendConfirm")}</span>
                      </button>
                      <button className="aip-btn ghost" onClick={() => setConfirmMidrangeLink(false)}><span>×</span></button>
                    </span>
                  ) : (
                    <>
                      <select
                        className="aip-input"
                        style={{ maxWidth: 260 }}
                        value={midrangeLinkEmail}
                        onChange={(e) => setMidrangeLinkEmail(e.target.value)}
                      >
                        <option value="">{t("pb_midrangeAccessPick")}</option>
                        {acceptedMembers.map((m) => (
                          <option key={m.email} value={m.email}>{m.email}</option>
                        ))}
                      </select>
                      <button className="aip-btn ghost" onClick={() => setConfirmMidrangeLink(true)} disabled={!!busy || archived || !midrangeLinkEmail}>
                        <UserCircle2 size={13} />
                        <span>{t("pb_midrangeAccessGrant")}</span>
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
