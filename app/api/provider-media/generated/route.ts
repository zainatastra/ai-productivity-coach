import { put } from "@vercel/blob";
import { NextResponse } from "next/server";

type GeneratedBody = {
  pathname?: string;
  contentType?: string;
  dataBase64?: string;
};

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 3_500_000;

// Server-to-server only: the .NET backend stores AI-generated images here.
export async function POST(request: Request): Promise<NextResponse> {
  const expectedSecret = process.env.VERCEL_MEDIA_INTERNAL_SECRET;
  const suppliedSecret = request.headers.get("x-media-internal-secret");

  if (!expectedSecret || !suppliedSecret || suppliedSecret !== expectedSecret) {
    return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  }

  let body: GeneratedBody;

  try {
    body = (await request.json()) as GeneratedBody;
  } catch {
    return NextResponse.json({ message: "Invalid request body." }, { status: 400 });
  }

  const pathname = body.pathname?.trim() || "";
  const contentType = body.contentType?.trim() || "";

  if (
    !pathname ||
    !pathname.startsWith("providers/") ||
    !pathname.includes("/ai-content/") ||
    pathname.includes("..")
  ) {
    return NextResponse.json({ message: "Invalid Blob pathname." }, { status: 400 });
  }

  if (!ALLOWED_TYPES.includes(contentType) || !body.dataBase64) {
    return NextResponse.json({ message: "Invalid image." }, { status: 400 });
  }

  const bytes = Buffer.from(body.dataBase64, "base64");

  if (bytes.length === 0 || bytes.length > MAX_BYTES) {
    return NextResponse.json({ message: "Image size is not allowed." }, { status: 400 });
  }

  try {
    const blob = await put(pathname, bytes, {
      access: "public",
      contentType,
      addRandomSuffix: false,
      allowOverwrite: false,
    });

    return NextResponse.json({ url: blob.url, pathname: blob.pathname });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Blob upload failed.";
    return NextResponse.json({ message }, { status: 500 });
  }
}
