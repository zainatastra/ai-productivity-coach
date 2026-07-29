"use client";

import { useState } from "react";
import { AnimatePresence } from "framer-motion";
import ProductivitySection from "@/components/ProductivitySection";
import AuthModal from "@/components/AuthModal";
import { useLanguage } from "@/services/LanguageContext";
import { useAuth } from "@/services/AuthContext";

const MAIN_APP_URL = "https://ai-productivity-coach-zeta.vercel.app";

type AuthModalState = {
  open: boolean;
  type: "login" | "signup";
};

export default function EmbedPage() {
  const { language } = useLanguage();
  const { user, loading: authLoading } = useAuth();

  const [response, setResponse] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"generate" | "compare" | null>(null);
  const [industryData, setIndustryData] = useState("");
  const [descriptionData, setDescriptionData] = useState("");

  const [authModal, setAuthModal] = useState<AuthModalState>({
    open: false,
    type: "login",
  });

  const isLoggedIn = !!user && !user.isAnonymous;

  const openAuthModal = (type: "login" | "signup" = "login") => {
    setAuthModal({ open: true, type });
  };

  const closeAuthModal = () => {
    setAuthModal((prev) => ({ ...prev, open: false }));
  };

  const openMainApp = () => {
    window.open(MAIN_APP_URL, "_top");
  };

  return (
    <main className="apc-embed min-h-screen bg-white text-slate-900 md:h-screen md:overflow-hidden">
      <div className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0 text-sm font-semibold tracking-tight sm:text-base">
            {language === "de"
              ? "Ey Eric! Mach mich produktiv!"
              : "Ey Eric! Make me Productive!"}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {!authLoading && !isLoggedIn && (
              <>
                <button
                  type="button"
                  onClick={() => openAuthModal("login")}
                  className="inline-flex h-11 min-w-[96px] items-center justify-center whitespace-nowrap rounded-full border border-slate-200 px-5 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                >
                  {language === "de" ? "Anmelden" : "Login"}
                </button>

                <button
                  type="button"
                  onClick={() => openAuthModal("signup")}
                  className="inline-flex h-11 min-w-[96px] items-center justify-center whitespace-nowrap rounded-full bg-black px-5 text-sm font-medium text-white transition hover:bg-slate-800"
                >
                  {language === "de" ? "Registrieren" : "Sign Up"}
                </button>
              </>
            )}

            {!authLoading && isLoggedIn && (
              <button
                type="button"
                onClick={openMainApp}
                className="inline-flex h-11 min-w-[116px] items-center justify-center whitespace-nowrap rounded-full bg-black px-5 text-sm font-medium text-white transition hover:bg-slate-800"
              >
                {language === "de" ? "App öffnen" : "Open App"}
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-3 py-4 sm:px-4 sm:py-6 md:h-[calc(100vh-68px)] md:box-border md:overflow-hidden">
        <ProductivitySection
          response={response}
          setResponse={setResponse}
          loading={loading}
          setLoading={setLoading}
          mode={mode}
          setMode={(value) => setMode(value)}
          industryData={industryData}
          setIndustryData={setIndustryData}
          descriptionData={descriptionData}
          setDescriptionData={setDescriptionData}
          isRestored={false}
          isLoggedIn={isLoggedIn}
          isEmbedMode={true}
          language={language}
          isHydrated={true}
          setShowAuthModal={({ type }) => {
            openAuthModal(type === "login" ? "login" : "signup");
          }}
        />
      </div>

      <AnimatePresence>
        {authModal.open && (
          <AuthModal
            open={authModal.open}
            initialMode={authModal.type}
            onClose={closeAuthModal}
            onSuccess={closeAuthModal}
          />
        )}
      </AnimatePresence>
    </main>
  );
}