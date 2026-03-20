"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/services/AuthContext";
import { useLanguage } from "@/services/LanguageContext";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import InputSection from "../components/InputSection";
import ResponseSection from "../components/ResponseSection";
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
  const [showAuthModal, setShowAuthModal] = useState(false); // ✅ ADDED

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

      {/* ================= MOBILE SIDEBAR OVERLAY ================= */}
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

        {/* MAIN */}
        <main className="flex-1 overflow-hidden mt-4">
          <div className="max-w-[1600px] mx-auto h-full flex flex-col px-3 md:px-8">

            {!isLoggedIn && (
              <div className="mb-6 text-center">
                <h1 className="text-3xl md:text-4xl font-bold text-black">
                  Ey Eric! Mach mich produktiv!
                </h1>
                <p className="text-gray-600 mt-2 max-w-xl mx-auto">
                  Die Welt dreht sich super schnell. Wer kann schon sagen,
                  ob er die aktuell besten Tools und Methoden verwendet?
                  Ey Eric analysiert Deine Arbeitsweise und schlägt Dir
                  Verbesserungen vor.
                </p>
              </div>
            )}

            <div className={`flex-1 grid grid-rows-[3fr_2fr] md:grid-rows-1 ${
              response ? "md:grid-cols-2" : "md:grid-cols-1"
            } gap-3 md:gap-10 pb-2 md:pb-4 min-h-0 items-stretch`}>

              <InputSection
                setResponse={setResponse}
                setLoading={setLoading}
                setIndustryData={setIndustryData}
                setDescriptionData={setDescriptionData}
                setMode={setMode}
                industryData={industryData}
                descriptionData={descriptionData}
                language={language}
                isLoggedIn={!!isLoggedIn}           
                setShowAuthModal={setShowAuthModal}  
              />

              {response?.industry && (
                <ResponseSection
                  response={response}
                  loading={loading}
                  industry={industryData}
                  description={descriptionData}
                  mode={mode}
                  isRestored={isRestored}
                  setShowClearModal={setShowClearModal}
                  isGuest={!isLoggedIn}
                />
              )}

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

        {/* ================= AUTH MODAL ================= */}
        <AnimatePresence>
          {showAuthModal && (
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
                  You need to register to see the comparison results.
                  It's completely free.
                </p>
                <div className="flex justify-center gap-4">
                  <button
                    onClick={() => setShowAuthModal(false)}
                    className="px-4 py-2 border rounded-lg text-sm"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => router.push("/auth?mode=signup")}
                    className="px-4 py-2 bg-black text-white rounded-lg text-sm"
                  >
                    Register
                  </button>
                  <button
                    onClick={() => router.push("/auth?mode=login")}
                    className="px-4 py-2 border rounded-lg text-sm"
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