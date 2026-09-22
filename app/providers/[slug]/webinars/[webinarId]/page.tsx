"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Building2,
  CheckCircle2,
  Loader2,
  Send,
  UserRound,
  Video,
} from "lucide-react";
import ProviderEmbedBridge from "@/components/ProviderEmbedBridge";
import { API_BASE_URL } from "@/services/api";

type WebinarPayload = {
  providerId: string;
  approvedVersion?: number;
  approvedAt?: string;
  company: any;
  about: any;
  webinar: any;
  canonicalWebinarSlug?: string;
};

type WebinarForm = {
  firstName: string;
  lastName: string;
  email: string;
  country: string;
  company: string;
  message: string;
  consentAccepted: boolean;
  website: string;
};

const EMPTY_FORM: WebinarForm = {
  firstName: "",
  lastName: "",
  email: "",
  country: "",
  company: "",
  message: "",
  consentAccepted: false,
  website: "",
};

function sanitizeWebinarHtml(value: string) {
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

export default function PublicWebinarPage() {
  const params = useParams<{ slug: string; webinarId: string }>();
  const router = useRouter();

  const slug = Array.isArray(params?.slug) ? params.slug[0] : params?.slug;
  const webinarId = Array.isArray(params?.webinarId)
    ? params.webinarId[0]
    : params?.webinarId;

  const [payload, setPayload] = useState<WebinarPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [form, setForm] = useState<WebinarForm>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!slug || !webinarId) return;

    const load = async () => {
      try {
        setLoading(true);
        setLoadError("");

        const response = await fetch(
          `${API_BASE_URL}/api/providers/${encodeURIComponent(
            slug
          )}/webinars/${encodeURIComponent(webinarId)}`,
          { cache: "no-store" }
        );

        const result = await response.json().catch(() => null);

        if (!response.ok) {
          setLoadError(result?.message || "Webinar not found.");
          return;
        }

        setPayload(result);

        const canonicalSlug =
          typeof result?.canonicalWebinarSlug === "string"
            ? result.canonicalWebinarSlug.trim()
            : "";

        if (
          canonicalSlug &&
          webinarId &&
          canonicalSlug.toLowerCase() !== webinarId.toLowerCase()
        ) {
          router.replace(
            `/providers/${encodeURIComponent(slug)}/webinars/${encodeURIComponent(
              canonicalSlug
            )}`
          );
        }
      } catch (error) {
        console.error("Public webinar load failed:", error);
        setLoadError("Unable to load this webinar.");
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [slug, webinarId, router]);

  const bodyHtml = useMemo(() => {
    if (typeof window === "undefined") return "";
    return sanitizeWebinarHtml(payload?.webinar?.content || "");
  }, [payload?.webinar?.content]);

  const updateField = <K extends keyof WebinarForm>(
    key: K,
    value: WebinarForm[K]
  ) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const responseWebinarId =
      typeof payload?.webinar?.id === "string"
        ? payload.webinar.id
        : "";

    if (!slug || !responseWebinarId || submitting) return;

    try {
      setSubmitting(true);
      setFormError("");

      const response = await fetch(
        `${API_BASE_URL}/api/providers/${encodeURIComponent(
          slug
        )}/webinars/${encodeURIComponent(responseWebinarId)}/responses`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        }
      );

      const result = await response.json().catch(() => null);

      if (!response.ok) {
        setFormError(result?.message || "Unable to submit your registration.");
        return;
      }

      setSubmitted(true);
      setForm(EMPTY_FORM);
    } catch (error) {
      console.error("Webinar registration failed:", error);
      setFormError("Unable to submit your registration. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');

        *,*::before,*::after{box-sizing:border-box}

        .wb-root{
          min-height:100vh;
          background:#f5f6f8;
          color:#111827;
          font-family:"Plus Jakarta Sans",sans-serif;
        }

        .wb-shell{
          width:min(1180px,calc(100% - 32px));
          margin:0 auto;
          padding:24px 0 64px;
        }

        .wb-back{
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

        .wb-page{
          overflow:visible;
          background:#fff;
          border:1px solid #e8eaee;
          border-radius:28px;
          box-shadow:0 18px 52px rgba(15,23,42,.06);
        }

        .wb-hero{
          position:relative;
          min-height:390px;
          border-radius:28px 28px 0 0;
          overflow:hidden;
          background:linear-gradient(135deg,#172033,#334155);
          display:flex;
          align-items:flex-end;
        }

        .wb-hero-bg{
          position:absolute;
          inset:0;
          width:100%;
          height:100%;
          object-fit:cover;
        }

        .wb-hero-overlay{
          position:absolute;
          inset:0;
          background:
            linear-gradient(180deg,rgba(7,12,24,.34),rgba(7,12,24,.82)),
            linear-gradient(90deg,rgba(7,12,24,.72),rgba(7,12,24,.38));
        }

        .wb-hero-content{
          position:relative;
          z-index:2;
          width:min(920px,100%);
          padding:42px 46px;
          color:#fff;
        }

        .wb-kicker{
          display:inline-flex;
          align-items:center;
          gap:6px;
          min-height:28px;
          padding:0 10px;
          border-radius:999px;
          background:rgba(255,255,255,.14);
          border:1px solid rgba(255,255,255,.20);
          backdrop-filter:blur(10px);
          font-size:8.5px;
          font-weight:800;
          letter-spacing:.055em;
          text-transform:uppercase;
          margin-bottom:14px;
        }

        .wb-subtitle{
          margin:0 0 8px;
          color:rgba(255,255,255,.96);
          text-shadow:0 2px 12px rgba(0,0,0,.22);
          font-size:14px;
          line-height:1.55;
          font-weight:700;
        }

        .wb-title{
          margin:0;
          width:100%;
          color:#fff;
          text-shadow:0 2px 18px rgba(0,0,0,.24);
          font-size:clamp(31px,4.2vw,52px);
          line-height:1.06;
          letter-spacing:-.045em;
          font-weight:800;
          text-wrap:balance;
        }

        .wb-provider{
          margin-top:18px;
          display:flex;
          align-items:center;
          gap:10px;
          color:rgba(255,255,255,.78);
        }

        .wb-provider-logo{
          width:38px;
          height:38px;
          border-radius:12px;
          background:#fff;
          border:1px solid rgba(255,255,255,.35);
          overflow:hidden;
          display:flex;
          align-items:center;
          justify-content:center;
          color:#111827;
        }

        .wb-provider-logo img{
          width:100%;
          height:100%;
          object-fit:contain;
        }

        .wb-provider-name{
          color:#fff;
          font-size:10.5px;
          font-weight:800;
        }

        .wb-provider-label{
          margin-top:2px;
          font-size:7.8px;
          font-weight:700;
          text-transform:uppercase;
          letter-spacing:.055em;
        }

        .wb-main{
          display:grid;
          grid-template-columns:minmax(0,1fr) minmax(340px,420px);
          gap:34px;
          padding:38px 44px 48px;
          align-items:start;
        }

        .wb-copy{
          min-width:0;
        }

        .wb-rich{
          color:#4f5866;
          font-size:13px;
          line-height:1.85;
        }

        .wb-rich p{margin:0 0 18px}
        .wb-rich h1,
        .wb-rich h2,
        .wb-rich h3{
          color:#111827;
          letter-spacing:-.035em;
          line-height:1.18;
          margin:30px 0 13px;
          font-weight:800;
        }

        .wb-rich h1{font-size:30px}
        .wb-rich h2{font-size:25px}
        .wb-rich h3{font-size:20px}

        .wb-rich blockquote{
          margin:24px 0;
          padding:16px 18px;
          border-left:4px solid #111827;
          background:#f8fafc;
          color:#4b5563;
          border-radius:0 14px 14px 0;
          font-weight:600;
        }

        .wb-rich ul,
        .wb-rich ol{
          margin:10px 0 18px 24px;
          padding-left:18px;
        }

        .wb-rich li{margin:7px 0}

        .wb-speaker{
          margin-top:32px;
          padding-top:24px;
          border-top:1px solid #eceef1;
        }

        .wb-speaker-label{
          color:#9aa2ad;
          font-size:8.5px;
          font-weight:800;
          text-transform:uppercase;
          letter-spacing:.06em;
          margin-bottom:12px;
        }

        .wb-speaker-card{
          display:flex;
          align-items:center;
          gap:16px;
        }

        .wb-speaker-photo{
          width:108px;
          height:108px;
          border-radius:24px;
          overflow:hidden;
          border:1px solid #e5e7eb;
          background:#f3f4f6;
          display:flex;
          align-items:center;
          justify-content:center;
          color:#9aa2ad;
          flex-shrink:0;
        }

        .wb-speaker-photo img{
          width:100%;
          height:100%;
          object-fit:cover;
          object-position:center top;
        }

        .wb-speaker-name{
          color:#111827;
          font-size:18px;
          line-height:1.4;
          font-weight:800;
          letter-spacing:-.025em;
        }

        .wb-speaker-copy{
          margin-top:4px;
          color:#8b94a2;
          font-size:10px;
          line-height:1.55;
        }

        .wb-form-card{
          position:sticky;
          top:24px;
          padding:24px;
          border:1px solid #e3e7ec;
          border-radius:22px;
          background:#fafbfc;
          box-shadow:0 16px 38px rgba(15,23,42,.06);
        }

        .wb-form-title{
          margin:0 0 5px;
          color:#111827;
          font-size:20px;
          font-weight:800;
          letter-spacing:-.03em;
        }

        .wb-form-copy{
          margin:0 0 20px;
          color:#89919e;
          font-size:10px;
          line-height:1.6;
        }

        .wb-form{
          display:flex;
          flex-direction:column;
          gap:12px;
        }

        .wb-field{
          display:flex;
          flex-direction:column;
          gap:6px;
        }

        .wb-field label{
          color:#4b5563;
          font-size:9.5px;
          font-weight:700;
        }

        .wb-field label span{color:#ef4444}

        .wb-input,
        .wb-select,
        .wb-textarea{
          width:100%;
          border:1px solid #dfe3e8;
          background:#fff;
          border-radius:12px;
          color:#111827;
          font-family:inherit;
          font-size:11px;
          outline:none;
          transition:border-color .18s ease,box-shadow .18s ease;
        }

        .wb-input,
        .wb-select{
          height:44px;
          padding:0 13px;
        }

        .wb-textarea{
          min-height:90px;
          resize:vertical;
          padding:12px 13px;
          line-height:1.6;
        }

        .wb-input:focus,
        .wb-select:focus,
        .wb-textarea:focus{
          border-color:#2563eb;
          box-shadow:0 0 0 3px rgba(37,99,235,.09);
        }

        .wb-consent{
          display:flex;
          align-items:flex-start;
          gap:9px;
          color:#66707f;
          font-size:9px;
          line-height:1.55;
        }

        .wb-consent input{
          width:15px;
          height:15px;
          margin-top:1px;
          flex-shrink:0;
          cursor:pointer;
        }

        .wb-submit{
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
          transition:transform .18s ease,opacity .18s ease;
        }

        .wb-submit:hover{transform:translateY(-1px)}
        .wb-submit:disabled{opacity:.55;cursor:not-allowed;transform:none}

        .wb-error{
          padding:10px 12px;
          border-radius:10px;
          background:#fff1f2;
          border:1px solid #fecdd3;
          color:#be123c;
          font-size:9.5px;
          line-height:1.5;
        }

        .wb-success{
          min-height:330px;
          display:flex;
          flex-direction:column;
          align-items:center;
          justify-content:center;
          text-align:center;
          padding:20px;
        }

        .wb-success-icon{
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

        .wb-success h3{
          margin:0 0 7px;
          font-size:19px;
          letter-spacing:-.03em;
        }

        .wb-success p{
          margin:0;
          max-width:320px;
          color:#7b8492;
          font-size:10.5px;
          line-height:1.65;
        }

        .wb-honeypot{
          position:absolute!important;
          left:-9999px!important;
          width:1px!important;
          height:1px!important;
          overflow:hidden!important;
        }

        .wb-loading,
        .wb-not-found{
          background:#fff;
          border:1px dashed #dfe3e8;
          border-radius:24px;
          padding:50px 20px;
          text-align:center;
          color:#929aa6;
          font-size:11px;
        }

        @media(max-width:900px){
          .wb-main{grid-template-columns:1fr}
          .wb-form-card{position:relative;top:auto}
        }

        @media(max-width:620px){
          .wb-shell{width:min(100% - 20px,1180px);padding-top:14px}
          .wb-hero{min-height:330px}
          .wb-hero-content{padding:30px 20px}
          .wb-title{font-size:34px}
          .wb-subtitle{font-size:12px}
          .wb-main{padding:28px 20px 34px;gap:26px}
          .wb-speaker-card{align-items:flex-start}
          .wb-speaker-photo{width:88px;height:88px;border-radius:20px}
          .wb-form-card{padding:20px}
        }
      `}</style>

      <div className="wb-root">
        <ProviderEmbedBridge />

        <main className="wb-shell">
          <button
            className="wb-back"
            onClick={() =>
              router.push(`/providers/${encodeURIComponent(slug || "")}`)
            }
          >
            <ArrowLeft size={12} />
            Back to provider
          </button>

          {loading ? (
            <div className="wb-loading">Loading approved webinar…</div>
          ) : loadError || !payload ? (
            <div className="wb-not-found">
              {loadError || "Webinar not found."}
            </div>
          ) : (
            <article className="wb-page">
              <section className="wb-hero">
                {payload.webinar?.bannerUrl && (
                  <img
                    className="wb-hero-bg"
                    src={payload.webinar.bannerUrl}
                    alt=""
                  />
                )}

                <div className="wb-hero-overlay" />

                <div className="wb-hero-content">
                  <div className="wb-kicker">
                    <Video size={11} />
                    Webinar
                  </div>

                  {payload.webinar?.subTitle && (
                    <div className="wb-subtitle">
                      {payload.webinar.subTitle}
                    </div>
                  )}

                  <h1 className="wb-title">{payload.webinar.title}</h1>

                  <div className="wb-provider">
                    <div className="wb-provider-logo">
                      {payload.company?.logoUrl ? (
                        <img
                          src={payload.company.logoUrl}
                          alt={`${payload.company?.name || "Provider"} logo`}
                        />
                      ) : (
                        <Building2 size={16} />
                      )}
                    </div>
                    <div>
                      <div className="wb-provider-name">
                        {payload.company?.name}
                      </div>
                      <div className="wb-provider-label">
                        Approved provider webinar
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              <section className="wb-main">
                <div className="wb-copy">
                  {bodyHtml && (
                    <div
                      className="wb-rich"
                      dangerouslySetInnerHTML={{ __html: bodyHtml }}
                    />
                  )}

                  <div className="wb-speaker">
                    <div className="wb-speaker-label">Speaker</div>

                    <div className="wb-speaker-card">
                      <div className="wb-speaker-photo">
                        {payload.webinar?.speakerImageUrl ? (
                          <img
                            src={payload.webinar.speakerImageUrl}
                            alt={payload.webinar?.speakerName || "Speaker"}
                          />
                        ) : (
                          <UserRound size={30} />
                        )}
                      </div>

                      <div>
                        <div className="wb-speaker-name">
                          {payload.webinar?.speakerName || "Speaker"}
                        </div>
                        <div className="wb-speaker-copy">
                          Featured speaker for this webinar
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <aside className="wb-form-card">
                  {submitted ? (
                    <div className="wb-success">
                      <div className="wb-success-icon">
                        <CheckCircle2 size={26} />
                      </div>
                      <h3>Registration submitted</h3>
                      <p>
                        Thank you. Your information has been saved for this
                        webinar and the provider can review your response.
                      </p>
                    </div>
                  ) : (
                    <>
                      <h2 className="wb-form-title">Register now</h2>
                      <p className="wb-form-copy">
                        Complete the form to register your interest in this webinar.
                      </p>

                      <form className="wb-form" onSubmit={handleSubmit}>
                        <div className="wb-honeypot" aria-hidden="true">
                          <label>
                            Website
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

                        <div className="wb-field">
                          <label>
                            First Name <span>*</span>
                          </label>
                          <input
                            className="wb-input"
                            value={form.firstName}
                            onChange={(event) =>
                              updateField("firstName", event.target.value)
                            }
                            maxLength={100}
                            required
                          />
                        </div>

                        <div className="wb-field">
                          <label>
                            Last Name <span>*</span>
                          </label>
                          <input
                            className="wb-input"
                            value={form.lastName}
                            onChange={(event) =>
                              updateField("lastName", event.target.value)
                            }
                            maxLength={100}
                            required
                          />
                        </div>

                        <div className="wb-field">
                          <label>
                            Email <span>*</span>
                          </label>
                          <input
                            className="wb-input"
                            type="email"
                            value={form.email}
                            onChange={(event) =>
                              updateField("email", event.target.value)
                            }
                            maxLength={254}
                            required
                          />
                        </div>

                        <div className="wb-field">
                          <label>
                            Country <span>*</span>
                          </label>
                          <select
                            className="wb-select"
                            value={form.country}
                            onChange={(event) =>
                              updateField("country", event.target.value)
                            }
                            required
                          >
                            <option value="">Please select</option>
                            <option value="Germany">Germany</option>
                            <option value="Austria">Austria</option>
                            <option value="Switzerland">Switzerland</option>
                          </select>
                        </div>

                        <div className="wb-field">
                          <label>Company</label>
                          <input
                            className="wb-input"
                            value={form.company}
                            onChange={(event) =>
                              updateField("company", event.target.value)
                            }
                            maxLength={180}
                          />
                        </div>

                        <div className="wb-field">
                          <label>Message</label>
                          <textarea
                            className="wb-textarea"
                            value={form.message}
                            onChange={(event) =>
                              updateField("message", event.target.value)
                            }
                            maxLength={4000}
                            placeholder="Optional message for the provider"
                          />
                        </div>

                        <label className="wb-consent">
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
                          <span>
                            I agree that the provider may store and process the
                            information submitted in this registration form.
                          </span>
                        </label>

                        {formError && <div className="wb-error">{formError}</div>}

                        <button
                          className="wb-submit"
                          type="submit"
                          disabled={submitting}
                        >
                          {submitting ? (
                            <>
                              <Loader2 size={14} className="animate-spin" />
                              Submitting…
                            </>
                          ) : (
                            <>
                              <Send size={13} />
                              Register now
                            </>
                          )}
                        </button>
                      </form>
                    </>
                  )}
                </aside>
              </section>
            </article>
          )}
        </main>
      </div>
    </>
  );
}
