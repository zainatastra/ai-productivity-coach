"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import {
  Building2,
  ChevronRight,
  Globe2,
  Search,
} from "lucide-react";
import Header from "@/components/Header";
import { API_BASE_URL } from "@/services/api";
import { useLanguage } from "@/services/LanguageContext";

type ProviderCard = {
  id: string;
  name: string;
  slug: string;
  shortDescription?: string;
  websiteUrl?: string;
  address?: string;
  categories?: string[];
  logoUrl?: string;
  bannerUrl?: string;
  headline?: string;
  headquarters?: string;
  specialties?: string[];
  approvedVersion?: number;
  approvedAt?: string;
};

export default function ProvidersDirectory() {
  const router = useRouter();
  const { language } = useLanguage();
  const isGerman = language === "de";
  const [providers, setProviders] = useState<ProviderCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [letter, setLetter] = useState("All");

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const res = await fetch(`${API_BASE_URL}/api/providers`, {
          cache: "no-store",
        });

        const payload = await res.json().catch(() => []);

        if (!res.ok) {
          setError(payload?.message || (language === "de" ? "Anbieter konnten nicht geladen werden." : "Unable to load providers."));
          return;
        }

        setProviders(Array.isArray(payload) ? payload : []);
      } catch (e) {
        console.error("Provider directory failed:", e);
        setError(language === "de" ? "Anbieter konnten nicht geladen werden." : "Unable to load providers.");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [language]);

  const categories = [
    "All",
    "Community",
    "Data management",
    "ERP provider",
    "Event",
    "IT Provider",
    "Marketing service provider",
    "Publisher",
    "Security Provider",
    "Software Provider",
  ];

  const alphabet = ["All", ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("")];

  const categoryLabels: Record<string, { en: string; de: string }> = {
    All: { en: "All", de: "Alle" },
    Community: { en: "Community", de: "Community" },
    "Data management": { en: "Data management", de: "Datenmanagement" },
    "ERP provider": { en: "ERP provider", de: "ERP-Anbieter" },
    Event: { en: "Event", de: "Event" },
    "IT Provider": { en: "IT Provider", de: "IT-Anbieter" },
    "Marketing service provider": {
      en: "Marketing service provider",
      de: "Marketing-Dienstleister",
    },
    Publisher: { en: "Publisher", de: "Verlag" },
    "Security Provider": { en: "Security Provider", de: "Security-Anbieter" },
    "Software Provider": { en: "Software Provider", de: "Software-Anbieter" },
  };

  const uiText = {
    providerProfiles: isGerman ? "Anbieterprofile" : "Provider profiles",
    searchPlaceholder: isGerman
      ? "Unternehmen, Kategorien, Fachgebiete oder Standorte suchen..."
      : "Search companies, categories, specialties or locations...",
    categories: isGerman ? "Kategorien" : "Categories",
    alphabet: "Alphabet",
    approvedProviders: isGerman ? "Freigegebene Anbieter" : "Approved Providers",
    loading: isGerman ? "Wird geladen…" : "Loading…",
    providerSingular: isGerman ? "Anbieter" : "provider",
    providerPlural: isGerman ? "Anbieter" : "providers",
    noMatches: isGerman
      ? "Keine freigegebenen Anbieter entsprechen Ihrer aktuellen Suche und den Filtern."
      : "{uiText.noMatches}",
    learnMore: isGerman ? "Mehr erfahren" : "Learn more",
  };

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();

    return providers.filter((provider) => {
      const haystack = [
        provider.name,
        provider.shortDescription,
        provider.headline,
        provider.address,
        provider.headquarters,
        ...(provider.categories || []),
        ...(provider.specialties || []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      const matchesSearch = !query || haystack.includes(query);
      const selectedCategory = category.trim().toLowerCase();
      const providerCategories = (provider.categories || [])
        .map((item) => String(item || "").trim().toLowerCase())
        .filter(Boolean);

      const matchesCategory =
        selectedCategory === "all" ||
        providerCategories.includes(selectedCategory);
      const matchesLetter =
        letter === "All" ||
        provider.name?.trim().toUpperCase().startsWith(letter);

      return matchesSearch && matchesCategory && matchesLetter;
    });
  }, [providers, search, category, letter]);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');

        *,*::before,*::after{box-sizing:border-box}

        .prov-root {
          min-height:100vh;
          background:#f5f6f8;
          color:#111827;
          font-family:"Plus Jakarta Sans",sans-serif;
        }

        .prov-shell {
          width:min(1240px,calc(100% - 32px));
          margin:0 auto;
          padding:42px 0 60px;
        }

        .prov-filter-card {
          margin-top:0;
          background:#fff;
          border:1px solid #e8eaee;
          border-bottom:2px solid #cfd5dd;
          border-radius:24px;
          padding:18px;
          box-shadow:0 14px 38px rgba(15,23,42,.05);
        }

        .prov-filter-top {
          display:flex;
          align-items:center;
          gap:14px;
          margin-bottom:14px;
        }

        .prov-filter-heading {
          display:flex;
          align-items:center;
          gap:9px;
          flex-shrink:0;
          color:#111827;
          font-size:14px;
          font-weight:800;
          letter-spacing:-.02em;
        }

        .prov-filter-heading-icon {
          width:34px;
          height:34px;
          border-radius:11px;
          display:flex;
          align-items:center;
          justify-content:center;
          background:#f5f6f8;
          border:1px solid #e8eaee;
          color:#68717f;
        }

        .prov-search-wrap {
          position:relative;
          flex:1;
          min-width:0;
          width:auto;
          margin-left:0;
        }

        .prov-search-icon {
          position:absolute;
          left:15px;
          top:50%;
          transform:translateY(-50%);
          color:#9aa2ad;
          pointer-events:none;
        }

        .prov-search {
          width:100%;
          height:48px;
          border:1.5px solid #e5e7eb;
          border-radius:999px;
          background:#fafbfc;
          padding:0 17px 0 43px;
          outline:none;
          font-family:inherit;
          font-size:12px;
          color:#111827;
          transition:border-color .18s ease,box-shadow .18s ease,background .18s ease;
        }

        .prov-search:focus {
          background:#fff;
          border-color:#111827;
          box-shadow:0 0 0 4px rgba(17,24,39,.05);
        }

        .prov-filter-row {
          display:flex;
          align-items:center;
          gap:8px;
          flex-wrap:wrap;
        }

        .prov-filter-row + .prov-filter-row {
          margin-top:10px;
          padding-top:10px;
          border-top:1px solid #f0f1f3;
        }

        .prov-filter-label {
          min-width:62px;
          color:#8a93a0;
          font-size:9px;
          font-weight:800;
          text-transform:uppercase;
          letter-spacing:.055em;
          flex-shrink:0;
        }

        .prov-pill {
          height:32px;
          padding:0 11px;
          border-radius:999px;
          border:1px solid #e5e7eb;
          background:#fff;
          color:#66707f;
          font-family:inherit;
          font-size:9px;
          font-weight:700;
          cursor:pointer;
          transition:all .16s ease;
        }

        .prov-pill:hover { background:#f7f8fa;color:#111827; }
        .prov-pill.active { background:#111827;border-color:#111827;color:#fff; }

        .prov-results-head {
          display:flex;
          align-items:center;
          justify-content:space-between;
          gap:12px;
          margin:28px 2px 13px;
        }

        .prov-results-title {
          font-size:13px;
          font-weight:800;
          color:#111827;
        }

        .prov-results-count {
          font-size:10px;
          color:#9aa2ad;
          font-weight:600;
        }

        .prov-grid {
          display:grid;
          grid-template-columns:repeat(auto-fill,minmax(0,282px));
          justify-content:start;
          gap:15px;
        }

        .prov-card {
          position:relative;
          overflow:hidden;
          min-width:0;
          background:#fff;
          border:1px solid #e8eaee;
          border-radius:24px;
          cursor:pointer;
          box-shadow:
            0 10px 22px rgba(15,23,42,.05),
            0 18px 34px rgba(15,23,42,.10);
          transition:transform .22s cubic-bezier(.22,1,.36,1),box-shadow .22s ease,border-color .22s ease;
        }

        .prov-card::after {
          content:"";
          position:absolute;
          left:0;
          right:0;
          bottom:0;
          height:4px;
          background:#173b6b;
          pointer-events:none;
        }

        .prov-card:hover {
          transform:translateY(-4px);
          border-color:#dde1e7;
          box-shadow:
            0 14px 28px rgba(15,23,42,.08),
            0 24px 44px rgba(15,23,42,.14);
        }

        .prov-card-banner {
          position:relative;
          width:100%;
          height:138px;
          display:flex;
          align-items:center;
          justify-content:center;
          overflow:hidden;
          background:#fff;
          border-bottom:1px solid #dde2e8;
          padding:12px 18px;
        }

        .prov-card-banner img {
          width:88%;
          height:88%;
          max-width:88%;
          max-height:88%;
          object-fit:contain;
          display:block;
        }

        .prov-card-banner-fallback {
          width:72px;
          height:72px;
          border-radius:20px;
          display:flex;
          align-items:center;
          justify-content:center;
          background:#f5f6f8;
          color:#6b7280;
          border:1px solid #e3e7ec;
          box-shadow:0 8px 24px rgba(15,23,42,.06);
        }

        .prov-card-body {
          padding:14px 16px 10px;
          background:linear-gradient(135deg,#f7f8fa,#eef1f4);
        }

        .prov-card-title-row {
          display:flex;
          align-items:flex-start;
          justify-content:space-between;
          gap:10px;
        }

        .prov-card-name {
          font-size:14px;
          font-weight:800;
          line-height:1.25;
          letter-spacing:-.025em;
          color:#111827;
        }

        .prov-arrow {
          width:26px;
          height:26px;
          flex-shrink:0;
          border-radius:999px;
          border:1px solid #e5e7eb;
          display:flex;
          align-items:center;
          justify-content:center;
          color:#8b94a2;
        }

        .prov-card-headline {
          margin-top:3px;
          color:#697386;
          font-size:9.5px;
          line-height:1.35;
          min-height:16px;
        }

        .prov-card-meta {
          display:flex;
          align-items:center;
          justify-content:flex-end;
          gap:5px;
          margin-top:6px;
          padding-top:7px;
          padding-bottom:2px;
          border-top:1px solid #e1e5ea;
          color:#173b6b;
          font-size:9.5px;
          font-weight:700;
        }

        .prov-empty {
          grid-column:1 / -1;
          min-height:260px;
          display:flex;
          align-items:center;
          justify-content:center;
          text-align:center;
          background:#fff;
          border:1px dashed #dfe3e8;
          border-radius:24px;
          padding:30px;
          color:#929aa6;
          font-size:11px;
          line-height:1.7;
        }

        @media(max-width:640px){
          .prov-shell{width:min(100% - 20px,1240px);padding-top:18px}
          .prov-grid{grid-template-columns:1fr}
          .prov-filter-card{padding:14px}
          .prov-filter-top{flex-direction:column;align-items:stretch;gap:12px}
          .prov-search-wrap{width:100%;flex:none;margin-left:0}
          .prov-filter-row{overflow-x:auto;flex-wrap:nowrap;padding-bottom:2px;scrollbar-width:none}
          .prov-filter-row::-webkit-scrollbar{display:none}
          .prov-pill{flex-shrink:0}
          .prov-filter-label{min-width:auto}
        }
      `}</style>

      <div className="prov-root">
        <Header />
        <main className="prov-shell">
          <section className="prov-filter-card">
            <div className="prov-filter-top">
              <div className="prov-filter-heading">
                <div className="prov-filter-heading-icon">
                  <Building2 size={15} />
                </div>
                <span>{uiText.providerProfiles}</span>
              </div>

              <div className="prov-search-wrap">
                <Search size={15} className="prov-search-icon" />
                <input
                  className="prov-search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={uiText.searchPlaceholder}
                />
              </div>
            </div>

            <div className="prov-filter-row">
              <div className="prov-filter-label">{uiText.categories}</div>
              {categories.map((item) => (
                <button
                  key={item}
                  type="button"
                  className={`prov-pill ${category === item ? "active" : ""}`}
                  onClick={() => setCategory(item)}
                >
                  {categoryLabels[item]?.[isGerman ? "de" : "en"] || item}
                </button>
              ))}
            </div>

            <div className="prov-filter-row">
              <div className="prov-filter-label">{uiText.alphabet}</div>
              {alphabet.map((item) => (
                <button
                  key={item}
                  type="button"
                  className={`prov-pill ${letter === item ? "active" : ""}`}
                  onClick={() => setLetter(item)}
                >
                  {item === "All" && isGerman ? "Alle" : item}
                </button>
              ))}
            </div>
          </section>

          <div className="prov-results-head">
            <div className="prov-results-title">{uiText.approvedProviders}</div>
            <div className="prov-results-count">
              {loading
                ? uiText.loading
                : `${filtered.length} ${
                    filtered.length === 1
                      ? uiText.providerSingular
                      : uiText.providerPlural
                  }`}
            </div>
          </div>

          <section className="prov-grid">
            {loading ? (
              Array.from({ length: 6 }).map((_, index) => (
                <div className="prov-card" key={index} style={{ minHeight: 285, opacity: .55 }} />
              ))
            ) : error ? (
              <div className="prov-empty">{error}</div>
            ) : filtered.length === 0 ? (
              <div className="prov-empty">
                No approved providers match your current search and filters.
              </div>
            ) : (
              filtered.map((provider) => (
                <motion.article
                  key={provider.id}
                  className="prov-card"
                  onClick={() => router.push(`/providers/${provider.slug}`)}
                  whileTap={{ scale: .99 }}
                >
                  <div className="prov-card-banner">
                    {provider.logoUrl ? (
                      <img src={provider.logoUrl} alt={`${provider.name} logo`} />
                    ) : (
                      <div className="prov-card-banner-fallback">
                        <Building2 size={24} />
                      </div>
                    )}
                  </div>

                  <div className="prov-card-body">
                    <div className="prov-card-title-row">
                      <div className="prov-card-name">{provider.name}</div>
                      <div className="prov-arrow"><ChevronRight size={13} /></div>
                    </div>

                    <div className="prov-card-meta">
                      <span>{uiText.learnMore}</span>
                      <ChevronRight size={11} />
                    </div>
                  </div>
                </motion.article>
              ))
            )}
          </section>
        </main>
      </div>
    </>
  );
}
