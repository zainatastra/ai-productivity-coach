// services/api.ts

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
  // Case 1: Proper structured backend response
  if (res?.data?.message) return res.data.message;

  // Case 2: Sometimes backend returns direct message
  if (res?.message) return res.message;

  // Case 3: Raw fallback
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
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        industry,
        description,
        mode: "generate",
        language,
      }),
    });

    const data: ApiResponse<any> = await res.json();

    console.log("🔥 GENERATE FULL API RESPONSE:", data);

    if (!res.ok) {
      throw new Error(data?.message || "Failed to generate response.");
    }

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
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        industry,
        description,
        mode: "compare", // ✅ CRITICAL (NOW CORRECT)
        language,
      }),
    });

    const data: ApiResponse<any> = await res.json();

    console.log("🔥 COMPARE FULL API RESPONSE:", data);

    if (!res.ok) {
      throw new Error(data?.message || "Failed to compare.");
    }

    return normalizeResponse(data);
  } catch (error: any) {
    console.error("❌ Compare API Error:", error);
    return "Unable to generate comparison at the moment.";
  }
}