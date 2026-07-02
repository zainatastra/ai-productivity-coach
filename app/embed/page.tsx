"use client";

import { useState } from "react";
import ProductivitySection from "@/components/ProductivitySection";
import { useLanguage } from "@/services/LanguageContext";

const MAIN_APP_URL = "https://ai-productivity-coach-zeta.vercel.app";

export default function EmbedPage() {
  const { language } = useLanguage();

  const [response, setResponse] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"generate" | "compare" | null>(null);
  const [industryData, setIndustryData] = useState("");
  const [descriptionData, setDescriptionData] = useState("");

  const redirectToMainApp = (target: "login" | "signup" = "signup") => {
    const url = `${MAIN_APP_URL}/auth?mode=${target}`;
    window.open(url, "_top");
  };

  return (
    <main className="apc-embed min-h-screen bg-white text-slate-900 md:h-screen md:overflow-hidden">
      <div className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0 text-sm font-semibold tracking-tight sm:text-base">Ey Eric! Make me Productive!</div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => redirectToMainApp("login")}
              className="inline-flex h-11 min-w-[96px] items-center justify-center whitespace-nowrap rounded-full border border-slate-200 px-5 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
            >
              Login
            </button>
            <button
              type="button"
              onClick={() => redirectToMainApp("signup")}
              className="inline-flex h-11 min-w-[96px] items-center justify-center whitespace-nowrap rounded-full bg-black px-5 text-sm font-medium text-white transition hover:bg-slate-800"
            >
              Sign Up
            </button>
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
          isLoggedIn={false}
          isEmbedMode={true}
          language={language}
          isHydrated={true}
          setShowAuthModal={({ type }) => {
            redirectToMainApp(type === "login" ? "login" : "signup");
          }}
        />
      </div>
    </main>
  );
}