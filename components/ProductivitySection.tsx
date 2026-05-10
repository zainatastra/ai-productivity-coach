"use client";

import { useState, useEffect, useRef } from "react";
import { generateProductivity, compareIndustry, generateTitle, saveConversation } from "@/services/api";
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
  isHydrated: boolean;
  onConversationSaved?: () => void;   // ✅ triggers sidebar refresh
}

const parseAIResponse = (text: any) => {
  if (typeof text !== "string") return { industry: "", work_field: "", reasoning: "", benchmark: "" };
  const clean = text.replace(/\r/g, "");
  const industryMatch    = clean.match(/\*\*Industry\*\*\s*([\s\S]*?)(\n\s*\n|\*\*|$)/i);
  const workFieldMatch   = clean.match(/\*\*Work Field\*\*\s*([\s\S]*?)(\n\s*\n|\*\*|$)/i);
  const descriptionMatch = clean.match(/\*\*Description\*\*\s*([\s\S]*?)(\n\s*\n|\*\*|$)/i);
  const benchmarkMatch   = clean.match(/\*\*Benchmark\*\*\s*([\s\S]*?)(\n\s*\n|\*\*|$)/i);
  return {
    industry:   industryMatch?.[1]?.trim()    || "",
    work_field: workFieldMatch?.[1]?.trim()   || "",
    reasoning:  descriptionMatch?.[1]?.trim() || "",
    benchmark:  benchmarkMatch?.[1]?.trim()   || "",
  };
};

export default function ProductivitySection({
  response, setResponse,
  loading, setLoading,
  mode, setMode,
  industryData, setIndustryData,
  descriptionData, setDescriptionData,
  isLoggedIn, setShowAuthModal,
  language, isHydrated,
  onConversationSaved,
}: Props) {
  const [isSubmitting, setIsSubmitting]   = useState(false);
  const [typedContent, setTypedContent]   = useState("");
  const [isFlipping,   setIsFlipping]     = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const industryRef  = useRef<HTMLInputElement>(null);
  const hasRestoredRef = useRef(false);

  /* ── auto-focus on mount ── */
  useEffect(() => {
    const t = setTimeout(() => industryRef.current?.focus(), 80);
    return () => clearTimeout(t);
  }, []);

  /* ── restore from localStorage ── */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const savedInput = localStorage.getItem("ai_input");
    if (savedInput) {
      try {
        const p = JSON.parse(savedInput);
        setIndustryData(p.industry || "");
        setDescriptionData(p.description || "");
      } catch (err) { console.error("Failed to restore input:", err); }
    }
    hasRestoredRef.current = true;
  }, [isLoggedIn]);

  /* ── build text ── */
  const buildGenerateText = (data: any): string => {
    if (!data) return "";
    if (data?.data)   return buildGenerateText(data.data);
    if (data?.result) return buildGenerateText(data.result);
    if (data.industry || data.work_field || data.reasoning) {
      let text = "";
      if (data.industry)  text += `INDUSTRY\n${data.industry}\n\n`;
      if (data.work_field) text += `WORK FIELD\n${data.work_field}\n\n`;
      if (Array.isArray(data.reasoning)) {
        text += `WHY THIS WORK FIELD\n`;
        data.reasoning.forEach((item: string) => { text += `• ${item}\n`; });
      }
      return text.trim();
    }
    if (typeof data?.message === "string") return data.message;
    if (typeof data === "string") return data;
    return "";
  };

  /* ── typing effect ── */
  useEffect(() => {
    if (!response || mode !== "generate") return;
    const fullText = response?.reasoning || "";
    if (!fullText) { setTypedContent("No response generated."); return; }
    if (typedContent.length > 0) return;
    let index = 0;
    setTypedContent("");
    const interval = setInterval(() => {
      index++;
      setTypedContent(fullText.slice(0, index));
      if (containerRef.current) containerRef.current.scrollTop = containerRef.current.scrollHeight;
      if (index >= fullText.length) clearInterval(interval);
    }, 8);
    return () => clearInterval(interval);
  }, [response, mode]);

  useEffect(() => {
    if (!response || mode !== "generate") return;
    const fullText = response?.reasoning || "";
    if (!fullText) return;
    setTypedContent(fullText);
  }, [response]);

  /* ── generate ── */
  const handleGenerate = async () => {
    if (!industryData || !descriptionData) { alert("Please fill in all fields."); return; }
    if (isSubmitting) return;
    try {
      setIsSubmitting(true);
      setIsFlipping(true);
      setLoading(true);
      await new Promise((res) => setTimeout(res, 400));
      setResponse(null);
      setTypedContent("");
      setMode("generate");
      const result = await generateProductivity(industryData, descriptionData, language);
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
      localStorage.setItem("ai_response", JSON.stringify(freshResult));
      localStorage.setItem("ai_input", JSON.stringify({ industry: industryData, description: descriptionData }));
      setTimeout(() => {
        setResponse(freshResult);
        setTypedContent(parsed.reasoning || "");
        setLoading(false);
      }, 300);

      // ✅ Generate AI title + save conversation (fire-and-forget, non-blocking)
      if (isLoggedIn) {
        (async () => {
          try {
            // Generate a short title (≤5 words) in parallel — don't block UI
            const title = await generateTitle(industryData, descriptionData, language);
            await saveConversation(industryData, descriptionData, freshResult, language, title);
            // Notify sidebar to refresh its conversation list
            onConversationSaved?.();
          } catch (err) {
            console.error("❌ Background save error:", err);
          }
        })();
      }
    } catch (err) {
      console.error("❌ Generate error:", err);
      const fallback = { industry: "", work_field: "", reasoning: "Something went wrong while generating results. Please try again.", benchmark: "", raw: "", _ts: Date.now() };
      setResponse(fallback);
      setTypedContent(fallback.reasoning);
      setLoading(false);
      localStorage.setItem("ai_response", JSON.stringify(fallback));
    } finally {
      setIsSubmitting(false);
    }
  };

  /* ── compare ── */
  const handleCompare = async () => {
    if (response?.compare) return;
    if (!isLoggedIn) { setShowAuthModal({ type: "compare", open: true }); return; }
    try {
      setIsSubmitting(true);
      setMode("compare");
      setLoading(true);
      const result = await compareIndustry(industryData, descriptionData, language);
      const text = typeof result === "string" ? result : "";
      setResponse((prev: any) => {
        const updated = { ...prev, compare: text || "Unable to generate comparison at the moment." };
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

  /* ── bold parser ── */
  const renderWithBold = (text: string) =>
    text.split(/(\*\*.*?\*\*)/g).map((part, index) =>
      part.startsWith("**") && part.endsWith("**")
        ? <span key={index} style={{ fontWeight: 650, color: "#111" }}>{part.replace(/\*\*/g, "")}</span>
        : <span key={index}>{part}</span>
    );

  /* ── benchmark number highlight ── */
  const renderBenchmark = (text: string) =>
    text.split(/(\d{1,3}(?:,\d{3})*(?:\s*(?:to|–|-)\s*\d{1,3}(?:,\d{3})*)?)/g)
      .map((part: string, i: number) =>
        /\d/.test(part)
          ? <span key={i} style={{ fontWeight: 700, color: "#111" }}>{part}</span>
          : <span key={i}>{part}</span>
      );

  /* ── thinking animation ── */
  const ThinkingAnimation = ({ inline = false }: { inline?: boolean }) => {
    const [frame, setFrame] = useState(0);
    const frames = ["⠋","⠙","⠹","⠸","⠼","⠴","⠦","⠧","⠇","⠏"];
    useEffect(() => {
      const iv = setInterval(() => setFrame(f => (f + 1) % frames.length), 90);
      return () => clearInterval(iv);
    }, []);

    return (
      <div className={inline ? "flex items-center" : "flex-1 flex items-center justify-center"}>
        <div style={{
          display: "flex", alignItems: "center", gap: 12,
          padding: inline ? "10px 16px" : "18px 28px",
          background: "linear-gradient(135deg, #f0f9ff, #e0f2fe)",
          border: "1px solid #bae6fd",
          borderRadius: 999,
          boxShadow: "0 2px 12px rgba(120,210,245,0.15)",
        }}>
          <span style={{
            fontFamily: "monospace", fontSize: inline ? 16 : 22,
            color: "#0ea5e9", lineHeight: 1,
          }}>{frames[frame]}</span>
          <span style={{
            fontSize: inline ? 13 : 15,
            fontWeight: 600,
            background: "linear-gradient(90deg, #0ea5e9, #78d2f5)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            letterSpacing: "0.01em",
          }}>
            {language === "de" ? "AI denkt nach…" : "AI is thinking…"}
          </span>
        </div>
      </div>
    );
  };

  return (
    <>
      <style>{`
        @keyframes ps-fadein { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
        @keyframes ps-shimmer { 0%,100% { opacity:0.6; } 50% { opacity:1; } }
        @keyframes ps-pulse-ring {
          0% { box-shadow: 0 0 0 0 rgba(120,210,245,0.4); }
          70% { box-shadow: 0 0 0 10px rgba(120,210,245,0); }
          100% { box-shadow: 0 0 0 0 rgba(120,210,245,0); }
        }
        @keyframes ps-bar-in { from { width:0; } to { width:var(--w); } }

        .ps-fadein  { animation: ps-fadein 0.4s ease both; }

        /* Input focus ring */
        .ps-input:focus {
          outline: none;
          border-color: #78d2f5 !important;
          box-shadow: 0 0 0 3px rgba(120,210,245,0.22), 0 1px 4px rgba(120,210,245,0.10) !important;
        }
        .ps-textarea:focus {
          outline: none;
          border-color: #78d2f5 !important;
          box-shadow: 0 0 0 3px rgba(120,210,245,0.22), 0 1px 4px rgba(120,210,245,0.10) !important;
        }

        /* CTA button */
        .ps-btn {
          width: 100%;
          background: linear-gradient(135deg, #78d2f5, #4bbde8);
          color: #fff;
          border: none;
          border-radius: 999px;
          padding: 13px 20px;
          font-size: 14px;
          font-weight: 700;
          letter-spacing: 0.01em;
          cursor: pointer;
          font-family: inherit;
          box-shadow: 0 4px 18px rgba(120,210,245,0.38);
          transition: transform 0.15s, box-shadow 0.15s, opacity 0.15s;
        }
        .ps-btn:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 6px 24px rgba(120,210,245,0.48);
        }
        .ps-btn:active:not(:disabled) { transform: scale(0.985); }
        .ps-btn:disabled { opacity: 0.5; cursor: not-allowed; }

        /* Activity row */
        .ps-activity {
          display: flex; justify-content: space-between; align-items: center;
          padding: 11px 18px;
          border-radius: 999px;
          background: #f7f8fa;
          border: 1px solid #ebebeb;
          animation: ps-fadein 0.35s ease both;
        }
        .ps-activity:hover { background: #f0f4f8; }

        /* section label */
        .ps-label {
          font-size: 10px; font-weight: 700; letter-spacing: 0.09em;
          text-transform: uppercase; color: #9ca3af; margin-bottom: 4px;
        }

        /* scrollbar */
        .ps-scroll::-webkit-scrollbar { width: 0; }
      `}</style>

      <div
        className="w-full bg-white rounded-2xl shadow-md border border-gray-200 px-5 md:px-10 py-5 md:py-8 flex flex-col overflow-hidden transition-all duration-700"
        style={{
          height: "calc(100vh - 80px)",
          transformStyle: "preserve-3d",
          transform: isFlipping ? "rotateY(180deg)" : "rotateY(0deg)",
        }}
      >
        {/* inner wrapper fixes mirror on flip */}
        <div
          className="h-full flex flex-col"
          style={{ transform: isFlipping ? "rotateY(180deg)" : "rotateY(0deg)" }}
        >

          {/* ══════════ INITIAL STATE ══════════ */}
          {!response && !loading && (
            <div className="flex flex-col h-full justify-between gap-5">

              {/* ── BANNER ── */}
              <div style={{
                background: "linear-gradient(135deg, #fafafa 0%, #f3f4f6 100%)",
                border: "1px solid #e5e7eb",
                borderRadius: 24,
                padding: "22px 24px",
                display: "flex",
                alignItems: "flex-start",
                gap: 16,
              }}>
                {/* icon */}
                <div style={{
                  width: 42, height: 42, borderRadius: 14, flexShrink: 0,
                  background: "#fff", border: "1px solid #e5e7eb",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.07)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <img src="/star.png" alt="icon" style={{ width: 24, height: 24, objectFit: "contain" }} />
                </div>

                {/* text */}
                <div style={{ flex: 1 }}>
                  <h2 style={{ fontSize: 15, fontWeight: 800, color: "#0d1117", letterSpacing: "-0.02em", marginBottom: 6, lineHeight: 1.3 }}>
                    {language === "de" ? "Ey Eric! Mach mich produktiv!" : "Hey Eric! Make me productive!"}
                  </h2>
                  <p style={{ fontSize: 13, color: "#6b7280", lineHeight: 1.7, margin: 0 }}>
                    {language === "de"
                      ? "Die Welt dreht sich super schnell. Wer kann schon sagen, ob er die aktuell besten Tools und Methoden nutzt? Ey Eric analysiert Deine Arbeitsweise und schlägt gezielte Verbesserungen vor."
                      : "The world is moving fast. Who can confidently say they are using the best tools and methods? Ey Eric analyzes your workflow and suggests smarter ways to improve it."}
                  </p>
                </div>
              </div>

              {/* ── FORM ── */}
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <input
                  ref={industryRef}
                  type="text"
                  placeholder={language === "de" ? "Geben Sie Ihre Branche ein…" : "Write your industry…"}
                  className="ps-input"
                  style={{
                    width: "100%", padding: "12px 18px",
                    border: "1.5px solid #e5e7eb", borderRadius: 999,
                    background: "#fff", fontSize: 13, color: "#111",
                    fontFamily: "inherit", boxSizing: "border-box",
                    transition: "border-color 0.2s, box-shadow 0.2s",
                  }}
                  value={industryData}
                  onChange={(e) => setIndustryData(e.target.value)}
                />

                <textarea
                  placeholder={language === "de" ? "Beschreiben Sie Ihren Job in 3–5 Sätzen…" : "Tell about your job in 3–5 sentences…"}
                  className="ps-textarea"
                  style={{
                    width: "100%", padding: "12px 18px",
                    border: "1.5px solid #e5e7eb", borderRadius: 18,
                    background: "#fff", fontSize: 13, color: "#111",
                    fontFamily: "inherit", resize: "vertical", minHeight: 150,
                    boxSizing: "border-box",
                    transition: "border-color 0.2s, box-shadow 0.2s",
                  }}
                  value={descriptionData}
                  onChange={(e) => setDescriptionData(e.target.value)}
                />

                <button className="ps-btn" onClick={handleGenerate}>
                  {language === "de" ? "Mach mich produktiv" : "Make Me Productive"}
                </button>
              </div>
            </div>
          )}

          {/* ══════════ THINKING (generate) ══════════ */}
          {loading && mode === "generate" && (
            <div className="flex-1 flex items-center justify-center">
              <ThinkingAnimation />
            </div>
          )}

          {/* ══════════ RESPONSE ══════════ */}
          {response && (
            <div className="flex-1 w-full flex flex-col min-h-0">

              {/* scrollable body */}
              <div ref={containerRef} className="ps-scroll flex-1 overflow-y-auto pr-1 min-h-0 pb-3">

                {/* INDUSTRY */}
                <div className="ps-fadein" style={{ marginBottom: 20 }}>
                  <div className="ps-label">{language === "de" ? "Branche" : "Industry"}</div>
                  <p style={{ fontSize: 17, fontWeight: 800, color: "#0d1117", letterSpacing: "-0.02em", margin: 0 }}>
                    {response.industry || "—"}
                  </p>
                </div>

                {/* WORK FIELD */}
                <div className="ps-fadein" style={{ marginBottom: 20, animationDelay: "0.06s" }}>
                  <div className="ps-label">{language === "de" ? "Arbeitsbereich" : "Work Field"}</div>
                  <p style={{ fontSize: 14, fontWeight: 600, color: "#374151", margin: 0 }}>
                    {response.work_field || "—"}
                  </p>
                </div>

                {/* DESCRIPTION */}
                <div className="ps-fadein" style={{ marginBottom: 20, animationDelay: "0.10s" }}>
                  <p style={{ fontSize: 13, color: "#4b5563", lineHeight: 1.75, margin: 0 }}>
                    {renderWithBold(typedContent)}
                  </p>
                </div>

                {/* BENCHMARK */}
                <div className="ps-fadein" style={{ marginBottom: 20, animationDelay: "0.14s" }}>
                  <div className="ps-label">{language === "de" ? "Benchmark" : "Benchmark"}</div>
                  <p style={{ fontSize: 13, color: "#4b5563", lineHeight: 1.7, margin: 0 }}>
                    {response?.benchmark
                      ? renderBenchmark(response.benchmark)
                      : <span style={{ color: "#9ca3af", fontStyle: "italic" }}>Estimating based on similar roles…</span>}
                  </p>
                </div>

                {/* ── CTA / THINKING(compare) / COMPARE RESULT ── */}
                <div style={{ marginTop: 8 }}>

                  {loading && mode === "compare" ? (
                    <ThinkingAnimation inline />

                  ) : response?.compare ? (

                    /* ── COMPARE RESULT HEADER ── */
                    <div className="ps-fadein">
                      <p style={{
                        fontSize: 13, fontWeight: 700, marginBottom: 14,
                        background: "linear-gradient(90deg, #10b981, #34d399)",
                        WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
                      }}>
                        {language === "de"
                          ? "Sehen Sie, welche Aktivitäten sie während ihrer Arbeitswoche durchführen:"
                          : "See what activities they spend their working week doing:"}
                      </p>

                      {/* ACTIVITY ROWS */}
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {response.compare
                          .split("\n")
                          .map((line: string, i: number) => {
                            if (!line || !line.trim()) return null;
                            const match = line.match(/^(.+?)\s*[—-]\s*(\d{1,2}\s*[–-]\s*\d{1,2}.*)$/);
                            if (!match) return null;
                            return (
                              <div
                                key={i}
                                className="ps-activity"
                                style={{ animationDelay: `${i * 0.04}s` }}
                              >
                                <span style={{ fontSize: 13, color: "#374151", fontWeight: 500 }}>
                                  {match[1].trim()}
                                </span>
                                <span style={{
                                  fontSize: 12, fontWeight: 700, color: "#0ea5e9",
                                  background: "#e0f2fe", padding: "3px 10px",
                                  borderRadius: 999, whiteSpace: "nowrap",
                                }}>
                                  {match[2].trim()}
                                </span>
                              </div>
                            );
                          })}
                      </div>
                    </div>

                  ) : (

                    /* ── CTA BLOCK ── */
                    <div
                      className="ps-fadein"
                      style={{
                        borderRadius: 20,
                        background: "linear-gradient(135deg, #e0f7ff 0%, #cff2fd 60%, #d6f0fd 100%)",
                        border: "1.5px solid #a5e5f8",
                        boxShadow: "0 4px 20px rgba(120,210,245,0.18)",
                        padding: "18px 20px",
                        display: "flex", alignItems: "flex-start", gap: 14,
                        cursor: "pointer",
                        transition: "box-shadow 0.2s, transform 0.15s",
                        animationDelay: "0.18s",
                      }}
                      onClick={handleCompare}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLElement).style.transform = "translateY(-2px)";
                        (e.currentTarget as HTMLElement).style.boxShadow = "0 8px 28px rgba(120,210,245,0.30)";
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLElement).style.transform = "translateY(0)";
                        (e.currentTarget as HTMLElement).style.boxShadow = "0 4px 20px rgba(120,210,245,0.18)";
                      }}
                    >
                      <div style={{
                        width: 36, height: 36, borderRadius: 12, flexShrink: 0,
                        background: "#fff", border: "1px solid #bae6fd",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        boxShadow: "0 2px 6px rgba(120,210,245,0.20)",
                      }}>
                        <img src="/star.png" alt="star" style={{ width: 20, height: 20, objectFit: "contain" }} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <p style={{ fontSize: 13, fontWeight: 700, color: "#0369a1", margin: "0 0 4px", lineHeight: 1.4 }}>
                          {language === "de"
                            ? "Möchten Sie sehen, welche Aktivitäten sie während ihrer Arbeitswoche durchführen?"
                            : "Want to see how top professionals in your field spend their week?"}
                        </p>
                        <p style={{ fontSize: 12, color: "#0ea5e9", margin: 0, fontWeight: 500 }}>
                          {language === "de"
                            ? "↓ Klicken zum Vergleichen"
                            : "↓ Click Compare to reveal the breakdown"}
                        </p>
                      </div>
                      <div style={{
                        width: 28, height: 28, borderRadius: 999, flexShrink: 0,
                        background: "#0ea5e9", color: "#fff",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 14, fontWeight: 700,
                        boxShadow: "0 2px 8px rgba(14,165,233,0.35)",
                        alignSelf: "center",
                      }}>→</div>
                    </div>
                  )}
                </div>
              </div>

              {/* ── COMPARE BUTTON ── */}
              <div style={{ paddingTop: 14, flexShrink: 0 }}>
                <button
                  className="ps-btn"
                  onClick={handleCompare}
                  disabled={!!(loading && mode === "compare")}
                >
                  {language === "de" ? "Vergleichen" : "Compare"}
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </>
  );
}
