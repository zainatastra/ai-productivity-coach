"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/services/AuthContext";
import { useLanguage } from "@/services/LanguageContext";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import ProductivitySection from "@/components/ProductivitySection";
import ConfirmModal from "@/components/ConfirmModal";

export default function Home() {
  const { user, loading: authLoading } = useAuth();
  const { language } = useLanguage();
  const router = useRouter();

  const [response, setResponse] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"generate" | "compare" | null>(null);

  const [industryData, setIndustryData] = useState("");
  const [descriptionData, setDescriptionData] = useState("");

  const [isRestored, setIsRestored] = useState(false);
  const [showClearModal, setShowClearModal] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState<{ open: boolean; type?: string }>({
  open: false,
});

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

    localStorage.setItem("aiProductivityState", JSON.stringify(state));
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
  if (!conversation) {
    // 🔥 FULL RESET
    setIndustryData("");
    setDescriptionData("");
    setResponse(null);
    setMode(null);
    setIsRestored(false);
    return;
  }

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

  const isLoggedIn = user && !user.isAnonymous;
  const showSidebar = true;

  return (
    <div className="h-screen flex bg-gray-100 overflow-hidden">

      {/* ================= MOBILE SIDEBAR ================= */}
      <AnimatePresence>
        {showSidebar && mobileSidebarOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.4 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 bg-black z-40 md:hidden"
              onClick={() => setMobileSidebarOpen(false)}
            />

            <motion.div
              initial={{ x: -300 }}
              animate={{ x: 0 }}
              exit={{ x: -300 }}
              transition={{ type: "spring", stiffness: 260, damping: 25 }}
              className="fixed left-0 top-0 h-full z-50 md:hidden"
            >
              <Sidebar
                onSelectConversation={handleSelectConversation}
                disabled={!isLoggedIn}
                industryData={industryData}
                descriptionData={descriptionData}
                response={response}
              />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ================= DESKTOP SIDEBAR ================= */}
      {showSidebar && (
        <div className="hidden md:block">
<Sidebar
  key={response?._ts || "empty"}   // 🔥 FORCE RE-RENDER
  onSelectConversation={handleSelectConversation}
  disabled={!isLoggedIn}
  industryData={industryData}
  descriptionData={descriptionData}
  response={response}
/>
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

        {/* ================= MAIN ================= */}
        <main className="flex-1 overflow-auto mt-4">
          <div className="max-w-[1600px] mx-auto px-3 md:px-8 pb-4">

            <ProductivitySection
              response={response}
              setResponse={setResponse}
              loading={loading}
              setLoading={setLoading}
              mode={mode}
              setMode={setMode}
              industryData={industryData}
              setIndustryData={setIndustryData}
              descriptionData={descriptionData}
              setDescriptionData={setDescriptionData}
              isRestored={isRestored}
              isLoggedIn={!!isLoggedIn}
              setShowAuthModal={setShowAuthModal}
              language={language}
            />

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

        {/* ================= AUTH MODAL ================= */}
<AnimatePresence>
  {showAuthModal.open && (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        className="bg-white rounded-2xl p-6 w-[400px] text-center shadow-xl"
        initial={{ scale: 0.9 }}
        animate={{ scale: 1 }}
        exit={{ scale: 0.9 }}
      >
        <h3 className="text-lg font-semibold mb-2">
          Register to continue
        </h3>

        <p className="text-sm text-gray-500 mb-6">
          You have to register in order to see the next step.
          <br />
          It is totally free.
        </p>

        <div className="flex justify-center gap-3">
          
          {/* CANCEL */}
          <button
            onClick={() => setShowAuthModal({ open: false })}
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm"
          >
            Cancel
          </button>

          {/* LOGIN */}
          <button
            onClick={() => {
              setShowAuthModal({ open: false });
              router.push("/auth?mode=login");
            }}
            className="px-4 py-2 bg-black text-white rounded-lg text-sm"
          >
            Login
          </button>

        </div>
      </motion.div>
    </motion.div>
  )}
</AnimatePresence>

      </div>
    </div>
  );
}