import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DEFAULT_RENDER_API_URL = "https://ai-productivity-coach-mlnn.onrender.com";

function getBackendBaseUrl() {
  return (
    process.env.RENDER_API_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    DEFAULT_RENDER_API_URL
  ).replace(/\/$/, "");
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    if (!body?.industry || !body?.description || !body?.mode) {
      return NextResponse.json(
        { success: false, message: "Missing required fields." },
        { status: 400 }
      );
    }

    const backendBaseUrl = getBackendBaseUrl();

    const backendResponse = await fetch(`${backendBaseUrl}/api/Productivity`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });

    const responseText = await backendResponse.text();

    let responseData: any;
    try {
      responseData = responseText
        ? JSON.parse(responseText)
        : { success: false, message: "Empty backend response." };
    } catch {
      responseData = {
        success: false,
        message: responseText || "Invalid backend response.",
      };
    }

    return NextResponse.json(responseData, {
      status: backendResponse.status,
    });
  } catch (error: any) {
    console.error("Productivity proxy error:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Unable to reach productivity backend.",
      },
      { status: 500 }
    );
  }
}