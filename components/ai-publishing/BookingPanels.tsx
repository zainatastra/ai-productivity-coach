"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Loader2, Save, Tag } from "lucide-react";
import { CONTENT_ERRORS, ERRORS, EXTRA_ERRORS, Lang, tr } from "./aiPublishingText";
import { rt, type RKey } from "./reviewText";
import type { Api } from "./DraftWorkspace";

/* eslint-disable @typescript-eslint/no-explicit-any */

const errorOf = (res: { status: number; code?: string }, lang: Lang) => {
  if (res.status === 0) return rt("c_err_network", lang);
  if (res.status === 401 || res.status === 403) return rt("c_err_session", lang);
  return tr(res.code ? CONTENT_ERRORS[res.code] || ERRORS[res.code] || EXTRA_ERRORS[res.code] : undefined, lang, rt("c_err_generic", lang));
};

// Cents shown the way a person types them ("1234,50"); the server does the real parsing and calculation.
const centsToInput = (cents?: number | null) => (cents ? (cents / 100).toFixed(2).replace(".", ",") : "");
const money = (cents: number, lang: Lang) =>
  lang === "de"
    ? `${(cents / 100).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`
    : `€${(cents / 100).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmt = (iso: string | undefined, lang: Lang) =>
  iso ? new Date(iso).toLocaleString(lang === "de" ? "de-DE" : "en-GB", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "";

type Booking = {
  id: string; providerName?: string; contentTitle?: string; contentType?: string; createdByEmail?: string;
  date?: string; timePeriod?: string; leads?: number; targetGroup?: string; priceCents?: number; createdAt?: string;
};

/* ═════════════ admin: default prices, notification address and the bookings list ═════════════ */

export function PricingPanel({ lang, api }: { lang: Lang; api: Api }) {
  const t = (key: RKey) => rt(key, lang);

  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [form, setForm] = useState({ whitepaperBase: "", pricePerLead: "", webinarBase: "", adminEmail: "" });
  const [base, setBase] = useState(form);
  const [emailConfigured, setEmailConfigured] = useState(true);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const load = useCallback(async () => {
    const [settings, list] = await Promise.all([api("/api/ai/settings/pricing"), api("/api/ai/bookings")]);

    if (settings.ok) {
      const next = {
        whitepaperBase: centsToInput(settings.data.whitepaperBaseCents),
        pricePerLead: centsToInput(settings.data.pricePerLeadCents),
        webinarBase: centsToInput(settings.data.webinarBaseCents),
        adminEmail: settings.data.adminEmail || "",
      };
      setForm(next);
      setBase(next);
      setEmailConfigured(!!settings.data.emailConfigured);
    } else {
      setError(errorOf(settings, lang));
    }

    if (list.ok) setBookings(list.data || []);
    setLoaded(true);
  }, [api, lang]);

  useEffect(() => {
    if (!open || loaded) return;
    const timer = setTimeout(() => { void load(); }, 0);
    return () => clearTimeout(timer);
  }, [open, loaded, load]);

  const dirty = JSON.stringify(form) !== JSON.stringify(base);

  const save = async () => {
    setBusy(true);
    setError("");
    setInfo("");
    const res = await api("/api/ai/settings/pricing", { method: "PUT", body: JSON.stringify(form) });
    setBusy(false);

    if (!res.ok) { setError(errorOf(res, lang)); return; }

    await load();
    setInfo(rt("es_saved", lang));
  };

  const field = (key: keyof typeof form, label: RKey, type = "text") => (
    <div style={{ flex: 1, minWidth: 190 }}>
      <label className="aip-label">{t(label)}</label>
      <input className="aip-input" type={type} inputMode={type === "email" ? "email" : "decimal"} value={form[key]} maxLength={120}
        disabled={busy} onChange={(e) => { setInfo(""); setForm((f) => ({ ...f, [key]: e.target.value })); }} />
    </div>
  );

  return (
    <div className="aip-card">
      <div className="aip-card-head">
        <div>
          <h3 className="aip-h3"><Tag size={16} /> <span>{t("pr_title")}</span></h3>
          <p className="aip-help">{t("pr_help")}</p>
        </div>
        <button className="aip-btn ghost" onClick={() => setOpen((v) => !v)}><span>{open ? t("es_close") : t("es_open")}</span></button>
      </div>

      {open && !loaded && !error && <div className="aip-meta"><Loader2 size={13} className="aip-spin" /></div>}
      {error && <div className="aip-error-text">{error}</div>}

      {open && loaded && (
        <>
          <div className="aip-row wrap" style={{ margin: 0, alignItems: "flex-start" }}>
            {field("whitepaperBase", "pr_whitepaperBase")}
            {field("pricePerLead", "pr_perLead")}
            {field("webinarBase", "pr_webinarBase")}
          </div>

          <div style={{ marginTop: 10, maxWidth: 420 }}>{field("adminEmail", "pr_adminEmail", "email")}</div>
          {!form.adminEmail.trim() && <div className="aip-meta">{t("pr_noEmail")}</div>}
          {!emailConfigured && <div className="aip-banner warn" style={{ marginTop: 8 }}><span>{t("es_notConfigured")}</span></div>}

          <div className="aip-row wrap" style={{ marginTop: 12 }}>
            <button className="aip-btn" onClick={save} disabled={busy || !dirty}>
              {busy ? <Loader2 size={13} className="aip-spin" /> : <Save size={13} />}
              <span>{t("pr_save")}</span>
            </button>
            {info && <span className="aip-ok-text" style={{ margin: 0 }}><Check size={13} /> <span>{info}</span></span>}
          </div>

          <div className="aip-label" style={{ marginTop: 20 }}>{t("pr_bookings")}</div>
          {bookings.length === 0 && <div className="aip-meta">{t("pr_noBookings")}</div>}
          <div className="aip-jobs">
            {bookings.map((b) => (
              <div key={b.id} className="aip-job">
                <div>
                  <strong><span>{b.contentTitle}</span></strong>{" "}
                  <span className="aip-pill gray"><span>{b.contentType === "webinar" ? "Webinar" : "Whitepaper"}</span></span>{" "}
                  <span className="aip-pill green"><span>{money(b.priceCents ?? 0, lang)}</span></span>
                  <div className="aip-meta">
                    {b.providerName} · {b.date} · {t(`bk_${b.timePeriod}` as RKey)} · {b.leads} Leads · {b.createdByEmail} · {fmt(b.createdAt, lang)}
                  </div>
                  <div className="aip-meta">{b.targetGroup}</div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ═════════════ admin: the price of one piece (empty = default) ═════════════ */

export function PiecePricing(props: {
  lang: Lang; api: Api; contentId: string; type: string; pricing?: { baseCents?: number; perLeadCents?: number } | null;
}) {
  const { lang, api, contentId, type } = props;
  const t = (key: RKey) => rt(key, lang);

  const initial = { base: centsToInput(props.pricing?.baseCents), perLead: centsToInput(props.pricing?.perLeadCents) };
  const [form, setForm] = useState(initial);
  const [base, setBase] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  useEffect(() => {
    const next = { base: centsToInput(props.pricing?.baseCents), perLead: centsToInput(props.pricing?.perLeadCents) };
    const timer = setTimeout(() => { setForm(next); setBase(next); }, 0);
    return () => clearTimeout(timer);
  }, [contentId, props.pricing?.baseCents, props.pricing?.perLeadCents]);

  if (type !== "whitepaper" && type !== "webinar") return null;

  const dirty = JSON.stringify(form) !== JSON.stringify(base);

  const save = async () => {
    setBusy(true);
    setError("");
    setInfo("");
    const res = await api(`/api/ai/content/${contentId}/pricing`, { method: "PUT", body: JSON.stringify({ base: form.base, perLead: form.perLead }) });
    setBusy(false);

    if (!res.ok) { setError(errorOf(res, lang)); return; }

    setBase(form);
    setInfo(rt("es_saved", lang));
  };

  return (
    <div className="aip-review-action" style={{ marginTop: 14 }}>
      <strong>{t("pr_pieceTitle")}</strong>
      <p className="aip-help" style={{ margin: "4px 0 8px" }}>{t("pr_pieceHelp")}</p>
      <div className="aip-row wrap" style={{ margin: 0 }}>
        <div>
          <label className="aip-label">{t("bk_basePrice")} (€)</label>
          <input className="aip-input" inputMode="decimal" placeholder={t("pr_default")} value={form.base} maxLength={20} disabled={busy}
            onChange={(e) => { setInfo(""); setForm((f) => ({ ...f, base: e.target.value })); }} />
        </div>
        {type === "whitepaper" && (
          <div>
            <label className="aip-label">{t("bk_perLead")} (€)</label>
            <input className="aip-input" inputMode="decimal" placeholder={t("pr_default")} value={form.perLead} maxLength={20} disabled={busy}
              onChange={(e) => { setInfo(""); setForm((f) => ({ ...f, perLead: e.target.value })); }} />
          </div>
        )}
        <button className="aip-btn ghost" style={{ alignSelf: "flex-end" }} onClick={save} disabled={busy || !dirty}>
          {busy ? <Loader2 size={13} className="aip-spin" /> : <Save size={13} />}
          <span>{t("pr_pieceSave")}</span>
        </button>
      </div>
      {error && <div className="aip-error-text">{error}</div>}
      {info && <div className="aip-ok-text" style={{ marginTop: 8 }}><Check size={13} /> <span>{info}</span></div>}
    </div>
  );
}

/* ═════════════ company: the Book form (company page styles) ═════════════ */

export function BookingForm(props: { lang: Lang; api: Api; contentId: string; type: string }) {
  const { lang, api, contentId, type } = props;
  const t = (key: RKey) => rt(key, lang);

  const [info, setInfo] = useState<any>(null);
  const [date, setDate] = useState("");
  const [period, setPeriod] = useState("morning");
  const [leads, setLeads] = useState("");
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const load = useCallback(async () => {
    const res = await api(`/api/ai/company/contents/${contentId}/booking`);
    if (res.ok) setInfo(res.data);
  }, [api, contentId]);

  useEffect(() => {
    const timer = setTimeout(() => { void load(); }, 0);
    return () => clearTimeout(timer);
  }, [load]);

  if (!info) return null;

  const count = Math.max(0, parseInt(leads, 10) || 0);
  // Only a preview: the server calculates the real price when the booking is made.
  const preview = type === "whitepaper" ? info.baseCents + info.perLeadCents * count : info.baseCents;
  const today = new Date().toISOString().slice(0, 10);

  const book = async () => {
    setBusy(true);
    setError("");
    setDone(false);
    const res = await api(`/api/ai/company/contents/${contentId}/booking`, {
      method: "POST",
      body: JSON.stringify({ date, timePeriod: period, leads: count, targetGroup: target }),
    });
    setBusy(false);

    if (!res.ok) { setError(errorOf(res, lang)); return; }

    setDone(true);
    setDate("");
    setLeads("");
    setTarget("");
    await load();
  };

  return (
    <div className="cr-card">
      <h3 className="cr-h3"><Tag size={15} /> <span>{t("bk_title")}</span></h3>
      <p className="cr-help">{t("bk_help")}</p>

      {!info.priced ? (
        <div className="cr-banner gray"><span>{t("bk_notPriced")}</span></div>
      ) : (
        <>
          <label className="cr-label">{type === "webinar" ? t("bk_dateWebinar") : t("bk_dateWhitepaper")}</label>
          <div className="cr-row">
            <input className="cr-input" style={{ maxWidth: 190 }} type="date" min={today} value={date} disabled={busy} onChange={(e) => setDate(e.target.value)} />
            <select className="cr-input" style={{ maxWidth: 190 }} value={period} disabled={busy} onChange={(e) => setPeriod(e.target.value)} aria-label={t("bk_period")}>
              {(info.timePeriods as string[]).map((p) => <option key={p} value={p}>{t(`bk_${p}` as RKey)}</option>)}
            </select>
          </div>

          <label className="cr-label" style={{ marginTop: 12 }}>{t("bk_leads")}</label>
          <input className="cr-input" style={{ maxWidth: 190 }} type="number" min={1} max={100000} value={leads} disabled={busy} onChange={(e) => setLeads(e.target.value)} />

          <label className="cr-label" style={{ marginTop: 12 }}>{t("bk_target")}</label>
          <textarea className="cr-input" rows={3} maxLength={1000} value={target} disabled={busy} onChange={(e) => setTarget(e.target.value)} />

          <div className="cr-note" style={{ marginTop: 14 }}>
            <strong>{t("bk_price")}: {money(preview, lang)}</strong>
            <div className="cr-meta" style={{ margin: "4px 0 0" }}>
              {type === "whitepaper"
                ? `${t("bk_formulaWhitepaper")} (${money(info.baseCents, lang)} + ${money(info.perLeadCents, lang)} × ${count})`
                : t("bk_formulaWebinar")}
            </div>
            <div className="cr-meta" style={{ margin: "2px 0 0" }}>{t("bk_previewNote")}</div>
          </div>

          <button className="cr-btn" style={{ marginTop: 12 }} onClick={book} disabled={busy || !date || count < 1 || target.trim().length < 3}>
            {busy ? <Loader2 size={14} className="cr-spin" /> : <Check size={14} />} <span>{t("bk_book")}</span>
          </button>
        </>
      )}

      {done && <div className="cr-ok" style={{ marginTop: 10 }}><Check size={14} /> <span>{t("bk_done")}</span></div>}
      {error && <div className="cr-error" style={{ marginTop: 10 }}>{error}</div>}

      {(info.bookings || []).length > 0 && (
        <>
          <div className="cr-label" style={{ marginTop: 16 }}>{t("bk_existing")}</div>
          <ul className="cr-versions">
            {info.bookings.map((b: any) => (
              <li key={b.id}>{b.date} · {t(`bk_${b.timePeriod}` as RKey)} · {b.leads} Leads · {money(b.priceCents ?? 0, lang)} · {fmt(b.createdAt, lang)}</li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
