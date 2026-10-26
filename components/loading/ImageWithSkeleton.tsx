"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Skeleton } from "./Skeleton";

type Props = {
  src: string;
  alt: string;
  className?: string;
  fallback: ReactNode;
  priority?: boolean;
};

/** A new URL starts a new loading lifecycle, including when React reuses a card. */
export function ImageWithSkeleton(props: Props) {
  return <ImageLoad key={props.src} {...props} />;
}

function ImageLoad({ src, alt, className = "", fallback, priority = false }: Props) {
  const imageRef = useRef<HTMLImageElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    const image = imageRef.current;
    if (!image) return;
    let cancelled = false;
    const fail = () => { if (!cancelled) setStatus("error"); };
    const reveal = async () => {
      try {
        // load alone does not guarantee the browser has decoded the pixels yet.
        await image.decode();
        if (!cancelled) setStatus(image.naturalWidth > 0 ? "ready" : "error");
      } catch {
        fail();
      }
    };
    image.addEventListener("load", reveal);
    image.addEventListener("error", fail);
    // Cached images can finish before hydration attaches the listeners.
    if (image.complete) void reveal();
    return () => {
      cancelled = true;
      image.removeEventListener("load", reveal);
      image.removeEventListener("error", fail);
    };
  }, []);

  return (
    <div className={className} aria-busy={status === "loading"}>
      {status === "loading" && (
        <Skeleton style={{ position: "absolute", width: "72%", height: "55%" }} />
      )}
      {status === "error" ? fallback : (
        // Keep arbitrary provider-hosted URLs compatible with the existing media flow.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          ref={imageRef}
          src={src}
          alt={alt}
          decoding="async"
          loading="eager"
          fetchPriority={priority ? "high" : "auto"}
          style={{ opacity: status === "ready" ? 1 : 0 }}
        />
      )}
    </div>
  );
}
