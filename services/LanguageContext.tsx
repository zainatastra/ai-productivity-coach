"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { API_BASE_URL } from "@/services/api";

type Language = "en" | "de";

const DEFAULT_LANGUAGE: Language = "de";
const STORAGE_KEY = "appLanguage";

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  uiTexts: any;
  setUiTexts: (data: any) => void;
  t: (key: string) => string;
}

// =========================
// 🔒 HARDCODED FALLBACK TEXTS
// Used when backend is unreachable (local dev, cold start, network error)
// =========================
const DEFAULT_UI_TEXTS: Record<string, { en: string; de: string }> = {
  make_me_productive: {
    en: "Make me Productive!",
    de: "Mach mich produktiv!",
  },
  world_moves_fast: {
    en: "The world moves fast.",
    de: "Die Welt dreht sich super schnell.",
  },
  who_can_say: {
    en: "Who can say if they're using the best tools and methods for their work.",
    de: "Wer kann schon sagen, ob er die aktuell besten Tools und Methoden für seine Arbeit verwendet.",
  },
  ey_eric_analyzes: {
    en: "Ey Eric analyzes your work style and suggests tools and methods to improve it.",
    de: "Ey Eric analysiert Deine Arbeitsweise und schlägt Dir Tools und Methoden vor, um diese zu verbessern.",
  },
  enter_industry: {
    en: "Enter your industry...",
    de: "Geben Sie Ihre Branche ein...",
  },
  describe_job: {
    en: "Describe your job in 3–5 sentences...",
    de: "Beschreiben Sie Ihren Job in 3–5 Sätzen...",
  },
  make_productive_button: {
    en: "Make me productive",
    de: "Mach mich produktiv",
  },
  login: { en: "Login", de: "Anmelden" },
  sign_up: { en: "Sign Up", de: "Registrieren" },
  dashboard: { en: "Dashboard", de: "Übersicht" },
};

const LanguageContext = createContext<LanguageContextType | null>(null);

function isValidLanguage(value: string | null): value is Language {
  return value === "en" || value === "de";
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>(DEFAULT_LANGUAGE);
  const [uiTexts, setUiTexts] = useState<any>(DEFAULT_UI_TEXTS);

  // =========================
  // LOAD SAVED LANGUAGE
  // German is only the first-time default.
  // If the user manually chooses English, never force it back to German.
  // =========================
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);

      if (isValidLanguage(saved)) {
        setLanguageState(saved);
        return;
      }

      localStorage.setItem(STORAGE_KEY, DEFAULT_LANGUAGE);
      setLanguageState(DEFAULT_LANGUAGE);
    } catch {
      setLanguageState(DEFAULT_LANGUAGE);
    }
  }, []);

  // =========================
  // FETCH UI TEXTS FROM BACKEND
  // Falls back silently to DEFAULT_UI_TEXTS if unreachable
  // =========================
  useEffect(() => {
    let cancelled = false;

    const fetchUITexts = async () => {
      try {
        if (!API_BASE_URL) return;

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);

        const res = await fetch(`${API_BASE_URL}/api/Admin/ui-texts`, {
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (cancelled) return;

        if (!res.ok) {
          console.warn(
            `[LanguageContext] UI texts endpoint returned ${res.status}. Using defaults.`
          );
          return;
        }

        const data = await res.json();

        if (cancelled) return;

        setUiTexts({ ...DEFAULT_UI_TEXTS, ...data });
      } catch (err: any) {
        if (cancelled) return;

        if (err?.name === "AbortError") {
          console.warn("[LanguageContext] UI texts fetch timed out. Using defaults.");
        } else {
          console.warn("[LanguageContext] UI texts fetch failed. Using defaults.", err?.message);
        }
      }
    };

    fetchUITexts();

    return () => {
      cancelled = true;
    };
  }, []);

  // =========================
  // SET LANGUAGE
  // =========================
  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    try {
      localStorage.setItem(STORAGE_KEY, lang);
      document.documentElement.lang = lang;
    } catch {
      // localStorage not available
    }
  };

  // Keep html lang synchronized after initial saved language is loaded.
  useEffect(() => {
    try {
      document.documentElement.lang = language;
    } catch {
      // document unavailable in edge cases
    }
  }, [language]);

  // =========================
  // TRANSLATION FUNCTION
  // Falls back: fetched text → default text → raw key (never blank)
  // =========================
  const t = (key: string): string => {
    return uiTexts?.[key]?.[language] ?? DEFAULT_UI_TEXTS?.[key]?.[language] ?? key;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, uiTexts, setUiTexts, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) throw new Error("useLanguage must be used within a LanguageProvider");
  return context;
}