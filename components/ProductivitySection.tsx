"use client";

import { useState, useEffect, useRef } from "react";
import { generateProductivity, compareIndustry, generateTitle, saveConversation, analyzeActivityWorkflow } from "@/services/api";
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
  isEmbedMode?: boolean;
}

type ActivityContext = {
  title: string;
  hours: string;
  description: string;
  tools: string[];
  toolOptions?: string[];
  analysis?: {
    analysis?: string;
    recommendedTools?: string[];
    timeSaving?: string;
    automationGaps?: string[];
  };
};

const MIN_TOOL_OPTIONS = 8;
const MAX_TOOL_OPTIONS = 20;

const uniqueTools = (tools: string[]) =>
  tools.filter((tool, index, arr) =>
    Boolean(tool?.trim()) && arr.findIndex((x) => x.toLowerCase() === tool.toLowerCase()) === index
  );

const takeToolOptions = (primary: string[], secondary: string[] = []) =>
  uniqueTools([...primary, ...secondary]).slice(0, MAX_TOOL_OPTIONS);

const getIndustryKey = (text: string) => {
  const value = text.toLowerCase();

  if (/(digital marketing|marketing|advertising|campaign|seo|social media|performance marketing|paid ads|content marketing|email marketing|google ads|meta ads)/.test(value)) return "marketing";
  if (/(software|technology|information technology|developer|software engineering|\bit\b|web development|api|backend|frontend|full-stack|fullstack|programming)/.test(value)) return "technology";
  if (/(healthcare|health care|hospital|clinic|medical|patient|doctor|nurse|clinical)/.test(value)) return "healthcare";
  if (/(ecommerce|e-commerce|online store|retail|shopify|marketplace|orders|inventory|product listing)/.test(value)) return "ecommerce";
  if (/(education|university|school|admission|student|learning|teacher|enrollment)/.test(value)) return "education";

  return "general";
};

type ToolRule = {
  industries?: string[];
  keywords: string[];
  tools: string[];
};

const FALLBACK_TOOLS_BY_INDUSTRY: Record<string, string[]> = {
  technology: [
    "VS Code", "Visual Studio", "GitHub", "GitLab", "Postman", "Swagger", "Docker", "Jira", "Confluence", "Sentry", "SonarQube", "GitHub Copilot"
  ],
  marketing: [
    "Meta Ads Manager", "Google Ads", "Google Analytics 4", "Looker Studio", "Google Tag Manager", "HubSpot", "Canva", "Figma", "Notion", "Airtable", "Semrush", "ChatGPT"
  ],
  healthcare: [
    "Epic", "Cerner", "Athenahealth", "Patient Portal", "Practice Management System", "Calendly", "Microsoft Teams", "Power BI", "Excel", "DocuSign", "Zendesk", "Google Forms"
  ],
  ecommerce: [
    "Shopify", "WooCommerce", "Amazon Seller Central", "eBay Seller Hub", "Google Merchant Center", "Klaviyo", "Gorgias", "Zendesk", "ShipStation", "AfterShip", "Inventory Planner", "Google Analytics 4"
  ],
  education: [
    "Google Classroom", "Moodle", "Canvas LMS", "Blackboard", "Google Forms", "Typeform", "Airtable", "Calendly", "HubSpot CRM", "Mailchimp", "Power BI", "Excel"
  ],
  general: [
    "Notion", "Trello", "Asana", "ClickUp", "Airtable", "Google Workspace", "Microsoft Teams", "Slack", "Excel", "ChatGPT", "Loom", "Miro"
  ],
};

const ACTIVITY_TOOL_RULES: ToolRule[] = [
  // Digital marketing, selected by exact activity intent instead of broad industry dumping
  {
    industries: ["marketing"],
    keywords: ["campaign planning", "campaign strategy", "strategy development", "campaign planning and strategy"],
    tools: ["Meta Ads Manager", "Google Ads", "Google Trends", "Meta Ad Library", "TikTok Creative Center", "Semrush", "Ahrefs", "Notion", "Airtable", "Miro", "ChatGPT", "Canva"],
  },
  {
    industries: ["marketing"],
    keywords: ["content creation", "copywriting", "ad copywriting", "design coordination", "creative", "collaboration with designers", "designers"],
    tools: ["Canva", "Figma", "Adobe Express", "CapCut", "Grammarly", "ChatGPT", "Google Docs", "Notion", "Loom", "Slack", "Frame.io", "Miro"],
  },
  {
    industries: ["marketing"],
    keywords: ["performance analysis", "performance analysis and reporting", "reporting", "ad performance", "review and optimization", "optimization"],
    tools: ["Google Analytics 4", "Looker Studio", "Google Ads", "Meta Ads Manager", "Google Tag Manager", "Supermetrics", "Excel", "Google Sheets", "Power BI", "Hotjar", "HubSpot", "ChatGPT"],
  },
  {
    industries: ["marketing"],
    keywords: ["social media", "social media management", "community", "posting", "publishing"],
    tools: ["Meta Business Suite", "Hootsuite", "Buffer", "Sprout Social", "Later", "Metricool", "Canva", "CapCut", "Notion", "Google Drive", "ChatGPT", "Grammarly"],
  },
  {
    industries: ["marketing"],
    keywords: ["email marketing", "email campaign", "newsletter", "email marketing campaign creation"],
    tools: ["Mailchimp", "Klaviyo", "HubSpot", "Brevo", "ActiveCampaign", "Google Analytics 4", "Canva", "Grammarly", "ChatGPT", "Google Sheets", "Zapier", "Notion"],
  },
  {
    industries: ["marketing"],
    keywords: ["client", "stakeholder", "client meeting", "client meetings", "presentations", "presentation", "communication"],
    tools: ["Google Meet", "Zoom", "Microsoft Teams", "Calendly", "Google Slides", "Canva", "Looker Studio", "HubSpot", "Notion", "Loom", "Fireflies.ai", "Slack"],
  },
  {
    industries: ["marketing"],
    keywords: ["ad management", "ads management", "paid ads", "budget", "budget management", "bid", "spend"],
    tools: ["Google Ads", "Meta Ads Manager", "TikTok Ads Manager", "LinkedIn Campaign Manager", "Google Tag Manager", "Looker Studio", "Google Analytics 4", "Optmyzr", "Revealbot", "Google Sheets", "Excel", "ChatGPT"],
  },
  {
    industries: ["marketing"],
    keywords: ["audience", "targeting", "segmentation", "audience targeting", "market research", "trend analysis", "trend research"],
    tools: ["Google Trends", "Semrush", "Ahrefs", "Meta Audience Insights", "Meta Ad Library", "TikTok Creative Center", "AnswerThePublic", "Exploding Topics", "Google Analytics 4", "Typeform", "ChatGPT", "Notion"],
  },

  // Software and IT
  {
    industries: ["technology"],
    keywords: ["development", "full-stack", "backend", "frontend", "api", "feature"],
    tools: ["VS Code", "Visual Studio", "GitHub", "GitLab", "Postman", "Swagger", "Docker", "Jira", "Confluence", "Sentry", "SonarQube", "GitHub Copilot"],
  },
  {
    industries: ["technology"],
    keywords: ["debugging", "bug", "troubleshooting", "error", "logs"],
    tools: ["Sentry", "LogRocket", "Postman", "Swagger", "Chrome DevTools", "Datadog", "New Relic", "Docker", "Visual Studio Debugger", "GitHub Issues", "Raygun", "Azure Application Insights"],
  },
  {
    industries: ["technology"],
    keywords: ["code review", "review", "pull request", "merge request"],
    tools: ["GitHub Pull Requests", "GitLab Merge Requests", "Bitbucket", "SonarQube", "CodeClimate", "Reviewable", "Jira", "Confluence", "GitHub Copilot", "Slack"],
  },
  {
    industries: ["technology"],
    keywords: ["testing", "qa", "quality assurance", "test"],
    tools: ["Postman", "Swagger", "Playwright", "Cypress", "Selenium", "Jest", "xUnit", "NUnit", "BrowserStack", "TestRail", "SonarQube", "GitHub Actions"],
  },
  {
    industries: ["technology"],
    keywords: ["deployment", "deploy", "release", "production", "ci/cd"],
    tools: ["GitHub Actions", "Azure DevOps", "Docker", "Kubernetes", "Vercel", "Netlify", "Render", "AWS", "Azure", "Terraform", "Sentry", "Postman"],
  },

  // Generic activity rules only apply when no stronger industry activity rule is found
  {
    keywords: ["documentation", "docs", "knowledge base", "sop"],
    tools: ["Notion", "Confluence", "Google Docs", "Microsoft Word", "Loom", "Scribe", "Miro", "Canva", "ChatGPT", "Grammarly"],
  },
  {
    keywords: ["meeting", "meetings", "presentation", "presentations", "coordination", "standup"],
    tools: ["Google Meet", "Zoom", "Microsoft Teams", "Slack", "Calendly", "Notion", "Loom", "Fireflies.ai", "Otter.ai", "Miro"],
  },

  // Other industries
  {
    industries: ["healthcare"],
    keywords: ["patient", "patients", "appointment", "clinical", "operations", "scheduling"],
    tools: ["Epic", "Cerner", "Athenahealth", "Patient Portal", "Practice Management System", "Calendly", "Microsoft Teams", "Power BI", "Excel", "DocuSign", "Zendesk", "Google Forms"],
  },
  {
    industries: ["ecommerce"],
    keywords: ["orders", "order", "inventory", "product", "returns", "customer"],
    tools: ["Shopify", "WooCommerce", "Amazon Seller Central", "eBay Seller Hub", "Gorgias", "Zendesk", "ShipStation", "AfterShip", "Inventory Planner", "Google Sheets", "Klaviyo", "Google Analytics 4"],
  },
  {
    industries: ["education"],
    keywords: ["admission", "admissions", "student", "application", "counseling", "enrollment"],
    tools: ["HubSpot CRM", "Salesforce Education Cloud", "Google Forms", "Typeform", "Airtable", "Calendly", "Google Workspace", "Mailchimp", "Power BI", "Excel", "Zoom", "Microsoft Teams"],
  },
];

const keywordMatches = (text: string, keyword: string) => {
  const normalizedText = text.toLowerCase();
  const normalizedKeyword = keyword.toLowerCase();
  if (normalizedKeyword.includes(" ")) return normalizedText.includes(normalizedKeyword);
  return normalizedText.split(/[^a-z0-9+.#]+/i).includes(normalizedKeyword);
};

const getRelevantToolOptions = (
  activityTitle: string,
  industry = "",
  workField = "",
  jobDescription = ""
) => {
  const activityText = activityTitle.toLowerCase();
  const broadContext = `${industry} ${workField} ${jobDescription}`.toLowerCase();
  const detectedIndustry = getIndustryKey(broadContext);
  const industryKey = detectedIndustry !== "general" ? detectedIndustry : getIndustryKey(activityTitle);
  const fallback = FALLBACK_TOOLS_BY_INDUSTRY[industryKey] || FALLBACK_TOOLS_BY_INDUSTRY.general;

  const industrySpecificMatches = ACTIVITY_TOOL_RULES.filter((rule) => {
    if (!rule.industries || !rule.industries.includes(industryKey)) return false;
    return rule.keywords.some((keyword) => keywordMatches(activityText, keyword));
  });

  if (industrySpecificMatches.length > 0) {
    const matchedTools = industrySpecificMatches.flatMap((rule) => rule.tools);
    const selected = takeToolOptions(matchedTools);
    return selected.length >= MIN_TOOL_OPTIONS ? selected : takeToolOptions(selected, fallback);
  }

  const genericMatches = ACTIVITY_TOOL_RULES.filter((rule) => {
    if (rule.industries) return false;
    return rule.keywords.some((keyword) => keywordMatches(activityText, keyword));
  });

  if (genericMatches.length > 0) {
    const matchedTools = genericMatches.flatMap((rule) => rule.tools);
    const selected = takeToolOptions(matchedTools);
    return selected.length >= MIN_TOOL_OPTIONS ? selected : takeToolOptions(selected, FALLBACK_TOOLS_BY_INDUSTRY.general);
  }

  return takeToolOptions(fallback, FALLBACK_TOOLS_BY_INDUSTRY.general);
};

const normalizeToolOptions = (tools: any): string[] => {
  if (!Array.isArray(tools)) return [];

  return uniqueTools(
    tools
      .map((tool) => String(tool || "").trim())
      .filter(Boolean)
  ).slice(0, MAX_TOOL_OPTIONS);
};

const parseCompareActivities = (compareText: any): ActivityContext[] => {
  if (typeof compareText !== "string") return [];

  const clean = compareText.trim();

  // New AI-driven format: the backend returns activity-specific tool options
  // generated by AI during Compare. These chips are not fixed in the frontend.
  const jsonMatch = clean.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      const activities = Array.isArray(parsed?.activities) ? parsed.activities : [];

      if (activities.length > 0) {
        return activities
          .map((item: any) => ({
            title: String(item?.title || "").trim(),
            hours: String(item?.hours || "").trim(),
            description: "",
            tools: [],
            toolOptions: normalizeToolOptions(item?.toolOptions || item?.tools || item?.recommendedTools),
          }))
          .filter((item: ActivityContext) => item.title && item.hours);
      }
    } catch {
      // Fall back to legacy line parsing below.
    }
  }

  // Legacy fallback for older saved conversations. New comparisons should use JSON.
  return clean
    .split("\n")
    .map((line: string) => line.trim())
    .filter(Boolean)
    .map((line: string) => {
      const match = line.match(/^(.+?)\s*[—-]\s*(\d{1,2}\s*[–-]\s*\d{1,2}.*)$/);
      if (!match) return null;

      return {
        title: match[1].trim(),
        hours: match[2].trim(),
        description: "",
        tools: [],
        toolOptions: [],
      };
    })
    .filter(Boolean) as ActivityContext[];
};

const parseWorkflowAnalysis = (text: any) => {
  if (typeof text !== "string") return null;

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;

  try {
    return JSON.parse(jsonMatch[0]);
  } catch {
    return null;
  }
};


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
  isEmbedMode = false,
}: Props) {
  const [isSubmitting, setIsSubmitting]   = useState(false);
  const [typedContent, setTypedContent]   = useState("");
  const [isFlipping,   setIsFlipping]     = useState(false);
  const [expandedActivity, setExpandedActivity] = useState<number | null>(0);
  const [workflowLoading, setWorkflowLoading] = useState(false);
  const [activityContexts, setActivityContexts] = useState<ActivityContext[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const industryRef  = useRef<HTMLInputElement>(null);
  const activityTextareaRefs = useRef<(HTMLTextAreaElement | null)[]>([]);
  const activityInsightRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [highlightedActivityIndex, setHighlightedActivityIndex] = useState<number | null>(null);
  const hasRestoredRef = useRef(false);

  /* ── auto-focus on mount ── */
  useEffect(() => {
    const t = setTimeout(() => industryRef.current?.focus(), 80);
    return () => clearTimeout(t);
  }, []);



  /* ── auto-focus activity textarea when a card expands ── */
  useEffect(() => {
    if (expandedActivity === null) return;

    const t = setTimeout(() => {
      const textarea = activityTextareaRefs.current[expandedActivity];
      if (!textarea) return;

      textarea.focus();
      const end = textarea.value.length;
      textarea.setSelectionRange(end, end);
    }, 180);

    return () => clearTimeout(t);
  }, [expandedActivity, response?.compare]);

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

  /* ── keep activity form data local so sidebar summary does not re-type on every keystroke ── */
  useEffect(() => {
    if (!response) {
      setActivityContexts([]);
      return;
    }

    if (Array.isArray(response.activityContexts) && response.activityContexts.length > 0) {
      setActivityContexts(response.activityContexts);
      return;
    }

    const parsedActivities = parseCompareActivities(response.compare);
    setActivityContexts(parsedActivities);
  }, [response?.compare, response?._ts]);

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
    if (!isLoggedIn && !isEmbedMode) { setShowAuthModal({ type: "compare", open: true }); return; }
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


  const enrichActivityTools = (items: ActivityContext[]) =>
    items.map((activity) => ({
      ...activity,
      // Tool chips should come from the AI-generated Compare payload.
      // Do not replace them with fixed frontend mappings.
      toolOptions: normalizeToolOptions(activity.toolOptions),
    }));

  const getActivityContexts = (): ActivityContext[] => {
    if (activityContexts.length > 0) return enrichActivityTools(activityContexts);

    if (Array.isArray(response?.activityContexts) && response.activityContexts.length > 0) {
      return enrichActivityTools(response.activityContexts);
    }

    return enrichActivityTools(parseCompareActivities(response?.compare));
  };

  const updateActivityDescription = (index: number, value: string) => {
    setActivityContexts((items) =>
      items.map((item, i) =>
        i === index ? { ...item, description: value } : item
      )
    );
  };

  const toggleActivityTool = (index: number, tool: string) => {
    setActivityContexts((items) =>
      items.map((item, i) => {
        if (i !== index) return item;

        const alreadySelected = item.tools.includes(tool);

        return {
          ...item,
          tools: alreadySelected
            ? item.tools.filter((t) => t !== tool)
            : [...item.tools, tool],
        };
      })
    );
  };

  const focusGeneratedActivityInsight = (index: number) => {
    setExpandedActivity(index);
    setHighlightedActivityIndex(index);

    window.setTimeout(() => {
      activityInsightRefs.current[index]?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }, 260);

    window.setTimeout(() => {
      setHighlightedActivityIndex((current) => (current === index ? null : current));
    }, 2200);
  };

  const handleWorkflowAnalysis = async () => {
    const activityContexts = getActivityContexts();

    if (!activityContexts.length) return;

    const hasAnyContext = activityContexts.some(
      (item) => item.description.trim().length > 0 || item.tools.length > 0
    );

    if (!hasAnyContext) {
      alert(
        language === "de"
          ? "Bitte beschreiben Sie mindestens eine Aktivität oder wählen Sie Tools aus."
          : "Please describe at least one activity or select some tools first."
      );
      return;
    }

    try {
      setWorkflowLoading(true);

      const result = await analyzeActivityWorkflow(
        industryData,
        descriptionData,
        activityContexts,
        language
      );

      const text = typeof result === "string" ? result : "";
      const parsed = parseWorkflowAnalysis(text);

      const aiActivities = Array.isArray(parsed?.activities) ? parsed.activities : [];

      const updatedContexts = activityContexts.map((item, index) => {
        const aiItem =
          aiActivities.find((a: any) =>
            String(a?.title || "").toLowerCase().trim() === item.title.toLowerCase().trim()
          ) || aiActivities[index];

        return {
          ...item,
          analysis: aiItem
            ? {
                analysis: aiItem.analysis || aiItem.summary || "",
                recommendedTools: Array.isArray(aiItem.recommendedTools) ? aiItem.recommendedTools : [],
                timeSaving: aiItem.timeSaving || "",
                automationGaps: Array.isArray(aiItem.automationGaps) ? aiItem.automationGaps : [],
              }
            : item.analysis,
        };
      });

      setActivityContexts(updatedContexts);

      setResponse((prev: any) => {
        if (!prev) return prev;

        const updated = {
          ...prev,
          activityContexts: updatedContexts,
          workflowAnalysis: parsed || { raw: text },
        };

        localStorage.setItem("ai_response", JSON.stringify(updated));
        return updated;
      });

      const preferredIndex =
        expandedActivity !== null && updatedContexts[expandedActivity]?.analysis?.analysis
          ? expandedActivity
          : updatedContexts.findIndex((item) => Boolean(item.analysis?.analysis));

      if (preferredIndex >= 0) {
        focusGeneratedActivityInsight(preferredIndex);
      }
    } catch (err) {
      console.error("❌ Workflow analysis error:", err);
      alert(
        language === "de"
          ? "Die Workflow-Analyse konnte nicht erstellt werden."
          : "Unable to generate workflow analysis right now."
      );
    } finally {
      setWorkflowLoading(false);
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
        @keyframes ps-insight-border-glow {
          0% { border-color: #bae6fd; box-shadow: 0 0 0 rgba(14,165,233,0); }
          18% { border-color: #38bdf8; box-shadow: 0 0 0 4px rgba(14,165,233,0.16), 0 0 18px rgba(14,165,233,0.32); }
          45% { border-color: #7dd3fc; box-shadow: 0 0 0 2px rgba(14,165,233,0.10), 0 0 12px rgba(14,165,233,0.20); }
          72% { border-color: #38bdf8; box-shadow: 0 0 0 4px rgba(14,165,233,0.14), 0 0 16px rgba(14,165,233,0.28); }
          100% { border-color: #bae6fd; box-shadow: 0 0 0 rgba(14,165,233,0); }
        }

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

        .ps-activity-card {
          border: 1px solid #e5e7eb;
          border-radius: 18px;
          background: #fff;
          overflow: hidden;
          animation: ps-fadein 0.35s ease both;
        }
        .ps-activity-header {
          width: 100%;
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
          padding: 12px 16px;
          background: #f7f8fa;
          border: none;
          cursor: pointer;
          font-family: inherit;
          text-align: left;
        }

        .ps-activity-arrow {
          color: #0ea5e9;
          font-weight: 800;
          font-size: 13px;
          display: inline-flex;
          transition: transform 0.22s ease;
        }
        .ps-activity-arrow.open { transform: rotate(90deg); }

        .ps-activity-body {
          overflow: hidden;
          max-height: 0;
          opacity: 0;
          transform: translateY(-6px);
          transition: max-height 0.32s ease, opacity 0.22s ease, transform 0.28s ease;
        }
        .ps-activity-body.open {
          max-height: 1100px;
          opacity: 1;
          transform: translateY(0);
        }
        .ps-activity-body-inner {
          padding: 14px 16px 16px;
          display: flex;
          flex-direction: column;
          gap: 14px;
        }

        .ps-tool-chip {
          border: 1px solid #e5e7eb;
          background: #f8fafc;
          border-radius: 999px;
          padding: 8px 13px;
          font-size: 12px;
          font-weight: 650;
          color: #374151;
          cursor: pointer;
          transition: all 0.15s ease;
          font-family: inherit;
        }
        .ps-tool-chip:hover {
          border-color: #78d2f5;
          background: #effaff;
        }
        .ps-tool-chip.active {
          border-color: #78d2f5;
          background: #e0f7ff;
          color: #0369a1;
          box-shadow: 0 0 0 2px rgba(120,210,245,0.16);
        }
        .ps-insight-box {
          border: 1px solid #bae6fd;
          border-radius: 16px;
          background: linear-gradient(135deg, #f0f9ff, #ffffff);
          padding: 13px 14px;
          transition: border-color 0.2s ease, box-shadow 0.2s ease;
        }
        .ps-insight-box.glow-once {
          animation: ps-insight-border-glow 2s ease-in-out both;
        }

        /* section label */
        .ps-label {
          font-size: 10px; font-weight: 700; letter-spacing: 0.09em;
          text-transform: uppercase; color: #9ca3af; margin-bottom: 4px;
        }

        /* scrollbar */
        .ps-scroll::-webkit-scrollbar { width: 0; }

        /* WordPress embed-only mobile polish. Normal live app is untouched. */
        .ps-embed-shell { height: calc(100vh - 80px); }
        .apc-embed .ps-embed-shell { height: 100%; }

        @media (max-width: 640px) {
          .apc-embed .ps-embed-shell {
            height: 980px !important;
            min-height: 980px;
            padding: 18px 14px !important;
            border-radius: 18px !important;
          }

          .apc-embed .ps-initial-state {
            justify-content: flex-start !important;
            gap: 18px !important;
          }

          .apc-embed .ps-intro-banner {
            padding: 18px 16px !important;
            border-radius: 22px !important;
            gap: 14px !important;
          }

          .apc-embed .ps-intro-icon {
            width: 40px !important;
            height: 40px !important;
            border-radius: 14px !important;
          }

          .apc-embed .ps-intro-title {
            font-size: 20px !important;
            line-height: 1.12 !important;
            margin-bottom: 10px !important;
            letter-spacing: -0.04em !important;
          }

          .apc-embed .ps-intro-text {
            font-size: 16px !important;
            line-height: 1.46 !important;
          }

          .apc-embed .ps-initial-form {
            margin-top: 0 !important;
            gap: 10px !important;
          }

          .apc-embed .ps-initial-form .ps-input {
            min-height: 48px !important;
            padding: 12px 16px !important;
            font-size: 15px !important;
          }

          .apc-embed .ps-initial-form .ps-textarea {
            min-height: 138px !important;
            padding: 14px 16px !important;
            font-size: 15px !important;
            line-height: 1.45 !important;
          }

          .apc-embed .ps-initial-form .ps-btn {
            min-height: 58px !important;
            font-size: 16px !important;
          }

          .apc-embed .ps-label { font-size: 11px !important; }
          .apc-embed .ps-activity-header { padding: 12px 14px !important; }
          .apc-embed .ps-activity-body-inner { padding: 13px 14px 15px !important; }
          .apc-embed .ps-tool-chip { font-size: 11px !important; padding: 7px 10px !important; }
        }
      `}</style>

      <div
        className="ps-embed-shell w-full bg-white rounded-2xl shadow-md border border-gray-200 px-5 md:px-10 py-5 md:py-8 flex flex-col overflow-hidden transition-all duration-700"
        style={{
          height: isEmbedMode ? "100%" : "calc(100vh - 80px)",
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
            <div className="ps-initial-state flex flex-col h-full justify-between gap-5">

              {/* ── BANNER ── */}
              <div className="ps-intro-banner" style={{
                background: "linear-gradient(135deg, #fafafa 0%, #f3f4f6 100%)",
                border: "1px solid #e5e7eb",
                borderRadius: 24,
                padding: "22px 24px",
                display: "flex",
                alignItems: "flex-start",
                gap: 16,
              }}>
                {/* icon */}
                <div className="ps-intro-icon" style={{
                  width: 42, height: 42, borderRadius: 14, flexShrink: 0,
                  background: "#fff", border: "1px solid #e5e7eb",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.07)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <img src="/star.png" alt="icon" style={{ width: 24, height: 24, objectFit: "contain" }} />
                </div>

                {/* text */}
                <div style={{ flex: 1 }}>
                  <h2 className="ps-intro-title" style={{ fontSize: 15, fontWeight: 800, color: "#0d1117", letterSpacing: "-0.02em", marginBottom: 6, lineHeight: 1.3 }}>
                    {language === "de" ? "Ey Eric! Mach mich produktiv!" : "Hey Eric! Make me productive!"}
                  </h2>
                  <p className="ps-intro-text" style={{ fontSize: 13, color: "#6b7280", lineHeight: 1.7, margin: 0 }}>
                    {language === "de"
                      ? "Die Welt dreht sich super schnell. Wer kann schon sagen, ob er die aktuell besten Tools und Methoden nutzt? Ey Eric analysiert Deine Arbeitsweise und schlägt gezielte Verbesserungen vor."
                      : "The world is moving fast. Who can confidently say they are using the best tools and methods? Ey Eric analyzes your workflow and suggests smarter ways to improve it."}
                  </p>
                </div>
              </div>

              {/* ── FORM ── */}
              <div className="ps-initial-form" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
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

                      {/* ACTIVITY BREAKDOWN + CONTEXT LAYERS */}
                      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        {getActivityContexts().map((activity: ActivityContext, i: number) => {
                          const isOpen = expandedActivity === i;
                          const activityToolOptions = normalizeToolOptions(activity.toolOptions);

                          return (
                            <div
                              key={`${activity.title}-${i}`}
                              className="ps-activity-card"
                              style={{ animationDelay: `${i * 0.04}s` }}
                            >
                              <button
                                type="button"
                                className="ps-activity-header"
                                onClick={() => setExpandedActivity(isOpen ? null : i)}
                              >
                                <span style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                                  <span className={`ps-activity-arrow ${isOpen ? "open" : ""}`}>▶</span>
                                  <span style={{ fontSize: 13, color: "#374151", fontWeight: 700 }}>
                                    {activity.title}
                                  </span>
                                </span>

                                <span style={{
                                  fontSize: 12, fontWeight: 800, color: "#0ea5e9",
                                  background: "#e0f2fe", padding: "4px 10px",
                                  borderRadius: 999, whiteSpace: "nowrap",
                                }}>
                                  {activity.hours}
                                </span>
                              </button>


                              <div className={`ps-activity-body ${isOpen ? "open" : ""}`} aria-hidden={!isOpen}>
                                <div className="ps-activity-body-inner">
                                  <div>
                                    <p style={{ fontSize: 12, fontWeight: 800, color: "#111827", margin: "0 0 8px" }}>
                                      {language === "de"
                                        ? `Beschreiben Sie, was Sie in ${activity.title} tatsächlich tun.`
                                        : `Tell us what you actually do in ${activity.title}.`}
                                    </p>

                                    <textarea
                                      ref={(el) => { activityTextareaRefs.current[i] = el; }}
                                      className="ps-textarea"
                                      placeholder={
                                        language === "de"
                                          ? "Beispiel: Ich plane Aufgaben, prüfe Anforderungen, löse Probleme und arbeite mit dem Team an der Umsetzung..."
                                          : "Example: I build APIs, fix bugs, review PRs, debug issues and connect frontend integrations..."
                                      }
                                      value={activity.description}
                                      onChange={(e) => updateActivityDescription(i, e.target.value)}
                                      style={{
                                        width: "100%",
                                        padding: "12px 14px",
                                        border: "1.5px solid #e5e7eb",
                                        borderRadius: 14,
                                        background: "#fff",
                                        fontSize: 13,
                                        color: "#111",
                                        fontFamily: "inherit",
                                        resize: "vertical",
                                        minHeight: 92,
                                        boxSizing: "border-box",
                                      }}
                                    />
                                  </div>

                                  <div>
                                    <p style={{
                                      fontSize: 12,
                                      fontWeight: 800,
                                      margin: "0 0 9px",
                                      background: "linear-gradient(90deg, #59ba45, #8bd879)",
                                      WebkitBackgroundClip: "text",
                                      WebkitTextFillColor: "transparent",
                                    }}>
                                      {language === "de"
                                        ? "Wählen Sie die Tools, Software oder Technologien aus, die Sie in dieser Aktivität nutzen."
                                        : "Select the tools, software or technologies you use in this activity."}
                                    </p>

                                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                                      {activityToolOptions.length > 0 ? activityToolOptions.map((tool) => (
                                        <button
                                          type="button"
                                          key={tool}
                                          className={`ps-tool-chip ${activity.tools.includes(tool) ? "active" : ""}`}
                                          onClick={() => toggleActivityTool(i, tool)}
                                        >
                                          {tool}
                                        </button>
                                      )) : (
                                        <span style={{ fontSize: 12, color: "#9ca3af", fontStyle: "italic" }}>
                                          {language === "de"
                                            ? "Tools werden beim nächsten Vergleich automatisch von der KI generiert."
                                            : "Tools will be generated by AI when you run Compare again."}
                                        </span>
                                      )}
                                    </div>
                                  </div>

                                  {activity.analysis?.analysis && (
                                    <div
                                      ref={(el) => { activityInsightRefs.current[i] = el; }}
                                      className={`ps-insight-box ${highlightedActivityIndex === i ? "glow-once" : ""}`}
                                    >
                                      <p style={{ fontSize: 12, fontWeight: 800, color: "#0369a1", margin: "0 0 6px" }}>
                                        {language === "de" ? "AI-Empfehlung" : "AI Recommendation"}
                                      </p>

                                      <p style={{ fontSize: 13, color: "#374151", lineHeight: 1.65, margin: "0 0 10px" }}>
                                        {activity.analysis.analysis}
                                      </p>

                                      {activity.analysis.recommendedTools && activity.analysis.recommendedTools.length > 0 && (
                                        <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: 8 }}>
                                          {activity.analysis.recommendedTools.map((tool) => (
                                            <span
                                              key={tool}
                                              style={{
                                                fontSize: 11,
                                                fontWeight: 800,
                                                color: "#0369a1",
                                                background: "#e0f2fe",
                                                borderRadius: 999,
                                                padding: "5px 9px",
                                              }}
                                            >
                                              {tool}
                                            </span>
                                          ))}
                                        </div>
                                      )}

                                      {activity.analysis.timeSaving && (
                                        <p style={{ fontSize: 12, fontWeight: 800, color: "#059669", margin: 0 }}>
                                          {language === "de" ? "Mögliche Zeitersparnis: " : "Potential time saving: "}
                                          {activity.analysis.timeSaving}
                                        </p>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {response?.workflowAnalysis?.overview && (
                        <div className="ps-insight-box" style={{ marginTop: 12 }}>
                          <p style={{ fontSize: 12, fontWeight: 800, color: "#0369a1", margin: "0 0 6px" }}>
                            {language === "de" ? "Gesamtanalyse" : "Overall Analysis"}
                          </p>
                          <p style={{ fontSize: 13, color: "#374151", lineHeight: 1.65, margin: 0 }}>
                            {response.workflowAnalysis.overview}
                          </p>
                        </div>
                      )}
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

              {/* ── COMPARE / ANALYZE BUTTON ── */}
              <div style={{ paddingTop: 14, flexShrink: 0 }}>
                {response?.compare ? (
                  <button
                    className="ps-btn"
                    onClick={handleWorkflowAnalysis}
                    disabled={workflowLoading}
                  >
                    {workflowLoading
                      ? (language === "de" ? "Analysiere…" : "Analyzing…")
                      : (language === "de" ? "Workflow analysieren" : "Analyze Workflow")}
                  </button>
                ) : (
                  <button
                    className="ps-btn"
                    onClick={handleCompare}
                    disabled={!!(loading && mode === "compare")}
                  >
                    {language === "de" ? "Vergleichen" : "Compare"}
                  </button>
                )}
              </div>
            </div>
          )}

        </div>
      </div>
    </>
  );
}
