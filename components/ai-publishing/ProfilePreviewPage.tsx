"use client";

import { useEffect, useState } from "react";
import { Building2, ExternalLink, FileText, Globe2, Mail, MapPin, Phone, ShieldAlert, Tags } from "lucide-react";
import { API_BASE_URL } from "@/services/api";
import { CONTENT_TYPES, tr, type Lang } from "./aiPublishingText";
import { rt, type RKey } from "./reviewText";

type PreviewContentItem = { id: string; type: string; title: string; excerpt: string; wordCount: number };

type PreviewResponse = {
  valid: boolean;
  name?: string;
  website?: string;
  language?: string;
  logoUrl?: string;
  headerImageUrl?: string;
  content?: PreviewContentItem[];
  profile?: {
    shortDescription: string; headline: string; overview: string; headquarters: string;
    foundedYear: string; employeeRange: string; specialties: string[]; categories: string[];
    email: string; phone: string; address: string;
  };
};

export default function ProfilePreviewPage({ token }: { token: string }) {
  const [data, setData] = useState<PreviewResponse | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/ai/profile-preview/${encodeURIComponent(token)}`, { cache: "no-store" });
        const body = (await res.json().catch(() => null)) as PreviewResponse | null;
        if (!cancelled) {
          if (res.ok && body) setData(body);
          else setError(true);
        }
      } catch {
        if (!cancelled) setError(true);
      }
    }, 0);

    return () => { cancelled = true; clearTimeout(timer); };
  }, [token]);

  const lang: Lang = data?.language === "en" ? "en" : "de";
  const t = (key: RKey) => rt(key, lang);

  const content = data?.content || [];
  const types = Array.from(new Set(content.map((c) => c.type)));
  const [activeTab, setActiveTab] = useState("about");

  if (error || (data && !data.valid)) {
    return (
      <div className="ppv-root ppv-center">
        <style>{CSS}</style>
        <div className="ppv-invalid"><ShieldAlert size={28} /><p>{t("pp_invalid")}</p></div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="ppv-root ppv-center">
        <style>{CSS}</style>
        <p className="ppv-muted">{t("pp_loading")}</p>
      </div>
    );
  }

  const profile = data.profile!;
  const website = data.website ? (data.website.startsWith("http") ? data.website : `https://${data.website}`) : "";

  return (
    <div className="ppv-root">
      <style>{CSS}</style>

      <div className="ppv-shell">
        <div className="ppv-badge"><ShieldAlert size={13} /> <span>{t("pp_badge")}</span></div>

        <section className="ppv-hero">
          <div className="ppv-banner">
            {data.headerImageUrl
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={data.headerImageUrl} alt="" />
              : <div className="ppv-banner-fallback" />}
          </div>

          <div className="ppv-identity">
            <div className="ppv-identity-main">
              <div className="ppv-logo">
                {data.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={data.logoUrl} alt={data.name} />
                ) : (
                  <Building2 size={27} />
                )}
              </div>

              <div style={{ minWidth: 0 }}>
                <h1 className="ppv-name">{data.name}</h1>
                <div className="ppv-headline">{profile.headline || profile.shortDescription}</div>
              </div>
            </div>

            {website && (
              <a className="ppv-website-btn" href={website} target="_blank" rel="noreferrer">
                <Globe2 size={11} />
                {t("pp_visitWebsite")}
                <ExternalLink size={10} />
              </a>
            )}
          </div>

          <div className="ppv-meta">
            {profile.categories.map((c) => (
              <span className="ppv-meta-pill" key={c}><Tags size={10} />{c}</span>
            ))}
            {profile.headquarters && <span className="ppv-meta-pill"><MapPin size={10} />{profile.headquarters}</span>}
            {profile.email && <span className="ppv-meta-pill"><Mail size={10} />{profile.email}</span>}
            {profile.phone && <span className="ppv-meta-pill"><Phone size={10} />{profile.phone}</span>}
          </div>
        </section>

        {types.length > 0 && (
          <nav className="ppv-tabs">
            <button className={`ppv-tab ${activeTab === "about" ? "active" : ""}`} onClick={() => setActiveTab("about")}>
              {t("pp_about")}
            </button>
            {types.map((type) => (
              <button key={type} className={`ppv-tab ${activeTab === type ? "active" : ""}`} onClick={() => setActiveTab(type)}>
                <FileText size={11} />
                {tr(CONTENT_TYPES[type], lang, type)}
                <span className="ppv-tab-count">{content.filter((c) => c.type === type).length}</span>
              </button>
            ))}
          </nav>
        )}

        {activeTab === "about" && (
          <>
            {(profile.shortDescription || profile.overview) && (
              <div className="ppv-card">
                <h2 className="ppv-h2">{t("pp_about")}</h2>
                <div className="ppv-about-grid">
                  <div>
                    {profile.shortDescription && <p className="ppv-lead">{profile.shortDescription}</p>}
                    {profile.overview && <p className="ppv-body">{profile.overview}</p>}
                  </div>

                  {(profile.foundedYear || profile.employeeRange || profile.headquarters) && (
                    <div className="ppv-facts">
                      {profile.foundedYear && <div className="ppv-fact"><label>{t("pp_founded")}</label><div>{profile.foundedYear}</div></div>}
                      {profile.employeeRange && <div className="ppv-fact"><label>{t("pp_employees")}</label><div>{profile.employeeRange}</div></div>}
                      {profile.headquarters && <div className="ppv-fact"><label>{t("pb_headquarters")}</label><div>{profile.headquarters}</div></div>}
                    </div>
                  )}
                </div>
              </div>
            )}

            {profile.specialties.length > 0 && (
              <div className="ppv-card">
                <h2 className="ppv-h2">{t("pp_specialties")}</h2>
                <div className="ppv-pills">{profile.specialties.map((s) => <span key={s} className="ppv-pill">{s}</span>)}</div>
              </div>
            )}

            {(profile.email || profile.phone || profile.address) && (
              <div className="ppv-card">
                <h2 className="ppv-h2">{t("pp_contact")}</h2>
                <div className="ppv-contact">
                  {profile.email && <div><Mail size={13} /> <span>{profile.email}</span></div>}
                  {profile.phone && <div><Phone size={13} /> <span>{profile.phone}</span></div>}
                  {profile.address && <div><MapPin size={13} /> <span>{profile.address}</span></div>}
                </div>
              </div>
            )}
          </>
        )}

        {types.includes(activeTab) && (
          <div className="ppv-card">
            <h2 className="ppv-h2">{tr(CONTENT_TYPES[activeTab], lang, activeTab)}</h2>
            <div className="ppv-content-list">
              {content.filter((c) => c.type === activeTab).map((c) => (
                <article className="ppv-content-item" key={c.id}>
                  <h3 className="ppv-content-title">{c.title}</h3>
                  {c.excerpt && <p className="ppv-content-excerpt">{c.excerpt}</p>}
                  <span className="ppv-content-words">{c.wordCount} {t("pp_words")}</span>
                </article>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
*,*::before,*::after{box-sizing:border-box}

.ppv-root { font-family:"Plus Jakarta Sans",system-ui,sans-serif; color:#111827; background:#f5f6f8; min-height:100vh; }
.ppv-center { display:flex; align-items:center; justify-content:center; }
.ppv-muted { color:#6b7280; font-size:14px; }
.ppv-invalid { display:flex; flex-direction:column; align-items:center; gap:12px; color:#991b1b; text-align:center; padding:40px 20px; }
.ppv-shell { width:min(1180px,calc(100% - 32px)); margin:0 auto; padding:24px 0 60px; }
.ppv-badge { display:flex; align-items:center; gap:7px; justify-content:center; background:#fef3c7; color:#92400e; font-size:12px; font-weight:800; letter-spacing:.03em; padding:9px 14px; border-radius:999px; margin-bottom:14px; }

.ppv-hero { overflow:hidden; background:#fff; border:1px solid #e8eaee; border-radius:28px; box-shadow:0 18px 52px rgba(15,23,42,.06); }
.ppv-banner { height:230px; background:linear-gradient(135deg,#e9edf2,#f8fafc); position:relative; }
.ppv-banner img { width:100%; height:100%; object-fit:cover; display:block; }
.ppv-banner-fallback { width:100%; height:100%; background:linear-gradient(135deg,#1f2937,#374151); }

.ppv-identity { padding:0 28px 26px; display:flex; align-items:flex-end; justify-content:space-between; gap:22px; }
.ppv-identity-main { display:flex; align-items:flex-end; gap:18px; min-width:0; }
.ppv-logo { width:88px; height:88px; flex-shrink:0; margin-top:-42px; border-radius:24px; background:#fff; border:5px solid #fff; box-shadow:0 12px 28px rgba(15,23,42,.13); display:flex; align-items:center; justify-content:center; color:#68717f; overflow:hidden; position:relative; z-index:2; }
.ppv-logo img { width:100%; height:100%; object-fit:contain; }
.ppv-name { margin:18px 0 5px; font-size:30px; font-weight:800; letter-spacing:-.045em; line-height:1.1; color:#111827; }
.ppv-headline { color:#7b8492; font-size:12.5px; line-height:1.6; }
.ppv-website-btn { height:38px; padding:0 13px; border-radius:999px; border:1px solid #111827; background:#111827; color:#fff; display:inline-flex; align-items:center; gap:6px; font-family:inherit; font-size:10px; font-weight:700; cursor:pointer; text-decoration:none; flex-shrink:0; }

.ppv-meta { display:flex; flex-wrap:wrap; gap:7px; padding:0 28px 24px; }
.ppv-meta-pill { min-height:30px; padding:0 10px; border-radius:999px; border:1px solid #e7e9ed; background:#fafbfc; color:#697386; display:inline-flex; align-items:center; gap:6px; font-size:10px; font-weight:700; }

.ppv-tabs { margin-top:16px; display:flex; gap:7px; overflow-x:auto; scrollbar-width:none; padding-bottom:2px; }
.ppv-tabs::-webkit-scrollbar{display:none}
.ppv-tab { height:37px; padding:0 12px; border-radius:999px; border:1px solid #e5e7eb; background:#fff; color:#697386; font-family:inherit; font-size:11px; font-weight:700; cursor:pointer; white-space:nowrap; display:flex; align-items:center; gap:6px; flex-shrink:0; }
.ppv-tab.active { background:#111827; border-color:#111827; color:#fff; }
.ppv-tab-count { min-width:18px; height:18px; border-radius:999px; display:flex; align-items:center; justify-content:center; background:rgba(127,127,127,.15); font-size:9px; }
.ppv-tab.active .ppv-tab-count { background:rgba(255,255,255,.2); }

.ppv-content-list { display:flex; flex-direction:column; gap:12px; }
.ppv-content-item { border:1px solid #e9ebef; background:#fafbfc; border-radius:16px; padding:16px; }
.ppv-content-title { margin:0 0 6px; font-size:14px; font-weight:800; color:#111827; letter-spacing:-.01em; }
.ppv-content-excerpt { margin:0 0 8px; font-size:12.5px; color:#5f6876; line-height:1.6; white-space:pre-wrap; }
.ppv-content-words { font-size:10.5px; color:#9aa2ad; font-weight:700; }

.ppv-card { margin-top:16px; background:#fff; border:1px solid #e8eaee; border-radius:24px; padding:26px; box-shadow:0 14px 38px rgba(15,23,42,.045); }
.ppv-h2 { margin:0 0 16px; font-size:13px; font-weight:800; letter-spacing:.04em; text-transform:uppercase; color:#6b7280; }
.ppv-about-grid { display:grid; grid-template-columns:minmax(0,1.35fr) minmax(220px,.65fr); gap:16px; }
.ppv-lead { font-size:15px; font-weight:600; color:#1f2937; margin:0 0 8px; line-height:1.6; }
.ppv-body { font-size:14px; color:#374151; line-height:1.75; white-space:pre-wrap; margin:0; }
.ppv-facts { display:flex; flex-direction:column; gap:9px; }
.ppv-fact { border:1px solid #eceef1; background:#fafbfc; border-radius:16px; padding:13px; }
.ppv-fact label { display:block; color:#9aa2ad; font-size:9.5px; text-transform:uppercase; letter-spacing:.055em; font-weight:700; margin-bottom:4px; }
.ppv-fact div { color:#374151; font-size:12.5px; line-height:1.55; }
.ppv-pills { display:flex; flex-wrap:wrap; gap:8px; }
.ppv-pill { background:#eef2ff; color:#3730a3; border-radius:999px; padding:5px 12px; font-size:12px; font-weight:700; }
.ppv-contact { display:flex; flex-direction:column; gap:10px; font-size:13.5px; color:#374151; }
.ppv-contact > div { display:flex; align-items:center; gap:8px; }

@media(max-width:800px){
  .ppv-about-grid{grid-template-columns:1fr}
  .ppv-identity{align-items:flex-start;flex-direction:column}
  .ppv-website-btn{margin-left:106px}
}

@media(max-width:580px){
  .ppv-shell{padding-top:14px}
  .ppv-banner{height:170px}
  .ppv-identity{padding:0 18px 20px}
  .ppv-meta{padding:0 18px 20px}
  .ppv-name{font-size:25px}
  .ppv-logo{width:76px;height:76px;border-radius:20px}
  .ppv-card{padding:20px 17px}
  .ppv-website-btn{margin-left:0}
}
`;
