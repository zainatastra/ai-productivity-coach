// services/api.ts

import { getAuth } from "firebase/auth";
import { app } from "@/services/firebase";

type Language = "en" | "de";

interface ApiResponse<T> {
  success?: boolean;
  data?: T;
  message?: string;
}

// ✅ BACKEND URLS
const LOCAL_API_URL = "http://localhost:5048";
const PRODUCTION_API_URL = "https://ai-productivity-coach-mlnn.onrender.com";

/*
  ✅ API ROUTING RULES

  1. Local development:
     Productivity requests use the local .NET backend directly:
     http://localhost:5048/api/Productivity

  2. Production / Vercel / WordPress embed:
     Productivity requests use the Vercel same-origin proxy:
     /api/productivity

     This prevents iframe browsers from suspending direct cross-origin
     requests from the embedded WordPress iframe to Render.

  3. Authenticated conversation saving still uses the .NET backend directly,
     because it needs Firebase Authorization headers and backend conversation APIs.
*/
const isBrowser = typeof window !== "undefined";
const isLocalhost =
  isBrowser &&
  (window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1");

const configuredApiUrl = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "");

export const API_BASE_URL = isLocalhost
  ? configuredApiUrl || LOCAL_API_URL
  : "";

const DIRECT_BACKEND_URL =
  configuredApiUrl && !isLocalhost ? configuredApiUrl : PRODUCTION_API_URL;

function productivityEndpoint() {
  return API_BASE_URL ? `${API_BASE_URL}/api/Productivity` : "/api/productivity";
}

function conversationSaveEndpoint() {
  return API_BASE_URL
    ? `${API_BASE_URL}/api/Conversation/save`
    : `${DIRECT_BACKEND_URL}/api/Conversation/save`;
}

/* =====================================================
   HELPER: NORMALIZE RESPONSE (ROBUST)
===================================================== */
function normalizeResponse(res: ApiResponse<any>) {
  if (res?.data?.message) return res.data.message;
  if (res?.message) return res.message;
  if (res?.data) return res.data;
  return res;
}

/* =====================================================
   HELPER: SAFE FETCH

   No AbortController here.
   AI + Render cold starts can take longer, especially inside embeds.
===================================================== */
async function safeFetch(url: string, options: RequestInit) {
  return fetch(url, {
    ...options,
    cache: "no-store",
  });
}

function fallbackMessage(language: Language, type: "generate" | "compare" | "activity") {
  if (language === "de") {
    if (type === "compare") {
      return "Der Vergleich konnte im Moment nicht erstellt werden. Bitte versuchen Sie es erneut.";
    }
    if (type === "activity") {
      return "Die Workflow-Analyse konnte im Moment nicht erstellt werden. Bitte versuchen Sie es erneut.";
    }
    return "Die Antwort konnte im Moment nicht erstellt werden. Bitte versuchen Sie es erneut.";
  }

  if (type === "compare") return "Unable to generate comparison at the moment.";
  if (type === "activity") return "Unable to generate workflow analysis at the moment.";
  return "Error generating response. Please try again.";
}

/* =====================================================
   GENERATE PRODUCTIVITY
===================================================== */
export async function generateProductivity(
  industry: string,
  description: string,
  language: Language
) {
  try {
    const endpoint = productivityEndpoint();
    console.log("🌍 Productivity endpoint:", endpoint);

    const res = await safeFetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ industry, description, mode: "generate", language }),
    });

    const data: ApiResponse<any> = await res.json();
    console.log("🔥 GENERATE FULL API RESPONSE:", data);

    if (!res.ok) {
      throw new Error(data?.message || "Failed to generate response.");
    }

    return normalizeResponse(data);
  } catch (error: any) {
    console.error("❌ Generate API Error:", error);
    return fallbackMessage(language, "generate");
  }
}

/* =====================================================
   COMPARE INDUSTRY
===================================================== */
export async function compareIndustry(
  industry: string,
  description: string,
  language: Language
) {
  try {
    const endpoint = productivityEndpoint();
    console.log("🌍 Productivity endpoint:", endpoint);

    const res = await safeFetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ industry, description, mode: "compare", language }),
    });

    const data: ApiResponse<any> = await res.json();
    console.log("🔥 COMPARE FULL API RESPONSE:", data);

    if (!res.ok) {
      throw new Error(data?.message || "Failed to compare.");
    }

    return normalizeResponse(data);
  } catch (error: any) {
    console.error("❌ Compare API Error:", error);
    return fallbackMessage(language, "compare");
  }
}

/* =====================================================
   ANALYZE ACTIVITY WORKFLOW
===================================================== */
export async function analyzeActivityWorkflow(
  industry: string,
  description: string,
  activities: Array<{
    title: string;
    hours: string;
    description: string;
    tools: string[];
  }>,
  language: Language
) {
  try {
    const endpoint = productivityEndpoint();
    console.log("🌍 Productivity endpoint:", endpoint);

    const res = await safeFetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        industry,
        description,
        mode: "activity-analysis",
        language,
        activities,
      }),
    });

    const data: ApiResponse<any> = await res.json();
    console.log("🔥 ACTIVITY ANALYSIS FULL API RESPONSE:", data);

    if (!res.ok) {
      throw new Error(data?.message || "Failed to analyze workflow.");
    }

    return normalizeResponse(data);
  } catch (error: any) {
    console.error("❌ Activity Analysis API Error:", error);
    return fallbackMessage(language, "activity");
  }
}

/* =====================================================
   SAVE CONVERSATION  (fires right after generate)
===================================================== */
export async function saveConversation(
  industry: string,
  description: string,
  response: any,
  language: Language,
  title: string
): Promise<string | null> {
  try {
    const auth = getAuth(app);
    const currentUser = auth.currentUser;
    if (!currentUser) return null; // not logged in — skip silently

    const token = await currentUser.getIdToken();
    const endpoint = conversationSaveEndpoint();

    const res = await safeFetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        industry,
        description,
        response: JSON.stringify(response),
        language,
        title,
      }),
    });

    if (!res.ok) {
      console.error("❌ Save conversation failed:", await res.text());
      return null;
    }

    const data = await res.json();
    console.log("✅ Conversation saved:", data);
    return data?.id ?? null;
  } catch (err) {
    console.error("❌ saveConversation error:", err);
    return null;
  }
}

/* =====================================================
   GENERATE CONVERSATION TITLE  (≤5 words via AI)
===================================================== */
export async function generateTitle(
  industry: string,
  description: string,
  language: Language
): Promise<string> {
  try {
    const endpoint = productivityEndpoint();

    const res = await safeFetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ industry, description, mode: "title", language }),
    });

    const data: ApiResponse<any> = await res.json();
    const raw = normalizeResponse(data);
    const title = (typeof raw === "string" ? raw : "")
      .trim()
      .replace(/^"|"$/g, "")
      .slice(0, 60);

    return title || industry;
  } catch {
    return industry;
  }
}