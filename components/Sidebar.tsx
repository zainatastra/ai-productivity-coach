"use client";

import { useEffect, useState, useRef } from "react";
import { getAuth, signOut } from "firebase/auth";
import { app } from "@/services/firebase";
import { useAuth } from "@/services/AuthContext";
import { useLanguage } from "@/services/LanguageContext";
import { API_BASE_URL } from "@/services/api";
import { motion, AnimatePresence } from "framer-motion";
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

// ✅ Props type — disabled is properly defined and optional
interface Props {
  onSelectConversation: (conversation: any) => void;
  disabled?: boolean;
  industryData?: string;
  descriptionData?: string;
  response?: any;
}

// ✅ disabled has a safe default of false
export default function Sidebar({
  onSelectConversation,
  disabled = false,
  industryData,
  descriptionData,
  response,
}: Props) {
  const { t } = useLanguage();
  const auth = getAuth(app);
  const { user } = useAuth();

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

  const profileRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  /* ================= FETCH CONVERSATIONS ================= */
  useEffect(() => {
    const fetchConversations = async () => {
      setIsLoadingChats(true);

      try {
        const currentUser = auth.currentUser;
        if (!currentUser) {
          setIsLoadingChats(false);
          return;
        }

        const token = await currentUser.getIdToken();

        const res = await fetch(
          `${API_BASE_URL}/api/Conversation`,
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );

        if (!res.ok || res.status === 401) {
          setConversations([]);
          return;
        }

        const data = await res.json();

        if (!Array.isArray(data)) {
          setConversations([]);
          return;
        }

        const sorted = [...data].sort(
          (a: Conversation, b: Conversation) =>
            Number(b.isPinned) - Number(a.isPinned)
        );

        setConversations(sorted);
      } catch (error) {
        console.error("Conversation fetch error:", error);
        setConversations([]);
      } finally {
        setIsLoadingChats(false);
      }
    };

    fetchConversations();
  }, [user]);

  /* ================= CLOSE MENUS ON OUTSIDE CLICK ================= */
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(event.target as Node) &&
        !(event.target as Element).closest?.(".menu-trigger")
      ) {
        setActiveMenu(null);
      }

      if (
        profileRef.current &&
        !profileRef.current.contains(event.target as Node)
      ) {
        setProfileOpen(false);
        setHelpOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  /* ================= UPDATE CONVERSATION ================= */
  const updateConversation = async (id: string, body: any) => {
    const currentUser = auth.currentUser;
    if (!currentUser) return;

    const token = await currentUser.getIdToken();

    await fetch(
      `${API_BASE_URL}/api/Conversation/${id}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      }
    );
  };

  /* ================= DELETE ================= */
  const handleDelete = async () => {
    if (!deleteTarget) return;

    setIsDeleting(true);

    try {
      const currentUser = auth.currentUser;
      if (!currentUser) return;

      const token = await currentUser.getIdToken();

      await fetch(
        `${API_BASE_URL}/api/Conversation/${deleteTarget.id}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      setConversations((prev) =>
        prev.filter((c) => c.id !== deleteTarget.id)
      );

      setDeleteTarget(null);
      setShowToast(true);
      setTimeout(() => setShowToast(false), 2500);
    } catch (err) {
      console.error("Delete failed:", err);
    } finally {
      setIsDeleting(false);
    }
  };

  /* ================= LOGOUT ================= */
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

  /* ================= PIN ================= */
  const togglePin = async (conv: Conversation) => {
    await updateConversation(conv.id, { isPinned: !conv.isPinned });

    const updated = conversations.map((c) =>
      c.id === conv.id ? { ...c, isPinned: !c.isPinned } : c
    );

    updated.sort((a, b) => Number(b.isPinned) - Number(a.isPinned));
    setConversations(updated);
  };

  /* ================= RENAME ================= */
  const saveRename = async (conv: Conversation) => {
    await updateConversation(conv.id, { title: editValue });

    setConversations((prev) =>
      prev.map((c) => (c.id === conv.id ? { ...c, title: editValue } : c))
    );

    setEditingId(null);
  };

  /* ================= RENDER ================= */
  return (
    <>
      <aside className="w-64 h-screen border-r border-gray-200 bg-[#f9f9f9] flex flex-col relative px-4">

        {/* ================= PROFILE DROPDOWN ================= */}
        <div className="relative py-3" ref={profileRef}>

          {/* CLICKABLE USER AREA */}
          <div
            onClick={() => {
              if (disabled) return;
              setProfileOpen(!profileOpen);
            }}
            className={`flex items-center justify-between rounded-xl p-2 transition ${
              disabled
                ? "opacity-50 cursor-not-allowed"
                : "cursor-pointer hover:bg-gray-100"
            }`}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full border border-gray-300 flex items-center justify-center text-sm font-semibold text-gray-700 bg-white">
                {firstName.charAt(0).toUpperCase()}
              </div>

              <div className="flex flex-col">
                <span className="text-sm font-semibold text-gray-900">
                  {firstName}
                </span>
                <span className="text-xs text-gray-500">
                  {t("productivityCoach")}
                </span>
              </div>
            </div>

            <ChevronDown
              size={18}
              className={`text-gray-500 transition-transform duration-200 ${
                profileOpen ? "rotate-180" : ""
              }`}
            />
          </div>

          {/* DROPDOWN MENU */}
          <AnimatePresence>
            {profileOpen && !disabled && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
                className="absolute left-0 right-0 mt-2 bg-white rounded-2xl shadow-2xl border border-gray-200 z-50 overflow-hidden"
              >
                <div className="px-4 py-3 text-sm text-gray-700">
                  {user?.email}
                </div>

                <div className="border-t border-gray-200" />

                <button
                  disabled={disabled}
                  className="flex items-center gap-3 w-full px-4 py-3 text-sm hover:bg-gray-100 transition text-left"
                >
                  <Settings size={18} />
                  Settings
                </button>

                <div>
                  <button
                    onClick={() => {
                      if (disabled) return;
                      setHelpOpen(!helpOpen);
                    }}
                    disabled={disabled}
                    className="flex items-center justify-between w-full px-4 py-3 text-sm hover:bg-gray-100 transition text-left"
                  >
                    <div className="flex items-center gap-3">
                      <HelpCircle size={18} />
                      Help
                    </div>
                    <ChevronDown
                      size={16}
                      className={`transition-transform ${
                        helpOpen ? "rotate-180" : ""
                      }`}
                    />
                  </button>

                  <AnimatePresence>
                    {helpOpen && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden bg-gray-50"
                      >
                        <button
                          disabled={disabled}
                          className="flex items-center gap-3 w-full px-8 py-2 text-sm hover:bg-gray-100 transition text-left"
                        >
                          <HelpCircle size={16} />
                          Help Center
                        </button>

                        <button
                          disabled={disabled}
                          className="flex items-center gap-3 w-full px-8 py-2 text-sm hover:bg-gray-100 transition text-left"
                        >
                          <Bug size={16} />
                          Report Bug
                        </button>

                        <button
                          disabled={disabled}
                          className="flex items-center gap-3 w-full px-8 py-2 text-sm hover:bg-gray-100 transition text-left"
                        >
                          <FileText size={16} />
                          Terms & Policies
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                <div className="border-t border-gray-200" />

                {/* LOGOUT BUTTON */}
                <button
                  onClick={() => {
                    if (disabled) return;
                    setShowLogoutModal(true);
                  }}
                  disabled={disabled}
                  className="flex items-center gap-3 w-full px-4 py-3 text-sm hover:bg-gray-100 transition text-red-600 text-left"
                >
                  <LogOut size={18} />
                  Logout
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ================= NEW CHAT BUTTON ================= */}
        <div className="py-3">
          <button
            onClick={() => {
              if (disabled) return;
              setActiveId(null);
              onSelectConversation({
                id: "",
                industry: "",
                description: "",
                response: "",
                createdAt: "",
              });
            }}
            disabled={disabled}
            className={`w-full px-4 py-2 rounded-xl border border-gray-300 text-sm bg-white text-gray-700 transition duration-200 text-left ${
              disabled ? "opacity-50 cursor-not-allowed" : "hover:bg-gray-100"
            }`}
          >
            + {t("newChat")}
          </button>
        </div>

        {/* ================= AI SUMMARY ================= */}
{response?.industry && (
  <div className="px-2 py-3 space-y-3">

    {/* INDUSTRY */}
    <div>
      <p className="text-xs text-gray-500">Your industry</p>
      <p className="text-sm font-semibold text-gray-900">
        {response?.industry || industryData}
      </p>
    </div>

    {/* WORK FIELD */}
    <div>
      <p className="text-xs text-gray-500">Your field of work</p>
      <p className="text-sm text-gray-700 line-clamp-3">
        {response?.work_field?.slice(0, 120)}...
      </p>
    </div>

    {/* BENCHMARK (if exists later) */}
    {response?.benchmark && (
      <div>
        <p className="text-xs text-gray-500">Benchmark</p>
        <p className="text-sm text-gray-700">
          {response.benchmark}
        </p>
      </div>
    )}

  </div>
)}

        {/* ================= SECTION LABEL ================= */}
        <div className="pt-2 pb-1">
          <p className="text-xs font-semibold text-gray-500">
            {t("recentConversations")}
          </p>
        </div>

        {/* ================= CONVERSATION LIST ================= */}
        <div className="flex-1 overflow-y-auto py-3 space-y-3">
          {isLoadingChats ? (
            <div className="flex items-center justify-center h-32">
              <div className="flex gap-2">
                {[0, 1, 2].map((i) => (
                  <motion.div
                    key={i}
                    className="w-2 h-2 bg-gray-400 rounded-full"
                    animate={{ opacity: [0.3, 1, 0.3] }}
                    transition={{
                      duration: 1,
                      repeat: Infinity,
                      delay: i * 0.2,
                    }}
                  />
                ))}
              </div>
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
                className={`relative group px-4 py-3 rounded-xl transition-all duration-200 text-left shadow-sm ${
                  disabled
                    ? "opacity-50 cursor-not-allowed"
                    : "cursor-pointer"
                } ${
                  activeId === conv.id
                    ? "bg-white shadow-md"
                    : "bg-white hover:bg-gray-50 hover:shadow-md"
                }`}
              >
                {editingId === conv.id ? (
                  <div className="flex items-center gap-2">
                    <input
                      autoFocus
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (disabled) return;
                        if (e.key === "Enter") saveRename(conv);
                        if (e.key === "Escape") setEditingId(null);
                      }}
                      className="text-sm px-2 py-1 rounded-md border border-gray-300 w-full bg-white focus:outline-none focus:ring-2 focus:ring-gray-800"
                    />
                    <Check
                      size={18}
                      className="cursor-pointer text-gray-700 hover:text-black transition"
                      onClick={() => {
                        if (disabled) return;
                        saveRename(conv);
                      }}
                    />
                  </div>
                ) : (
                  <div className="flex items-center gap-2 pr-4.5">
                    {conv.isPinned && (
                      <Pin size={16} className="text-gray-500 shrink-0" />
                    )}
                    <p className="text-sm font-normal text-gray-700 overflow-hidden whitespace-nowrap">
                      <span className="block overflow-hidden text-clip">
                        {conv.title || conv.industry}
                      </span>
                    </p>
                  </div>
                )}

                {!disabled && editingId !== conv.id && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveMenu(activeMenu === conv.id ? null : conv.id);
                    }}
                    className="menu-trigger absolute right-3 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition"
                  >
                    <MoreHorizontal size={18} className="text-gray-500" />
                  </button>
                )}

                <AnimatePresence>
                  {activeMenu === conv.id && !disabled && (
                    <motion.div
                      ref={(el) => { menuRef.current = el; }}
                      initial={{ opacity: 0, y: -5, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -5, scale: 0.98 }}
                      transition={{ duration: 0.15 }}
                      className="absolute right-2 top-10 bg-white shadow-xl rounded-xl border border-gray-200 w-44 z-20 overflow-hidden"
                    >
                      <button
                        onClick={() => togglePin(conv)}
                        className="flex items-center gap-2 px-4 py-2 w-full text-sm hover:bg-gray-100 text-left"
                      >
                        <Pin size={16} />
                        {conv.isPinned ? "Unpin" : "Pin Chat"}
                      </button>

                      <button
                        onClick={() => {
                          setEditingId(conv.id);
                          setEditValue(conv.title || conv.industry);
                          setActiveMenu(null);
                        }}
                        className="flex items-center gap-2 px-4 py-2 w-full text-sm hover:bg-gray-100 text-left"
                      >
                        <Pencil size={16} />
                        Rename
                      </button>

                      <button
                        onClick={() => {
                          setDeleteTarget(conv);
                          setActiveMenu(null);
                        }}
                        className="flex items-center gap-2 px-4 py-2 hover:bg-gray-100 w-full text-sm text-red-600 text-left"
                      >
                        <Trash2 size={16} />
                        Delete
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))
          )}
        </div>
      </aside>

      {/* ================= DELETE CONFIRM MODAL ================= */}
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

      {/* ================= LOGOUT CONFIRM MODAL ================= */}
      <ConfirmModal
        open={showLogoutModal}
        title="Are you sure you want to logout?"
        description="You will be signed out of your account."
        confirmText={isLoggingOut ? "Logging out..." : "Yes, Logout"}
        confirmDisabled={isLoggingOut}
        confirmClassName={isLoggingOut ? "bg-black/60 cursor-not-allowed" : ""}
        onCancel={() => !isLoggingOut && setShowLogoutModal(false)}
        onConfirm={handleLogout}
      />

      {/* ================= TOAST ================= */}
      <Toast show={showToast} message="SUCCESS ! Conversation Deleted" />
    </>
  );
}