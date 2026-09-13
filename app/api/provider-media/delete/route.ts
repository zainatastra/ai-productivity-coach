import { del } from "@vercel/blob";
import { NextResponse } from "next/server";

type DeleteBody = {
  pathname?: string;
};

export async function POST(request: Request): Promise<NextResponse> {
  const expectedSecret = process.env.VERCEL_MEDIA_INTERNAL_SECRET;
  const suppliedSecret = request.headers.get("x-media-internal-secret");

  if (!expectedSecret || !suppliedSecret || suppliedSecret !== expectedSecret) {
    return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  }

  let body: DeleteBody;

  try {
    body = (await request.json()) as DeleteBody;
  } catch {
    return NextResponse.json({ message: "Invalid request body." }, { status: 400 });
  }

  const pathname = body.pathname?.trim() || "";

  if (!pathname || !pathname.startsWith("providers/") || pathname.includes("..")) {
    return NextResponse.json({ message: "Invalid Blob pathname." }, { status: 400 });
  }

  try {
    await del(pathname);
    return NextResponse.json({ success: true, pathname });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Blob deletion failed.";

    if (message.toLowerCase().includes("not found")) {
      return NextResponse.json(
        { success: true, pathname, alreadyMissing: true },
        { status: 200 }
      );
    }

    return NextResponse.json({ message }, { status: 500 });
  }
}
