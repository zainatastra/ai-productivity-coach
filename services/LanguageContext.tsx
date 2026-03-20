"use client";

import { createContext, useContext, useEffect, useState } from "react";

import { API_BASE_URL } from "@/services/api";

type Language = "en" | "de";

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  uiTexts: any;
  setUiTexts: (data: any) => void;
  t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextType | null>(null);

export function LanguageProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [language, setLanguageState] = useState<Language>("en");
  const [uiTexts, setUiTexts] = useState<any>({});

  // =========================
  // LOAD LANGUAGE
  // =========================
  useEffect(() => {
    const saved = localStorage.getItem("appLanguage") as Language;
    if (saved) setLanguageState(saved);
  }, []);

  // =========================
  // FETCH UI TEXTS (🔥 FIXED)
  // =========================
  useEffect(() => {
    const fetchUIText = async () => {
      try {
        const url =
          `${API_BASE_URL}/api/Admin/ui-texts`

        console.log("FETCHING UI TEXTS:", url); // ✅ DEBUG

        const res = await fetch(url);

        if (!res.ok) {
          console.error("❌ API ERROR:", res.status, res.statusText);
          return;
        }

        const data = await res.json();

        console.log("✅ UI TEXTS RECEIVED:", data); // ✅ DEBUG

        setUiTexts(data);
      } catch (err) {
        console.error("❌ UI TEXT FETCH ERROR:", err);
      }
    };

    fetchUIText();
  }, []);

  // =========================
  // SET LANGUAGE
  // =========================
  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem("appLanguage", lang);
  };

  // =========================
  // TRANSLATION FUNCTION
  // =========================
  const t = (key: string) => {
    return uiTexts?.[key]?.[language] || key;
  };

  return (
    <LanguageContext.Provider
      value={{ language, setLanguage, uiTexts, setUiTexts, t }}
    >
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) throw new Error("LanguageProvider missing");
  return context;
}