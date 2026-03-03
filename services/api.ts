// services/api.ts

type Language = "en" | "de";

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
}

/* =====================================================
   GENERATE PRODUCTIVITY
===================================================== */
export async function generateProductivity(
  industry: string,
  description: string,
  language: Language
) {
  const res = await fetch("/api/productivity", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      industry,
      description,
      mode: "generate",
      language, // 🔥 PASS LANGUAGE
    }),
  });

  const data: ApiResponse<any> = await res.json();

  if (!res.ok || !data.success) {
    throw new Error(
      data.message || "Failed to generate productivity response."
    );
  }

  return data.data;
}

/* =====================================================
   COMPARE INDUSTRY
===================================================== */
export async function compareIndustry(
  industry: string,
  description: string,
  language: Language
) {
  const res = await fetch("/api/productivity", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      industry,
      description,
      mode: "compare",
      language, // 🔥 PASS LANGUAGE
    }),
  });

  const data: ApiResponse<any> = await res.json();

  if (!res.ok || !data.success) {
    throw new Error(
      data.message || "Failed to generate comparison response."
    );
  }

  return data.data;
}