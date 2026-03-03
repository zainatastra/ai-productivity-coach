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
     BUILD NEW GENERATE TEXT
  ============================ */

  const buildGenerateText = (data: any) => {
    if (!data) return "";

    let text = "";

    if (data.industry) {
      text += `INDUSTRY\n${data.industry}\n\n`;
    }

    if (data.work_field) {
      text += `WORK FIELD\n${data.work_field}\n\n`;
    }

    if (data.reasoning?.length) {
      text += `WHY THIS WORK FIELD\n`;
      data.reasoning.forEach((item: string) => {
        text += `• ${item}\n`;
      });
    }

    return text;
  };

  /* ===========================
     RESET WHEN CLEARED
  ============================ */

  useEffect(() => {
    if (!response) {
      setTypedContent("");
    }
  }, [response]);

  /* ===========================
     TYPING ANIMATION
  ============================ */

  useEffect(() => {
    if (!response || mode !== "generate") return;

    const fullText = buildGenerateText(response);

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
  }, [response, mode, isRestored]);

  /* ===========================
     PARSE BOLD TEXT (**text**)
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
    className="
      relative
      order-1 lg:order-2
      bg-white
      p-0
      rounded-2xl
      shadow-lg
      border border-gray-200
      h-full
      flex flex-col
      overflow-hidden
    "
    style={{
      WebkitTextSizeAdjust: "100%",
      WebkitFontSmoothing: "antialiased",
      color: "#000000",
    }}
  >
    <div
      ref={containerRef}
      className="flex-1 overflow-y-auto p-6"
    >

  {/* ================= HEADER AREA ================= */}
  {!response && !loading && (
    <div className="text-base font-semibold text-black">
      AI Response
    </div>
  )}

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
  {!loading && mode === "generate" && typedContent && (
    <div>
      {typedContent.split("\n").map((line, index) => {
        const isHeading =
          line === "INDUSTRY" ||
          line === "WORK FIELD" ||
          line === "WHY THIS WORK FIELD";

        const isBullet = line.startsWith("•");

        if (isHeading) {
          return (
            <p
              key={index}
              className={`text-lg font-bold text-black ${index === 0 ? "" : "mt-5"}`}
            >
              {line}
            </p>
          );
        }

        if (isBullet) {
          return (
            <p
              key={index}
              className="text-sm mt-2 leading-relaxed text-black"
            >
              • {renderWithBold(line.replace("• ", ""))}
            </p>
          );
        }

        return (
          <p
            key={index}
            className="text-sm mt-2 leading-relaxed text-black"
          >
            {renderWithBold(line)}
          </p>
        );
      })}
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