"use client";

import { useEffect, useState, useRef } from "react";
import { getAuth, signOut } from "firebase/auth";
import { app } from "@/services/firebase";
import { useAuth } from "@/services/AuthContext";
import { useLanguage } from "@/services/LanguageContext";
import { API_BASE_URL } from "@/services/api";
import { motion, AnimatePresence } from "framer-motion";
import { LayoutDashboard } from "lucide-react";
import {
  MoreHorizontal,
  Pin,
  Pencil,
  Trash2,
  Check,
  ChevronDown,
  Settings,
  HelpCircle,
  LogOut,
  FileText,
  Bug,
  SidebarClose,
  SidebarOpen,
  Plus,
  ChevronRight,
} from "lucide-react";

import ConfirmModal from "./ConfirmModal";
import Toast from "./Toast";

interface Conversation {
  id: string;
  title?: string;
  industry: string;
  description: string;
  response: string;
  createdAt: string;
  isPinned?: boolean;
}

interface Props {
  onSelectConversation: (conversation: any) => void;
  disabled?: boolean;
  industryData?: string;
  descriptionData?: string;
  response?: any;
  refreshKey?: number;   // ✅ bump this to trigger conversation re-fetch
}

/* ── Typing animation for newest sidebar title ── */
function AnimatingTitle({
  text,
  isNew,
  onDone,
}: {
  text: string;
  isNew: boolean;
  onDone: () => void;
}) {
  const [displayed, setDisplayed] = useState("");

  useEffect(() => {
    if (!isNew) {
      setDisplayed(text);
      return;
    }
    let i = 0;
    setDisplayed("");
    const iv = setInterval(() => {
      i++;
      setDisplayed(text.slice(0, i));
      if (i >= text.length) {
        clearInterval(iv);
        setTimeout(onDone, 100);
      }
    }, 36);
    return () => clearInterval(iv);
  }, [text, isNew]);

  return <span className="sb-chat-text">{displayed}</span>;
}

export default function Sidebar({
  onSelectConversation,
  disabled = false,
  industryData,
  descriptionData,
  response,
  refreshKey = 0,
}: Props) {
  const { t } = useLanguage();
  const auth = getAuth(app);
  const { user } = useAuth();
  const { language } = useLanguage();

  const isLoggedIn = !!user;

  const firstName =
    user?.displayName?.split(" ")[0] ||
    user?.email?.split("@")[0] ||
    "User";

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Conversation | null>(null);
  const [showToast, setShowToast] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isLoadingChats, setIsLoadingChats] = useState(true);
  const [collapsed, setCollapsed] = useState(false);
  const [newestId, setNewestId] = useState<string | null>(null);

  const [typedIndustry, setTypedIndustry] = useState("");
  const [typedWorkField, setTypedWorkField] = useState("");
  const [typedBenchmark, setTypedBenchmark] = useState("");

  const profileRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  /* ── FETCH CONVERSATIONS ── */
  useEffect(() => {
    const fetchConversations = async () => {
      setIsLoadingChats(true);
      try {
        const currentUser = auth.currentUser;
        if (!currentUser) { setIsLoadingChats(false); return; }
        const token = await currentUser.getIdToken();
        const res = await fetch(`${API_BASE_URL}/api/Conversation`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok || res.status === 401) { setConversations([]); return; }
        const data = await res.json();
        if (!Array.isArray(data)) { setConversations([]); return; }
        const sorted = [...data].sort(
          (a: Conversation, b: Conversation) => Number(b.isPinned) - Number(a.isPinned)
        );
        // Track newest conversation for typing animation
        setConversations(prev => {
          const prevIds = new Set(prev.map((c: Conversation) => c.id));
          const incoming = sorted.find((c: Conversation) => !prevIds.has(c.id));
          if (incoming) setNewestId(incoming.id);
          return sorted;
        });
      } catch (error) {
        console.error("Conversation fetch error:", error);
        setConversations([]);
      } finally {
        setIsLoadingChats(false);
      }
    };
    fetchConversations();
  }, [user, refreshKey]);

  /* ── CLOSE MENUS + TYPING EFFECT ── */
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(event.target as Node) &&
        !(event.target as Element).closest?.(".menu-trigger")
      ) {
        setActiveMenu(null);
      }
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setProfileOpen(false);
        setHelpOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);

    const intervals: any[] = [];
    const timeouts: any[] = [];

    if (response) {
      setTypedIndustry("");
      setTypedWorkField("");
      setTypedBenchmark("");

      const type = (text: string, setter: any, delay: number) => {
        let i = 0;
        const interval = setInterval(() => {
          i++;
          setter(text.slice(0, i));
          if (i >= text.length) clearInterval(interval);
        }, delay);
        intervals.push(interval);
      };

      type(response.industry || "", setTypedIndustry, 20);
      timeouts.push(setTimeout(() => { type(response.work_field || "", setTypedWorkField, 20); }, 300));
      timeouts.push(setTimeout(() => { type(response.benchmark || "", setTypedBenchmark, 20); }, 600));
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      intervals.forEach(clearInterval);
      timeouts.forEach(clearTimeout);
    };
  }, [response]);

  /* ── UPDATE ── */
  const updateConversation = async (id: string, body: any) => {
    const currentUser = auth.currentUser;
    if (!currentUser) return;
    const token = await currentUser.getIdToken();
    await fetch(`${API_BASE_URL}/api/Conversation/${id}`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  };

  /* ── DELETE ── */
  const handleDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) return;
      const token = await currentUser.getIdToken();
      await fetch(`${API_BASE_URL}/api/Conversation/${deleteTarget.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      setConversations((prev) => prev.filter((c) => c.id !== deleteTarget.id));
      setDeleteTarget(null);
      setShowToast(true);
      setTimeout(() => setShowToast(false), 2500);
    } catch (err) {
      console.error("Delete failed:", err);
    } finally {
      setIsDeleting(false);
    }
  };

  /* ── LOGOUT ── */
  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await signOut(auth);
      setShowLogoutModal(false);
    } catch (err) {
      console.error("Logout failed:", err);
    } finally {
      setIsLoggingOut(false);
    }
  };

  /* ── PIN ── */
  const togglePin = async (conv: Conversation) => {
    await updateConversation(conv.id, { isPinned: !conv.isPinned });
    const updated = conversations.map((c) =>
      c.id === conv.id ? { ...c, isPinned: !c.isPinned } : c
    );
    updated.sort((a, b) => Number(b.isPinned) - Number(a.isPinned));
    setConversations(updated);
  };

  /* ── RENAME ── */
  const saveRename = async (conv: Conversation) => {
    await updateConversation(conv.id, { title: editValue });
    setConversations((prev) =>
      prev.map((c) => (c.id === conv.id ? { ...c, title: editValue } : c))
    );
    setEditingId(null);
  };

  /* ── BENCHMARK RENDERER ── */
  const renderBenchmark = (text: string) =>
    text
      .split(/(\d{1,3}(?:,\d{3})*(?:\s*(?:to|–|-)\s*\d{1,3}(?:,\d{3})*)?)/g)
      .map((part: string, i: number) =>
        /\d/.test(part)
          ? <span key={i} style={{ fontWeight: 650, color: "#111" }}>{part}</span>
          : <span key={i}>{part}</span>
      );

  /* ── AI SUMMARY BLOCK ── */
  const AISummary = () =>
    response && response.industry ? (
      <div style={{
        margin: "8px 0",
        borderRadius: 16,
        background: "#f7f7f8",
        border: "1px solid #ebebeb",
        padding: "14px 16px",
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}>
        {/* Industry */}
        <div>
          <p style={{ fontSize: 10, fontWeight: 700, color: "#9ca3af", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 3 }}>
            {language === "de" ? "Branche" : "Industry"}
          </p>
          <p style={{ fontSize: 13, fontWeight: 600, color: "#111", lineHeight: 1.4 }}>
            {typedIndustry || "—"}
          </p>
        </div>
        {/* Work Field */}
        <div>
          <p style={{ fontSize: 10, fontWeight: 700, color: "#9ca3af", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 3 }}>
            {language === "de" ? "Arbeitsbereich" : "Work Field"}
          </p>
          <p style={{ fontSize: 13, color: "#374151", lineHeight: 1.4 }}>
            {typedWorkField || "—"}
          </p>
        </div>
        {/* Benchmark */}
        <div>
          <p style={{ fontSize: 10, fontWeight: 700, color: "#9ca3af", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 3 }}>
            {language === "de" ? "Benchmark" : "Benchmark"}
          </p>
          <p style={{ fontSize: 13, color: "#374151", lineHeight: 1.6 }}>
            {typedBenchmark
              ? renderBenchmark(typedBenchmark)
              : <span style={{ color: "#9ca3af", fontStyle: "italic" }}>Estimating based on similar roles…</span>}
          </p>
        </div>
      </div>
    ) : null;

  /* ════════════════════════════════════════
     RENDER
  ════════════════════════════════════════ */
  return (
    <>
      <style>{`
        .sb-root {
          font-family: inherit;
          height: 100vh;
          display: flex;
          flex-direction: column;
          background: #fafafa;
          border-right: 1px solid #ebebeb;
          box-shadow: 2px 0 12px rgba(0,0,0,0.04);
          transition: width 0.28s cubic-bezier(0.22,1,0.36,1);
          overflow: hidden;
          position: relative;
          flex-shrink: 0;
        }
        .sb-root.open  { width: 256px; }
        .sb-root.closed { width: 64px; }

        @media (max-width: 767px) { .sb-root { display: none !important; } }

        /* scrollbar */
        .sb-scroll::-webkit-scrollbar { width: 0px; }

        /* logo */
        .sb-logo-wrap {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 14px 14px 8px;
          flex-shrink: 0;
        }
        .sb-logo-img { height: 75px; width: auto; object-fit: contain; transition: opacity 0.2s; }
        .sb-logo-img.hidden-logo { opacity: 0; pointer-events: none; width: 0; }

        /* toggle btn */
        .sb-toggle {
          width: 32px; height: 32px; border-radius: 999px;
          border: 1px solid #e5e7eb; background: #fff;
          align-items: center; justify-content: center;
          cursor: pointer; color: #6b7280; flex-shrink: 0;
          transition: background 0.15s, color 0.15s;
        }
        .sb-toggle:hover { background: #f3f4f6; color: #111; }

        /* new chat */
        .sb-new-chat {
          display: flex; align-items: center; gap: 9px;
          margin: 4px 12px 4px;
          padding: 10px 14px;
          border-radius: 999px;
          border: 1px solid #e5e7eb;
          background: #fff;
          font-size: 13px; font-weight: 600; color: #111;
          cursor: pointer; transition: background 0.15s, box-shadow 0.15s;
          white-space: nowrap; overflow: hidden;
        }
        .sb-new-chat:hover:not(:disabled) { background: #f5f5f5; box-shadow: 0 1px 4px rgba(0,0,0,0.07); }
        .sb-new-chat:disabled { opacity: 0.45; cursor: not-allowed; }
        .sb-new-chat.collapsed { justify-content: center; padding: 10px; margin: 4px 10px; }

        /* dashboard */
        .sb-dashboard {
          display: flex; align-items: center; gap: 9px;
          margin: 4px 12px;
          padding: 10px 14px;
          border-radius: 999px;
          background: #f3f4f6;
          font-size: 13px; font-weight: 500; color: #374151;
          cursor: pointer; transition: background 0.15s;
          white-space: nowrap; overflow: hidden;
        }
        .sb-dashboard:hover { background: #e9eaec; }
        .sb-dashboard.collapsed { justify-content: center; padding: 10px; margin: 4px 10px; }

        /* section label */
        .sb-section-label {
          font-size: 10px; font-weight: 700; letter-spacing: 0.08em;
          text-transform: uppercase; color: #c4c9d4;
          padding: 4px 18px 4px; flex-shrink: 0;
        }

        /* divider */
        .sb-divider {
          height: 1px; background: #f0f0f0; margin: 6px 14px; flex-shrink: 0;
        }

        /* chat item */
        .sb-chat-item {
          position: relative;
          display: flex; align-items: center;
          padding: 8px 10px;
          border-radius: 999px;
          margin: 2px 12px;
          cursor: pointer;
          transition: background 0.15s;
          border: 1px solid transparent;
          min-width: 0;
        }
        .sb-chat-item:hover { background: #f3f4f6; }
        .sb-chat-item.active { background: #ebebeb; border-color: #e0e0e0; }
        .sb-chat-item.disabled { opacity: 0.45; cursor: not-allowed; }

        .sb-chat-text {
          font-size: 13px; font-weight: 400; color: #374151;
          overflow: hidden; white-space: nowrap; text-overflow: ellipsis;
          flex: 1; min-width: 0;
        }

        /* menu trigger */
        .sb-menu-trigger {
          opacity: 0; position: absolute; right: 10px;
          width: 26px; height: 26px; border-radius: 999px;
          display: flex; align-items: center; justify-content: center;
          color: #6b7280; border: none; background: transparent; cursor: pointer;
          transition: opacity 0.15s, background 0.15s;
          flex-shrink: 0;
        }
        .sb-chat-item:hover .sb-menu-trigger { opacity: 1; }
        .sb-menu-trigger:hover { background: #e5e7eb; color: #111; }

        /* chat dropdown */
        .sb-chat-dropdown {
          position: absolute; right: 8px; top: calc(100% + 4px);
          background: #fff; border: 1px solid #e5e7eb;
          border-radius: 16px; box-shadow: 0 8px 28px rgba(0,0,0,0.10);
          min-width: 160px; z-index: 50; overflow: hidden;
        }
        .sb-chat-dropdown button {
          display: flex; align-items: center; gap: 9px;
          width: 100%; padding: 9px 14px;
          font-size: 13px; font-weight: 500; color: #374151;
          background: transparent; border: none; cursor: pointer;
          transition: background 0.12s; text-align: left;
        }
        .sb-chat-dropdown button:hover { background: #f5f5f5; }
        .sb-chat-dropdown button.danger { color: #dc2626; }
        .sb-chat-dropdown button.danger:hover { background: #fef2f2; }

        /* rename input */
        .sb-rename-input {
          font-size: 13px; padding: 4px 10px;
          border: 1.5px solid #d1d5db; border-radius: 999px;
          outline: none; width: 100%; background: #fff; color: #111;
          font-family: inherit;
        }
        .sb-rename-input:focus { border-color: #111; }

        /* loading dots */
        .sb-dots { display: flex; gap: 5px; justify-content: center; align-items: center; padding: 24px 0; }

        /* profile section */
        .sb-profile-trigger {
          display: flex; align-items: center; gap: 10px;
          padding: 10px 12px; margin: 6px 10px;
          border-radius: 999px; cursor: pointer;
          transition: background 0.15s;
          border: 1px solid transparent;
        }
        .sb-profile-trigger:hover { background: #f3f4f6; border-color: #ebebeb; }
        .sb-profile-trigger.disabled { opacity: 0.45; cursor: not-allowed; }

        .sb-avatar {
          width: 32px; height: 32px; border-radius: 999px;
          background: #111; color: #fff;
          display: flex; align-items: center; justify-content: center;
          font-size: 13px; font-weight: 700; flex-shrink: 0;
        }

        /* profile dropdown */
        .sb-profile-dropdown {
          position: absolute; left: 10px; right: 10px; bottom: calc(100% + 6px);
          background: #fff; border: 1px solid #e5e7eb;
          border-radius: 20px; box-shadow: 0 -4px 28px rgba(0,0,0,0.09);
          z-index: 50; overflow: hidden;
        }
        .sb-profile-dropdown .pd-email {
          padding: 12px 16px 10px;
          font-size: 12px; color: #9ca3af; border-bottom: 1px solid #f0f0f0;
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .sb-profile-dropdown button {
          display: flex; align-items: center; gap: 10px;
          width: 100%; padding: 10px 16px;
          font-size: 13px; font-weight: 500; color: #374151;
          background: transparent; border: none; cursor: pointer;
          transition: background 0.12s; text-align: left; font-family: inherit;
        }
        .sb-profile-dropdown button:hover { background: #f7f7f8; }
        .sb-profile-dropdown button.danger { color: #dc2626; }
        .sb-profile-dropdown button.danger:hover { background: #fef2f2; }
        .sb-profile-dropdown .pd-divider { height: 1px; background: #f0f0f0; margin: 0; }

        /* help sub-items */
        .pd-help-sub {
          background: #fafafa;
        }
        .pd-help-sub button {
          padding-left: 40px;
          font-size: 12px;
        }

        /* collapsed tooltip on hover - simple approach */
        .sb-root.closed .sb-new-chat span,
        .sb-root.closed .sb-dashboard span,
        .sb-root.closed .sb-section-label,
        .sb-root.closed .sb-chat-text,
        .sb-root.closed .sb-profile-name {
          display: none;
        }
      `}</style>

      <aside className={`sb-root ${collapsed ? "closed" : "open"}`}>

        {/* ── LOGO + TOGGLE ── */}
        <div className="sb-logo-wrap">
          {!collapsed && (
            <img
              src="/logo.png"
              alt="Logo"
              className="sb-logo-img"
            />
          )}
          {collapsed && <div style={{ flex: 1 }} />}
          <button
            className="sb-toggle hidden md:flex"
            onClick={() => setCollapsed(!collapsed)}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed
              ? <SidebarOpen size={15} />
              : <SidebarClose size={15} />
            }
          </button>
        </div>

        {/* ══════════ NOT LOGGED IN ══════════ */}
        {!isLoggedIn ? (
          <div style={{ padding: "8px 0", flex: 1 }}>
            <button className={`sb-dashboard ${collapsed ? "collapsed" : ""}`}>
              <LayoutDashboard size={16} style={{ flexShrink: 0 }} />
              {!collapsed && <span>{language === "de" ? "Übersicht" : "Dashboard"}</span>}
            </button>

            {!collapsed && (
              <>
                <div className="sb-divider" style={{ marginTop: 10 }} />
                <div style={{ padding: "0 12px" }}>
                  <AISummary />
                </div>
              </>
            )}
          </div>

        ) : (
        /* ══════════ LOGGED IN ══════════ */
          <>
            {/* NEW CHAT */}
            <div style={{ padding: "4px 0", flexShrink: 0 }}>
              <button
                className={`sb-new-chat ${collapsed ? "collapsed" : ""}`}
                onClick={() => {
                  if (disabled) return;
                  setActiveId(null);
                  setActiveMenu(null);
                  onSelectConversation(null);
                }}
                disabled={disabled}
              >
                <Plus size={15} style={{ flexShrink: 0 }} />
                {!collapsed && <span>{t("newChat")}</span>}
              </button>
            </div>

            {/* AI SUMMARY */}
            {!collapsed && (
              <div style={{ padding: "0 12px", flexShrink: 0 }}>
                <AISummary />
              </div>
            )}

            {/* RECENT CONVERSATIONS */}
            {!collapsed && (
              <>
                <div className="sb-divider" style={{ marginTop: 8 }} />
                <div className="sb-section-label" style={{ marginTop: 6 }}>
                  {t("recentConversations")}
                </div>
              </>
            )}

            {/* CONVERSATION LIST */}
            <div
              className="sb-scroll"
              style={{
                flex: 1,
                overflowY: "auto",
                padding: "4px 0",
              }}
            >
              {isLoadingChats ? (
                <div className="sb-dots">
                  {[0, 1, 2].map((i) => (
                    <motion.div
                      key={i}
                      style={{ width: 6, height: 6, borderRadius: "50%", background: "#d1d5db" }}
                      animate={{ opacity: [0.3, 1, 0.3] }}
                      transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}
                    />
                  ))}
                </div>
              ) : (
                conversations.map((conv) => (
                  <div
                    key={conv.id}
                    onClick={() => {
                      if (disabled) return;
                      setActiveId(conv.id);
                      onSelectConversation(conv);
                    }}
                    className={`sb-chat-item ${activeId === conv.id ? "active" : ""} ${disabled ? "disabled" : ""}`}
                  >
                    {editingId === conv.id ? (
                      <div style={{ display: "flex", alignItems: "center", gap: 6, width: "100%" }}>
                        <input
                          autoFocus
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (disabled) return;
                            if (e.key === "Enter") saveRename(conv);
                            if (e.key === "Escape") setEditingId(null);
                          }}
                          className="sb-rename-input"
                          onClick={(e) => e.stopPropagation()}
                        />
                        <Check
                          size={16}
                          style={{ cursor: "pointer", color: "#374151", flexShrink: 0 }}
                          onClick={(e) => { e.stopPropagation(); if (!disabled) saveRename(conv); }}
                        />
                      </div>
                    ) : (
                      <>
                        {conv.isPinned && (
                          <Pin size={12} style={{ color: "#9ca3af", flexShrink: 0, marginRight: 5 }} />
                        )}
                        {!collapsed && (
                          <AnimatingTitle
                            text={conv.title || conv.industry}
                            isNew={conv.id === newestId}
                            onDone={() => setNewestId(null)}
                          />
                        )}

                        {/* THREE-DOT MENU TRIGGER */}
                        {!disabled && !collapsed && (
                          <button
                            className="sb-menu-trigger menu-trigger"
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveMenu(activeMenu === conv.id ? null : conv.id);
                            }}
                          >
                            <MoreHorizontal size={14} />
                          </button>
                        )}

                        {/* CHAT DROPDOWN */}
                        <AnimatePresence>
                          {activeMenu === conv.id && !disabled && (
                            <motion.div
                              ref={(el) => { menuRef.current = el; }}
                              initial={{ opacity: 0, y: -6, scale: 0.97 }}
                              animate={{ opacity: 1, y: 0, scale: 1 }}
                              exit={{ opacity: 0, y: -6, scale: 0.97 }}
                              transition={{ duration: 0.14 }}
                              className="sb-chat-dropdown"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <button onClick={() => { togglePin(conv); setActiveMenu(null); }}>
                                <Pin size={14} />
                                {conv.isPinned ? "Unpin" : "Pin Chat"}
                              </button>
                              <button onClick={() => { setEditingId(conv.id); setEditValue(conv.title || conv.industry); setActiveMenu(null); }}>
                                <Pencil size={14} />
                                Rename
                              </button>
                              <button className="danger" onClick={() => { setDeleteTarget(conv); setActiveMenu(null); }}>
                                <Trash2 size={14} />
                                Delete
                              </button>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* ── PROFILE SECTION ── */}
            <div className="sb-divider" />
            <div style={{ position: "relative", flexShrink: 0, paddingBottom: 8 }} ref={profileRef}>

              <div
                className={`sb-profile-trigger ${disabled ? "disabled" : ""} ${collapsed ? "" : ""}`}
                onClick={() => { if (disabled) return; setProfileOpen(!profileOpen); }}
                style={collapsed ? { justifyContent: "center" } : {}}
              >
                <div className="sb-avatar">
                  {firstName.charAt(0).toUpperCase()}
                </div>

                {!collapsed && (
                  <>
                    <div style={{ flex: 1, minWidth: 0 }} className="sb-profile-name">
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#111", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {firstName}
                      </div>
                      <div style={{ fontSize: 11, color: "#9ca3af" }}>
                        {t("productivityCoach")}
                      </div>
                    </div>
                    <ChevronDown
                      size={15}
                      style={{
                        color: "#9ca3af",
                        transition: "transform 0.2s",
                        transform: profileOpen ? "rotate(0deg)" : "rotate(-180deg)",
                        flexShrink: 0,
                      }}
                    />
                  </>
                )}
              </div>

              {/* PROFILE DROPDOWN */}
              <AnimatePresence>
                {profileOpen && !disabled && !collapsed && (
                  <motion.div
                    initial={{ opacity: 0, y: 8, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 8, scale: 0.98 }}
                    transition={{ duration: 0.18 }}
                    className="sb-profile-dropdown"
                  >
                    {/* Email */}
                    <div className="pd-email">{user?.email}</div>

                    {/* Settings */}
                    <button disabled={disabled}>
                      <Settings size={15} />
                      {language === "de" ? "Einstellungen" : "Settings"}
                    </button>

                    {/* Help */}
                    <button
                      onClick={() => { if (!disabled) setHelpOpen(!helpOpen); }}
                      disabled={disabled}
                      style={{ justifyContent: "space-between" }}
                    >
                      <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <HelpCircle size={15} />
                        {language === "de" ? "Hilfe" : "Help"}
                      </span>
                      <ChevronRight
                        size={13}
                        style={{
                          color: "#9ca3af",
                          transition: "transform 0.2s",
                          transform: helpOpen ? "rotate(90deg)" : "rotate(0deg)",
                        }}
                      />
                    </button>

                    <AnimatePresence>
                      {helpOpen && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.18 }}
                          className="pd-help-sub"
                          style={{ overflow: "hidden" }}
                        >
                          <button disabled={disabled}>
                            <HelpCircle size={13} />
                            {language === "de" ? "Hilfe-Center" : "Help Center"}
                          </button>
                          <button disabled={disabled}>
                            <Bug size={13} />
                            {language === "de" ? "Fehler melden" : "Report Bug"}
                          </button>
                          <button disabled={disabled}>
                            <FileText size={13} />
                            {language === "de" ? "Bedingungen & Richtlinien" : "Terms & Policies"}
                          </button>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <div className="pd-divider" />

                    {/* Logout */}
                    <button
                      className="danger"
                      onClick={() => { if (!disabled) setShowLogoutModal(true); }}
                      disabled={disabled}
                    >
                      <LogOut size={15} />
                      {language === "de" ? "Abmelden" : "Logout"}
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </>
        )}
      </aside>

      {/* ── MODALS ── */}
      <ConfirmModal
        open={!!deleteTarget}
        title="Are you sure you want to delete?"
        description="This will permanently remove this conversation."
        confirmText={isDeleting ? "Deleting..." : "Yes, Delete"}
        confirmDisabled={isDeleting}
        confirmClassName={isDeleting ? "bg-black/60 cursor-not-allowed" : ""}
        onCancel={() => !isDeleting && setDeleteTarget(null)}
        onConfirm={handleDelete}
      />

      <ConfirmModal
        open={showLogoutModal}
        title={language === "de" ? "Sind Sie sicher, dass Sie sich abmelden möchten?" : "Are you sure you want to logout?"}
        description={language === "de" ? "Sie werden von Ihrem Konto abgemeldet." : "You will be signed out of your account."}
        confirmText={isLoggingOut ? (language === "de" ? "Wird abgemeldet..." : "Logging out...") : (language === "de" ? "Ja, abmelden" : "Yes, Logout")}
        confirmDisabled={isLoggingOut}
        confirmClassName={isLoggingOut ? "bg-black/60 cursor-not-allowed" : ""}
        onCancel={() => !isLoggingOut && setShowLogoutModal(false)}
        onConfirm={handleLogout}
      />

      <Toast show={showToast} message="SUCCESS ! Conversation Deleted" />
    </>
  );
}