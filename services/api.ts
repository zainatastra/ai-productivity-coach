// services/api.ts

import { getAuth } from "firebase/auth";
import { app } from "@/services/firebase";

type Language = "en" | "de";

interface ApiResponse<T> {
  success?: boolean;
  data?: T;
  message?: string;
}

/* =====================================================
   BASE URL — LOCAL + PRODUCTION + WORDPRESS EMBED SAFE
===================================================== */
const isBrowser = typeof window !== "undefined";

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  (isBrowser && window.location.hostname.includes("localhost")
    ? "http://localhost:5048"
    : "https://ai-productivity-coach-mlnn.onrender.com");

/* =====================================================
   FETCH WITH TIMEOUT — PREVENTS INFINITE LOADING
===================================================== */
const FETCH_TIMEOUT_MS = 45000;

async function fetchWithTimeout(url: string, options: RequestInit) {
  const controller = new AbortController();

  const timeout = setTimeout(() => {
    controller.abort();
  }, FETCH_TIMEOUT_MS);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

/* =====================================================
   HELPER: NORMALIZE RESPONSE (ROBUST)
===================================================== */
function normalizeResponse(res: ApiResponse<any>) {
  if (res?.data?.message) return res.data.message;
  if (res?.message) return res.message;
  return res;
}

function fallbackMessage(language: Language, type: "generate" | "compare" | "activity") {
  if (language === "de") {
    if (type === "compare") return "Der Vergleich konnte im Moment nicht erstellt werden. Bitte versuchen Sie es erneut.";
    if (type === "activity") return "Die Workflow-Analyse konnte im Moment nicht erstellt werden. Bitte versuchen Sie es erneut.";
    return "Die Antwort konnte nicht erstellt werden. Bitte versuchen Sie es erneut.";
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
    const res = await fetchWithTimeout(`${API_BASE_URL}/api/Productivity`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ industry, description, mode: "generate", language }),
    });

    const data: ApiResponse<any> = await res.json();
    console.log("🔥 GENERATE FULL API RESPONSE:", data);

    if (!res.ok) throw new Error(data?.message || "Failed to generate response.");

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
    const res = await fetchWithTimeout(`${API_BASE_URL}/api/Productivity`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ industry, description, mode: "compare", language }),
    });

    const data: ApiResponse<any> = await res.json();
    console.log("🔥 COMPARE FULL API RESPONSE:", data);

    if (!res.ok) throw new Error(data?.message || "Failed to compare.");

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
    const res = await fetchWithTimeout(`${API_BASE_URL}/api/Productivity`, {
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

    if (!res.ok) throw new Error(data?.message || "Failed to analyze workflow.");

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

    const res = await fetchWithTimeout(`${API_BASE_URL}/api/Conversation/save`, {
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
        title, // ✅ pass AI-generated title
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
    const res = await fetchWithTimeout(`${API_BASE_URL}/api/Productivity`, {
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
    return industry; // fallback to industry name
  }
}