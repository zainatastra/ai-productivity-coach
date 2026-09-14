"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Building2,
  CalendarDays,
  ChevronRight,
  Clock3,
  Newspaper,
} from "lucide-react";
import Header from "@/components/Header";
import { API_BASE_URL } from "@/services/api";

type PublicArticlePayload = {
  providerId: string;
  approvedVersion?: number;
  approvedAt?: string;
  company: any;
  about: any;
  post: any;
  canonicalPostSlug?: string;
  relatedPosts: any[];
};

const stripHtml = (value: string) =>
  value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

const estimateReadingTime = (value: string) => {
  const words = stripHtml(value || "")
    .split(/\s+/)
    .filter(Boolean).length;

  return Math.max(1, Math.ceil(words / 220));
};

const sanitizeRichHtml = (html: string) => {
  if (typeof window === "undefined" || !html) return "";

  const parser = new DOMParser();
  const documentNode = parser.parseFromString(`<div>${html}</div>`, "text/html");
  const wrapper = documentNode.body.firstElementChild as HTMLElement | null;

  if (!wrapper) return "";

  const allowedTags = new Set([
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
    "H4",
    "UL",
    "OL",
    "LI",
    "BLOCKQUOTE",
    "IMG",
  ]);

  const cleanNode = (node: Node) => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === Node.ELEMENT_NODE) {
        const element = child as HTMLElement;

        if (!allowedTags.has(element.tagName)) {
          const fragment = documentNode.createDocumentFragment();
          while (element.firstChild) fragment.appendChild(element.firstChild);
          element.replaceWith(fragment);
          continue;
        }

        if (element.tagName === "IMG") {
          const src = element.getAttribute("src") || "";
          let safeImage = false;

          try {
            const parsed = new URL(src);
            safeImage =
              parsed.protocol === "https:" &&
              parsed.hostname.endsWith(".blob.vercel-storage.com");
          } catch {
            safeImage = false;
          }

          if (!safeImage) {
            element.remove();
            continue;
          }

          const alt = element.getAttribute("alt") || "Article image";

          for (const attribute of Array.from(element.attributes)) {
            element.removeAttribute(attribute.name);
          }

          element.setAttribute("src", src);
          element.setAttribute("alt", alt.slice(0, 180));
          element.setAttribute("loading", "lazy");
          element.setAttribute("decoding", "async");
          continue;
        }

        for (const attribute of Array.from(element.attributes)) {
          element.removeAttribute(attribute.name);
        }

        cleanNode(element);
      }
    }
  };

  cleanNode(wrapper);
  return wrapper.innerHTML;
};

const normalizeArticleBody = (body: string) => {
  if (!body) return "";

  if (/<[a-z][\s\S]*>/i.test(body)) {
    return sanitizeRichHtml(body);
  }

  return body
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map(
      (paragraph) =>
        `<p>${paragraph
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/\n/g, "<br>")}</p>`
    )
    .join("");
};

const formatPublishedDate = (value?: string) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleDateString(undefined, {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
};

const getSafeVideoEmbedUrl = (value: string) => {
  const raw = value.trim();
  if (!raw) return "";

  try {
    const parsed = new URL(raw);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    const cleanPath = parsed.pathname.replace(/\/+$/, "");
    const pathParts = cleanPath.split("/").filter(Boolean);

    const safeId = (candidate: string | undefined) =>
      candidate && /^[a-zA-Z0-9_-]+$/.test(candidate) ? candidate : "";

    // YouTube
    if (
      host === "youtube.com" ||
      host === "m.youtube.com" ||
      host === "music.youtube.com" ||
      host === "youtube-nocookie.com"
    ) {
      let id = "";

      if (pathParts[0] === "watch") {
        id = safeId(parsed.searchParams.get("v") || undefined);
      } else if (["embed", "shorts", "live"].includes(pathParts[0] || "")) {
        id = safeId(pathParts[1]);
      }

      return id ? `https://www.youtube-nocookie.com/embed/${id}` : "";
    }

    if (host === "youtu.be") {
      const id = safeId(pathParts[0]);
      return id ? `https://www.youtube-nocookie.com/embed/${id}` : "";
    }

    // Vimeo
    if (host === "vimeo.com" || host === "player.vimeo.com") {
      const id = pathParts.find((part) => /^\d+$/.test(part)) || "";
      return id ? `https://player.vimeo.com/video/${id}` : "";
    }

    // Loom
    if (host === "loom.com") {
      const markerIndex = pathParts.findIndex((part) =>
        ["share", "embed"].includes(part)
      );
      const id = markerIndex >= 0 ? safeId(pathParts[markerIndex + 1]) : "";
      return id ? `https://www.loom.com/embed/${id}` : "";
    }

    // Dailymotion
    if (host === "dailymotion.com") {
      const markerIndex = pathParts.findIndex((part) => part === "video");
      const id = markerIndex >= 0 ? safeId(pathParts[markerIndex + 1]) : "";
      return id ? `https://www.dailymotion.com/embed/video/${id}` : "";
    }

    if (host === "dai.ly") {
      const id = safeId(pathParts[0]);
      return id ? `https://www.dailymotion.com/embed/video/${id}` : "";
    }

    // Wistia
    if (
      host === "wistia.com" ||
      host.endsWith(".wistia.com") ||
      host === "fast.wistia.net"
    ) {
      const mediaIndex = pathParts.findIndex((part) => part === "medias");
      const iframeIndex = pathParts.findIndex((part) => part === "iframe");
      const id =
        mediaIndex >= 0
          ? safeId(pathParts[mediaIndex + 1])
          : iframeIndex >= 0
            ? safeId(pathParts[iframeIndex + 1])
            : "";

      return id ? `https://fast.wistia.net/embed/iframe/${id}` : "";
    }

    return "";
  } catch {
    return "";
  }
};


export default function ProviderPostPage() {
  const params = useParams<{ slug: string; postId: string }>();
  const router = useRouter();

  const slug = Array.isArray(params?.slug) ? params.slug[0] : params?.slug;
  const postId = Array.isArray(params?.postId) ? params.postId[0] : params?.postId;

  const [payload, setPayload] = useState<PublicArticlePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!slug || !postId) return;

    const load = async () => {
      try {
        setLoading(true);
        setError("");

        const res = await fetch(
          `${API_BASE_URL}/api/providers/${encodeURIComponent(slug)}/posts/${encodeURIComponent(postId)}`,
          { cache: "no-store" }
        );

        const result = await res.json().catch(() => null);

        if (!res.ok) {
          setError(result?.message || "Post not found.");
          return;
        }

        setPayload(result);

        // Existing approved snapshots may still be reached through an older
        // Firestore document-ID URL. Once the API resolves the post, move the
        // browser to the canonical title-based slug without another navigation.
        const canonicalPostSlug = String(
          result?.canonicalPostSlug || result?.post?.slug || ""
        ).trim();

        if (
          canonicalPostSlug &&
          canonicalPostSlug.toLowerCase() !== String(postId).toLowerCase()
        ) {
          router.replace(
            `/providers/${encodeURIComponent(slug)}/posts/${encodeURIComponent(canonicalPostSlug)}`,
            { scroll: false }
          );
        }
      } catch (error) {
        console.error("Public article loading failed:", error);
        setError("Unable to load this post.");
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [slug, postId, router]);

  const bodyHtml = useMemo(
    () => normalizeArticleBody(payload?.post?.body || ""),
    [payload?.post?.body]
  );

  const readingMinutes = useMemo(
    () => estimateReadingTime(payload?.post?.body || ""),
    [payload?.post?.body]
  );

  const videoEmbedUrl = useMemo(
    () => getSafeVideoEmbedUrl(String(payload?.post?.videoEmbedUrl || "")),
    [payload?.post?.videoEmbedUrl]
  );

  const galleryMedia = useMemo(() => {
    const items = payload?.post?.galleryMedia;
    if (!Array.isArray(items)) return [];

    return items
      .map((item: any) => ({
        url: typeof item?.url === "string" ? item.url : "",
      }))
      .filter((item: { url: string }) => Boolean(item.url))
      .slice(0, 10);
  }, [payload?.post?.galleryMedia]);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');

        *,*::before,*::after{box-sizing:border-box}

        .pa-root {
          min-height:100vh;
          background:
            radial-gradient(circle at 14% 8%, rgba(59,130,246,.055), transparent 26%),
            #f6f7f9;
          color:#111827;
          font-family:"Plus Jakarta Sans",sans-serif;
        }

        .pa-shell {
          width:min(1160px,calc(100% - 32px));
          margin:0 auto;
          padding:24px 0 72px;
        }

        .pa-back {
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
          margin-bottom:18px;
          box-shadow:0 6px 18px rgba(15,23,42,.03);
        }

        .pa-hero {
          overflow:hidden;
          border:1px solid #e7e9ed;
          border-radius:30px;
          background:#fff;
          box-shadow:0 22px 62px rgba(15,23,42,.065);
        }

        .pa-hero-copy {
          padding:42px 52px 36px;
        }

        .pa-kicker {
          display:inline-flex;
          align-items:center;
          gap:7px;
          min-height:29px;
          padding:0 10px;
          border-radius:999px;
          background:#eff6ff;
          border:1px solid #dbeafe;
          color:#2563eb;
          font-size:9px;
          font-weight:800;
          letter-spacing:.065em;
          text-transform:uppercase;
          margin-bottom:19px;
        }

        .pa-title {
          margin:7px 0 0;
          max-width:860px;
          color:#111827;
          font-size:clamp(30px,4vw,48px);
          line-height:1.08;
          letter-spacing:-.045em;
          font-weight:800;
        }

        .pa-subheading {
          margin:0;
          max-width:820px;
          color:#697386;
          font-size:14px;
          line-height:1.65;
          font-weight:700;
        }

        .pa-excerpt {
          margin:14px 0 0;
          max-width:780px;
          color:#9199a5;
          font-size:12px;
          line-height:1.8;
        }

        .pa-meta {
          margin-top:24px;
          padding-top:20px;
          border-top:1px solid #eef0f3;
          display:flex;
          align-items:center;
          justify-content:space-between;
          gap:16px;
          flex-wrap:wrap;
        }

        .pa-company {
          display:flex;
          align-items:center;
          gap:10px;
          min-width:0;
        }

        .pa-company-logo {
          width:50px;
          height:50px;
          border-radius:13px;
          border:1px solid #e8eaee;
          background:#fff;
          display:flex;
          align-items:center;
          justify-content:center;
          overflow:hidden;
          color:#697386;
          flex-shrink:0;
        }

        .pa-company-logo img {
          width:100%;
          height:100%;
          object-fit:contain;
        }

        .pa-company-name {
          color:#111827;
          font-size:13px;
          font-weight:800;
          line-height:1.35;
        }

        .pa-company-label {
          margin-top:3px;
          color:#9aa2ad;
          font-size:9.5px;
          font-weight:700;
          text-transform:uppercase;
          letter-spacing:.06em;
        }

        .pa-meta-right {
          display:flex;
          align-items:center;
          gap:8px;
          flex-wrap:wrap;
        }

        .pa-meta-pill {
          min-height:30px;
          padding:0 10px;
          border-radius:999px;
          border:1px solid #e7e9ed;
          background:#fafbfc;
          color:#697386;
          display:inline-flex;
          align-items:center;
          gap:6px;
          font-size:9px;
          font-weight:700;
        }

        .pa-media-layout {
          display:grid;
          grid-template-columns:minmax(0,1fr) 270px;
          gap:18px;
          align-items:start;
          padding:0 22px 22px;
        }

        .pa-image {
          width:100%;
          height:390px;
          overflow:hidden;
          background:#eef1f4;
          border:1px solid #eef0f3;
          border-radius:22px;
        }

        .pa-image img {
          width:100%;
          height:100%;
          object-fit:cover;
          display:block;
        }

        .pa-image-empty {
          display:flex;
          align-items:center;
          justify-content:center;
          color:#9aa2ad;
        }

        .pa-layout {
          display:block;
          margin-top:20px;
        }

        .pa-article {
          background:#fff;
          border:1px solid #e8eaee;
          border-radius:26px;
          padding:42px 48px 48px;
          box-shadow:0 16px 44px rgba(15,23,42,.04);
        }

        .pa-body {
          color:#374151;
          font-size:14px;
          line-height:1.95;
        }

        .pa-body p {
          margin:0 0 20px;
        }

        .pa-body h1 {
          margin:42px 0 16px;
          color:#111827;
          font-size:34px;
          line-height:1.16;
          letter-spacing:-.04em;
          font-weight:800;
        }

        .pa-body h2 {
          margin:38px 0 14px;
          color:#111827;
          font-size:28px;
          line-height:1.22;
          letter-spacing:-.035em;
          font-weight:800;
        }

        .pa-body h3 {
          margin:30px 0 12px;
          color:#111827;
          font-size:21px;
          line-height:1.3;
          letter-spacing:-.025em;
          font-weight:800;
        }

        .pa-body h4 {
          margin:24px 0 10px;
          color:#111827;
          font-size:17px;
          line-height:1.35;
          font-weight:800;
        }

        .pa-body strong,
        .pa-body b {
          color:#111827;
          font-weight:800;
        }

        .pa-body blockquote {
          margin:28px 0;
          padding:18px 20px;
          border-left:3px solid #2563eb;
          background:#f8fafc;
          border-radius:0 16px 16px 0;
          color:#56606f;
        }

        .pa-body img {
          display:block;
          width:min(100%,820px);
          height:auto;
          max-height:620px;
          object-fit:contain;
          margin:30px auto;
          border-radius:20px;
          border:1px solid #e7eaf0;
          background:#f3f5f7;
          box-shadow:0 14px 34px rgba(15,23,42,.075);
        }

        .pa-body ul,
        .pa-body ol {
          margin:0 0 20px 22px;
          padding:0;
        }

        .pa-body li {
          margin-bottom:8px;
        }

        .pa-empty-body {
          padding:24px;
          border:1px dashed #dfe3e8;
          border-radius:18px;
          background:#fafbfc;
          color:#929aa6;
          font-size:11px;
          line-height:1.7;
          text-align:center;
        }

        .pa-side {
          display:flex;
          flex-direction:column;
          gap:12px;
        }

        .pa-side-card {
          background:#fff;
          border:1px solid #e8eaee;
          border-radius:22px;
          padding:18px;
          box-shadow:0 12px 34px rgba(15,23,42,.035);
        }

        .pa-side-label {
          color:#9aa2ad;
          font-size:8.5px;
          font-weight:800;
          letter-spacing:.07em;
          text-transform:uppercase;
          margin-bottom:9px;
        }

        .pa-side-title {
          color:#111827;
          font-size:13px;
          font-weight:800;
          line-height:1.45;
          margin-bottom:7px;
        }

        .pa-side-copy {
          color:#7d8693;
          font-size:10px;
          line-height:1.7;
        }

        .pa-video {
          margin-top:24px;
          background:#fff;
          border:1px solid #e8eaee;
          border-radius:26px;
          padding:28px;
          box-shadow:0 16px 44px rgba(15,23,42,.035);
        }

        .pa-video-head {
          margin-bottom:15px;
        }

        .pa-video-title {
          margin:0;
          color:#111827;
          font-size:20px;
          font-weight:800;
          letter-spacing:-.035em;
        }

        .pa-video-copy {
          margin-top:4px;
          color:#939ba7;
          font-size:10px;
          line-height:1.6;
        }

        .pa-video-frame {
          position:relative;
          width:100%;
          aspect-ratio:16 / 9;
          overflow:hidden;
          border-radius:20px;
          background:#111827;
          border:1px solid #e1e5eb;
          box-shadow:0 14px 32px rgba(15,23,42,.09);
        }

        .pa-video-frame iframe {
          position:absolute;
          inset:0;
          width:100%;
          height:100%;
          border:0;
          display:block;
        }

        .pa-gallery {
          margin-top:24px;
          background:#fff;
          border:1px solid #e8eaee;
          border-radius:26px;
          padding:28px;
          box-shadow:0 16px 44px rgba(15,23,42,.035);
        }

        .pa-gallery-head {
          display:flex;
          align-items:flex-end;
          justify-content:space-between;
          gap:14px;
          margin-bottom:16px;
        }

        .pa-gallery-title {
          margin:0;
          color:#111827;
          font-size:20px;
          font-weight:800;
          letter-spacing:-.035em;
        }

        .pa-gallery-copy {
          margin-top:4px;
          color:#939ba7;
          font-size:10px;
          line-height:1.6;
        }

        .pa-gallery-count {
          flex-shrink:0;
          padding:6px 9px;
          border-radius:999px;
          border:1px solid #e6e9ee;
          background:#f8fafc;
          color:#6b7280;
          font-size:8.5px;
          font-weight:800;
        }

        .pa-gallery-grid {
          display:grid;
          grid-template-columns:repeat(4,minmax(0,1fr));
          grid-auto-rows:150px;
          gap:10px;
        }

        .pa-gallery-item {
          position:relative;
          overflow:hidden;
          border-radius:17px;
          background:#eef1f4;
          border:1px solid #e7eaf0;
          display:block;
          box-shadow:0 7px 18px rgba(15,23,42,.035);
        }

        .pa-gallery-item:first-child {
          grid-column:span 2;
          grid-row:span 2;
        }

        .pa-gallery-item:nth-child(6n) {
          grid-column:span 2;
        }

        .pa-gallery-item img {
          width:100%;
          height:100%;
          object-fit:cover;
          display:block;
          transition:transform .35s cubic-bezier(.22,1,.36,1);
        }

        .pa-gallery-item::after {
          content:"";
          position:absolute;
          inset:0;
          background:linear-gradient(180deg,transparent 65%,rgba(15,23,42,.18));
          opacity:0;
          transition:opacity .25s ease;
          pointer-events:none;
        }

        .pa-gallery-item:hover img {
          transform:scale(1.035);
        }

        .pa-gallery-item:hover::after {
          opacity:1;
        }

        .pa-related {
          margin-top:24px;
          background:#fff;
          border:1px solid #e8eaee;
          border-radius:26px;
          padding:28px;
          box-shadow:0 16px 44px rgba(15,23,42,.035);
        }

        .pa-related-head {
          display:flex;
          align-items:end;
          justify-content:space-between;
          gap:16px;
          margin-bottom:16px;
        }

        .pa-related-title {
          margin:0;
          font-size:20px;
          font-weight:800;
          letter-spacing:-.035em;
        }

        .pa-related-copy {
          margin-top:4px;
          color:#939ba7;
          font-size:10px;
        }

        .pa-related-grid {
          display:grid;
          grid-template-columns:repeat(4,minmax(0,1fr));
          gap:14px;
        }

        .pa-related-card {
          overflow:hidden;
          border:1px solid #e9ebef;
          border-radius:18px;
          background:#fff;
          color:inherit;
          text-decoration:none;
          transition:transform .18s ease,box-shadow .18s ease,border-color .18s ease;
        }

        .pa-related-card:hover {
          transform:translateY(-2px);
          border-color:#d8dde4;
          box-shadow:0 12px 26px rgba(15,23,42,.055);
        }

        .pa-related-image {
          aspect-ratio:16 / 9;
          background:#eef1f4;
          overflow:hidden;
        }

        .pa-related-image img {
          width:100%;
          height:100%;
          object-fit:cover;
          display:block;
        }

        .pa-related-card-copy {
          padding:14px;
        }

        .pa-related-card-title {
          color:#111827;
          font-size:11px;
          line-height:1.5;
          font-weight:800;
          margin-bottom:5px;
        }

        .pa-related-card-text {
          color:#8c95a2;
          font-size:9.5px;
          line-height:1.6;
          max-height:48px;
          overflow:hidden;
        }

        .pa-loading {
          min-height:60vh;
          display:flex;
          align-items:center;
          justify-content:center;
          color:#929aa6;
          font-size:11px;
        }

        .pa-error {
          margin-top:10px;
          padding:42px 24px;
          border:1px dashed #dfe3e8;
          border-radius:24px;
          background:#fff;
          color:#7d8693;
          text-align:center;
          font-size:11px;
        }

        @media(max-width:900px){
          .pa-media-layout{grid-template-columns:1fr}
          .pa-side{display:grid;grid-template-columns:1fr 1fr}
          .pa-image{height:340px}
          .pa-gallery-grid{grid-template-columns:repeat(2,minmax(0,1fr));grid-auto-rows:145px}
          .pa-related-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
        }

        @media(max-width:640px){
          .pa-shell{width:min(100% - 20px,1160px);padding-top:14px}
          .pa-hero{border-radius:23px}
          .pa-hero-copy{padding:28px 20px 24px}
          .pa-title{font-size:30px}
          .pa-subheading{font-size:12.5px}
          .pa-article{padding:28px 20px 32px;border-radius:22px}
          .pa-body{font-size:13px}
          .pa-body h2{font-size:23px}
          .pa-body h3{font-size:18px}
          .pa-media-layout{padding:0 14px 14px;gap:12px}
          .pa-image{height:240px;border-radius:18px}
          .pa-side{grid-template-columns:1fr}
          .pa-video{padding:22px 18px;border-radius:22px}
          .pa-video-frame{border-radius:16px}
          .pa-gallery{padding:22px 18px;border-radius:22px}
          .pa-gallery-grid{grid-template-columns:1fr;grid-auto-rows:220px}
          .pa-gallery-item:first-child,
          .pa-gallery-item:nth-child(6n){grid-column:auto;grid-row:auto}
          .pa-related{padding:22px 18px;border-radius:22px}
          .pa-related-grid{grid-template-columns:1fr}
        }
      `}</style>

      <div className="pa-root">
        <Header />

        <main className="pa-shell">
          <button
            className="pa-back"
            onClick={() => router.push(`/providers/${encodeURIComponent(slug || "")}`)}
          >
            <ArrowLeft size={12} />
            Back to provider
          </button>

          {loading ? (
            <div className="pa-loading">Loading approved post…</div>
          ) : error || !payload ? (
            <div className="pa-error">{error || "Post not found."}</div>
          ) : (
            <>
              <motion.section
                className="pa-hero"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: .28 }}
              >
                <div className="pa-hero-copy">
                  <div className="pa-kicker">
                    <Newspaper size={11} />
                    Provider insight
                  </div>

                  {payload.post.subHeading && (
                    <p className="pa-subheading">{payload.post.subHeading}</p>
                  )}

                  <h1 className="pa-title">{payload.post.title}</h1>

                  {payload.post.excerpt && (
                    <p className="pa-excerpt">{payload.post.excerpt}</p>
                  )}

                  <div className="pa-meta">
                    <div className="pa-company">
                      <div className="pa-company-logo">
                        {payload.company?.logoUrl ? (
                          <img src={payload.company.logoUrl} alt={`${payload.company.name} logo`} />
                        ) : (
                          <Building2 size={18} />
                        )}
                      </div>
                      <div>
                        <div className="pa-company-name">{payload.company?.name}</div>
                        <div className="pa-company-label">Provider article</div>
                      </div>
                    </div>

                    <div className="pa-meta-right">
                      {(payload.post.createdAt || payload.post.updatedAt) && (
                        <span className="pa-meta-pill">
                          <CalendarDays size={10} />
                          {formatPublishedDate(payload.post.createdAt || payload.post.updatedAt)}
                        </span>
                      )}
                      <span className="pa-meta-pill">
                        <Clock3 size={10} />
                        {readingMinutes} min read
                      </span>
                    </div>
                  </div>
                </div>

                <div className="pa-media-layout">
                  {payload.post.imageUrl ? (
                    <div className="pa-image">
                      <img src={payload.post.imageUrl} alt={payload.post.title || ""} />
                    </div>
                  ) : (
                    <div className="pa-image pa-image-empty">
                      <Newspaper size={28} />
                    </div>
                  )}

                  <aside className="pa-side">
                    <div className="pa-side-card">
                      <div className="pa-side-label">Published by</div>
                      <div className="pa-side-title">{payload.company?.name}</div>
                      <div className="pa-side-copy">
                        {payload.about?.headline ||
                          payload.company?.shortDescription ||
                          "Approved provider on Ey Eric."}
                      </div>
                    </div>

                    <div className="pa-side-card">
                      <div className="pa-side-label">Article</div>
                      <div className="pa-side-title">{readingMinutes} minute read</div>
                      <div className="pa-side-copy">
                        This article is part of the provider's administrator-approved public profile.
                      </div>
                    </div>
                  </aside>
                </div>
              </motion.section>

              <div className="pa-layout">
                <article className="pa-article">
                  {bodyHtml ? (
                    <div
                      className="pa-body"
                      dangerouslySetInnerHTML={{ __html: bodyHtml }}
                    />
                  ) : (
                    <div className="pa-empty-body">
                      This approved post does not contain article content yet.
                    </div>
                  )}
                </article>
              </div>

              {videoEmbedUrl && (
                <section className="pa-video">
                  <div className="pa-video-head">
                    <h2 className="pa-video-title">Video</h2>
                    <div className="pa-video-copy">
                      Watch the video included with this provider article.
                    </div>
                  </div>

                  <div className="pa-video-frame">
                    <iframe
                      src={videoEmbedUrl}
                      title={`${payload.post.title || "Provider article"} video`}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      allowFullScreen
                      loading="lazy"
                      referrerPolicy="strict-origin-when-cross-origin"
                    />
                  </div>
                </section>
              )}

              {galleryMedia.length > 0 && (
                <section className="pa-gallery">
                  <div className="pa-gallery-head">
                    <div>
                      <h2 className="pa-gallery-title">Gallery</h2>
                      <div className="pa-gallery-copy">
                        More visual highlights from this provider article.
                      </div>
                    </div>
                    <span className="pa-gallery-count">
                      {galleryMedia.length} image{galleryMedia.length === 1 ? "" : "s"}
                    </span>
                  </div>

                  <div className="pa-gallery-grid">
                    {galleryMedia.map((media, index) => (
                      <a
                        className="pa-gallery-item"
                        key={`${media.url}-${index}`}
                        href={media.url}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={`Open gallery image ${index + 1}`}
                      >
                        <img
                          src={media.url}
                          alt={`${payload.post.title || "Article"} gallery image ${index + 1}`}
                        />
                      </a>
                    ))}
                  </div>
                </section>
              )}

              {payload.relatedPosts?.length > 0 && (
                <section className="pa-related">
                  <div className="pa-related-head">
                    <div>
                      <h2 className="pa-related-title">Related Posts</h2>
                      <div className="pa-related-copy">Continue reading related provider insights.</div>
                    </div>
                  </div>

                  <div className="pa-related-grid">
                    {payload.relatedPosts.slice(0, 8).map((item) => (
                      <a
                        className="pa-related-card"
                        key={item.id}
                        href={`/providers/${encodeURIComponent(slug || "")}/posts/${encodeURIComponent(String(item.slug || item.id))}`}
                      >
                        {item.imageUrl && (
                          <div className="pa-related-image">
                            <img src={item.imageUrl} alt="" />
                          </div>
                        )}
                        <div className="pa-related-card-copy">
                          <div className="pa-related-card-title">{item.title || "Provider post"}</div>
                          {(item.subHeading || item.excerpt) && (
                            <div className="pa-related-card-text">
                              {item.subHeading || item.excerpt}
                            </div>
                          )}
                        </div>
                      </a>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </main>
      </div>
    </>
  );
}
