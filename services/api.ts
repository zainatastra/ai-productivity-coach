// services/api.ts

import { getAuth } from "firebase/auth";
import { app } from "@/services/firebase";

type Language = "en" | "de";

interface ApiResponse<T> {
  success?: boolean;
  data?: T;
  message?: string;
}

// ✅ BASE URL (LOCAL + PRODUCTION SAFE)
export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:5048";

/* =====================================================
   HELPER: NORMALIZE RESPONSE (ROBUST)
===================================================== */
function normalizeResponse(res: ApiResponse<any>) {
  if (res?.data?.message) return res.data.message;
  if (res?.message)       return res.message;
  return res;
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
    const res = await fetch(`${API_BASE_URL}/api/Productivity`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ industry, description, mode: "generate", language }),
    });

    const data: ApiResponse<any> = await res.json();
    console.log("🔥 GENERATE FULL API RESPONSE:", data);

    if (!res.ok) throw new Error(data?.message || "Failed to generate response.");

    return normalizeResponse(data);
  } catch (error: any) {
    console.error("❌ Generate API Error:", error);
    return "Error generating response. Please try again.";
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
    const res = await fetch(`${API_BASE_URL}/api/Productivity`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ industry, description, mode: "compare", language }),
    });

    const data: ApiResponse<any> = await res.json();
    console.log("🔥 COMPARE FULL API RESPONSE:", data);

    if (!res.ok) throw new Error(data?.message || "Failed to compare.");

    return normalizeResponse(data);
  } catch (error: any) {
    console.error("❌ Compare API Error:", error);
    return "Unable to generate comparison at the moment.";
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
    const auth        = getAuth(app);
    const currentUser = auth.currentUser;
    if (!currentUser) return null;                     // not logged in — skip silently

    const token = await currentUser.getIdToken();

    const res = await fetch(`${API_BASE_URL}/api/Conversation/save`, {
      method:  "POST",
      headers: {
        "Content-Type":  "application/json",
        Authorization:   `Bearer ${token}`,
      },
      body: JSON.stringify({
        industry,
        description,
        response: JSON.stringify(response),
        language,
        title,                                          // ✅ pass AI-generated title
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
    const res = await fetch(`${API_BASE_URL}/api/Productivity`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ industry, description, mode: "title", language }),
    });

    const data: ApiResponse<any> = await res.json();
    const raw = normalizeResponse(data);
    const title = (typeof raw === "string" ? raw : "").trim().replace(/^"|"$/g, "").slice(0, 60);
    return title || industry;
  } catch {
    return industry;                                    // fallback to industry name
  }
}
