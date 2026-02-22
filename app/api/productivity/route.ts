import OpenAI from "openai";
import { NextResponse } from "next/server";

/**
 * Force dynamic execution.
 * Prevents Vercel from trying to pre-render or analyze at build time.
 */
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    /* ===========================
       ENV VALIDATION
    ============================ */

    if (!process.env.OPENAI_API_KEY) {
      console.error("OPENAI_API_KEY is missing");
      return NextResponse.json(
        { success: false, message: "Server configuration error." },
        { status: 500 }
      );
    }

    /* ===========================
       CREATE OPENAI INSTANCE
       (INSIDE HANDLER ONLY)
    ============================ */

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const { industry, description, mode } = await req.json();

    if (!industry || !description || !mode) {
      return NextResponse.json(
        { success: false, message: "Missing required fields." },
        { status: 400 }
      );
    }

    let prompt = "";

    /* ===========================
       GENERATE MODE
    ============================ */

    if (mode === "generate") {
      prompt = `
You are a senior productivity consultant.

Industry: ${industry}
Job Description: ${description}

Return ONLY valid JSON:

{
  "summary": "80-100 word overview",
  "improvements": ["4-5 actionable improvements"],
  "daily_plan": ["4-5 daily execution steps"],
  "growth_tips": ["4-5 long-term strategies"]
}

No markdown. No explanation. JSON only.
`;
    }

    /* ===========================
       COMPARE MODE
    ============================ */

    if (mode === "compare") {
      prompt = `
You are an expert workforce planning strategist.

Industry: ${industry}
Job Description: ${description}

Create a realistic weekly workload distribution.

Rules:
- Total must equal exactly 40 hours.
- 5-9 intelligent activities.
- Industry-specific.
- Professional wording.
- Balanced workload.

Return ONLY valid JSON:

{
  "activities": [
    { "title": "Activity Name", "hours": "X - Y" }
  ]
}

No markdown.
No explanation.
JSON only.
`;
    }

    /* ===========================
       OPENAI CALL
    ============================ */

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You strictly return clean JSON only. No markdown. No explanations.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.7,
    });

    const raw = completion.choices[0]?.message?.content || "";

    /* ===========================
       SAFE JSON EXTRACTION
    ============================ */

    const jsonMatch = raw.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      console.error("Invalid JSON:", raw);
      return NextResponse.json(
        { success: false, message: "AI returned invalid JSON." },
        { status: 500 }
      );
    }

    let parsed;

    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch (err) {
      console.error("JSON Parse Error:", raw);
      return NextResponse.json(
        { success: false, message: "Failed to parse AI response." },
        { status: 500 }
      );
    }

    /* ===========================
       SAFETY FALLBACK (COMPARE)
    ============================ */

    if (mode === "compare") {
      if (!parsed.activities || !Array.isArray(parsed.activities)) {
        parsed.activities = [
          { title: "Core Responsibilities", hours: "15 - 18" },
          { title: "Collaboration & Meetings", hours: "4 - 6" },
          { title: "Planning & Strategy", hours: "4 - 6" },
          { title: "Execution & Delivery", hours: "8 - 10" },
          { title: "Learning & Development", hours: "2 - 4" }
        ];
      }
    }

    return NextResponse.json({
      success: true,
      data: parsed,
    });

  } catch (error) {
    console.error("API Error:", error);

    return NextResponse.json(
      { success: false, message: "Internal server error." },
      { status: 500 }
    );
  }
}