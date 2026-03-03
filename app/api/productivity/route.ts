import OpenAI from "openai";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      console.error("OPENAI_API_KEY is missing");
      return NextResponse.json(
        { success: false, message: "Server configuration error." },
        { status: 500 }
      );
    }

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const { industry, description, mode, language } =
      await req.json();

    if (!industry || !description || !mode) {
      return NextResponse.json(
        { success: false, message: "Missing required fields." },
        { status: 400 }
      );
    }

    const selectedLanguage = language === "de" ? "de" : "en";

    const languageInstruction =
      selectedLanguage === "de"
        ? "Respond entirely in German language."
        : "Respond entirely in English language.";

    let prompt = "";

    /* ===========================
       GENERATE MODE (ENHANCED)
    ============================ */

    if (mode === "generate") {
      prompt = `
You are a senior AI workforce intelligence analyst with deep industry expertise.

User Industry Input: ${industry}
User Description: ${description}

${languageInstruction}

OBJECTIVE:

1. Clearly identify the correct Industry.
2. Identify the specific Work Field within that industry.
3. Provide a detailed professional explanation of that work field.
4. Provide analytical reasoning explaining WHY this conclusion was reached,
   strictly based on terminology, responsibilities, signals, and keywords
   found in the user's description.

STRICT QUALITY RULES:

- The work_field explanation MUST be between 150–250 words.
- It must contain multiple structured paragraphs.
- Each reasoning bullet must be minimum 25 words.
- Provide at least 4 reasoning bullet points.
- Be analytical and professional.
- Do not be generic.
- Highlight important keywords using **double asterisks**.
- Do NOT use markdown headings.
- Do NOT include emojis.
- Do NOT include extra commentary.
- Return clean JSON only.

Return ONLY valid JSON in this format:

{
  "industry": "Clear industry classification",
  "work_field": "Detailed multi-paragraph professional explanation (150-250 words minimum)",
  "reasoning": [
    "Detailed analytical explanation with **bold keywords** (25+ words)",
    "Detailed analytical explanation with **bold keywords** (25+ words)",
    "Detailed analytical explanation with **bold keywords** (25+ words)",
    "Detailed analytical explanation with **bold keywords** (25+ words)"
  ]
}

JSON only.
`;
    }

    /* ===========================
       COMPARE MODE (UNCHANGED)
    ============================ */

    if (mode === "compare") {
      prompt = `
You are an expert workforce planning strategist.

Industry: ${industry}
Job Description: ${description}

${languageInstruction}

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

JSON only.
`;
    }

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
      temperature: 0.6,
      max_tokens: 900,
    });

    const raw = completion.choices[0]?.message?.content || "";

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
    } catch {
      console.error("JSON Parse Error:", raw);
      return NextResponse.json(
        { success: false, message: "Failed to parse AI response." },
        { status: 500 }
      );
    }

    /* ===========================
       SAFETY FALLBACKS
    ============================ */

    if (mode === "generate") {
      if (!parsed.industry) parsed.industry = industry;
      if (!parsed.work_field) parsed.work_field = "Detailed analysis unavailable.";
      if (!Array.isArray(parsed.reasoning)) parsed.reasoning = [];
    }

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