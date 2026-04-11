"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useRef, useState } from "react";

interface Props {
  response: any;
  loading: boolean;
  industry: string;
  description: string;
  mode: "generate" | "compare" | null;
  isRestored: boolean;
  setShowClearModal: (value: boolean) => void;
  isGuest?: boolean;
}

export default function ResponseSection({
  response,
  loading,
  mode,
  isRestored,
}: Props) {
  const [typedContent, setTypedContent] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  /* ===========================
     BUILD GENERATE TEXT (FINAL FIX)
  ============================ */
  const buildGenerateText = (data: any): string => {
    if (!data) return "";

    // unwrap nested responses safely
    if (data?.data) return buildGenerateText(data.data);
    if (data?.result) return buildGenerateText(data.result);

    // structured future response
    if (data.industry || data.work_field || data.reasoning) {
      let text = "";

      if (data.industry) {
        text += `INDUSTRY\n${data.industry}\n\n`;
      }

      if (data.work_field) {
        text += `WORK FIELD\n${data.work_field}\n\n`;
      }

      if (Array.isArray(data.reasoning)) {
        text += `WHY THIS WORK FIELD\n`;
        data.reasoning.forEach((item: string) => {
          text += `• ${item}\n`;
        });
      }

      return text.trim();
    }

    // 🔥 IMPORTANT: current backend response
    if (typeof data?.message === "string") {
      return data.message;
    }

    // fallback string
    if (typeof data === "string") return data;

    return "";
  };

  /* ===========================
     RESET
  ============================ */
  useEffect(() => {
    if (!response) {
      setTypedContent("");
    }
  }, [response]);

  /* ===========================
     TYPING ANIMATION (FIXED)
  ============================ */
  useEffect(() => {
    if (!response) return;

    const fullText = buildGenerateText(response);

    // 🔥 CRITICAL FIX: prevent empty rendering
    if (!fullText) {
      setTypedContent("No response generated.");
      return;
    }

    // restored → no animation
    if (isRestored) {
      setTypedContent(fullText);
      return;
    }

    setTypedContent("");

    let index = 0;

    const interval = setInterval(() => {
      index++;

      setTypedContent(fullText.slice(0, index));

      if (containerRef.current) {
        containerRef.current.scrollTop =
          containerRef.current.scrollHeight;
      }

      if (index >= fullText.length) {
        clearInterval(interval);
      }
    }, 8);

    return () => clearInterval(interval);
  }, [response, isRestored]);

  /* ===========================
     PARSE BOLD TEXT
  ============================ */
  const renderWithBold = (text: string) => {
    const parts = text.split(/(\*\*.*?\*\*)/g);

    return parts.map((part, index) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return (
          <span key={index} className="font-semibold text-black">
            {part.replace(/\*\*/g, "")}
          </span>
        );
      }
      return <span key={index}>{part}</span>;
    });
  };

  /* ===========================
     SAFE ACTIVITY EXTRACTION
  ============================ */
  const activities =
    response?.activities ||
    response?.weekly_distribution ||
    response?.tasks ||
    [];

  const validActivities = Array.isArray(activities)
    ? activities.map((item: any) => ({
        title:
          item.title ||
          item.task ||
          item.name ||
          item.activity ||
          "Activity",
        hours:
          item.hours ||
          item.time ||
          item.duration ||
          item.range ||
          "",
      }))
    : [];

  /* ===========================
     RENDER
  ============================ */
  return (
    <div
      className="relative order-1 lg:order-2 bg-white rounded-2xl shadow-lg border border-gray-200 h-full flex flex-col overflow-hidden"
      style={{
        WebkitTextSizeAdjust: "100%",
        WebkitFontSmoothing: "antialiased",
        color: "#000000",
      }}
    >
      <div ref={containerRef} className="flex-1 overflow-y-auto p-6">

        {/* HEADER */}
        {!response && !loading && (
          <div className="text-base font-semibold text-black">
            AI Response
          </div>
        )}

        {/* LOADING */}
        {loading && (
          <div className="flex items-center gap-2">
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                className="w-3 h-3 bg-[#78D1F5] rounded-full"
                animate={{
                  scale: [1, 1.4, 1],
                  opacity: [0.6, 1, 0.6],
                }}
                transition={{
                  duration: 0.8,
                  repeat: Infinity,
                  delay: i * 0.2,
                }}
              />
            ))}
          </div>
        )}

        {/* ================= GENERATED CONTENT ================= */}
        {response && (
          <div>
            {typedContent ? (
              typedContent.split("\n").map((line, index) => {
                const isHeading =
  line.toLowerCase().includes("industry") ||
  line.toLowerCase().includes("work field") ||
  line.toLowerCase().includes("description");

                const isBullet = line.startsWith("-") || line.startsWith("•");

                if (isHeading) {
                  return (
<p
  key={index}
  className={`text-xl font-bold text-black ${
    index === 0 ? "" : "mt-6"
  }`}
>
  {renderWithBold(line)}
</p>
                  );
                }

                if (isBullet) {
                  return (
                    <p
                      key={index}
                      className="text-[15px] mt-3 leading-relaxed text-black"
                    >
                      • {renderWithBold(line.replace(/^[-•]\s*/, ""))}
                    </p>
                  );
                }

                return (
                  <p
                    key={index}
                    className="text-[15px] mt-3 leading-relaxed text-black"
                  >
                    {renderWithBold(line)}
                  </p>
                );
              })
            ) : (
              <p className="text-sm text-gray-400">
                Thinking...
              </p>
            )}
          </div>
        )}

        {/* ================= COMPARE MODE ================= */}
        {!loading &&
          mode === "compare" &&
          response &&
          validActivities.length > 0 && (
            <div>
              <h2 className="text-lg font-bold text-black">
                Weekly Work Distribution (40 Hours)
              </h2>

              <p className="text-sm text-black mb-4">
                Estimated Weekly Hours:{" "}
                <span className="font-semibold">40 hrs</span>
              </p>

              <div className="space-y-3">
                {validActivities.map((item, index) => (
                  <div
                    key={index}
                    className="flex justify-between items-center bg-gray-100 px-4 py-3 rounded-lg"
                  >
                    <span className="font-medium text-black">
                      {item.title}
                    </span>

                    <span className="text-black font-medium">
                      {item.hours} hrs / week
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
      </div>
    </div>
  );
}

/* ===========================
   THINKING DOTS
============================ */

function ThinkingDots() {
  return (
    <div className="flex gap-2">
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          className="w-3 h-3 bg-[#78D1F5] rounded-full"
          animate={{
            scale: [1, 1.4, 1],
            opacity: [0.6, 1, 0.6],
          }}
          transition={{
            duration: 0.8,
            repeat: Infinity,
            delay: i * 0.2,
          }}
        />
      ))}
    </div>
  );
}