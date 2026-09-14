"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Building2,
  CalendarDays,
  ChevronRight,
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

const stripPublicHtml = (value: string) =>
  value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

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
          transition:transform .18s ease,box-shadow .18s ease,border-color .18s ease;
        }

        .pp-item-clickable {
          display:block;
          color:inherit;
          text-decoration:none;
          cursor:pointer;
        }

        .pp-item-clickable:hover {
          border-color:#d6dbe2;
        }

        .pp-post-image {
          width:100%;
          aspect-ratio:16 / 8.5;
          border-radius:14px;
          overflow:hidden;
          background:#f2f4f7;
          margin-bottom:13px;
        }

        .pp-post-image img {
          width:100%;
          height:100%;
          object-fit:cover;
          display:block;
        }

        .pp-post-subheading {
          margin:-1px 0 7px;
          color:#5f6876;
          font-size:10px;
          font-weight:600;
          line-height:1.55;
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


        .pp-webinar-grid {
          display:grid;
          grid-template-columns:repeat(2,minmax(0,1fr));
          gap:14px;
        }

        .pp-webinar-card {
          min-width:0;
          overflow:hidden;
          border:1px solid #e7eaf0;
          border-radius:20px;
          background:#fff;
          box-shadow:0 8px 24px rgba(15,23,42,.035);
          transition:transform .2s ease,box-shadow .2s ease,border-color .2s ease;
        }

        .pp-webinar-card:hover {
          transform:translateY(-2px);
          border-color:#d7dce4;
          box-shadow:0 14px 32px rgba(15,23,42,.07);
        }

        .pp-webinar-image {
          width:100%;
          aspect-ratio:16 / 9;
          overflow:hidden;
          background:#f1f3f5;
        }

        .pp-webinar-image img {
          width:100%;
          height:100%;
          object-fit:cover;
          display:block;
        }

        .pp-webinar-placeholder {
          width:100%;
          height:100%;
          display:flex;
          align-items:center;
          justify-content:center;
          color:#9aa2ad;
          background:#f5f6f8;
        }

        .pp-webinar-body {
          padding:16px;
        }

        .pp-webinar-title {
          margin:0 0 14px;
          color:#111827;
          font-size:13px;
          line-height:1.45;
          font-weight:800;
          letter-spacing:-.015em;
        }

        .pp-webinar-button {
          width:100%;
          height:36px;
          border-radius:999px;
          border:1px solid #111827;
          background:#111827;
          color:#fff;
          display:flex;
          align-items:center;
          justify-content:center;
          gap:6px;
          font-size:9.5px;
          font-weight:800;
          text-decoration:none;
          transition:background .16s ease,transform .16s ease;
        }

        .pp-webinar-button:hover {
          background:#000;
          transform:translateY(-1px);
        }

        @media(max-width:800px){
          .pp-webinar-grid{grid-template-columns:1fr}
        }


        .pp-whitepaper-grid {
          display:grid;
          grid-template-columns:repeat(2,minmax(0,1fr));
          gap:14px;
        }

        .pp-whitepaper-card {
          min-width:0;
          overflow:hidden;
          border:1px solid #e9ebef;
          border-radius:20px;
          background:#fff;
          box-shadow:0 8px 24px rgba(15,23,42,.035);
          transition:transform .2s ease,box-shadow .2s ease,border-color .2s ease;
        }

        .pp-whitepaper-card:hover {
          transform:translateY(-2px);
          border-color:#d9dee5;
          box-shadow:0 14px 32px rgba(15,23,42,.07);
        }

        .pp-whitepaper-image {
          width:100%;
          aspect-ratio:16 / 9;
          background:#f1f3f5;
          overflow:hidden;
        }

        .pp-whitepaper-image img {
          width:100%;
          height:100%;
          object-fit:cover;
          display:block;
        }

        .pp-whitepaper-placeholder {
          width:100%;
          height:100%;
          display:flex;
          align-items:center;
          justify-content:center;
          color:#9aa2ad;
        }

        .pp-whitepaper-body {
          padding:16px;
        }

        .pp-whitepaper-title {
          margin:0 0 14px;
          color:#111827;
          font-size:13px;
          line-height:1.45;
          font-weight:800;
          letter-spacing:-.015em;
        }

        .pp-whitepaper-button {
          width:100%;
          height:36px;
          border-radius:999px;
          border:1px solid #111827;
          background:#111827;
          color:#fff;
          display:flex;
          align-items:center;
          justify-content:center;
          gap:6px;
          font-size:9.5px;
          font-weight:800;
          text-decoration:none;
          transition:background .16s ease,transform .16s ease;
        }

        .pp-whitepaper-button:hover {
          background:#000;
          transform:translateY(-1px);
        }

        @media(max-width:800px){
          .pp-whitepaper-grid{grid-template-columns:1fr}
        }


        .pp-product-table-wrap {
          width:100%;
          overflow-x:auto;
          border:1px solid #e7eaf0;
          border-radius:18px;
          background:#fff;
          box-shadow:0 8px 24px rgba(15,23,42,.025);
        }

        .pp-product-table {
          width:100%;
          min-width:980px;
          border-collapse:separate;
          border-spacing:0;
          table-layout:fixed;
        }

        .pp-product-table th {
          padding:13px 16px;
          text-align:left;
          background:#f8fafc;
          border-bottom:1px solid #e7eaf0;
          color:#5f6876;
          font-size:9px;
          font-weight:800;
          letter-spacing:.055em;
          text-transform:uppercase;
        }

        .pp-product-table th:nth-child(1){width:20%}
        .pp-product-table th:nth-child(2){width:18%}
        .pp-product-table th:nth-child(3){width:27%}
        .pp-product-table th:nth-child(4){width:35%}

        .pp-product-table td {
          padding:18px 16px;
          vertical-align:top;
          border-bottom:1px solid #eef0f3;
          color:#596273;
          font-size:10.5px;
          line-height:1.65;
          background:#fff;
        }

        .pp-product-table tbody tr:last-child td {
          border-bottom:none;
        }

        .pp-product-table tbody tr {
          transition:background .16s ease;
        }

        .pp-product-table tbody tr:hover td {
          background:#fcfdff;
        }

        .pp-product-name {
          color:#111827;
          font-size:11.5px;
          line-height:1.5;
          font-weight:800;
          letter-spacing:-.01em;
          word-break:break-word;
        }

        .pp-product-category {
          display:inline-flex;
          align-items:center;
          min-height:28px;
          padding:0 10px;
          border-radius:999px;
          border:1px solid #e3e7ec;
          background:#f8fafc;
          color:#4f5866;
          font-size:9px;
          font-weight:700;
          line-height:1.3;
        }

        .pp-product-description {
          color:#66707f;
          font-size:10.5px;
          line-height:1.7;
          white-space:pre-wrap;
          word-break:break-word;
        }

        .pp-product-features {
          display:flex;
          flex-wrap:wrap;
          gap:7px;
        }

        .pp-product-feature {
          display:inline-flex;
          align-items:center;
          min-height:29px;
          padding:6px 10px;
          border-radius:999px;
          border:1px solid #e1e5ea;
          background:#f8fafc;
          color:#4f5866;
          font-size:9px;
          font-weight:700;
          line-height:1.25;
          white-space:normal;
        }

        .pp-product-empty-cell {
          color:#a0a7b2;
          font-size:10px;
          font-style:italic;
        }

        @media(max-width:760px){
          .pp-product-table-wrap {
            border:none;
            border-radius:0;
            box-shadow:none;
            overflow:visible;
            background:transparent;
          }

          .pp-product-table {
            min-width:0;
            table-layout:auto;
            border-collapse:separate;
            border-spacing:0 12px;
          }

          .pp-product-table thead {
            display:none;
          }

          .pp-product-table,
          .pp-product-table tbody,
          .pp-product-table tr,
          .pp-product-table td {
            display:block;
            width:100%;
          }

          .pp-product-table tr {
            border:1px solid #e7eaf0;
            border-radius:16px;
            background:#fff;
            overflow:hidden;
            box-shadow:0 8px 20px rgba(15,23,42,.025);
          }

          .pp-product-table td {
            padding:12px 14px;
            border-bottom:1px solid #eef0f3;
            background:#fff!important;
          }

          .pp-product-table td:last-child {
            border-bottom:none;
          }

          .pp-product-table td::before {
            content:attr(data-label);
            display:block;
            margin-bottom:6px;
            color:#9aa2ad;
            font-size:8px;
            font-weight:800;
            letter-spacing:.055em;
            text-transform:uppercase;
          }

          .pp-product-name{font-size:12px}
        }

        .pp-event-grid {
          display:grid;
          grid-template-columns:repeat(2,minmax(0,1fr));
          gap:16px;
        }

        .pp-event-card {
          overflow:hidden;
          min-width:0;
          border:1px solid #e6e9ee;
          border-radius:22px;
          background:#fff;
          box-shadow:0 12px 32px rgba(15,23,42,.045);
          transition:transform .2s ease,box-shadow .2s ease,border-color .2s ease;
        }

        .pp-event-card:hover {
          transform:translateY(-2px);
          border-color:#d7dce4;
          box-shadow:0 18px 40px rgba(15,23,42,.075);
        }

        .pp-event-image {
          position:relative;
          width:100%;
          aspect-ratio:16 / 9;
          overflow:hidden;
          background:#f2f4f7;
        }

        .pp-event-image img {
          width:100%;
          height:100%;
          object-fit:cover;
          display:block;
        }

        .pp-event-image-placeholder {
          width:100%;
          height:100%;
          display:flex;
          flex-direction:column;
          align-items:center;
          justify-content:center;
          gap:7px;
          color:#a0a7b2;
          font-size:9px;
          font-weight:700;
          text-transform:uppercase;
          letter-spacing:.06em;
        }

        .pp-event-badge {
          position:absolute;
          top:14px;
          right:14px;
          min-height:29px;
          padding:0 11px;
          border-radius:999px;
          background:#111827;
          color:#fff;
          display:inline-flex;
          align-items:center;
          justify-content:center;
          font-size:8.5px;
          font-weight:800;
          letter-spacing:.055em;
          text-transform:uppercase;
          box-shadow:0 7px 18px rgba(15,23,42,.16);
        }

        .pp-event-content {
          padding:18px 18px 16px;
        }

        .pp-event-title {
          margin:0 0 15px;
          color:#111827;
          font-size:17px;
          line-height:1.35;
          font-weight:800;
          letter-spacing:-.025em;
        }

        .pp-event-details {
          display:flex;
          flex-direction:column;
          gap:10px;
        }

        .pp-event-detail {
          display:flex;
          align-items:flex-start;
          gap:9px;
          color:#68717f;
          font-size:10.5px;
          line-height:1.55;
        }

        .pp-event-detail svg {
          margin-top:1px;
          color:#111827;
          flex-shrink:0;
        }

        .pp-event-detail strong {
          display:block;
          color:#303846;
          font-size:10.5px;
          font-weight:800;
        }

        .pp-event-time {
          display:block;
          margin-top:2px;
          color:#8b94a2;
          font-size:10px;
          font-weight:500;
        }

        .pp-event-footer {
          min-height:54px;
          padding:10px 18px;
          border-top:1px solid #edf0f3;
          display:flex;
          align-items:center;
          justify-content:center;
          background:#fcfcfd;
        }

        .pp-event-link {
          width:100%;
          min-height:34px;
          border-radius:999px;
          background:#111827;
          color:#fff;
          display:inline-flex;
          align-items:center;
          justify-content:center;
          gap:6px;
          text-decoration:none;
          font-size:9.5px;
          font-weight:800;
          transition:background .16s ease,transform .16s ease;
        }

        .pp-event-link:hover {
          background:#000;
          transform:translateY(-1px);
        }

        .pp-event-no-link {
          color:#a0a7b2;
          font-size:9.5px;
          font-weight:600;
        }

        @media(max-width:800px){
          .pp-event-grid{grid-template-columns:1fr}
        }

        .pp-contact-card {
          display:grid;
          grid-template-columns:112px minmax(0,1fr);
          gap:18px;
          align-items:center;
          padding:18px;
          min-height:150px;
        }

        .pp-contact-photo {
          width:112px;
          height:112px;
          border-radius:999px;
          overflow:hidden;
          background:#f3f4f6;
          border:5px solid #f0f1f3;
          display:flex;
          align-items:center;
          justify-content:center;
          color:#9aa2ad;
          flex-shrink:0;
        }

        .pp-contact-photo img {
          width:100%;
          height:100%;
          object-fit:cover;
          display:block;
        }

        .pp-contact-main {
          min-width:0;
        }

        .pp-contact-top {
          display:flex;
          align-items:flex-start;
          justify-content:space-between;
          gap:14px;
        }

        .pp-contact-name {
          margin:0;
          color:#111827;
          font-size:17px;
          line-height:1.35;
          font-weight:800;
          letter-spacing:-.025em;
        }

        .pp-contact-role {
          margin-top:3px;
          color:#7c8592;
          font-size:11px;
          line-height:1.5;
        }

        .pp-contact-open {
          flex-shrink:0;
          display:inline-flex;
          align-items:center;
          gap:5px;
          color:#111827;
          font-size:9.5px;
          font-weight:800;
          text-decoration:none;
          white-space:nowrap;
        }

        .pp-contact-separator {
          height:1px;
          background:#eceef1;
          margin:12px 0 11px;
        }

        .pp-contact-details {
          display:flex;
          flex-direction:column;
          gap:8px;
        }

        .pp-contact-detail {
          display:flex;
          align-items:center;
          gap:8px;
          color:#4b5563;
          font-size:10.5px;
          line-height:1.5;
          min-width:0;
        }

        .pp-contact-detail svg {
          color:#111827;
          flex-shrink:0;
        }

        .pp-contact-detail a {
          color:inherit;
          text-decoration:none;
          word-break:break-word;
        }

        .pp-contact-detail a:hover {
          text-decoration:underline;
        }

        @media(max-width:640px){
          .pp-contact-card{grid-template-columns:78px minmax(0,1fr);gap:13px;padding:14px}
          .pp-contact-photo{width:78px;height:78px;border-width:4px}
          .pp-contact-name{font-size:14px}
          .pp-contact-top{gap:8px}
          .pp-contact-open{font-size:8.5px}
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
                    itemHrefPrefix={`/providers/${encodeURIComponent(slug || "")}/posts/`}
                    imageKey="imageUrl"
                    subHeadingKey="subHeading"
                  />
                )}

                {activeTab === "whitepapers" && (
                  <PublicItems
                    title="Whitepapers"
                    items={profile.whitepapers}
                    primary="title"
                    copy="content"
                    itemHrefPrefix={`/providers/${encodeURIComponent(slug || "")}/whitepapers/`}
                    imageKey="imageUrl"
                    whitepaperVariant
                  />
                )}

                {activeTab === "products" && (
                  <PublicItems
                    title="Products"
                    items={profile.products}
                    primary="name"
                    copy="shortDescription"
                    productVariant
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
                    imageKey="photoUrl"
                    contactVariant
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
                    copy="subTitle"
                    itemHrefPrefix={`/providers/${encodeURIComponent(slug || "")}/webinars/`}
                    imageKey="bannerUrl"
                    webinarVariant
                  />
                )}

                {activeTab === "events" && (
                  <PublicItems
                    title="Events"
                    items={profile.events}
                    primary="title"
                    copy="summary"
                    urlKey="eventUrl"
                    imageKey="imageUrl"
                    eventVariant
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

const readLegacyEventDateTime = (value: unknown) => {
  if (typeof value !== "string" || !value.trim()) return { date: "", time: "" };

  const raw = value.trim();
  const direct = raw.match(/^(\d{4}-\d{2}-\d{2})[T\s](\d{2}:\d{2})/);
  if (direct) return { date: direct[1], time: direct[2] };

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return { date: "", time: "" };

  const pad = (value: number) => String(value).padStart(2, "0");
  return {
    date: `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}`,
    time: `${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`,
  };
};

const formatEventDate = (value: string) => {
  if (!value) return "";
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
};

const formatEventTime = (value: string) => value ? value.slice(0, 5) : "";

function PublicItems({
  title,
  items,
  primary,
  copy,
  fallbackCopy,
  urlKey,
  metaKeys = [],
  itemHrefPrefix,
  imageKey,
  subHeadingKey,
  contactVariant = false,
  whitepaperVariant = false,
  productVariant = false,
  eventVariant = false,
  webinarVariant = false,
}: {
  title: string;
  items: any[];
  primary: string;
  copy: string;
  fallbackCopy?: string;
  urlKey?: string;
  metaKeys?: string[];
  itemHrefPrefix?: string;
  imageKey?: string;
  subHeadingKey?: string;
  contactVariant?: boolean;
  whitepaperVariant?: boolean;
  productVariant?: boolean;
  eventVariant?: boolean;
  webinarVariant?: boolean;
}) {
  return (
    <>
      <h2 className="pp-section-title">{title}</h2>

      {items.length === 0 ? (
        <div className="pp-empty">No approved {title.toLowerCase()} are currently available.</div>
      ) : webinarVariant ? (
        <div className="pp-webinar-grid">
          {items.map((item) => {
            const publicKey =
              item.slug || item.id ? String(item.slug || item.id) : "";
            const href =
              itemHrefPrefix && publicKey
                ? `${itemHrefPrefix}${encodeURIComponent(publicKey)}`
                : "";

            return (
              <article className="pp-webinar-card" key={item.id || item.title}>
                <div className="pp-webinar-image">
                  {imageKey && item[imageKey] ? (
                    <img
                      src={String(item[imageKey])}
                      alt={String(item[primary] || "Webinar")}
                    />
                  ) : (
                    <div className="pp-webinar-placeholder">
                      <Video size={28} />
                    </div>
                  )}
                </div>

                <div className="pp-webinar-body">
                  <h3 className="pp-webinar-title">
                    {item[primary] || "Webinar"}
                  </h3>

                  {href && (
                    <a className="pp-webinar-button" href={href}>
                      Learn More
                      <ChevronRight size={11} />
                    </a>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      ) : eventVariant ? (
        <div className="pp-event-grid">
          {items.map((item) => {
            const legacyStart = readLegacyEventDateTime(item.startAt);
            const legacyEnd = readLegacyEventDateTime(item.endAt);

            const startDate = typeof item.startDate === "string" && item.startDate ? item.startDate : legacyStart.date;
            const startTime = typeof item.startTime === "string" && item.startTime ? item.startTime : legacyStart.time;
            const endDate = typeof item.endDate === "string" && item.endDate ? item.endDate : legacyEnd.date;
            const endTime = typeof item.endTime === "string" && item.endTime ? item.endTime : legacyEnd.time;
            const hasUrl = typeof item.eventUrl === "string" && item.eventUrl.trim().length > 0;

            return (
              <article className="pp-event-card" key={item.id || item.title}>
                <div className="pp-event-image">
                  {item.imageUrl ? (
                    <img src={String(item.imageUrl)} alt={String(item.title || "Event")} />
                  ) : (
                    <div className="pp-event-image-placeholder">
                      <Sparkles size={28} />
                      <span>Event</span>
                    </div>
                  )}
                  <span className="pp-event-badge">Event</span>
                </div>

                <div className="pp-event-content">
                  <h3 className="pp-event-title">{item.title || "Event"}</h3>

                  <div className="pp-event-details">
                    {item.location && (
                      <div className="pp-event-detail">
                        <MapPin size={16} />
                        <span>{String(item.location)}</span>
                      </div>
                    )}

                    {(startDate || endDate) && (
                      <div className="pp-event-detail">
                        <CalendarDays size={16} />
                        <div>
                          <strong>
                            {formatEventDate(startDate)}
                            {endDate && ` – ${formatEventDate(endDate)}`}
                          </strong>
                          {(startTime || endTime) && (
                            <span className="pp-event-time">
                              {formatEventTime(startTime)}
                              {endTime && ` – ${formatEventTime(endTime)}`}
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="pp-event-footer">
                  {hasUrl ? (
                    <a
                      className="pp-event-link"
                      href={item.eventUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      View Event
                      <ExternalLink size={11} />
                    </a>
                  ) : (
                    <span className="pp-event-no-link">No event URL provided</span>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      ) : productVariant ? (
        <div className="pp-product-table-wrap">
          <table className="pp-product-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Category</th>
                <th>Brief Description</th>
                <th>Features</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const rawFeatures = Array.isArray(item.features)
                  ? item.features.filter(
                      (feature: unknown): feature is string =>
                        typeof feature === "string" && feature.trim().length > 0
                    )
                  : [];

                return (
                  <tr key={item.id || item.name}>
                    <td data-label="Product">
                      <div className="pp-product-name">
                        {item.name || "Product"}
                      </div>
                    </td>

                    <td data-label="Category">
                      {item.category ? (
                        <span className="pp-product-category">
                          {String(item.category)}
                        </span>
                      ) : (
                        <span className="pp-product-empty-cell">—</span>
                      )}
                    </td>

                    <td data-label="Brief Description">
                      {item.shortDescription ? (
                        <div className="pp-product-description">
                          {String(item.shortDescription)}
                        </div>
                      ) : (
                        <span className="pp-product-empty-cell">—</span>
                      )}
                    </td>

                    <td data-label="Features">
                      {rawFeatures.length > 0 ? (
                        <div className="pp-product-features">
                          {rawFeatures.map((feature: string, index: number) => (
                            <span
                              className="pp-product-feature"
                              key={`${feature}-${index}`}
                            >
                              {feature}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="pp-product-empty-cell">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : whitepaperVariant ? (
        <div className="pp-whitepaper-grid">
          {items.map((item) => {
            const publicKey = item.slug || item.id ? String(item.slug || item.id) : "";
            const href =
              itemHrefPrefix && publicKey
                ? `${itemHrefPrefix}${encodeURIComponent(publicKey)}`
                : "";

            return (
              <article className="pp-whitepaper-card" key={item.id || publicKey}>
                <div className="pp-whitepaper-image">
                  {imageKey && item[imageKey] ? (
                    <img
                      src={String(item[imageKey])}
                      alt={String(item[primary] || "Whitepaper")}
                    />
                  ) : (
                    <div className="pp-whitepaper-placeholder">
                      <FileText size={28} />
                    </div>
                  )}
                </div>

                <div className="pp-whitepaper-body">
                  <h3 className="pp-whitepaper-title">
                    {item[primary] || "Whitepaper"}
                  </h3>

                  {href && (
                    <a className="pp-whitepaper-button" href={href}>
                      <FileText size={11} />
                      View Whitepaper
                    </a>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="pp-list">
          {items.map((item) => {
            const rawDescription = item[copy] || (fallbackCopy ? item[fallbackCopy] : "");
            const description =
              typeof rawDescription === "string"
                ? stripPublicHtml(rawDescription)
                : rawDescription;

            if (contactVariant) {
              return (
                <article className="pp-item pp-contact-card" key={item.id}>
                  <div className="pp-contact-photo">
                    {item.photoUrl ? (
                      <img src={item.photoUrl} alt={`${item.fullName || "Contact"} photo`} />
                    ) : (
                      <UserRound size={30} />
                    )}
                  </div>

                  <div className="pp-contact-main">
                    <div className="pp-contact-top">
                      <div>
                        <h3 className="pp-contact-name">
                          {item[primary] || "Contact"}
                        </h3>
                        {description && (
                          <div className="pp-contact-role">{description}</div>
                        )}
                      </div>

                      {urlKey && item[urlKey] && (
                        <a
                          className="pp-contact-open"
                          href={item[urlKey]}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Open
                          <ExternalLink size={9} />
                        </a>
                      )}
                    </div>

                    <div className="pp-contact-separator" />

                    <div className="pp-contact-details">
                      {item.email && (
                        <div className="pp-contact-detail">
                          <Mail size={14} />
                          <a href={`mailto:${item.email}`}>{item.email}</a>
                        </div>
                      )}

                      {item.phone && (
                        <div className="pp-contact-detail">
                          <Phone size={14} />
                          <a href={`tel:${String(item.phone).replace(/\s+/g, "")}`}>
                            {item.phone}
                          </a>
                        </div>
                      )}
                    </div>
                  </div>
                </article>
              );
            }

            const content = (
              <>
                {imageKey && item[imageKey] && (
                  <div className="pp-post-image">
                    <img src={item[imageKey]} alt="" />
                  </div>
                )}

                <div className="pp-item-title">{item[primary] || title.slice(0, -1)}</div>

                {subHeadingKey && item[subHeadingKey] && (
                  <div className="pp-post-subheading">{String(item[subHeadingKey])}</div>
                )}

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
                      onClick={(event) => event.stopPropagation()}
                    >
                      Open
                      <ExternalLink size={9} />
                    </a>
                  )}
                </div>
              </>
            );

            const publicPostKey =
              itemHrefPrefix && (item.slug || item.id)
                ? String(item.slug || item.id)
                : "";

            return itemHrefPrefix && publicPostKey ? (
              <a
                className="pp-item pp-item-clickable"
                key={item.id || publicPostKey}
                href={`${itemHrefPrefix}${encodeURIComponent(publicPostKey)}`}
              >
                {content}
              </a>
            ) : (
              <article className="pp-item" key={item.id}>
                {content}
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}
