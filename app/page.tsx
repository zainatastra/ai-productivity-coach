"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/services/AuthContext";
import { useLanguage } from "@/services/LanguageContext";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import InputSection from "../components/InputSection";
import ResponseSection from "../components/ResponseSection";
import ConfirmModal from "@/components/ConfirmModal"; // ✅ IMPORTANT

export default function Home() {
  const { user, loading: authLoading } = useAuth();
  const { language } = useLanguage();

  const [response, setResponse] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] =
    useState<"generate" | "compare" | null>(null);

  const [industryData, setIndustryData] = useState("");
  const [descriptionData, setDescriptionData] = useState("");

  const [isRestored, setIsRestored] = useState(false);
  const [showClearModal, setShowClearModal] = useState(false);

  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  /* ===============================
     RESTORE LOCAL STATE
  =============================== */
  useEffect(() => {
    const saved = localStorage.getItem("aiProductivityState");

    if (saved) {
      const parsed = JSON.parse(saved);

      setIndustryData(parsed.industry || "");
      setDescriptionData(parsed.description || "");
      setMode(parsed.mode || null);

      if (parsed.response) {
        setResponse(parsed.response);
        setIsRestored(true);
      }
    }
  }, []);

  /* ===============================
     SAVE STATE
  =============================== */
  useEffect(() => {
    const state = {
      response,
      mode,
      industry: industryData,
      description: descriptionData,
    };

    localStorage.setItem(
      "aiProductivityState",
      JSON.stringify(state)
    );
  }, [response, mode, industryData, descriptionData]);

  /* ===============================
     CLEAR HANDLER
  =============================== */
  const handleClear = () => {
    localStorage.removeItem("aiProductivityState");

    setResponse(null);
    setMode(null);
    setIndustryData("");
    setDescriptionData("");
    setIsRestored(false);
    setShowClearModal(false);
  };

  const handleSelectConversation = (conversation: any) => {
    setIndustryData(conversation.industry);
    setDescriptionData(conversation.description);

    try {
      const parsedResponse = JSON.parse(conversation.response);
      setResponse(parsedResponse);
    } catch {
      setResponse(null);
    }

    setMode("generate");
    setIsRestored(true);
  };

  if (authLoading) return null;

  const showSidebar = user && !user.isAnonymous;

  return (
    <div className="h-screen flex bg-white overflow-hidden">

      {/* ================= MOBILE SIDEBAR OVERLAY ================= */}
      <AnimatePresence>
        {showSidebar && mobileSidebarOpen && (
          <>
            {/* BACKDROP */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.4 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 bg-black z-40 md:hidden"
              onClick={() => setMobileSidebarOpen(false)}
            />

            {/* SLIDING SIDEBAR */}
            <motion.div
              initial={{ x: -300 }}
              animate={{ x: 0 }}
              exit={{ x: -300 }}
              transition={{ type: "spring", stiffness: 260, damping: 25 }}
              className="fixed left-0 top-0 h-full z-50 md:hidden"
            >
              <Sidebar onSelectConversation={handleSelectConversation} />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ================= DESKTOP SIDEBAR ================= */}
      {showSidebar && (
        <div className="hidden md:block">
          <Sidebar onSelectConversation={handleSelectConversation} />
        </div>
      )}

      {/* ================= RIGHT SIDE ================= */}
      <div className="flex-1 flex flex-col">

        {/* HEADER */}
        <div className="border-b border-gray-200">
          <Header
            setShowClearModal={setShowClearModal}
            setMobileSidebarOpen={setMobileSidebarOpen}
          />
        </div>

        {/* MAIN */}
        <main className="flex-1 overflow-hidden mt-4">
          <div className="max-w-[1600px] mx-auto h-full flex flex-col px-8">

            <div className="flex-1 grid grid-rows-[2.6fr_2fr] md:grid-rows-1 md:grid-cols-2 gap-3 md:gap-10 pb-2 md:pb-4 min-h-0 items-stretch">

              <InputSection
                setResponse={setResponse}
                setLoading={setLoading}
                setIndustryData={setIndustryData}
                setDescriptionData={setDescriptionData}
                setMode={setMode}
                industryData={industryData}
                descriptionData={descriptionData}
                language={language}
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
        </main>

        {/* ================= CLEAR MODAL ================= */}
        <AnimatePresence>
          {showClearModal && (
            <ConfirmModal
              open={showClearModal}
              title="Are you sure you want to clear?"
              description="This will remove your current response and input."
              confirmText="Yes, Clear"
              onCancel={() => setShowClearModal(false)}
              onConfirm={handleClear}
            />
          )}
        </AnimatePresence>

      </div>
    </div>
  );
}