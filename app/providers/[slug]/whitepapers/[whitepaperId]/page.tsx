"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Building2,
  CheckCircle2,
  FileText,
  Loader2,
  Mail,
  MapPin,
  Phone,
  Send,
} from "lucide-react";
import ProviderEmbedBridge from "@/components/ProviderEmbedBridge";
import { API_BASE_URL } from "@/services/api";
import { useLanguage } from "@/services/LanguageContext";

type WhitepaperPayload = {
  providerId: string;
  approvedVersion?: number;
  approvedAt?: string;
  company: any;
  about: any;
  whitepaper: any;
  canonicalWhitepaperSlug?: string;
};

type LeadForm = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  company: string;
  address: string;
  message: string;
  consentAccepted: boolean;
  website: string;
};

const EMPTY_FORM: LeadForm = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  company: "",
  address: "",
  message: "",
  consentAccepted: false,
  website: "",
};

function sanitizeWhitepaperHtml(value: string) {
  if (!value) return "";

  const parser = new DOMParser();
  const doc = parser.parseFromString(value, "text/html");
  const allowed = new Set([
    "P",
    "BR",
    "STRONG",
    "B",
    "EM",
    "I",
    "U",
    "H1",
    "H2",
    "H3",
    "BLOCKQUOTE",
    "UL",
    "OL",
    "LI",
  ]);

  const walk = (node: Node) => {
    Array.from(node.childNodes).forEach((child) => {
      if (child.nodeType === Node.ELEMENT_NODE) {
        const el = child as HTMLElement;

        if (!allowed.has(el.tagName)) {
          const fragment = document.createDocumentFragment();
          while (el.firstChild) fragment.appendChild(el.firstChild);
          el.replaceWith(fragment);
          walk(fragment);
          return;
        }

        Array.from(el.attributes).forEach((attribute) =>
          el.removeAttribute(attribute.name)
        );
      }

      walk(child);
    });
  };

  walk(doc.body);
  return doc.body.innerHTML;
}

export default function PublicWhitepaperPage() {
  const params = useParams<{ slug: string; whitepaperId: string }>();
  const router = useRouter();
  const { language } = useLanguage();
  const isGerman = language === "de";

  const slug = Array.isArray(params?.slug) ? params.slug[0] : params?.slug;
  const whitepaperId = Array.isArray(params?.whitepaperId)
    ? params.whitepaperId[0]
    : params?.whitepaperId;

  const uiText = {
    backToProvider: isGerman ? "Zurück zum Anbieter" : "Back to provider",
    loadingWhitepaper: isGerman
      ? "Freigegebenes Whitepaper wird geladen…"
      : "Loading approved whitepaper…",
    whitepaperNotFound: isGerman ? "Whitepaper nicht gefunden." : "Whitepaper not found.",
    approvedProvider: isGerman
      ? "Vom Administrator freigegebener Anbieter"
      : "Administrator-approved provider",
    providerFallback: isGerman ? "Anbieter" : "Provider",
    whitepaperImage: isGerman ? "Whitepaper-Bild" : "Whitepaper image",
    responseSubmitted: isGerman ? "Antwort gesendet" : "Response submitted",
    responseSubmittedCopy: isGerman
      ? "Vielen Dank. Ihre Angaben wurden für dieses Whitepaper gespeichert und können vom Anbieter eingesehen werden."
      : "Thank you. Your information has been saved for this whitepaper and the provider can review your response.",
    requestWhitepaper: isGerman ? "Dieses Whitepaper anfordern" : "Request this whitepaper",
    formCopy: (providerName: string) =>
      isGerman
        ? `Füllen Sie das Formular aus. Ihre Anfrage wird sicher an ${providerName} übermittelt.`
        : `Complete the form and your response will be sent securely to ${providerName}.`,
    theProvider: isGerman ? "den Anbieter" : "the provider",
    firstName: isGerman ? "Vorname" : "First Name",
    lastName: isGerman ? "Nachname" : "Last Name",
    email: isGerman ? "E-Mail" : "Email",
    phone: isGerman ? "Telefon" : "Phone",
    company: isGerman ? "Unternehmen" : "Company",
    address: isGerman ? "Adresse" : "Address",
    message: isGerman ? "Nachricht" : "Message",
    optionalMessage: isGerman
      ? "Optionale Nachricht an den Anbieter"
      : "Optional message for the provider",
    consent: isGerman
      ? "Ich stimme zu, dass der Anbieter die in diesem Formular übermittelten Informationen für diese Whitepaper-Anfrage speichern und verarbeiten darf."
      : "I agree that the provider may store and process the information submitted in this form for this whitepaper request.",
    submitting: isGerman ? "Wird gesendet…" : "Submitting…",
    submit: isGerman ? "Absenden" : "Submit",
    website: "Website",
    unableToSubmit: isGerman
      ? "Ihre Anfrage konnte nicht gesendet werden."
      : "Unable to submit your response.",
    unableToSubmitRetry: isGerman
      ? "Ihre Anfrage konnte nicht gesendet werden. Bitte versuchen Sie es erneut."
      : "Unable to submit your response. Please try again.",
  };

  const [payload, setPayload] = useState<WhitepaperPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [form, setForm] = useState<LeadForm>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!slug || !whitepaperId) return;

    const load = async () => {
      try {
        setLoading(true);
        setLoadError("");

        const response = await fetch(
          `${API_BASE_URL}/api/providers/${encodeURIComponent(
            slug
          )}/whitepapers/${encodeURIComponent(whitepaperId)}`,
          { cache: "no-store" }
        );

        const result = await response.json().catch(() => null);

        if (!response.ok) {
          setLoadError(result?.message || (language === "de" ? "Whitepaper nicht gefunden." : "Whitepaper not found."));
          return;
        }

        setPayload(result);

        const canonicalSlug =
          typeof result?.canonicalWhitepaperSlug === "string"
            ? result.canonicalWhitepaperSlug
            : "";

        if (
          canonicalSlug &&
          canonicalSlug !== whitepaperId
        ) {
          router.replace(
            `/providers/${encodeURIComponent(slug)}/whitepapers/${encodeURIComponent(
              canonicalSlug
            )}`
          );
        }
      } catch (error) {
        console.error("Public whitepaper load failed:", error);
        setLoadError(language === "de" ? "Dieses Whitepaper konnte nicht geladen werden." : "Unable to load this whitepaper.");
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [slug, whitepaperId, router, language]);

  const bodyHtml = useMemo(() => {
    if (typeof window === "undefined") return "";
    return sanitizeWhitepaperHtml(payload?.whitepaper?.content || "");
  }, [payload?.whitepaper?.content]);

  const updateField = <K extends keyof LeadForm>(
    key: K,
    value: LeadForm[K]
  ) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const responseWhitepaperId =
      typeof payload?.whitepaper?.id === "string"
        ? payload.whitepaper.id
        : whitepaperId;

    if (!slug || !responseWhitepaperId || submitting) return;

    try {
      setSubmitting(true);
      setFormError("");

      const response = await fetch(
        `${API_BASE_URL}/api/providers/${encodeURIComponent(
          slug
        )}/whitepapers/${encodeURIComponent(responseWhitepaperId)}/responses`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        }
      );

      const result = await response.json().catch(() => null);

      if (!response.ok) {
        setFormError(result?.message || uiText.unableToSubmit);
        return;
      }

      setSubmitted(true);
      setForm(EMPTY_FORM);
    } catch (error) {
      console.error("Whitepaper form submission failed:", error);
      setFormError(uiText.unableToSubmitRetry);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');

        *,*::before,*::after{box-sizing:border-box}

        .wp-root{
          min-height:100vh;
          background:#f5f6f8;
          color:#111827;
          font-family:"Plus Jakarta Sans",sans-serif;
        }

        .wp-shell{
          width:min(1180px,calc(100% - 32px));
          margin:0 auto;
          padding:24px 0 64px;
        }

        .wp-back{
          height:36px;
          padding:0 13px;
          border-radius:999px;
          border:1px solid #e5e7eb;
          background:#fff;
          color:#5f6876;
          display:inline-flex;
          align-items:center;
          gap:7px;
          font-family:inherit;
          font-size:10px;
          font-weight:700;
          cursor:pointer;
          margin-bottom:14px;
        }

        .wp-card{
          background:#fff;
          border:1px solid #e8eaee;
          border-radius:28px;
          box-shadow:0 18px 52px rgba(15,23,42,.06);
          overflow:hidden;
        }

        .wp-intro{
          padding:38px 40px 32px;
          border-bottom:1px solid #eceef1;
        }

        .wp-kicker{
          display:inline-flex;
          align-items:center;
          gap:6px;
          min-height:27px;
          padding:0 10px;
          border-radius:999px;
          background:#eef4ff;
          color:#2563eb;
          font-size:8.5px;
          font-weight:800;
          text-transform:uppercase;
          letter-spacing:.055em;
          margin-bottom:16px;
        }

        .wp-title{
          margin:0;
          width:100%;
          max-width:none;
          font-size:clamp(27px,3.15vw,42px);
          line-height:1.12;
          letter-spacing:-.038em;
          font-weight:800;
          color:#111827;
          text-wrap:balance;
          overflow-wrap:anywhere;
        }

        .wp-provider{
          margin-top:22px;
          display:flex;
          align-items:center;
          gap:11px;
          color:#68717f;
        }

        .wp-provider-logo{
          width:42px;
          height:42px;
          border-radius:13px;
          background:#fff;
          border:1px solid #e8eaee;
          display:flex;
          align-items:center;
          justify-content:center;
          overflow:hidden;
        }

        .wp-provider-logo img{
          width:100%;
          height:100%;
          object-fit:contain;
        }

        .wp-provider-name{
          color:#111827;
          font-size:11px;
          font-weight:800;
        }

        .wp-provider-label{
          margin-top:2px;
          color:#9aa2ad;
          font-size:8px;
          text-transform:uppercase;
          letter-spacing:.05em;
          font-weight:700;
        }

        .wp-content{
          padding:38px 44px 10px;
        }

        .wp-rich{
          max-width:920px;
          color:#4f5866;
          font-size:14px;
          line-height:1.85;
        }

        .wp-rich p{margin:0 0 19px}
        .wp-rich h1,
        .wp-rich h2,
        .wp-rich h3{
          color:#111827;
          letter-spacing:-.035em;
          line-height:1.18;
          margin:34px 0 14px;
          font-weight:800;
        }
        .wp-rich h1{font-size:31px}
        .wp-rich h2{font-size:26px}
        .wp-rich h3{font-size:21px}
        .wp-rich blockquote{
          margin:26px 0;
          padding:17px 20px;
          border-left:4px solid #111827;
          background:#f8fafc;
          color:#4b5563;
          border-radius:0 14px 14px 0;
          font-weight:600;
        }
        .wp-rich ul,
        .wp-rich ol{
          margin:10px 0 20px 24px;
          padding-left:18px;
        }
        .wp-rich li{margin:7px 0}

        .wp-lead-section{
          margin:28px 44px 44px;
          border:1px solid #e8eaee;
          border-radius:24px;
          overflow:hidden;
          display:grid;
          grid-template-columns:minmax(0,.9fr) minmax(420px,1.1fr);
          background:#fafbfc;
        }

        .wp-image-panel{
          min-height:640px;
          background:#eef1f4;
          position:relative;
        }

        .wp-image-panel img{
          width:100%;
          height:100%;
          object-fit:cover;
          display:block;
          position:absolute;
          inset:0;
        }

        .wp-image-placeholder{
          min-height:640px;
          display:flex;
          flex-direction:column;
          align-items:center;
          justify-content:center;
          gap:10px;
          color:#9aa2ad;
          font-size:11px;
        }

        .wp-form-panel{
          padding:30px;
          background:#fff;
        }

        .wp-form-title{
          margin:0 0 6px;
          color:#111827;
          font-size:22px;
          font-weight:800;
          letter-spacing:-.035em;
        }

        .wp-form-copy{
          margin:0 0 24px;
          color:#87909d;
          font-size:10.5px;
          line-height:1.65;
        }

        .wp-form-grid{
          display:grid;
          grid-template-columns:1fr 1fr;
          gap:14px;
        }

        .wp-field{
          display:flex;
          flex-direction:column;
          gap:6px;
        }

        .wp-field.full{grid-column:1 / -1}

        .wp-field label{
          color:#4b5563;
          font-size:9.5px;
          font-weight:700;
        }

        .wp-field label span{color:#ef4444}

        .wp-input,
        .wp-textarea{
          width:100%;
          border:1px solid #dfe3e8;
          background:#fff;
          border-radius:12px;
          color:#111827;
          font-family:inherit;
          font-size:11px;
          outline:none;
          transition:border-color .18s ease, box-shadow .18s ease;
        }

        .wp-input{
          height:44px;
          padding:0 13px;
        }

        .wp-textarea{
          min-height:92px;
          resize:vertical;
          padding:12px 13px;
          line-height:1.6;
        }

        .wp-input:focus,
        .wp-textarea:focus{
          border-color:#2563eb;
          box-shadow:0 0 0 3px rgba(37,99,235,.09);
        }

        .wp-consent{
          grid-column:1 / -1;
          display:flex;
          align-items:flex-start;
          gap:9px;
          color:#66707f;
          font-size:9.5px;
          line-height:1.55;
          margin-top:2px;
        }

        .wp-consent input{
          width:15px;
          height:15px;
          margin-top:1px;
          cursor:pointer;
        }

        .wp-submit{
          grid-column:1 / -1;
          height:46px;
          border:0;
          border-radius:12px;
          background:#111827;
          color:#fff;
          font-family:inherit;
          font-size:10.5px;
          font-weight:800;
          display:flex;
          align-items:center;
          justify-content:center;
          gap:7px;
          cursor:pointer;
          transition:transform .18s ease, opacity .18s ease;
        }

        .wp-submit:hover{transform:translateY(-1px)}
        .wp-submit:disabled{opacity:.55;cursor:not-allowed;transform:none}

        .wp-error{
          grid-column:1 / -1;
          padding:10px 12px;
          border-radius:10px;
          background:#fff1f2;
          border:1px solid #fecdd3;
          color:#be123c;
          font-size:9.5px;
          line-height:1.5;
        }

        .wp-success{
          min-height:430px;
          display:flex;
          flex-direction:column;
          align-items:center;
          justify-content:center;
          text-align:center;
          padding:30px;
        }

        .wp-success-icon{
          width:54px;
          height:54px;
          border-radius:50%;
          background:#ecfdf3;
          color:#15803d;
          display:flex;
          align-items:center;
          justify-content:center;
          margin-bottom:14px;
        }

        .wp-success h3{
          margin:0 0 7px;
          font-size:20px;
          letter-spacing:-.03em;
        }

        .wp-success p{
          margin:0;
          max-width:350px;
          color:#7b8492;
          font-size:10.5px;
          line-height:1.65;
        }

        .wp-honeypot{
          position:absolute!important;
          left:-9999px!important;
          width:1px!important;
          height:1px!important;
          overflow:hidden!important;
        }

        .wp-loading,
        .wp-not-found{
          background:#fff;
          border:1px dashed #dfe3e8;
          border-radius:24px;
          padding:50px 20px;
          text-align:center;
          color:#929aa6;
          font-size:11px;
        }

        @media(max-width:900px){
          .wp-lead-section{grid-template-columns:1fr}
          .wp-image-panel,.wp-image-placeholder{min-height:500px}
        }

        @media(max-width:620px){
          .wp-shell{width:min(100% - 20px,1180px);padding-top:14px}
          .wp-intro{padding:28px 20px 25px}
          .wp-title{font-size:28px;line-height:1.16}
          .wp-content{padding:28px 20px 6px}
          .wp-lead-section{margin:20px;border-radius:20px}
          .wp-image-panel,.wp-image-placeholder{min-height:390px}
          .wp-form-panel{padding:22px 18px}
          .wp-form-grid{grid-template-columns:1fr}
          .wp-field.full,.wp-consent,.wp-submit,.wp-error{grid-column:1}
        }
      `}</style>

      <div className="wp-root">
        <ProviderEmbedBridge />

        <main className="wp-shell">
          <button
            className="wp-back"
            onClick={() => router.push(`/providers/${encodeURIComponent(slug || "")}`)}
          >
            <ArrowLeft size={12} />
            {uiText.backToProvider}
          </button>

          {loading ? (
            <div className="wp-loading">{uiText.loadingWhitepaper}</div>
          ) : loadError || !payload ? (
            <div className="wp-not-found">
              {loadError || uiText.whitepaperNotFound}
            </div>
          ) : (
            <article className="wp-card">
              <header className="wp-intro">
                <div className="wp-kicker">
                  <FileText size={11} />
                  Whitepaper
                </div>

                <h1 className="wp-title">{payload.whitepaper.title}</h1>

                <div className="wp-provider">
                  <div className="wp-provider-logo">
                    {payload.company?.logoUrl ? (
                      <img
                        src={payload.company.logoUrl}
                        alt={`${payload.company?.name || uiText.providerFallback} logo`}
                      />
                    ) : (
                      <Building2 size={18} />
                    )}
                  </div>

                  <div>
                    <div className="wp-provider-name">
                      {payload.company?.name}
                    </div>
                    <div className="wp-provider-label">
                      {uiText.approvedProvider}
                    </div>
                  </div>
                </div>
              </header>

              {bodyHtml && (
                <section className="wp-content">
                  <div
                    className="wp-rich"
                    dangerouslySetInnerHTML={{ __html: bodyHtml }}
                  />
                </section>
              )}

              <section className="wp-lead-section">
                <div className="wp-image-panel">
                  {payload.whitepaper?.imageUrl ? (
                    <img
                      src={payload.whitepaper.imageUrl}
                      alt={payload.whitepaper.title || "Whitepaper"}
                    />
                  ) : (
                    <div className="wp-image-placeholder">
                      <FileText size={28} />
                      {uiText.whitepaperImage}
                    </div>
                  )}
                </div>

                <div className="wp-form-panel">
                  {submitted ? (
                    <div className="wp-success">
                      <div className="wp-success-icon">
                        <CheckCircle2 size={26} />
                      </div>
                      <h3>{uiText.responseSubmitted}</h3>
                      <p>{uiText.responseSubmittedCopy}</p>
                    </div>
                  ) : (
                    <>
                      <h2 className="wp-form-title">{uiText.requestWhitepaper}</h2>
                      <p className="wp-form-copy">
                        {uiText.formCopy(payload.company?.name || uiText.theProvider)}
                      </p>

                      <form className="wp-form-grid" onSubmit={handleSubmit}>
                        <div className="wp-honeypot" aria-hidden="true">
                          <label>
                            {uiText.website}
                            <input
                              tabIndex={-1}
                              autoComplete="off"
                              value={form.website}
                              onChange={(event) =>
                                updateField("website", event.target.value)
                              }
                            />
                          </label>
                        </div>

                        <div className="wp-field">
                          <label>
                            {uiText.firstName} <span>*</span>
                          </label>
                          <input
                            className="wp-input"
                            value={form.firstName}
                            onChange={(event) =>
                              updateField("firstName", event.target.value)
                            }
                            maxLength={100}
                            required
                          />
                        </div>

                        <div className="wp-field">
                          <label>
                            {uiText.lastName} <span>*</span>
                          </label>
                          <input
                            className="wp-input"
                            value={form.lastName}
                            onChange={(event) =>
                              updateField("lastName", event.target.value)
                            }
                            maxLength={100}
                            required
                          />
                        </div>

                        <div className="wp-field">
                          <label>
                            {uiText.email} <span>*</span>
                          </label>
                          <input
                            className="wp-input"
                            type="email"
                            value={form.email}
                            onChange={(event) =>
                              updateField("email", event.target.value)
                            }
                            maxLength={254}
                            required
                          />
                        </div>

                        <div className="wp-field">
                          <label>
                            {uiText.phone} <span>*</span>
                          </label>
                          <input
                            className="wp-input"
                            type="tel"
                            value={form.phone}
                            onChange={(event) =>
                              updateField("phone", event.target.value)
                            }
                            maxLength={60}
                            required
                          />
                        </div>

                        <div className="wp-field full">
                          <label>{uiText.company}</label>
                          <input
                            className="wp-input"
                            value={form.company}
                            onChange={(event) =>
                              updateField("company", event.target.value)
                            }
                            maxLength={180}
                          />
                        </div>

                        <div className="wp-field full">
                          <label>{uiText.address}</label>
                          <textarea
                            className="wp-textarea"
                            value={form.address}
                            onChange={(event) =>
                              updateField("address", event.target.value)
                            }
                            maxLength={500}
                          />
                        </div>

                        <div className="wp-field full">
                          <label>{uiText.message}</label>
                          <textarea
                            className="wp-textarea"
                            value={form.message}
                            onChange={(event) =>
                              updateField("message", event.target.value)
                            }
                            maxLength={4000}
                            placeholder={uiText.optionalMessage}
                          />
                        </div>

                        <label className="wp-consent">
                          <input
                            type="checkbox"
                            checked={form.consentAccepted}
                            onChange={(event) =>
                              updateField(
                                "consentAccepted",
                                event.target.checked
                              )
                            }
                            required
                          />
                          <span>{uiText.consent}</span>
                        </label>

                        {formError && (
                          <div className="wp-error">{formError}</div>
                        )}

                        <button
                          className="wp-submit"
                          type="submit"
                          disabled={submitting}
                        >
                          {submitting ? (
                            <>
                              <Loader2 size={14} className="animate-spin" />
                              {uiText.submitting}
                            </>
                          ) : (
                            <>
                              <Send size={13} />
                              {uiText.submit}
                            </>
                          )}
                        </button>
                      </form>
                    </>
                  )}
                </div>
              </section>
            </article>
          )}
        </main>
      </div>
    </>
  );
}
