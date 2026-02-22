"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import InputSection from "../components/InputSection";
import ResponseSection from "../components/ResponseSection";

export default function Home() {
  const [response, setResponse] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"generate" | "compare" | null>(null);

  const [industryData, setIndustryData] = useState("");
  const [descriptionData, setDescriptionData] = useState("");

  const [isRestored, setIsRestored] = useState(false);
  const [showClearModal, setShowClearModal] = useState(false);

  /* Restore State */
useEffect(() => {
  const saved = localStorage.getItem("aiProductivityState");

  if (saved) {
    const parsed = JSON.parse(saved);

    setResponse(parsed.response || null);
    setMode(parsed.mode || null);
    setIndustryData(parsed.industry || "");
    setDescriptionData(parsed.description || "");

    setIsRestored(true);

    // Reset restore flag immediately after hydration
    setTimeout(() => setIsRestored(false), 0);
  }
}, []);

  /* Save State */
  useEffect(() => {
    const state = {
      response,
      mode,
      industry: industryData,
      description: descriptionData,
    };

    localStorage.setItem("aiProductivityState", JSON.stringify(state));
  }, [response, mode, industryData, descriptionData]);

  /* Clear Handler */
  const handleClear = () => {
    localStorage.removeItem("aiProductivityState");

    setResponse(null);
    setMode(null);
    setIndustryData("");
    setDescriptionData("");
    setIsRestored(false);

    setShowClearModal(false);
  };

  return (
    <main className="h-screen bg-white overflow-hidden">
      <div className="max-w-[1600px] mx-auto h-full flex flex-col px-4 md:px-12">

        {/* Header */}
        <div className="text-center pt-6 pb-4 shrink-0">
          <h1 className="text-4xl font-bold tracking-tight">
            AI Productivity Coach
          </h1>
          <p className="text-gray-500 mt-2">
            Optimize your professional life with AI insights.
          </p>
        </div>

        {/* Grid */}
        <div className="flex-1 grid grid-rows-[2.6fr_2fr] md:grid-rows-1 md:grid-cols-2 gap-3 md:gap-10 pb-2 md:pb-4 min-h-0 items-stretch">

          <InputSection
            setResponse={setResponse}
            setLoading={setLoading}
            setIndustryData={setIndustryData}
            setDescriptionData={setDescriptionData}
            setMode={setMode}
            industryData={industryData}
            descriptionData={descriptionData}
          />

          <ResponseSection
            response={response}
            loading={loading}
            industry={industryData}
            description={descriptionData}
            mode={mode}
            isRestored={isRestored}
            setShowClearModal={setShowClearModal}
          />

        </div>
      </div>

      {/* Clear Modal */}
      <AnimatePresence>
        {showClearModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 backdrop-blur-md bg-black/30 flex items-center justify-center z-50"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="bg-white p-8 rounded-2xl shadow-2xl w-[420px] text-center"
            >
              <h3 className="text-xl font-semibold mb-3">
                Are you sure you want to clear?
              </h3>

              <p className="text-gray-500 text-sm mb-6">
                This will remove all generated responses and input data.
              </p>

              <div className="flex justify-center gap-4">
                <button
                  onClick={() => setShowClearModal(false)}
                  className="px-5 py-2 border rounded-lg hover:bg-gray-100 transition"
                >
                  Cancel
                </button>

                <button
                  onClick={handleClear}
                  className="px-5 py-2 bg-black text-white rounded-lg hover:bg-gray-800 transition"
                >
                  Yes, Proceed
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}