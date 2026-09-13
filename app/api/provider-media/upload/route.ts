import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";

type ClientPayload = {
  firebaseToken: string;
  companyId: string;
  scope: "company" | "resource";
  slot: string;
  resourceType?: string;
  resourceId?: string;
  pathname: string;
  contentType: string;
  size: number;
};

const getBackendUrl = () => {
  const configured =
    process.env.MEDIA_BACKEND_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    process.env.NEXT_PUBLIC_API_BASE_URL ||
    (process.env.NODE_ENV === "development"
      ? "http://localhost:5048"
      : "");

  return configured.replace(/\/+$/, "");
};

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = (await request.json()) as HandleUploadBody;

    const jsonResponse = await handleUpload({
      body,
      request,

      onBeforeGenerateToken: async (pathname, clientPayload) => {
        if (!clientPayload) {
          throw new Error(
            "Missing provider-media authorization payload."
          );
        }

        let payload: ClientPayload;

        try {
          payload = JSON.parse(clientPayload) as ClientPayload;
        } catch {
          throw new Error(
            "Invalid provider-media authorization payload."
          );
        }

        const backendUrl = getBackendUrl();

        if (!backendUrl) {
          throw new Error(
            "Provider media backend URL is not configured."
          );
        }

        if (
          !payload.firebaseToken ||
          !payload.companyId ||
          !payload.scope ||
          !payload.slot ||
          !payload.pathname ||
          !payload.contentType ||
          !payload.size
        ) {
          throw new Error(
            "Incomplete provider-media authorization payload."
          );
        }

        if (pathname !== payload.pathname) {
          throw new Error(
            "Upload pathname does not match the authorized request."
          );
        }

        const authorization = await fetch(
          `${backendUrl}/api/company/${encodeURIComponent(
            payload.companyId
          )}/media/authorize`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${payload.firebaseToken}`,
            },
            body: JSON.stringify({
              scope: payload.scope,
              slot: payload.slot,
              resourceType: payload.resourceType || "",
              resourceId: payload.resourceId || "",
              pathname: payload.pathname,
              contentType: payload.contentType,
              size: payload.size,
            }),
            cache: "no-store",
          }
        );

        const authorizationBody = await authorization
          .json()
          .catch(() => null);

        if (!authorization.ok) {
          throw new Error(
            authorizationBody?.message ||
              `Media upload authorization failed with status ${authorization.status}.`
          );
        }

        return {
          allowedContentTypes:
            authorizationBody.allowedContentTypes,
          maximumSizeInBytes:
            authorizationBody.maximumSizeInBytes,
          addRandomSuffix: false,
          allowOverwrite: false,
          cacheControlMaxAge: 31536000,
          validUntil: Date.now() + 15 * 60 * 1000,
        };
      },

      onUploadCompleted: async () => {},
    });

    return NextResponse.json(jsonResponse);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Media upload failed.";

    console.error(
      "[Provider Media Upload Route]",
      message,
      error
    );

    return NextResponse.json(
      { error: message },
      { status: 400 }
    );
  }
}