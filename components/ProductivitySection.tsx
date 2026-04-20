"use client";

import { useState, useEffect, useRef } from "react";
import { generateProductivity, compareIndustry } from "@/services/api";
import { useLanguage } from "@/services/LanguageContext";

interface Props {
  response: any;
  setResponse: (v: any) => void;
  loading: boolean;
  setLoading: (v: boolean) => void;
  mode: "generate" | "compare" | null;
  setMode: (v: "generate" | "compare") => void;

  industryData: string;
  setIndustryData: (v: string) => void;

  descriptionData: string;
  setDescriptionData: (v: string) => void;

  isRestored: boolean;
  isLoggedIn: boolean;
  setShowAuthModal: (v: { open: boolean; type?: string }) => void;

  language: "en" | "de";

  isHydrated: boolean; // ✅ ADD THIS
}

const parseAIResponse = (text: any) => {
  if (typeof text !== "string") {
    return {
      industry: "",
      work_field: "",
      reasoning: "",
      benchmark: "",
    };
  }

  const clean = text.replace(/\r/g, "");

  const industryMatch = clean.match(/\*\*Industry\*\*\s*([\s\S]*?)(\n\s*\n|\*\*|$)/i);
  const workFieldMatch = clean.match(/\*\*Work Field\*\*\s*([\s\S]*?)(\n\s*\n|\*\*|$)/i);
  const descriptionMatch = clean.match(/\*\*Description\*\*\s*([\s\S]*?)(\n\s*\n|\*\*|$)/i);
  const benchmarkMatch = clean.match(/\*\*Benchmark\*\*\s*([\s\S]*?)(\n\s*\n|\*\*|$)/i);

  return {
    industry: industryMatch?.[1]?.trim() || "",
    work_field: workFieldMatch?.[1]?.trim() || "",
    reasoning: descriptionMatch?.[1]?.trim() || "",
    benchmark: benchmarkMatch?.[1]?.trim() || "",
  };
};

export default function ProductivitySection({
  response,
  setResponse,
  loading,
  setLoading,
  mode,
  setMode,
  industryData,
  setIndustryData,
  descriptionData,
  setDescriptionData,
  isLoggedIn,
  setShowAuthModal,
  language,
  isHydrated, // ✅ ADD THIS
}: Props) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [typedContent, setTypedContent] = useState("");
  const [isFlipping, setIsFlipping] = useState(false);

const containerRef = useRef<HTMLDivElement>(null);

// ✅ RESTORE FROM LOCAL STORAGE (LOAD + LOGIN + FIX MODE + INPUTS)
const hasRestoredRef = useRef(false);

useEffect(() => {
  if (typeof window === "undefined") return;

  const savedInput = localStorage.getItem("ai_input");

  if (savedInput) {
    try {
      const inputParsed = JSON.parse(savedInput);

      setIndustryData(inputParsed.industry || "");
      setDescriptionData(inputParsed.description || "");
    } catch (err) {
      console.error("Failed to restore input:", err);
    }
  }

  hasRestoredRef.current = true;

}, [isLoggedIn]);

  /* ================= BUILD TEXT ================= */
  const buildGenerateText = (data: any): string => {
    if (!data) return "";

    if (data?.data) return buildGenerateText(data.data);
    if (data?.result) return buildGenerateText(data.result);

    if (data.industry || data.work_field || data.reasoning) {
      let text = "";

      if (data.industry) {
        text += `INDUSTRY\n${data.industry}\n\n`;
      }

      if (data.work_field) {
        text += `WORK FIELD\n${data.work_field}\n\n`;
      }

      if (Array.isArray(data.reasoning)) {
        text += `WHY THIS WORK FIELD\n`;
        data.reasoning.forEach((item: string) => {
          text += `• ${item}\n`;
        });
      }

      return text.trim();
    }

    if (typeof data?.message === "string") {
      return data.message;
    }

    if (typeof data === "string") return data;

    return "";
  };

/* ================= TYPING EFFECT ================= */
useEffect(() => {
  if (!response || mode !== "generate") return;

  const fullText = response?.reasoning || "";

  if (!fullText) {
    setTypedContent("No response generated.");
    return;
  }

  // 🔥 If already populated → DO NOTHING
  if (typedContent.length > 0) return;

  let index = 0;
  setTypedContent("");

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

}, [response, mode]);

/* ================= FORCE SHOW ON RESTORE ================= */
useEffect(() => {
  if (!response || mode !== "generate") return;

  const fullText = response?.reasoning || "";

  if (!fullText) return;

  // 🔥 ALWAYS ensure text is visible after restore/login
  setTypedContent(fullText);

}, [response]);

/* ================= GENERATE ================= */
const handleGenerate = async () => {
  if (!industryData || !descriptionData) {
    alert("Please fill in all fields.");
    return;
  }

  if (isSubmitting) return;

  try {
    setIsSubmitting(true);

    // 🔥 ONE-TIME FLIP
    setIsFlipping(true);

    // 🔥 SHOW THINKING IMMEDIATELY
    setLoading(true);

    await new Promise((res) => setTimeout(res, 400));

    // RESET STATE
    setResponse(null);
    setTypedContent("");
    setMode("generate");

    const result = await generateProductivity(
      industryData,
      descriptionData,
      language
    );

    const text = typeof result === "string" ? result : "";
    const parsed = parseAIResponse(text);

    const freshResult = {
      industry: parsed.industry || "",
      work_field: parsed.work_field || "",
      reasoning: parsed.reasoning || "",
      benchmark: parsed.benchmark || "",
      raw: text,
      _ts: Date.now(),
    };

    // ✅ SAVE RESPONSE
    localStorage.setItem("ai_response", JSON.stringify(freshResult));

    // ✅ SAVE ORIGINAL INPUT (CRITICAL FOR COMPARE)
    localStorage.setItem(
      "ai_input",
      JSON.stringify({
        industry: industryData,
        description: descriptionData,
      })
    );

    // 🔥 THINKING → RESPONSE
    setTimeout(() => {
      setResponse(freshResult);

      // ✅ IMPORTANT: instantly show full text after generation
      setTypedContent(parsed.reasoning || "");

      setLoading(false);
    }, 300);

  } catch (err) {
    console.error("❌ Generate error:", err);

    const fallback = {
      industry: "",
      work_field: "",
      reasoning:
        "Something went wrong while generating results. Please try again.",
      benchmark: "",
      raw: "",
      _ts: Date.now(),
    };

    setResponse(fallback);
    setTypedContent(fallback.reasoning);
    setLoading(false);

    localStorage.setItem("ai_response", JSON.stringify(fallback));

  } finally {
    setIsSubmitting(false);
  }
};

/* ================= COMPARE ================= */
const handleCompare = async () => {
  if (response?.compare) return;

  if (!isLoggedIn) {
    setShowAuthModal({
      type: "compare",
      open: true,
    });
    return;
  }

  try {
    setIsSubmitting(true);
    setMode("compare");
    setLoading(true);

    const result = await compareIndustry(
      industryData,
      descriptionData,
      language
    );

    const text = typeof result === "string" ? result : "";

    setResponse((prev: any) => {
      const updated = {
        ...prev,
        compare: text || "Unable to generate comparison at the moment.",
      };

      localStorage.setItem("ai_response", JSON.stringify(updated));
      return updated;
    });

  } catch (err) {
    console.error("❌ Compare error:", err);
  } finally {
    setLoading(false);
    setIsSubmitting(false);
  }
};

  /* ================= BOLD PARSER ================= */
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

const ThinkingAnimation = ({ inline = false }: { inline?: boolean }) => {
  const [dots, setDots] = useState(".");

  useEffect(() => {
    const interval = setInterval(() => {
      setDots((prev) => (prev.length >= 3 ? "." : prev + "."));
    }, 400);

    return () => clearInterval(interval);
  }, []);

  return (
    <div
      className={
        inline
          ? "flex items-center"
          : "flex-1 flex items-center justify-center"
      }
    >
      <p className="text-lg font-medium text-gray-600 flex items-center">
        
        {/* ✅ STATIC TEXT (DOES NOT MOVE) */}
        <span>
          {language === "de" ? "Denken" : "Thinking"}
        </span>

        {/* ✅ ANIMATED DOTS ONLY */}
        <span className="inline-block w-[28px] text-left ml-1 font-mono">
          {dots}
        </span>

      </p>
    </div>
  );
};

return (
  <div
    className="w-full bg-white rounded-2xl shadow-md border border-gray-200 px-6 md:px-12 py-6 md:py-10 h-[calc(100vh-80px)] flex flex-col overflow-hidden transition-all duration-700"
    style={{
      transformStyle: "preserve-3d",
      transform: isFlipping ? "rotateY(180deg)" : "rotateY(0deg)",
    }}
  >
    {/* 🔥 INNER WRAPPER (FIX MIRROR ISSUE) */}
    <div
      className="h-full flex flex-col"
      style={{
        transform: isFlipping ? "rotateY(180deg)" : "rotateY(0deg)",
      }}
    >

      {/* ================= INITIAL STATE ================= */}
      {!response && !loading && (
        <div className="flex flex-col h-full justify-between">

{/* ================= TOP BANNER ================= */}
<div className="w-full mb-6">
  <div className="w-full bg-gradient-to-r from-gray-50 to-gray-100 border border-gray-200 rounded-[40px] px-6 md:px-10 py-6 md:py-8 shadow-sm">

    <div className="flex items-start gap-4">

      {/* ICON */}
      <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-white shadow-sm border border-gray-200">
        <img
          src="/star.png"
          alt="icon"
          className="w-6 h-6 object-contain"
        />
      </div>

      {/* TEXT CONTENT */}
      <div className="flex-1">

        {/* TITLE */}
        <h2 className="text-base md:text-lg font-semibold text-gray-900 mb-2">
          {language === "de"
            ? "Ey Eric! Mach mich produktiv!"
            : "Hey Eric! Make me productive!"}
        </h2>

        {/* DESCRIPTION */}
        <p className="text-sm md:text-[15px] text-gray-600 leading-relaxed">
          {language === "de"
            ? "Die Welt dreht sich super schnell. Wer kann schon sagen, ob er die aktuell besten Tools und Methoden nutzt? Ey Eric analysiert Deine Arbeitsweise und schlägt Dir gezielte Verbesserungen vor."
            : "The world is moving fast. Who can confidently say they are using the best tools and methods? Ey Eric analyzes your workflow and suggests smarter ways to improve it."}
        </p>

      </div>
    </div>
  </div>
</div>

{/* FORM */}
<div className="w-full flex flex-col gap-4">
  <input
    type="text"
    placeholder={
      language === "de"
        ? "Geben Sie Ihre Branche ein..."
        : "Write your industry..."
    }
    className="w-full px-5 py-3 border border-gray-300 rounded-full bg-white text-sm focus:outline-none focus:ring-2 focus:ring-black/20 transition"
    value={industryData}
    onChange={(e) => setIndustryData(e.target.value)}
  />

  <textarea
    placeholder={
      language === "de"
        ? "Beschreiben Sie Ihren Job in 3–5 Sätzen..."
        : "Tell about your job in 3-5 sentences..."
    }
    className="w-full px-5 py-3 border border-gray-300 rounded-2xl min-h-[180px] bg-white text-sm focus:outline-none focus:ring-2 focus:ring-black/20 transition"
    value={descriptionData}
    onChange={(e) => setDescriptionData(e.target.value)}
  />

  <button
    onClick={handleGenerate}
    className="w-full bg-[#78D1F5] text-white py-3 px-5 rounded-full font-semibold hover:bg-[#5bbce3] transition shadow-sm active:scale-[0.98]"
  >
    {language === "de"
      ? "Mach mich produktiv"
      : "Make Me Productive"}
  </button>
</div>

        </div>
      )}

      {/* ================= THINKING ================= */}
{loading && mode === "generate" && (
  <div className="flex-1 flex items-center justify-center transition-opacity duration-500 opacity-100">
    <ThinkingAnimation />
  </div>
)}

{/* ================= RESPONSE ================= */}
{response && (
  <div className="flex-1 w-full flex flex-col min-h-0 transition-opacity duration-500 opacity-100">

<div className="flex-1 overflow-y-auto pr-2 min-h-0">

  {/* INDUSTRY */}
  <div className="mb-6">
    <p className="text-sm font-bold text-black tracking-wide animate-fadeIn">
      {language === "de" ? "BRANCHE" : "INDUSTRY"}
    </p>
    <p className="text-lg font-semibold text-black mt-1">
      {response.industry || "—"}
    </p>
  </div>

  {/* WORK FIELD */}
  <div className="mb-6">
    <p className="text-sm font-bold text-black tracking-wide animate-fadeIn">
      {language === "de" ? "ARBEITSBEREICH" : "WORK FIELD"}
    </p>
    <p className="text-base text-black mt-1">
      {response.work_field || "—"}
    </p>
  </div>

  {/* DESCRIPTION */}
  <div className="mb-6">
    <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">
      {renderWithBold(typedContent)}
    </p>
  </div>

  {/* BENCHMARK */}
  <div className="mb-6">
    <p className="text-sm font-bold text-black tracking-wide animate-fadeIn">
      {language === "de" ? "BENCHMARK" : "BENCHMARK"}
    </p>

    <p className="text-sm text-gray-700 mt-1">
      {response?.benchmark
        ? response.benchmark
            .split(/(\d{1,3}(?:,\d{3})*(?:\s*(?:to|–|-)\s*\d{1,3}(?:,\d{3})*)?)/g)
            .map((part: string, i: number) => {
              if (/\d/.test(part)) {
                return (
                  <span key={i} className="font-semibold text-black">
                    {part}
                  </span>
                );
              }
              return <span key={i}>{part}</span>;
            })
        : "Estimating based on similar roles..."}
    </p>

    {/* 🔥 PROMINENT CTA BLOCK */}
    <div className="mt-5">
  {loading && mode === "compare" ? (
    <div className="transition-opacity duration-300">
      <ThinkingAnimation inline />
    </div>
  ) : response?.compare ? (

    // ✅ FORCE COLOR (CANNOT BE OVERRIDDEN)
    <p
      className="text-sm font-bold mb-2 text-green-600"
      style={{ color: "#20c55e" }}
    >
      {language === "de"
        ? "Sehen Sie, welche Aktivitäten sie während ihrer Arbeitswoche durchführen:"
        : "See what activities they spend their working week doing:"}
    </p>

  ) : (
    <div className="relative rounded-2xl border border-blue-200 shadow-sm overflow-hidden">
      
      {/* GLOW */}
      <div className="absolute inset-0 animate-glow pointer-events-none"></div>

      {/* CONTENT */}
      <div className="relative z-10 flex items-start gap-3 px-5 py-4">
        
        {/* Icon */}
        <div className="flex items-center justify-center w-9 h-9">
          <img 
            src="/star.png" 
            alt="star"
            className="w-7 h-7 object-contain drop-shadow-sm"
          />
        </div>

        {/* Text */}
        <div>
          <p className="text-sm font-semibold text-gray-800">
            {language === "de"
              ? "Möchten Sie sehen, welche Aktivitäten sie während ihrer Arbeitswoche durchführen?"
              : "Would you like to see what activities they spend their working week doing?"}
          </p>

          <p className="text-sm text-gray-600 mt-1">
            {language === "de"
              ? "↓ Klicken Sie auf „Vergleichen“, um es herauszufinden"
              : "↓ Click Compare to find out"}
          </p>
        </div>
      </div>
    </div>
  )}
</div>
  </div>

  {/* COMPARE RESULT */}
  {response?.compare && (
    <div className="mt-6 space-y-3 animate-fadeIn">
      {response.compare
        .split("\n")
        .map((line: string, i: number) => {
          if (!line || !line.trim()) return null;

          const match = line.match(
            /^(.+?)\s*[—-]\s*(\d{1,2}\s*[–-]\s*\d{1,2}.*)$/
          );

          if (!match) return null;

          const activity = match[1].trim();
          const time = match[2].trim();

          return (
            <div
              key={i}
              className="flex justify-between items-center bg-gray-100 px-4 py-3 rounded-xl transition-all duration-300"
            >
              <span className="text-sm text-gray-800">
                {activity}
              </span>
              <span className="text-sm font-medium text-gray-700">
                {time}
              </span>
            </div>
          );
        })}
    </div>
  )}
</div>

    {/* BUTTON */}
    <div className="pt-4 shrink-0">
      <button
        onClick={handleCompare}
        disabled={loading && mode === "compare"}
        className="w-full bg-[#78D1F5] text-white py-3 px-5 rounded-full font-semibold hover:bg-[#5bbce3] transition shadow-sm active:scale-[0.98]"
      >
        {language === "de" ? "Vergleichen" : "Compare"}
      </button>
    </div>

  </div>
)}

    </div>
  </div>
);
}