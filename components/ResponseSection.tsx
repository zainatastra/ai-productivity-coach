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
  setShowClearModal,
}: Props) {
  const [typedContent, setTypedContent] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  const buildGenerateText = (data: any) => {
    if (!data) return "";

    let text = "";

    if (data.summary) text += `SUMMARY\n${data.summary}\n\n`;

    if (data.improvements?.length) {
      text += `KEY IMPROVEMENTS\n`;
      data.improvements.forEach((item: string) => {
        text += `• ${item}\n`;
      });
      text += "\n";
    }

    if (data.daily_plan?.length) {
      text += `DAILY PLAN\n`;
      data.daily_plan.forEach((item: string) => {
        text += `• ${item}\n`;
      });
      text += "\n";
    }

    if (data.growth_tips?.length) {
      text += `GROWTH TIPS\n`;
      data.growth_tips.forEach((item: string) => {
        text += `• ${item}\n`;
      });
    }

    return text;
  };

  /* Reset when response cleared */
  useEffect(() => {
    if (!response) {
      setTypedContent("");
    }
  }, [response]);

  /* Typing Animation */
  useEffect(() => {
    if (!response || mode !== "generate") return;

    const fullText = buildGenerateText(response);

    // Only skip animation if restoring AND no typing yet
    if (isRestored && typedContent === "") {
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
  }, [response, mode]); // removed isRestored dependency

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

  return (
    <div className="relative order-1 lg:order-2 bg-white pt-4 pb-4 px-4 lg:p-8 rounded-2xl shadow-lg border border-gray-200 h-full flex flex-col overflow-hidden">
      <button
        onClick={() => setShowClearModal(true)}
        className="absolute top-4 right-4 text-sm border border-red-500 text-red-500 px-3 py-1 rounded-lg hover:bg-red-50 transition"
      >
        Clear
      </button>

      <div ref={containerRef} className="flex-1 overflow-y-auto">
        {!loading && !response && (
          <div className="text-base font-semibold text-gray-400">
            AI Response
          </div>
        )}

        <AnimatePresence>
          {loading && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="mt-2 ml-1"
            >
              <ThinkingDots />
            </motion.div>
          )}
        </AnimatePresence>

        {!loading && mode === "generate" && typedContent && (
          <div>
            {typedContent.split("\n").map((line, index) => {
              const isHeading =
                line === "SUMMARY" ||
                line === "KEY IMPROVEMENTS" ||
                line === "DAILY PLAN" ||
                line === "GROWTH TIPS";

              return (
                <p
                  key={index}
                  className={
                    isHeading
                      ? index === 0
                        ? "text-base font-bold"
                        : "text-base font-bold mt-5"
                      : "text-sm mt-1 leading-relaxed"
                  }
                >
                  {line}
                </p>
              );
            })}
          </div>
        )}

        {!loading &&
          mode === "compare" &&
          response &&
          validActivities.length > 0 && (
            <div>
              <h2 className="text-lg font-bold">
                Weekly Work Distribution (40 Hours)
              </h2>
              <p className="text-sm text-gray-500 mb-4">
                Estimated Weekly Hours:{" "}
                <span className="font-semibold">40 hrs</span>
              </p>

              <div className="space-y-3">
                {validActivities.map((item, index) => (
                  <div
                    key={index}
                    className="flex justify-between items-center bg-gray-100 px-4 py-3 rounded-lg"
                  >
                    <span className="font-medium text-gray-800">
                      {item.title}
                    </span>
                    <span className="text-gray-600 font-medium">
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