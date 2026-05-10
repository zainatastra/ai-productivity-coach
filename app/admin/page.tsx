"use client";

import { useEffect, useState } from "react";
import { getAuth, onAuthStateChanged, signOut } from "firebase/auth";
import { getFirestore, collection, getDocs } from "firebase/firestore";
import { Eye } from "lucide-react";
import { API_BASE_URL } from "@/services/api";
import { useLanguage } from "@/services/LanguageContext";
import { adminApp } from "@/services/firebase";
import {
  LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
} from "recharts";
import {
  LayoutDashboard, Bug, FileText, Settings, LogOut, Users,
  MessageSquare, TrendingUp, TrendingDown, Search,
  PanelLeftClose, PanelLeftOpen, Menu, Pencil, Globe, Check, X,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { PieChart, Pie, Cell } from "recharts";

interface DashboardData {
  totalUsers: number;
  totalResponses: number;
  openBugs?: number;
  resolvedBugs?: number;
  graph: Record<string, number>;
  users: any[];
  newUsers: number;
  returningUsers: number;
  inactiveOldUsers: number;
  highlyActiveUsers: number;
  moderateUsers: number;
  inactiveUsers: number;
}

type AdminMenu = "dashboard" | "users" | "bugs" | "content" | "conversations" | "settings";

const PAGE_TITLES: Record<AdminMenu, string> = {
  dashboard:     "Admin Dashboard",
  users:         "Users",
  bugs:          "Bug Reports",
  content:       "Content Management",
  conversations: "Conversations",
  settings:      "Settings",
};

export default function AdminDashboard() {
  const auth = getAuth(adminApp);
  const { language } = useLanguage();

  const [data,                      setData]                      = useState<DashboardData | null>(null);
  const [loading,                   setLoading]                   = useState(true);
  const [unauthorized,              setUnauthorized]              = useState(false);
  const [activeMenu,                setActiveMenu]                = useState<AdminMenu>("dashboard");
  const [searchTerm,                setSearchTerm]                = useState("");
  const [roleFilter,                setRoleFilter]                = useState("All");
  const [showLogoutModal,           setShowLogoutModal]           = useState(false);
  const [mobileSidebarOpen,         setMobileSidebarOpen]         = useState(false);
  const [sidebarCollapsed,          setSidebarCollapsed]          = useState(false);
  const [conversations,             setConversations]             = useState<any[]>([]);
  const [selectedUserConversations, setSelectedUserConversations] = useState<any[]>([]);
  const [conversationModalOpen,     setConversationModalOpen]     = useState(false);
  const [uiTexts,                   setUiTexts]                   = useState<any>({});
  const [selectedField,             setSelectedField]             = useState<string | null>(null);
  const [modalOpen,                 setModalOpen]                 = useState(false);
  const [tempEN,                    setTempEN]                    = useState("");
  const [tempDE,                    setTempDE]                    = useState("");
  const [isSaving,                  setIsSaving]                  = useState(false);
  const [showSaveModal,             setShowSaveModal]             = useState(false);
  const [saveModalMsg,              setSaveModalMsg]              = useState<{ ok: boolean; text: string } | null>(null);

  const contentFields = [
    { key: "productivityCoach",             label: "Productivity Coach",           icon: Users },
    { key: "newChat",                       label: "New Chat",                     icon: MessageSquare },
    { key: "recentConversations",           label: "Recent Conversations",         icon: MessageSquare },
    { key: "Ey Eric! Mach mich produktiv!", label: "Ey Eric! Make me Productive!", icon: FileText },
    { key: "clear",                         label: "Clear Button",                 icon: X },
    { key: "industryPlaceholder",           label: "Industry Placeholder",         icon: FileText },
    { key: "jobPlaceholder",                label: "Job Placeholder",              icon: FileText },
    { key: "makeProductive",                label: "Make Me Productive",           icon: TrendingUp },
    { key: "compare",                       label: "Compare Button",               icon: Check },
  ];

  const navItems: { key: AdminMenu; label: string; Icon: any }[] = [
    { key: "dashboard",     label: "Dashboard",     Icon: LayoutDashboard },
    { key: "users",         label: "Users",         Icon: Users },
    { key: "bugs",          label: "Bug Reports",   Icon: Bug },
    { key: "content",       label: "Content",       Icon: FileText },
    { key: "conversations", label: "Conversations", Icon: MessageSquare },
    { key: "settings",      label: "Settings",      Icon: Settings },
  ];

  const handleLogout = async () => {
    try { await signOut(auth); window.location.href = "/admin/login"; }
    catch (e) { console.error("Logout failed:", e); }
  };

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) { setUnauthorized(true); setLoading(false); return; }
      try {
        const token = await user.getIdToken();
        const res = await fetch(`${API_BASE_URL}/api/admin/dashboard`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) { setUnauthorized(true); setLoading(false); return; }
        setData(await res.json());
      } catch (e) { console.error("Dashboard fetch error:", e); }
      finally { setLoading(false); }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/Admin/ui-texts`)
      .then(r => r.json())
      .then(setUiTexts)
      .catch(console.error);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const db = getFirestore(adminApp);
        const snap = await getDocs(collection(db, "users"));
        const all: any[] = [];
        for (const doc of snap.docs) {
          const convSnap = await getDocs(collection(db, "users", doc.id, "conversations"));
          all.push({
            userId: doc.id,
            fullName: doc.data().fullName,
            conversations: convSnap.docs.map(d => d.data()),
          });
        }
        setConversations(all);
      } catch (e) { console.error("Conversations fetch error:", e); }
    })();
  }, []);

  if (loading) return (
    <div className="flex h-screen items-center justify-center bg-gray-50">
      <p className="text-gray-400 text-sm">Loading admin dashboard…</p>
    </div>
  );

  if (unauthorized) {
    if (typeof window !== "undefined") window.location.href = "/admin/login";
    return null;
  }

  if (!data) return null;

  const filteredUsers = data.users
    .filter((u: any) =>
      u.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.email.toLowerCase().includes(searchTerm.toLowerCase())
    )
    .filter((u: any) => roleFilter === "All" || u.role === roleFilter);

  const graphEntries = Object.entries(data.graph);
  const graphData    = graphEntries.map(([date, value]) => ({
    date: new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    responses: value,
  }));

  const values      = graphEntries.map(([, v]) => v);
  const last7       = values.slice(-7);
  const previous7   = values.slice(-14, -7);
  const lastTotal   = last7.reduce((a, b) => a + b, 0);
  const prevTotal   = previous7.reduce((a, b) => a + b, 0);
  let growthPercent = 0;
  let isGrowthUp    = true;
  if (prevTotal > 0) {
    growthPercent = ((lastTotal - prevTotal) / prevTotal) * 100;
    isGrowthUp    = growthPercent >= 0;
  }

  const totalAcq       = data.newUsers + data.returningUsers + data.inactiveOldUsers;
  const newPct         = totalAcq ? (data.newUsers / totalAcq) * 100 : 0;
  const retPct         = totalAcq ? (data.returningUsers / totalAcq) * 100 : 0;
  const inactPct       = totalAcq ? (data.inactiveOldUsers / totalAcq) * 100 : 0;
  const acquisitionData = [
    { name: "New Users",          value: data.newUsers,         color: "#93c5fd" },
    { name: "Returning Users",    value: data.returningUsers,   color: "#86efac" },
    { name: "Inactive Old Users", value: data.inactiveOldUsers, color: "#000" },
  ];

  const totalAct   = data.highlyActiveUsers + data.moderateUsers + data.inactiveUsers;
  const hiPct      = totalAct ? (data.highlyActiveUsers / totalAct) * 100 : 0;
  const modPct     = totalAct ? (data.moderateUsers / totalAct) * 100 : 0;
  const inActPct   = totalAct ? (data.inactiveUsers / totalAct) * 100 : 0;
  const activityData = [
    { name: "Highly Active", value: data.highlyActiveUsers, color: "#22c55e" },
    { name: "Moderate",      value: data.moderateUsers,     color: "#1e3a8a" },
    { name: "Inactive",      value: data.inactiveUsers,     color: "#374151" },
  ];

  const showModal = (ok: boolean, text: string) => {
    setSaveModalMsg({ ok, text });
    setShowSaveModal(true);
  };

  const handleSaveAll = async () => {
    for (const f of contentFields) {
      if (!uiTexts[f.key]?.en?.trim()) { showModal(false, `${f.label} (English) is required.`); return; }
      if (!uiTexts[f.key]?.de?.trim()) { showModal(false, `${f.label} (German) is required.`);  return; }
    }
    const user = auth.currentUser;
    if (!user) { showModal(false, "Not authenticated."); return; }
    try {
      setIsSaving(true);
      const token = await user.getIdToken();
      const res = await fetch(`${API_BASE_URL}/api/Admin/ui-texts`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(uiTexts),
      });
      showModal(res.ok, res.ok ? "Content saved successfully!" : "Failed to save content. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const goTo = (key: AdminMenu) => { setActiveMenu(key); setMobileSidebarOpen(false); };

  /* ── reusable coming-soon block ── */
  const ComingSoon = ({ Icon, label, desc }: { Icon: any; label: string; desc: string }) => (
    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ textAlign: "center", maxWidth: 320, padding: "40px 24px" }}>
        <div style={{
          width: 64, height: 64, borderRadius: 999,
          background: "linear-gradient(135deg,#f3f4f6,#e5e7eb)",
          border: "1.5px solid #e5e7eb",
          display: "flex", alignItems: "center", justifyContent: "center",
          margin: "0 auto 20px", color: "#9ca3af",
          boxShadow: "0 4px 14px rgba(0,0,0,0.06)",
        }}>
          <Icon size={26} />
        </div>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 14px", borderRadius: 999, background: "#fef3c7", border: "1px solid #fde68a", marginBottom: 16 }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#f59e0b", display: "inline-block" }} />
          <span style={{ fontSize: 10, fontWeight: 700, color: "#92400e", letterSpacing: "0.08em", textTransform: "uppercase" as const }}>Coming Soon</span>
        </div>
        <h3 style={{ fontSize: 20, fontWeight: 800, color: "#0d1117", letterSpacing: "-0.025em", marginBottom: 10 }}>{label}</h3>
        <p style={{ fontSize: 13, color: "#9ca3af", lineHeight: 1.7 }}>{desc}</p>
      </div>
    </div>
  );

  return (
    <>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; }

        .adm-root {
          display: flex; height: 100vh; background: #f4f6f9;
          font-family: inherit; overflow: hidden;
        }

        /* ══ SIDEBAR ══ */
        .adm-sb {
          background: #fff; border-right: 1px solid #ebebeb;
          box-shadow: 2px 0 10px rgba(0,0,0,0.04);
          display: flex; flex-direction: column;
          height: 100vh; flex-shrink: 0;
          transition: width 0.26s cubic-bezier(0.22,1,0.36,1);
          overflow: hidden; position: relative; z-index: 50;
        }
        .adm-sb.open   { width: 240px; }
        .adm-sb.closed { width: 64px; }

        @media (max-width: 767px) {
          .adm-sb {
            position: fixed; top: 0; left: 0;
            transform: translateX(-100%);
            transition: transform 0.28s cubic-bezier(0.22,1,0.36,1), width 0.26s;
          }
          .adm-sb.mob-open { transform: translateX(0); width: 240px !important; }
        }

        .adm-sb-top {
          display: flex; align-items: center; justify-content: space-between;
          padding: 14px 12px 12px; border-bottom: 1px solid #f0f0f0;
          flex-shrink: 0; min-height: 64px;
        }
        .adm-sb-profile { display: flex; align-items: center; gap: 10px; min-width: 0; flex: 1; overflow: hidden; }
        .adm-avatar {
          width: 36px; height: 36px; border-radius: 999px; flex-shrink: 0;
          background: #fff; border: 1.5px solid #e5e7eb;
          display: flex; align-items: center; justify-content: center;
          font-size: 13px; font-weight: 700; color: #111;
          box-shadow: 0 1px 4px rgba(0,0,0,0.08);
        }
        .adm-sb-name { font-size: 13px; font-weight: 700; color: #0d1117; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .adm-sb-role { font-size: 10px; font-weight: 700; letter-spacing: 0.07em; text-transform: uppercase; color: #9ca3af; margin-top: 1px; }

        .adm-toggle {
          width: 30px; height: 30px; border-radius: 999px;
          border: 1px solid #e5e7eb; background: #fff;
          align-items: center; justify-content: center;
          cursor: pointer; color: #6b7280; flex-shrink: 0;
          transition: background 0.15s; margin-left: 6px;
        }
        .adm-toggle:hover { background: #f5f5f5; color: #111; }

        .adm-nav {
          flex: 1; padding: 10px 8px;
          display: flex; flex-direction: column;
          justify-content: center;
          gap: 3px; overflow: hidden;
        }
        .adm-nb {
          display: flex; align-items: center; gap: 10px;
          padding: 10px; border-radius: 12px; border: none;
          background: transparent; cursor: pointer; font-family: inherit;
          font-size: 13px; font-weight: 500; color: #6b7280;
          transition: background 0.15s, color 0.15s;
          white-space: nowrap; overflow: hidden; text-align: left; width: 100%;
        }
        .adm-nb:hover  { background: #f5f5f5; color: #111; }
        .adm-nb.active { background: #f0f0f0; color: #0d1117; font-weight: 700; }
        .adm-nb.col    { justify-content: center; }

        .adm-lo-wrap { padding: 8px; border-top: 1px solid #f0f0f0; flex-shrink: 0; }
        .adm-lo-btn {
          display: flex; align-items: center; gap: 10px;
          padding: 9px 12px; border-radius: 999px; border: none;
          background: transparent; cursor: pointer; font-family: inherit;
          font-size: 13px; font-weight: 500; color: #dc2626;
          transition: background 0.15s; width: 100%; white-space: nowrap; overflow: hidden;
        }
        .adm-lo-btn:hover { background: #fef2f2; }
        .adm-lo-btn.col { justify-content: center; }

        /* ══ MAIN ══ */
        .adm-main { flex: 1; display: flex; flex-direction: column; overflow: hidden; min-width: 0; }

        .adm-topbar {
          display: flex; align-items: center; gap: 12px;
          padding: 14px 28px; border-bottom: 1px solid #ebebeb;
          background: #fff; flex-shrink: 0;
        }
        @media (max-width: 767px) { .adm-topbar { padding: 12px 16px; } }
        .adm-topbar-title { font-size: 16px; font-weight: 800; color: #0d1117; letter-spacing: -0.02em; }

        .adm-mob-btn {
          width: 34px; height: 34px; border-radius: 10px;
          border: 1px solid #e5e7eb; background: #fff;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; color: #374151; flex-shrink: 0;
        }

        .adm-content { flex: 1; overflow-y: auto; padding: 24px 28px; min-height: 0; display: flex; flex-direction: column; }
        @media (max-width: 767px) { .adm-content { padding: 16px; } }
        .adm-content::-webkit-scrollbar { width: 0; }

        /* ══ TABLE CARD ══ */
        .adm-tc {
          background: #fff; border: 1.5px solid #ebebeb; border-radius: 20px;
          overflow: hidden; box-shadow: 0 1px 4px rgba(0,0,0,0.05);
          display: flex; flex-direction: column; flex: 1; min-height: 0;
        }
        .adm-toolbar {
          display: flex; align-items: center; gap: 10px;
          padding: 13px 16px; border-bottom: 1px solid #f0f0f0; flex-shrink: 0;
        }
        .adm-tb-title { font-size: 14px; font-weight: 700; color: #0d1117; flex-shrink: 0; }

        /* search centred */
        .adm-search-center { flex: 1; display: flex; justify-content: center; }
        .adm-sw { position: relative; width: 100%; max-width: 300px; }
        .adm-si { position: absolute; left: 11px; top: 50%; transform: translateY(-50%); color: #9ca3af; pointer-events: none; }
        .adm-sinput {
          width: 100%; padding: 8px 12px 8px 32px;
          border: 1.5px solid #e5e7eb; border-radius: 999px;
          font-size: 13px; background: #fafafa; color: #111;
          outline: none; font-family: inherit;
          transition: border-color 0.18s, box-shadow 0.18s;
        }
        .adm-sinput:focus { border-color: #111; box-shadow: 0 0 0 3px rgba(0,0,0,0.06); background: #fff; }

        /* filter right */
        .adm-filter-right { display: flex; align-items: center; gap: 7px; margin-left: auto; }
        .adm-filter-label { font-size: 11px; color: #9ca3af; font-weight: 600; }
        .adm-sel {
          padding: 7px 11px; border: 1.5px solid #e5e7eb; border-radius: 999px;
          font-size: 12px; font-family: inherit; color: #374151; background: #fafafa;
          outline: none; cursor: pointer;
        }
        .adm-sel:focus { border-color: #111; }

        .adm-tbody-scroll { flex: 1; overflow-y: auto; }
        .adm-tbody-scroll::-webkit-scrollbar { width: 0; }

        .adm-table { width: 100%; border-collapse: collapse; }
        .adm-table thead { background: #fafafa; position: sticky; top: 0; z-index: 1; }
        .adm-table th {
          padding: 10px 16px; font-size: 10px; font-weight: 700;
          letter-spacing: 0.08em; text-transform: uppercase; color: #9ca3af;
          text-align: left; border-bottom: 1px solid #f0f0f0;
        }
        .adm-table td { padding: 12px 16px; font-size: 13px; border-bottom: 1px solid #f7f7f7; vertical-align: middle; }
        .adm-table tbody tr:last-child td { border-bottom: none; }
        .adm-table tbody tr:hover td { background: #fafafa; }

        .adm-uav {
          width: 30px; height: 30px; border-radius: 999px; flex-shrink: 0;
          background: #f3f4f6; border: 1px solid #e5e7eb;
          display: flex; align-items: center; justify-content: center;
          font-size: 11px; font-weight: 700; color: #374151;
        }
        .adm-rbadge {
          display: inline-flex; padding: 3px 10px; border-radius: 999px;
          font-size: 11px; font-weight: 600; background: #f3f4f6; color: #374151;
        }
        .adm-rbadge.admin { background: #fef3c7; color: #92400e; }

        /* ══ CONTENT SECTION ══ */
        .adm-content-outer {
          background: #fff; border: 1.5px solid #ebebeb; border-radius: 20px;
          overflow: hidden; box-shadow: 0 1px 4px rgba(0,0,0,0.05);
          display: flex; flex-direction: column; flex: 1; min-height: 0;
        }
        .adm-content-rows {
          flex: 1; overflow-y: auto; padding: 16px;
          display: flex; flex-direction: column; gap: 8px;
        }
        .adm-content-rows::-webkit-scrollbar { width: 0; }
        .adm-cr {
          display: flex; align-items: center; justify-content: space-between;
          padding: 13px 16px; background: #fff;
          border: 1.5px solid #ebebeb; border-radius: 14px;
          transition: border-color 0.18s, box-shadow 0.18s; flex-shrink: 0;
        }
        .adm-cr:hover { border-color: #d1d5db; box-shadow: 0 2px 8px rgba(0,0,0,0.05); }
        .adm-cr-left { display: flex; align-items: center; gap: 12px; }
        .adm-cr-icon {
          width: 34px; height: 34px; border-radius: 10px; flex-shrink: 0;
          background: #f3f4f6; display: flex; align-items: center; justify-content: center; color: #6b7280;
        }
        .adm-cr-label  { font-size: 13px; font-weight: 600; color: #0d1117; }
        .adm-cr-preview { font-size: 11px; color: #9ca3af; margin-top: 2px; }
        .adm-edit-btn {
          width: 32px; height: 32px; border-radius: 999px; border: 1.5px solid #e5e7eb;
          background: #fff; display: flex; align-items: center; justify-content: center;
          cursor: pointer; color: #6b7280; flex-shrink: 0;
          transition: background 0.15s, color 0.15s;
        }
        .adm-edit-btn:hover { background: #f5f5f5; color: #111; }

        /* save footer — pinned inside content card */
        .adm-save-footer { padding: 14px 16px; border-top: 1px solid #f0f0f0; flex-shrink: 0; background: #fff; }
        .adm-save-btn {
          width: 100%; padding: 12px; border: none; border-radius: 999px;
          background: #0d1117; color: #fff; font-size: 13px; font-weight: 700;
          cursor: pointer; font-family: inherit;
          transition: opacity 0.15s, transform 0.12s;
          box-shadow: 0 2px 8px rgba(0,0,0,0.15);
        }
        .adm-save-btn:hover:not(:disabled) { opacity: 0.88; transform: translateY(-1px); }
        .adm-save-btn:disabled { opacity: 0.5; cursor: not-allowed; }

        /* modal input */
        .adm-mi {
          width: 100%; padding: 10px 14px; border: 1.5px solid #e5e7eb;
          border-radius: 999px; font-size: 13px; font-family: inherit;
          outline: none; background: #fafafa; color: #111;
          transition: border-color 0.18s;
        }
        .adm-mi:focus { border-color: #111; background: #fff; }
        .adm-ml {
          font-size: 10px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase;
          color: #9ca3af; margin-bottom: 6px; display: flex; align-items: center; gap: 6px;
        }

        .adm-scroll::-webkit-scrollbar { width: 0; }

        @media (max-width: 600px) { .adm-table .hide-mob { display: none; } }
      `}</style>

      <div className="adm-root">

        {/* ── MOBILE BACKDROP ── */}
        <AnimatePresence>
          {mobileSidebarOpen && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 0.3 }} exit={{ opacity: 0 }}
              style={{ position: "fixed", inset: 0, background: "#000", zIndex: 40 }}
              className="md:hidden"
              onClick={() => setMobileSidebarOpen(false)}
            />
          )}
        </AnimatePresence>

        {/* ══ SIDEBAR ══ */}
        <aside className={`adm-sb ${sidebarCollapsed ? "closed" : "open"} ${mobileSidebarOpen ? "mob-open" : ""}`}>

          <div className="adm-sb-top">
            {!sidebarCollapsed && (
              <div className="adm-sb-profile">
                <div className="adm-avatar">M</div>
                <div style={{ minWidth: 0 }}>
                  <div className="adm-sb-name">Matthias Scheffer</div>
                  <div className="adm-sb-role">Admin</div>
                </div>
              </div>
            )}
            {sidebarCollapsed && <div style={{ flex: 1 }} />}
            {/* desktop only toggle */}
            <button
              className="adm-toggle hidden md:flex"
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              title={sidebarCollapsed ? "Expand" : "Collapse"}
            >
              {sidebarCollapsed ? <PanelLeftOpen size={14} /> : <PanelLeftClose size={14} />}
            </button>
          </div>

          <nav className="adm-nav">
            {navItems.map(({ key, label, Icon }) => (
              <button
                key={key}
                onClick={() => goTo(key)}
                className={`adm-nb ${activeMenu === key ? "active" : ""} ${sidebarCollapsed ? "col" : ""}`}
                title={sidebarCollapsed ? label : undefined}
              >
                <Icon size={16} style={{ flexShrink: 0 }} />
                {!sidebarCollapsed && label}
              </button>
            ))}
          </nav>

          <div className="adm-lo-wrap">
            <button
              className={`adm-lo-btn ${sidebarCollapsed ? "col" : ""}`}
              onClick={() => { setShowLogoutModal(true); setMobileSidebarOpen(false); }}
            >
              <LogOut size={15} style={{ flexShrink: 0 }} />
              {!sidebarCollapsed && "Logout"}
            </button>
          </div>
        </aside>

        {/* ══ MAIN ══ */}
        <div className="adm-main">

          {/* Top bar */}
          <div className="adm-topbar">
            {/* mobile hamburger only */}
            <button className="adm-mob-btn md:hidden" onClick={() => setMobileSidebarOpen(true)}>
              <Menu size={17} />
            </button>
            <span className="adm-topbar-title">{PAGE_TITLES[activeMenu]}</span>
          </div>

          {/* Content area */}
          <div className="adm-content">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeMenu}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.22 }}
                style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}
              >

                {/* ══════════ DASHBOARD ══════════ */}
                {activeMenu === "dashboard" && (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-5 mb-6">
                      {[
                        { label: "Total Users",     Icon: Users,         value: data.totalUsers },
                        { label: "Total Responses", Icon: MessageSquare, value: data.totalResponses },
                      ].map(({ label, Icon, value }) => (
                        <div key={label} className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition">
                          <div className="flex items-center gap-2 text-gray-500 text-sm mb-2"><Icon size={15} />{label}</div>
                          <h3 className="text-2xl font-semibold text-gray-900">{value}</h3>
                        </div>
                      ))}
                      <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition">
                        <div className="flex items-center gap-2 text-gray-500 text-sm mb-3"><Bug size={15} />Bug Reports</div>
                        <div className="flex items-center justify-between">
                          <div><p className="text-xs text-gray-500">Opened</p><p className="text-lg font-semibold text-red-600">{data.openBugs ?? 0}</p></div>
                          <div><p className="text-xs text-gray-500">Resolved</p><p className="text-lg font-semibold text-green-600">{data.resolvedBugs ?? 0}</p></div>
                        </div>
                      </div>
                      <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition">
                        <div className="flex items-center gap-2 text-gray-500 text-sm mb-2"><Users size={15} />User Growth (7d)</div>
                        <div className="flex items-center gap-2 mb-2">
                          <h3 className="text-xl font-semibold">{Math.abs(growthPercent).toFixed(1)}%</h3>
                          {isGrowthUp ? <TrendingUp size={15} className="text-green-600" /> : <TrendingDown size={15} className="text-red-600" />}
                        </div>
                        <ResponsiveContainer width="100%" height={38}>
                          <LineChart data={last7.map((v, i) => ({ name: i, value: v }))}>
                            <Line type="monotone" dataKey="value" stroke={isGrowthUp ? "#16a34a" : "#dc2626"} strokeWidth={2} dot={false} />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                      <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                        <h3 className="font-semibold mb-4 text-sm">User Activity (7 Days)</h3>
                        <ResponsiveContainer width="100%" height={190}>
                          <PieChart>
                            <Pie data={activityData} dataKey="value" innerRadius={52} outerRadius={80} paddingAngle={4}>
                              {activityData.map((e, i) => <Cell key={i} fill={e.color} />)}
                            </Pie>
                          </PieChart>
                        </ResponsiveContainer>
                        <div className="mt-4 space-y-2 text-xs">
                          {[["#22c55e","Highly Active",hiPct],["#1e3a8a","Moderate",modPct],["#374151","Inactive",inActPct]].map(([c,n,p]) => (
                            <div key={String(n)} className="flex items-center justify-between">
                              <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full" style={{ background: String(c) }} />{String(n)}</div>
                              <span>{Number(p).toFixed(1)}%</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="col-span-1 md:col-span-2 bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                        <h3 className="font-semibold mb-4 text-sm">Responses Generated (7 Days)</h3>
                        <ResponsiveContainer width="100%" height={270}>
                          <LineChart data={graphData} margin={{ top: 10, right: 16, left: 6, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="date" style={{ fontSize: 11 }} />
                            <YAxis width={34} style={{ fontSize: 11 }} />
                            <Tooltip />
                            <Line type="monotone" dataKey="responses" stroke="#000" strokeWidth={2} dot={{ r: 3 }} />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>

                      <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                        <h3 className="font-semibold mb-4 text-sm">User Acquisition (30 Days)</h3>
                        <ResponsiveContainer width="100%" height={190}>
                          <PieChart>
                            <Pie data={acquisitionData} dataKey="value" innerRadius={52} outerRadius={80} paddingAngle={4}>
                              {acquisitionData.map((e, i) => <Cell key={i} fill={e.color} />)}
                            </Pie>
                          </PieChart>
                        </ResponsiveContainer>
                        <div className="mt-4 space-y-2 text-xs">
                          {[["#93c5fd","New Users",newPct],["#86efac","Returning",retPct],["#000","Inactive Old",inactPct]].map(([c,n,p]) => (
                            <div key={String(n)} className="flex items-center justify-between">
                              <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full" style={{ background: String(c) }} />{String(n)}</div>
                              <span>{Number(p).toFixed(1)}%</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </>
                )}

                {/* ══════════ USERS ══════════ */}
                {activeMenu === "users" && (
                  <div className="adm-tc">
                    <div className="adm-toolbar">
                      <span className="adm-tb-title">Users Table</span>
                      {/* search — centred */}
                      <div className="adm-search-center">
                        <div className="adm-sw">
                          <Search size={13} className="adm-si" />
                          <input
                            type="text"
                            placeholder="Search users…"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="adm-sinput"
                          />
                        </div>
                      </div>
                      {/* filter — right */}
                      <div className="adm-filter-right">
                        <span className="adm-filter-label">Filter</span>
                        <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className="adm-sel">
                          <option value="All">All</option>
                          <option value="User">Users</option>
                          <option value="Admin">Admin</option>
                        </select>
                      </div>
                    </div>

                    <div className="adm-tbody-scroll">
                      <table className="adm-table">
                        <thead>
                          <tr>
                            <th>Name</th>
                            <th className="hide-mob">Email</th>
                            <th>Role</th>
                            <th className="hide-mob">Joined</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredUsers.map((user: any) => (
                            <tr key={user.id}>
                              <td>
                                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                  <div className="adm-uav">{user.fullName?.charAt(0)?.toUpperCase() || "?"}</div>
                                  <span style={{ fontWeight: 600, color: "#0d1117", fontSize: 13 }}>{user.fullName}</span>
                                </div>
                              </td>
                              <td className="hide-mob" style={{ color: "#6b7280", fontSize: 13 }}>{user.email}</td>
                              <td>
                                <span className={`adm-rbadge ${user.role?.toLowerCase() === "admin" ? "admin" : ""}`}>
                                  {user.role}
                                </span>
                              </td>
                              <td className="hide-mob" style={{ color: "#9ca3af", fontSize: 12 }}>
                                {new Date(user.createdAt).toLocaleDateString("en-GB")}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* ══════════ CONTENT ══════════ */}
                {activeMenu === "content" && (
                  <div className="adm-content-outer">
                    <div className="adm-content-rows">
                      {contentFields.map((field) => {
                        const IconComp = field.icon;
                        const preview  = uiTexts?.[field.key]?.en;
                        return (
                          <div key={field.key} className="adm-cr">
                            <div className="adm-cr-left">
                              <div className="adm-cr-icon"><IconComp size={15} /></div>
                              <div>
                                <div className="adm-cr-label">{field.label}</div>
                                {preview && (
                                  <div className="adm-cr-preview">
                                    {preview.length > 52 ? preview.slice(0, 52) + "…" : preview}
                                  </div>
                                )}
                              </div>
                            </div>
                            <button
                              className="adm-edit-btn"
                              onClick={() => {
                                setSelectedField(field.key);
                                setTempEN(uiTexts?.[field.key]?.en || "");
                                setTempDE(uiTexts?.[field.key]?.de || "");
                                setModalOpen(true);
                              }}
                            >
                              <Pencil size={13} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                    {/* Save button pinned to bottom — always visible */}
                    <div className="adm-save-footer">
                      <button
                        className="adm-save-btn"
                        onClick={handleSaveAll}
                        disabled={isSaving}
                      >
                        {isSaving ? "Saving…" : "Save All Changes"}
                      </button>
                    </div>
                  </div>
                )}

                {/* ══════════ CONVERSATIONS ══════════ */}
                {activeMenu === "conversations" && (
                  <div className="adm-tc">
                    <div className="adm-tbody-scroll">
                      <table className="adm-table">
                        <thead>
                          <tr>
                            <th>User</th>
                            <th>Conversations</th>
                            <th style={{ textAlign: "center" }}>View</th>
                          </tr>
                        </thead>
                        <tbody>
                          {conversations.map((user, i) => (
                            <tr key={i}>
                              <td style={{ fontWeight: 600, color: "#0d1117", fontSize: 13 }}>{user.fullName || "Unknown User"}</td>
                              <td style={{ color: "#6b7280", fontSize: 13 }}>{user.conversations.length}</td>
                              <td style={{ textAlign: "center" }}>
                                <button
                                  onClick={() => { setSelectedUserConversations(user.conversations); setConversationModalOpen(true); }}
                                  style={{ width: 30, height: 30, borderRadius: 999, border: "1.5px solid #e5e7eb", background: "#fff", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", color: "#6b7280" }}
                                >
                                  <Eye size={14} />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* ══════════ BUG REPORTS — COMING SOON ══════════ */}
                {activeMenu === "bugs" && (
                  <ComingSoon
                    Icon={Bug}
                    label="Bug Reports"
                    desc="Bug reporting management is under development and will be available in the next release."
                  />
                )}

                {/* ══════════ SETTINGS — COMING SOON ══════════ */}
                {activeMenu === "settings" && (
                  <ComingSoon
                    Icon={Settings}
                    label="Settings"
                    desc="Admin settings configuration is under development and will be available in the next release."
                  />
                )}

              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* ══ SAVE CONFIRMATION MODAL ══ */}
      <AnimatePresence>
        {showSaveModal && saveModalMsg && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ position: "fixed", inset: 0, zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.35)", backdropFilter: "blur(4px)" }}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              style={{ background: "#fff", borderRadius: 20, width: "min(360px,90vw)", padding: "32px 28px 28px", textAlign: "center", boxShadow: "0 20px 60px rgba(0,0,0,0.15)" }}
            >
              <div style={{ width: 52, height: 52, borderRadius: 999, background: saveModalMsg.ok ? "#f0fdf4" : "#fef2f2", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 18px", color: saveModalMsg.ok ? "#16a34a" : "#dc2626" }}>
                {saveModalMsg.ok ? <Check size={24} /> : <X size={24} />}
              </div>
              <h3 style={{ fontSize: 16, fontWeight: 800, color: "#0d1117", marginBottom: 8, letterSpacing: "-0.015em" }}>
                {saveModalMsg.ok ? "Saved successfully!" : "Something went wrong"}
              </h3>
              <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 24, lineHeight: 1.6 }}>{saveModalMsg.text}</p>
              <button
                onClick={() => setShowSaveModal(false)}
                style={{ padding: "10px 32px", borderRadius: 999, border: "none", background: saveModalMsg.ok ? "#0d1117" : "#dc2626", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}
              >
                OK
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ══ LOGOUT MODAL ══ */}
      <AnimatePresence>
        {showLogoutModal && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ position: "fixed", inset: 0, zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.35)", backdropFilter: "blur(4px)" }}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              style={{ background: "#fff", borderRadius: 20, width: "min(380px,90vw)", padding: "28px 24px 24px", textAlign: "center", boxShadow: "0 20px 60px rgba(0,0,0,0.15)" }}
            >
              <div style={{ width: 48, height: 48, borderRadius: 999, background: "#fef2f2", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", color: "#dc2626" }}>
                <LogOut size={22} />
              </div>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: "#0d1117", marginBottom: 6 }}>
                {language === "de" ? "Abmelden?" : "Sign out?"}
              </h3>
              <p style={{ fontSize: 13, color: "#9ca3af", marginBottom: 22 }}>
                {language === "de" ? "Sie werden von Ihrem Konto abgemeldet." : "You will be signed out of your account."}
              </p>
              <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
                <button
                  onClick={() => setShowLogoutModal(false)}
                  style={{ padding: "9px 20px", borderRadius: 999, border: "1.5px solid #e5e7eb", background: "#fff", fontSize: 13, fontWeight: 600, color: "#374151", cursor: "pointer", fontFamily: "inherit" }}
                >
                  {language === "de" ? "Abbrechen" : "Cancel"}
                </button>
                <button
                  onClick={handleLogout}
                  style={{ padding: "9px 20px", borderRadius: 999, border: "none", background: "#dc2626", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}
                >
                  {language === "de" ? "Abmelden" : "Logout"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ══ CONTENT EDIT MODAL ══ */}
      <AnimatePresence>
        {modalOpen && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ position: "fixed", inset: 0, zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.35)", backdropFilter: "blur(4px)" }}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              style={{ background: "#fff", borderRadius: 20, width: "min(420px,92vw)", padding: "28px", boxShadow: "0 20px 60px rgba(0,0,0,0.15)" }}
            >
              <h3 style={{ fontSize: 16, fontWeight: 700, color: "#0d1117", marginBottom: 20 }}>Edit Content</h3>
              <div style={{ marginBottom: 14 }}>
                <label className="adm-ml"><Globe size={12} /> English</label>
                <input value={tempEN} onChange={(e) => setTempEN(e.target.value)} className="adm-mi" placeholder="English text…" />
              </div>
              <div style={{ marginBottom: 22 }}>
                <label className="adm-ml"><Globe size={12} /> Deutsch</label>
                <input value={tempDE} onChange={(e) => setTempDE(e.target.value)} className="adm-mi" placeholder="German text…" />
              </div>
              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <button
                  onClick={() => setModalOpen(false)}
                  style={{ padding: "9px 18px", borderRadius: 999, border: "1.5px solid #e5e7eb", background: "#fff", fontSize: 13, fontWeight: 600, color: "#374151", cursor: "pointer", fontFamily: "inherit" }}
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    if (!tempEN.trim() || !tempDE.trim()) {
                      showModal(false, "Both English and German fields are required.");
                      return;
                    }
                    if (!selectedField) return;
                    setUiTexts((prev: any) => ({ ...prev, [selectedField]: { en: tempEN, de: tempDE } }));
                    setModalOpen(false);
                  }}
                  style={{ padding: "9px 18px", borderRadius: 999, border: "none", background: "#0d1117", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}
                >
                  Save
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ══ CONVERSATION MODAL ══ */}
      <AnimatePresence>
        {conversationModalOpen && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ position: "fixed", inset: 0, zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.35)", backdropFilter: "blur(4px)" }}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="adm-scroll"
              style={{ background: "#fff", borderRadius: 20, width: "min(660px,94vw)", maxHeight: "80vh", overflowY: "auto", padding: "28px", boxShadow: "0 20px 60px rgba(0,0,0,0.15)" }}
            >
              <h3 style={{ fontSize: 16, fontWeight: 700, color: "#0d1117", marginBottom: 18 }}>User Conversations</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {selectedUserConversations.map((conv, i) => (
                  <div key={i} style={{ border: "1.5px solid #ebebeb", borderRadius: 14, padding: "14px 16px" }}>
                    <p style={{ fontSize: 13, marginBottom: 4 }}><strong>Industry:</strong> {conv.industry}</p>
                    <p style={{ fontSize: 13, marginBottom: 4 }}><strong>Description:</strong> {conv.description}</p>
                    <p style={{ fontSize: 13, marginBottom: 8 }}><strong>Language:</strong> {conv.language}</p>
                    <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>AI Response:</p>
                    <p style={{ fontSize: 13, color: "#4b5563", lineHeight: 1.7 }}>{conv.response}</p>
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 20 }}>
                <button
                  onClick={() => setConversationModalOpen(false)}
                  style={{ padding: "9px 20px", borderRadius: 999, border: "none", background: "#0d1117", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}
                >
                  Close
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}