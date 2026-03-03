"use client";

import { useEffect, useState, useRef } from "react";
import { getAuth, signOut } from "firebase/auth";
import { app } from "@/services/firebase";
import { useAuth } from "@/services/AuthContext";
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

interface SidebarProps {
  onSelectConversation: (conversation: Conversation) => void;
}

export default function Sidebar({ onSelectConversation }: SidebarProps) {
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

  const profileRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  /* ================= FETCH CONVERSATIONS ================= */
/* ================= FETCH CONVERSATIONS ================= */
useEffect(() => {
  const fetchConversations = async () => {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) return;

      const token = await currentUser.getIdToken();

      const res = await fetch("http://localhost:5048/api/conversation", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      // 🚨 Handle Unauthorized
      if (res.status === 401) {
        console.warn("Unauthorized — skipping conversation fetch");
        setConversations([]);
        return;
      }

      if (!res.ok) {
        console.warn("Failed to fetch conversations:", res.status);
        setConversations([]);
        return;
      }

      const data = await res.json();

      // 🚨 Prevent crash if API does not return array
      if (!Array.isArray(data)) {
        console.warn("Invalid conversations response");
        setConversations([]);
        return;
      }

      const sorted = data.sort(
        (a: Conversation, b: Conversation) =>
          Number(b.isPinned) - Number(a.isPinned)
      );

      setConversations(sorted);
    } catch (error) {
      console.error("Conversation fetch error:", error);
      setConversations([]);
    }
  };

  fetchConversations();
}, [user]);

  /* ================= CLOSE MENUS ON OUTSIDE CLICK ================= */
  useEffect(() => {
    const handleClickOutside = (event: any) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setActiveMenu(null);
      }

      if (profileRef.current && !profileRef.current.contains(event.target)) {
        setProfileOpen(false);
        setHelpOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () =>
      document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  /* ================= UPDATE CONVERSATION ================= */
  const updateConversation = async (id: string, body: any) => {
    const currentUser = auth.currentUser;
    if (!currentUser) return;

    const token = await currentUser.getIdToken();

    await fetch(`http://localhost:5048/api/conversation/${id}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  };

  /* ================= DELETE ================= */
  const handleDelete = async () => {
    if (!deleteTarget) return;

    const currentUser = auth.currentUser;
    if (!currentUser) return;

    const token = await currentUser.getIdToken();

    const res = await fetch(
      `http://localhost:5048/api/conversation/${deleteTarget.id}`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (!res.ok) {
      console.warn("Delete failed but UI already updated");
    }

    setConversations((prev) =>
      prev.filter((c) => c.id !== deleteTarget.id)
    );

    setDeleteTarget(null);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 2500);
  };

  /* ================= LOGOUT ================= */
  const handleLogout = async () => {
    try {
      await signOut(auth);
      setShowLogoutModal(false);
    } catch (err) {
      console.error("Logout failed:", err);
    }
  };

  /* ================= PIN ================= */
  const togglePin = async (conv: Conversation) => {
    await updateConversation(conv.id, {
      isPinned: !conv.isPinned,
    });

    const updated = conversations.map((c) =>
      c.id === conv.id ? { ...c, isPinned: !c.isPinned } : c
    );

    updated.sort(
      (a, b) => Number(b.isPinned) - Number(a.isPinned)
    );

    setConversations(updated);
  };

  /* ================= RENAME ================= */
  const saveRename = async (conv: Conversation) => {
    await updateConversation(conv.id, {
      title: editValue,
    });

    setConversations((prev) =>
      prev.map((c) =>
        c.id === conv.id ? { ...c, title: editValue } : c
      )
    );

    setEditingId(null);
  };

  return (
  <>
    <aside className="w-64 h-screen border-r border-gray-200 bg-[#f9f9f9] flex flex-col relative px-4">

      {/* ================= PROFILE DROPDOWN ================= */}
      <div className="relative py-3" ref={profileRef}>

        {/* CLICKABLE USER AREA */}
        <div
          onClick={() => setProfileOpen(!profileOpen)}
          className="flex items-center justify-between cursor-pointer hover:bg-gray-100 rounded-xl p-2 transition"
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
                Productivity Coach
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
          {profileOpen && (
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

              <button className="flex items-center gap-3 w-full px-4 py-3 text-sm hover:bg-gray-100 transition text-left">
                <Settings size={18} />
                Settings
              </button>

              <div>
                <button
                  onClick={() => setHelpOpen(!helpOpen)}
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
                      <button className="flex items-center gap-3 w-full px-8 py-2 text-sm hover:bg-gray-100 transition text-left">
                        <HelpCircle size={16} />
                        Help Center
                      </button>

                      <button className="flex items-center gap-3 w-full px-8 py-2 text-sm hover:bg-gray-100 transition text-left">
                        <Bug size={16} />
                        Report Bug
                      </button>

                      <button className="flex items-center gap-3 w-full px-8 py-2 text-sm hover:bg-gray-100 transition text-left">
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
                onClick={() => setShowLogoutModal(true)}
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
            setActiveId(null);
            onSelectConversation({
              id: "",
              industry: "",
              description: "",
              response: "",
              createdAt: "",
            });
          }}
          className="w-full px-4 py-2 rounded-xl border border-gray-300 text-sm bg-white text-gray-700 hover:bg-gray-100 transition duration-200 text-left"
        >
          + New Chat
        </button>
      </div>

      {/* ================= SECTION LABEL ================= */}
      <div className="pt-2 pb-1">
        <p className="text-xs font-semibold text-gray-500 tracking-wide">
          Recent Conversations
        </p>
      </div>

      {/* ================= CONVERSATION LIST ================= */}
      <div className="flex-1 overflow-y-auto py-3 space-y-3">
        {conversations.map((conv) => (
          <div
            key={conv.id}
            className={`relative group p-3 rounded-xl border transition cursor-pointer text-left ${
              activeId === conv.id
                ? "bg-gray-100 border-gray-300"
                : "bg-white border-gray-200 hover:bg-gray-50"
            }`}
            onClick={() => {
              setActiveId(conv.id);
              onSelectConversation(conv);
            }}
          >
            {editingId === conv.id ? (
              <div className="flex items-center gap-2">
                <input
                  autoFocus
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  className="text-sm px-2 py-1 rounded-md border border-gray-300 w-full bg-white focus:outline-none focus:ring-2 focus:ring-gray-800"
                />
                <Check
                  size={18}
                  className="cursor-pointer"
                  onClick={() => saveRename(conv)}
                />
              </div>
            ) : (
              <div className="flex items-center gap-2">
                {conv.isPinned && (
                  <Pin size={18} className="text-gray-600 shrink-0" />
                )}
                <p className="text-sm font-semibold truncate text-gray-800">
                  {conv.title || conv.industry}
                </p>
              </div>
            )}

            <button
              onClick={(e) => {
                e.stopPropagation();
                setActiveMenu(activeMenu === conv.id ? null : conv.id);
              }}
              className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition"
            >
              <MoreHorizontal size={18} />
            </button>

            <AnimatePresence>
              {activeMenu === conv.id && (
                <motion.div
                  ref={menuRef}
                  initial={{ opacity: 0, y: -5, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -5, scale: 0.98 }}
                  transition={{ duration: 0.15 }}
                  className="absolute right-2 top-10 bg-white shadow-xl rounded-xl border border-gray-200 w-44 z-20 overflow-hidden"
                >
                  <button
                    onClick={() => togglePin(conv)}
                    className="flex items-center gap-2 px-4 py-2 w-full text-sm hover:bg-gray-100 transition text-left"
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
                    className="flex items-center gap-2 px-4 py-2 w-full text-sm hover:bg-gray-100 transition text-left"
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
        ))}
      </div>
    </aside>

    {/* DELETE CONFIRM MODAL */}
    <ConfirmModal
      open={!!deleteTarget}
      title="Are you sure you want to delete?"
      description="This will permanently remove this conversation."
      confirmText="Yes, Delete"
      onCancel={() => setDeleteTarget(null)}
      onConfirm={handleDelete}
    />

    {/* LOGOUT CONFIRM MODAL */}
    <ConfirmModal
      open={showLogoutModal}
      title="Are you sure you want to logout?"
      description="You will be signed out of your account."
      confirmText="Yes, Logout"
      onCancel={() => setShowLogoutModal(false)}
      onConfirm={handleLogout}
    />

    <Toast
      show={showToast}
      message="SUCCESS ! Conversation Deleted"
    />
  </>
);
}