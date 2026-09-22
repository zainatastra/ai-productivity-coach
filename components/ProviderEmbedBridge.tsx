"use client";

import { useEffect, useRef, useState } from "react";
import Header from "@/components/Header";
import { useLanguage } from "@/services/LanguageContext";

type ProviderEmbedMessage = {
  type: "ey-eric-providers:ready" | "ey-eric-providers:resize";
  height: number;
  path: string;
};

const EMBED_BODY_CLASS = "ey-eric-providers-embedded";

/**
 * Keeps the public provider routes usable both as normal EY-ERIC pages and as
 * a seamless WordPress embed. The parent WordPress plugin validates the sender
 * origin before accepting these messages.
 */
export default function ProviderEmbedBridge() {
  const { setLanguage } = useLanguage();
  const [isEmbedded, setIsEmbedded] = useState<boolean | null>(null);
  const frameRef = useRef<number | null>(null);
  const setLanguageRef = useRef(setLanguage);

  useEffect(() => {
    setLanguageRef.current = setLanguage;
  }, [setLanguage]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const embedded =
      window.self !== window.top || params.get("embed") === "wordpress";
    const requestedLanguage = params.get("lang");
    const detectionTimer = window.setTimeout(() => setIsEmbedded(embedded), 0);

    if (!embedded) {
      return () => window.clearTimeout(detectionTimer);
    }

    document.body.classList.add(EMBED_BODY_CLASS);

    if (requestedLanguage === "de" || requestedLanguage === "en") {
      setLanguageRef.current(requestedLanguage);
    }

    const targetOrigin = (() => {
      try {
        return document.referrer ? new URL(document.referrer).origin : "*";
      } catch {
        return "*";
      }
    })();

    const sendSize = (
      type: ProviderEmbedMessage["type"] = "ey-eric-providers:resize"
    ) => {
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
      }

      frameRef.current = window.requestAnimationFrame(() => {
        const height = Math.ceil(
          Math.max(
            document.body.scrollHeight,
            document.body.offsetHeight,
            document.documentElement.scrollHeight
          )
        );

        const message: ProviderEmbedMessage = {
          type,
          height,
          path: `${window.location.pathname}${window.location.search}${window.location.hash}`,
        };

        window.parent.postMessage(message, targetOrigin);
      });
    };

    const resizeObserver = new ResizeObserver(() => sendSize());
    resizeObserver.observe(document.body);

    const mutationObserver = new MutationObserver(() => sendSize());
    mutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });

    const handleLoad = () => sendSize();
    window.addEventListener("load", handleLoad, true);
    sendSize("ey-eric-providers:ready");

    return () => {
      window.clearTimeout(detectionTimer);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      window.removeEventListener("load", handleLoad, true);
      document.body.classList.remove(EMBED_BODY_CLASS);

      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
      }
    };
  }, []);

  // Avoid briefly rendering the EY-ERIC application header inside WordPress
  // while the browser determines whether this page is framed.
  if (isEmbedded === null || isEmbedded) return null;

  return <Header />;
}
