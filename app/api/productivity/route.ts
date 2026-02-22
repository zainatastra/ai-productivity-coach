import OpenAI from "openai";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is missing");
    }

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

    if (mode === "generate") {
      prompt = `
You are a professional productivity consultant.

User Industry: ${industry}
User Description: ${description}

Return ONLY valid JSON:

{
  "summary": "80-100 words",
  "improvements": ["4-5 items"],
  "daily_plan": ["4-5 items"],
  "growth_tips": ["4-5 items"]
}
`;
    }

    if (mode === "compare") {
      prompt = `
You are a professional workforce productivity analyst.

User Industry: ${industry}
User Description: ${description}

Create a realistic weekly workload distribution for a 40-hour work week.

Return ONLY valid JSON:

{
  "weekly_distribution": [
    { "activity": "Task Name", "min_hours": 4, "max_hours": 6 }
  ],
  "total_estimated_hours": 40
}
`;
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are a strict JSON-only generator. Return clean JSON only.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.7,
    });

    const raw = completion.choices[0]?.message?.content || "";

    const parsed = JSON.parse(raw);

    return NextResponse.json({
      success: true,
      data: parsed,
    });
  } catch (error: any) {
    console.error("API Error:", error);

    return NextResponse.json(
      { success: false, message: error.message },
      { status: 500 }
    );
  }
}