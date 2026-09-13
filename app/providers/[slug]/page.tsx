"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Building2,
  CalendarDays,
  ExternalLink,
  FileText,
  Globe2,
  Mail,
  MapPin,
  Newspaper,
  Package,
  Phone,
  Sparkles,
  Tags,
  UserRound,
  Users,
  Video,
} from "lucide-react";
import Header from "@/components/Header";
import { API_BASE_URL } from "@/services/api";

type PublicProvider = {
  id: string;
  approvedVersion?: number;
  approvedAt?: string;
  company: any;
  about: any;
  posts: any[];
  whitepapers: any[];
  products: any[];
  contacts: any[];
  appointments: any[];
  webinars: any[];
  events: any[];
};

type TabKey =
  | "about"
  | "posts"
  | "whitepapers"
  | "products"
  | "contacts"
  | "calendar"
  | "webinars"
  | "events";

export default function ProviderProfilePage() {
  const params = useParams<{ slug: string }>();
  const router = useRouter();
  const slug = Array.isArray(params?.slug) ? params.slug[0] : params?.slug;

  const [profile, setProfile] = useState<PublicProvider | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<TabKey>("about");

  useEffect(() => {
    if (!slug) return;

    const load = async () => {
      try {
        setLoading(true);
        const res = await fetch(`${API_BASE_URL}/api/providers/${encodeURIComponent(slug)}`, {
          cache: "no-store",
        });

        const payload = await res.json().catch(() => null);

        if (!res.ok) {
          setError(payload?.message || "Provider profile not found.");
          return;
        }

        setProfile(payload);
      } catch (e) {
        console.error("Public provider profile failed:", e);
        setError("Unable to load this provider profile.");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [slug]);

  const tabs = useMemo(() => {
    if (!profile) return [];

    return [
      ["about", "About", FileText, 1],
      ["posts", "Posts", Newspaper, profile.posts.length],
      ["whitepapers", "Whitepapers", FileText, profile.whitepapers.length],
      ["products", "Products", Package, profile.products.length],
      ["contacts", "Contacts", Users, profile.contacts.length],
      ["calendar", "Appointments", CalendarDays, profile.appointments.length],
      ["webinars", "Webinars", Video, profile.webinars.length],
      ["events", "Events", Sparkles, profile.events.length],
    ] as const;
  }, [profile]);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');

        *,*::before,*::after{box-sizing:border-box}

        .pp-root {
          min-height:100vh;
          background:#f5f6f8;
          color:#111827;
          font-family:"Plus Jakarta Sans",sans-serif;
        }

        .pp-shell {
          width:min(1180px,calc(100% - 32px));
          margin:0 auto;
          padding:24px 0 60px;
        }

        .pp-back {
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

        .pp-hero {
          overflow:hidden;
          background:#fff;
          border:1px solid #e8eaee;
          border-radius:28px;
          box-shadow:0 18px 52px rgba(15,23,42,.06);
        }

        .pp-banner {
          height:230px;
          background:linear-gradient(135deg,#e9edf2,#f8fafc);
          position:relative;
        }

        .pp-banner img {
          width:100%;
          height:100%;
          object-fit:cover;
          display:block;
        }

        .pp-identity {
          padding:0 28px 26px;
          display:flex;
          align-items:flex-end;
          justify-content:space-between;
          gap:22px;
        }

        .pp-identity-main {
          display:flex;
          align-items:flex-end;
          gap:18px;
          min-width:0;
        }

        .pp-logo {
          width:88px;
          height:88px;
          flex-shrink:0;
          margin-top:-42px;
          border-radius:24px;
          background:#fff;
          border:5px solid #fff;
          box-shadow:0 12px 28px rgba(15,23,42,.13);
          display:flex;
          align-items:center;
          justify-content:center;
          color:#68717f;
          overflow:hidden;
          position:relative;
          z-index:2;
        }

        .pp-logo img {
          width:100%;
          height:100%;
          object-fit:contain;
        }

        .pp-company-name {
          margin:18px 0 5px;
          font-size:30px;
          font-weight:800;
          letter-spacing:-.045em;
          line-height:1.1;
          color:#111827;
        }

        .pp-headline {
          color:#7b8492;
          font-size:11.5px;
          line-height:1.6;
        }

        .pp-website {
          height:38px;
          padding:0 13px;
          border-radius:999px;
          border:1px solid #111827;
          background:#111827;
          color:#fff;
          display:inline-flex;
          align-items:center;
          gap:6px;
          font-family:inherit;
          font-size:9.5px;
          font-weight:700;
          cursor:pointer;
          text-decoration:none;
          flex-shrink:0;
        }

        .pp-meta {
          display:flex;
          flex-wrap:wrap;
          gap:7px;
          padding:0 28px 24px;
        }

        .pp-meta-pill {
          min-height:30px;
          padding:0 10px;
          border-radius:999px;
          border:1px solid #e7e9ed;
          background:#fafbfc;
          color:#697386;
          display:inline-flex;
          align-items:center;
          gap:6px;
          font-size:9.5px;
          font-weight:700;
        }

        .pp-tabs {
          margin-top:16px;
          display:flex;
          gap:7px;
          overflow-x:auto;
          scrollbar-width:none;
          padding-bottom:2px;
        }

        .pp-tabs::-webkit-scrollbar{display:none}

        .pp-tab {
          height:37px;
          padding:0 12px;
          border-radius:999px;
          border:1px solid #e5e7eb;
          background:#fff;
          color:#697386;
          font-family:inherit;
          font-size:9.5px;
          font-weight:700;
          cursor:pointer;
          white-space:nowrap;
          display:flex;
          align-items:center;
          gap:6px;
          flex-shrink:0;
        }

        .pp-tab.active {
          background:#111827;
          border-color:#111827;
          color:#fff;
        }

        .pp-tab-count {
          min-width:18px;
          height:18px;
          border-radius:999px;
          display:flex;
          align-items:center;
          justify-content:center;
          background:rgba(127,127,127,.12);
          font-size:8px;
        }

        .pp-content-card {
          margin-top:12px;
          background:#fff;
          border:1px solid #e8eaee;
          border-radius:24px;
          padding:26px;
          box-shadow:0 14px 38px rgba(15,23,42,.045);
        }

        .pp-section-title {
          margin:0 0 16px;
          font-size:18px;
          font-weight:800;
          letter-spacing:-.03em;
        }

        .pp-about-grid {
          display:grid;
          grid-template-columns:minmax(0,1.35fr) minmax(260px,.65fr);
          gap:16px;
        }

        .pp-about-copy {
          color:#66707f;
          font-size:11.5px;
          line-height:1.8;
          white-space:pre-wrap;
        }

        .pp-about-block {
          padding:17px;
          border-radius:18px;
          border:1px solid #eceef1;
          background:#fafbfc;
          margin-top:10px;
        }

        .pp-about-block strong {
          display:block;
          font-size:9px;
          text-transform:uppercase;
          letter-spacing:.06em;
          color:#9aa2ad;
          margin-bottom:7px;
        }

        .pp-about-block div {
          color:#4f5866;
          font-size:10.5px;
          line-height:1.7;
          white-space:pre-wrap;
        }

        .pp-facts {
          display:flex;
          flex-direction:column;
          gap:9px;
        }

        .pp-fact {
          border:1px solid #eceef1;
          background:#fafbfc;
          border-radius:16px;
          padding:13px;
        }

        .pp-fact label {
          display:block;
          color:#9aa2ad;
          font-size:8.5px;
          text-transform:uppercase;
          letter-spacing:.055em;
          font-weight:700;
          margin-bottom:4px;
        }

        .pp-fact div {
          color:#374151;
          font-size:10.5px;
          line-height:1.55;
        }

        .pp-list {
          display:grid;
          grid-template-columns:repeat(2,minmax(0,1fr));
          gap:11px;
        }

        .pp-item {
          min-width:0;
          border:1px solid #e9ebef;
          background:#fff;
          border-radius:18px;
          padding:16px;
          transition:transform .18s ease,box-shadow .18s ease;
        }

        .pp-item:hover {
          transform:translateY(-2px);
          box-shadow:0 10px 25px rgba(15,23,42,.05);
        }

        .pp-item-title {
          font-size:12px;
          line-height:1.45;
          font-weight:800;
          color:#111827;
          margin-bottom:5px;
        }

        .pp-item-copy {
          font-size:10px;
          line-height:1.65;
          color:#87909d;
          white-space:pre-wrap;
          max-height:90px;
          overflow:hidden;
        }

        .pp-item-meta {
          display:flex;
          flex-wrap:wrap;
          gap:6px;
          margin-top:11px;
          padding-top:10px;
          border-top:1px solid #f0f1f3;
        }

        .pp-item-meta span,
        .pp-item-link {
          color:#727b89;
          font-size:9px;
          line-height:1.5;
        }

        .pp-item-link {
          display:inline-flex;
          align-items:center;
          gap:4px;
          color:#111827;
          font-weight:700;
          text-decoration:none;
        }

        .pp-empty {
          padding:40px 20px;
          border:1px dashed #dfe3e8;
          border-radius:18px;
          text-align:center;
          color:#929aa6;
          font-size:10.5px;
          line-height:1.65;
        }

        .pp-loading {
          min-height:60vh;
          display:flex;
          align-items:center;
          justify-content:center;
          color:#929aa6;
          font-size:11px;
        }

        @media(max-width:800px){
          .pp-about-grid{grid-template-columns:1fr}
          .pp-list{grid-template-columns:1fr}
          .pp-identity{align-items:flex-start;flex-direction:column}
          .pp-website{margin-left:106px}
        }

        @media(max-width:580px){
          .pp-shell{width:min(100% - 20px,1180px);padding-top:14px}
          .pp-banner{height:170px}
          .pp-identity{padding:0 18px 20px}
          .pp-meta{padding:0 18px 20px}
          .pp-company-name{font-size:25px}
          .pp-logo{width:76px;height:76px;border-radius:20px}
          .pp-content-card{padding:20px 17px}
          .pp-website{margin-left:0}
        }
      `}</style>

      <div className="pp-root">
        <Header />

        <main className="pp-shell">
          <button className="pp-back" onClick={() => router.push("/providers")}>
            <ArrowLeft size={12} />
            Provider Directory
          </button>

          {loading ? (
            <div className="pp-loading">Loading approved provider profile…</div>
          ) : error || !profile ? (
            <div className="pp-content-card">
              <div className="pp-empty">{error || "Provider profile not found."}</div>
            </div>
          ) : (
            <>
              <section className="pp-hero">
                <div className="pp-banner">
                  {profile.company.bannerUrl && (
                    <img src={profile.company.bannerUrl} alt="" />
                  )}
                </div>

                <div className="pp-identity">
                  <div className="pp-identity-main">
                    <div className="pp-logo">
                      {profile.company.logoUrl ? (
                        <img
                          src={profile.company.logoUrl}
                          alt={`${profile.company.name} logo`}
                        />
                      ) : (
                        <Building2 size={27} />
                      )}
                    </div>

                    <div style={{ minWidth: 0 }}>
                      <h1 className="pp-company-name">{profile.company.name}</h1>
                      <div className="pp-headline">
                        {profile.about?.headline ||
                          profile.company.shortDescription ||
                          "Approved provider profile"}
                      </div>
                    </div>
                  </div>

                  {profile.company.websiteUrl && (
                    <a
                      className="pp-website"
                      href={profile.company.websiteUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <Globe2 size={11} />
                      Visit Website
                      <ExternalLink size={10} />
                    </a>
                  )}
                </div>

                <div className="pp-meta">
                  {(profile.company.categories || []).map((item: string) => (
                    <span className="pp-meta-pill" key={item}>
                      <Tags size={10} />
                      {item}
                    </span>
                  ))}

                  {(profile.about?.headquarters || profile.company.address) && (
                    <span className="pp-meta-pill">
                      <MapPin size={10} />
                      {profile.about?.headquarters || profile.company.address}
                    </span>
                  )}

                  {profile.company.email && (
                    <span className="pp-meta-pill">
                      <Mail size={10} />
                      {profile.company.email}
                    </span>
                  )}

                  {profile.company.phone && (
                    <span className="pp-meta-pill">
                      <Phone size={10} />
                      {profile.company.phone}
                    </span>
                  )}
                </div>
              </section>

              <nav className="pp-tabs">
                {tabs.map(([key, label, Icon, count]) => (
                  <button
                    key={key}
                    className={`pp-tab ${activeTab === key ? "active" : ""}`}
                    onClick={() => setActiveTab(key)}
                  >
                    <Icon size={11} />
                    {label}
                    {key !== "about" && (
                      <span className="pp-tab-count">{count}</span>
                    )}
                  </button>
                ))}
              </nav>

              <motion.section
                key={activeTab}
                className="pp-content-card"
                initial={{ opacity: 0, y: 7 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: .2 }}
              >
                {activeTab === "about" && (
                  <>
                    <h2 className="pp-section-title">About {profile.company.name}</h2>
                    <div className="pp-about-grid">
                      <div>
                        <div className="pp-about-copy">
                          {profile.about?.overview ||
                            profile.company.shortDescription ||
                            "No public overview has been added yet."}
                        </div>

                        {profile.about?.mission && (
                          <div className="pp-about-block">
                            <strong>Mission</strong>
                            <div>{profile.about.mission}</div>
                          </div>
                        )}

                        {profile.about?.vision && (
                          <div className="pp-about-block">
                            <strong>Vision</strong>
                            <div>{profile.about.vision}</div>
                          </div>
                        )}
                      </div>

                      <div className="pp-facts">
                        {profile.about?.foundedYear && (
                          <div className="pp-fact">
                            <label>Founded</label>
                            <div>{profile.about.foundedYear}</div>
                          </div>
                        )}
                        {profile.about?.employeeRange && (
                          <div className="pp-fact">
                            <label>Employees</label>
                            <div>{profile.about.employeeRange}</div>
                          </div>
                        )}
                        {profile.about?.headquarters && (
                          <div className="pp-fact">
                            <label>Headquarters</label>
                            <div>{profile.about.headquarters}</div>
                          </div>
                        )}
                        {(profile.about?.specialties || []).length > 0 && (
                          <div className="pp-fact">
                            <label>Specialties</label>
                            <div>{profile.about.specialties.join(" · ")}</div>
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                )}

                {activeTab === "posts" && (
                  <PublicItems
                    title="Posts"
                    items={profile.posts}
                    primary="title"
                    copy="excerpt"
                    fallbackCopy="body"
                  />
                )}

                {activeTab === "whitepapers" && (
                  <PublicItems
                    title="Whitepapers"
                    items={profile.whitepapers}
                    primary="title"
                    copy="summary"
                    urlKey="externalUrl"
                    metaKeys={["authors"]}
                  />
                )}

                {activeTab === "products" && (
                  <PublicItems
                    title="Products"
                    items={profile.products}
                    primary="name"
                    copy="shortDescription"
                    fallbackCopy="description"
                    urlKey="productUrl"
                    metaKeys={["priceLabel"]}
                  />
                )}

                {activeTab === "contacts" && (
                  <PublicItems
                    title="Contacts"
                    items={profile.contacts}
                    primary="fullName"
                    copy="jobTitle"
                    urlKey="linkedInUrl"
                    metaKeys={["email", "phone"]}
                  />
                )}

                {activeTab === "calendar" && (
                  <PublicItems
                    title="Appointments"
                    items={profile.appointments}
                    primary="title"
                    copy="notes"
                    urlKey="bookingUrl"
                    metaKeys={["startAt", "endAt", "location"]}
                  />
                )}

                {activeTab === "webinars" && (
                  <PublicItems
                    title="Webinars"
                    items={profile.webinars}
                    primary="title"
                    copy="summary"
                    urlKey="registrationUrl"
                    metaKeys={["scheduledAt", "speaker"]}
                  />
                )}

                {activeTab === "events" && (
                  <PublicItems
                    title="Events"
                    items={profile.events}
                    primary="title"
                    copy="summary"
                    urlKey="eventUrl"
                    metaKeys={["startAt", "endAt", "location"]}
                  />
                )}
              </motion.section>
            </>
          )}
        </main>
      </div>
    </>
  );
}

function PublicItems({
  title,
  items,
  primary,
  copy,
  fallbackCopy,
  urlKey,
  metaKeys = [],
}: {
  title: string;
  items: any[];
  primary: string;
  copy: string;
  fallbackCopy?: string;
  urlKey?: string;
  metaKeys?: string[];
}) {
  return (
    <>
      <h2 className="pp-section-title">{title}</h2>

      {items.length === 0 ? (
        <div className="pp-empty">No approved {title.toLowerCase()} are currently available.</div>
      ) : (
        <div className="pp-list">
          {items.map((item) => {
            const description = item[copy] || (fallbackCopy ? item[fallbackCopy] : "");

            return (
              <article className="pp-item" key={item.id}>
                <div className="pp-item-title">{item[primary] || title.slice(0, -1)}</div>

                {description && (
                  <div className="pp-item-copy">{description}</div>
                )}

                <div className="pp-item-meta">
                  {metaKeys.map((key) =>
                    item[key] ? <span key={key}>{String(item[key])}</span> : null
                  )}

                  {urlKey && item[urlKey] && (
                    <a
                      className="pp-item-link"
                      href={item[urlKey]}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open
                      <ExternalLink size={9} />
                    </a>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}
