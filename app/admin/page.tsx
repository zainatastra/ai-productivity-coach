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
  UserPlus, EyeOff, LockKeyhole, UserCog,
  ClipboardCheck, Building2, CircleCheck, RotateCcw, Ban, Trash2,
  ExternalLink, Clock3, ShieldCheck, ChevronRight,
  History, Activity, Filter, RefreshCw, CalendarDays,
  MoreVertical, KeyRound, ShieldOff,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { PieChart, Pie, Cell } from "recharts";

interface DashboardData {
  totalUsers: number;
  totalResponses: number;
  openBugs?: number;
  resolvedBugs?: number;

  grantedUsersTotal?: number;
  grantedUsersActive?: number;
  grantedUsersRevoked?: number;

  profilesTotal?: number;
  profilesPending?: number;
  profilesApproved?: number;
  profilesRejected?: number;

  graph: Record<string, number>;
  users: any[];
  newUsers: number;
  returningUsers: number;
  inactiveOldUsers: number;
  highlyActiveUsers: number;
  moderateUsers: number;
  inactiveUsers: number;
}

type AdminMenu = "dashboard" | "users" | "access" | "reviews" | "audit" | "bugs" | "content" | "conversations" | "settings";

const PAGE_TITLES: Record<AdminMenu, string> = {
  dashboard:     "Admin Dashboard",
  users:         "Users",
  access:        "Access Control",
  reviews:       "Provider Reviews",
  audit:         "Audit Logs",
  bugs:          "Bug Reports",
  content:       "Content Management",
  conversations: "Conversations",
  settings:      "Settings",
};


type ProviderReviewRow = {
  id: string;
  name: string;
  slug: string;
  status: string;
  moderationState: string;
  publisherName: string;
  publisherEmail: string;
  submittedAt?: string;
  approvedAt?: string;
  updatedAt?: string;
};

type ProviderReviewDetail = {
  company: any;
  publisher: any;
  about: any;
  posts: any[];
  whitepapers: any[];
  products: any[];
  contacts: any[];
  appointments: any[];
  webinars: any[];
  events: any[];
};

type AuditLog = {
  id: string;
  actorUid: string;
  actorRole: string;
  action: string;
  companyId: string;
  resourceType: string;
  resourceId: string;
  fromState?: string;
  toState?: string;
  note?: string;
  createdAt?: string;
};

type PublisherAdminAction = "password" | "revoke" | "restore" | "delete";

type ProviderConfirmAction = "approve" | "request_revision" | "reject" | "unpublish" | "republish" | "delete";

type AdminToast = {
  type: "success" | "error";
  text: string;
};

export default function AdminDashboard() {
  const auth = getAuth(adminApp);
  const { language } = useLanguage();

  const [data,                      setData]                      = useState<DashboardData | null>(null);
  const [loading,                   setLoading]                   = useState(true);
  const [unauthorized,              setUnauthorized]              = useState(false);
  const [activeMenu,                setActiveMenu]                = useState<AdminMenu>("dashboard");
  const [searchTerm,                setSearchTerm]                = useState("");
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
  const [publisherModalOpen,         setPublisherModalOpen]         = useState(false);
  const [publisherName,              setPublisherName]              = useState("");
  const [publisherEmail,             setPublisherEmail]             = useState("");
  const [publisherPassword,          setPublisherPassword]          = useState("");
  const [showPublisherPassword,      setShowPublisherPassword]      = useState(false);
  const [publisherCreating,          setPublisherCreating]          = useState(false);
  const [publisherError,             setPublisherError]             = useState("");
  const [publisherMenuUid,           setPublisherMenuUid]           = useState<string | null>(null);
  const [publisherTarget,            setPublisherTarget]            = useState<any | null>(null);
  const [publisherAction,            setPublisherAction]            = useState<PublisherAdminAction | null>(null);
  const [publisherActionLoading,     setPublisherActionLoading]     = useState(false);
  const [publisherActionError,       setPublisherActionError]       = useState("");
  const [newPublisherPassword,       setNewPublisherPassword]       = useState("");
  const [confirmPublisherPassword,   setConfirmPublisherPassword]   = useState("");
  const [showNewPublisherPassword,   setShowNewPublisherPassword]   = useState(false);
  const [adminToast,                 setAdminToast]                 = useState<AdminToast | null>(null);
  const [providerReviews,           setProviderReviews]           = useState<ProviderReviewRow[]>([]);
  const [providerReviewsLoading,    setProviderReviewsLoading]    = useState(false);
  const [providerReviewFilter,      setProviderReviewFilter]      = useState("all");
  const [selectedProviderReview,    setSelectedProviderReview]    = useState<ProviderReviewDetail | null>(null);
  const [providerReviewModalOpen,   setProviderReviewModalOpen]   = useState(false);
  const [providerReviewLoading,     setProviderReviewLoading]     = useState(false);
  const [providerDecisionLoading,   setProviderDecisionLoading]   = useState(false);
  const [providerDecisionNote,      setProviderDecisionNote]      = useState("");
  const [providerReviewError,       setProviderReviewError]       = useState("");
  const [providerConfirmAction,    setProviderConfirmAction]    = useState<ProviderConfirmAction | null>(null);
  const [auditLogs,                 setAuditLogs]                 = useState<AuditLog[]>([]);
  const [auditLoading,              setAuditLoading]              = useState(false);
  const [auditError,                setAuditError]                = useState("");
  const [auditSearch,               setAuditSearch]               = useState("");
  const [auditRole,                 setAuditRole]                 = useState("all");
  const [auditAction,               setAuditAction]               = useState("all");
  const [auditCompany,              setAuditCompany]              = useState("all");
  const [auditDateFrom,             setAuditDateFrom]             = useState("");
  const [auditDateTo,               setAuditDateTo]               = useState("");

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
    { key: "access",        label: "Access Control", Icon: UserCog },
    { key: "reviews",       label: "Provider Reviews", Icon: ClipboardCheck },
    { key: "audit",         label: "Audit Logs", Icon: History },
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

  useEffect(() => {
    if (activeMenu === "reviews") {
      loadProviderReviews(providerReviewFilter);
    } else if (activeMenu === "dashboard") {
      loadProviderReviews("all");
    }
  }, [activeMenu, providerReviewFilter]);

  useEffect(() => {
    if (activeMenu === "audit") {
      loadAuditLogs();

      if (providerReviews.length === 0) {
        loadProviderReviews("all");
      }
    }
  }, [activeMenu, auditRole, auditAction, auditCompany, auditDateFrom, auditDateTo]);

  useEffect(() => {
    const closeMenus = () => setPublisherMenuUid(null);
    window.addEventListener("click", closeMenus);
    return () => window.removeEventListener("click", closeMenus);
  }, []);

  useEffect(() => {
    if (!adminToast) return;
    const timeout = window.setTimeout(() => setAdminToast(null), 3200);
    return () => window.clearTimeout(timeout);
  }, [adminToast]);

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
    .filter((u: any) => (u.role || "user").toLowerCase() === "user")
    .filter((u: any) =>
      (u.fullName || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (u.email || "").toLowerCase().includes(searchTerm.toLowerCase())
    );

  const publisherUsers = data.users
    .filter((u: any) => (u.role || "").toLowerCase() === "publisher");

  const dashboardGrantedTotal = publisherUsers.length;
  const dashboardGrantedRevoked = publisherUsers.filter((u: any) => {
    const status = String(u.status || "active").trim().toLowerCase();
    return status === "disabled" || status === "revoked";
  }).length;
  const dashboardGrantedActive = dashboardGrantedTotal - dashboardGrantedRevoked;

  const dashboardProfilesPending = providerReviews.filter((review) =>
    String(review.moderationState || "").trim().toLowerCase() === "pending_review"
  ).length;

  const dashboardProfilesRejected = providerReviews.filter((review) =>
    String(review.moderationState || "").trim().toLowerCase() === "rejected"
  ).length;

  const dashboardProfilesApproved = providerReviews.filter((review) => {
    const moderation = String(review.moderationState || "").trim().toLowerCase();
    const status = String(review.status || "").trim().toLowerCase();
    return moderation === "approved" ||
      (status === "published" && moderation !== "pending_review" && moderation !== "rejected");
  }).length;

  const dashboardProfilesTotal = providerReviews.length;

  const auditActions = Array.from(
    new Set(auditLogs.map((log) => log.action).filter(Boolean))
  ).sort();

  const auditCompanyOptions = Array.from(
    new Set([
      ...providerReviews.map((review) => review.id),
      ...auditLogs.map((log) => log.companyId).filter(Boolean),
    ])
  );

  const visibleAuditLogs = auditLogs.filter((log) => {
    const q = auditSearch.trim().toLowerCase();
    if (!q) return true;

    return [
      log.action,
      log.actorRole,
      log.actorUid,
      log.companyId,
      log.resourceType,
      log.resourceId,
      log.fromState,
      log.toState,
      log.note,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(q);
  });

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
      if (res.ok) {
        setAdminToast({ type: "success", text: "Content saved successfully." });
      } else {
        showModal(false, "Failed to save content. Please try again.");
      }
    } finally {
      setIsSaving(false);
    }
  };

  const refreshDashboard = async () => {
    const user = auth.currentUser;
    if (!user) return false;

    const token = await user.getIdToken();
    const res = await fetch(`${API_BASE_URL}/api/admin/dashboard`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) return false;

    setData(await res.json());
    return true;
  };

  const resetPublisherForm = () => {
    setPublisherName("");
    setPublisherEmail("");
    setPublisherPassword("");
    setShowPublisherPassword(false);
    setPublisherError("");
  };

  const closePublisherModal = () => {
    if (publisherCreating) return;
    setPublisherModalOpen(false);
    resetPublisherForm();
  };

  const handleCreatePublisher = async () => {
    setPublisherError("");

    const fullName = publisherName.trim();
    const email = publisherEmail.trim().toLowerCase();
    const password = publisherPassword;

    if (!fullName) {
      setPublisherError("Enter the publisher's full name.");
      return;
    }

    if (!email) {
      setPublisherError("Enter the publisher's email address.");
      return;
    }

    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setPublisherError("Enter a valid email address.");
      return;
    }

    if (password.length < 6) {
      setPublisherError("Temporary password must be at least 6 characters.");
      return;
    }

    const user = auth.currentUser;
    if (!user) {
      setPublisherError("Admin session expired. Please sign in again.");
      return;
    }

    try {
      setPublisherCreating(true);
      const token = await user.getIdToken();

      const res = await fetch(`${API_BASE_URL}/api/admin/publishers`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ fullName, email, password }),
      });

      const payload = await res.json().catch(() => null);

      if (!res.ok) {
        if (res.status === 409) {
          setPublisherError("An account with this email already exists.");
        } else {
          setPublisherError(payload?.message || "Unable to create publisher. Please try again.");
        }
        return;
      }

      await refreshDashboard();
      setPublisherModalOpen(false);
      resetPublisherForm();
      setAdminToast({ type: "success", text: `${fullName} was created successfully as a Publisher.` });
    } catch (e) {
      console.error("Publisher creation failed:", e);
      setPublisherError("Unable to create publisher. Please check the connection and try again.");
    } finally {
      setPublisherCreating(false);
    }
  };

  const openPublisherAction = (user: any, action: PublisherAdminAction) => {
    setPublisherMenuUid(null);
    setPublisherTarget(user);
    setPublisherAction(action);
    setPublisherActionError("");
    setNewPublisherPassword("");
    setConfirmPublisherPassword("");
    setShowNewPublisherPassword(false);
  };

  const closePublisherAction = () => {
    if (publisherActionLoading) return;
    setPublisherAction(null);
    setPublisherTarget(null);
    setPublisherActionError("");
    setNewPublisherPassword("");
    setConfirmPublisherPassword("");
    setShowNewPublisherPassword(false);
  };

  const executePublisherAction = async () => {
    const adminUser = auth.currentUser;

    if (!adminUser || !publisherTarget?.id || !publisherAction) {
      setPublisherActionError("Admin session expired. Please sign in again.");
      return;
    }

    if (publisherAction === "password") {
      if (newPublisherPassword.length < 8) {
        setPublisherActionError("New password must be at least 8 characters.");
        return;
      }

      if (newPublisherPassword !== confirmPublisherPassword) {
        setPublisherActionError("Passwords do not match.");
        return;
      }
    }

    try {
      setPublisherActionLoading(true);
      setPublisherActionError("");

      const token = await adminUser.getIdToken();
      const uid = encodeURIComponent(publisherTarget.id);

      let url = `${API_BASE_URL}/api/admin/publishers/${uid}`;
      let method = "POST";
      let body: string | undefined;

      if (publisherAction === "password") {
        url += "/password";
        method = "PUT";
        body = JSON.stringify({ password: newPublisherPassword });
      } else if (publisherAction === "revoke") {
        url += "/revoke";
        method = "POST";
      } else if (publisherAction === "restore") {
        url += "/restore";
        method = "POST";
      } else {
        method = "DELETE";
      }

      const res = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        ...(body ? { body } : {}),
      });

      const payload = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(payload?.message || "Unable to complete this publisher action.");
      }

      await refreshDashboard();

      const name = publisherTarget.fullName || publisherTarget.email || "Publisher";
      const successText =
        publisherAction === "password"
          ? `${name}'s password was changed and all existing sessions were revoked.`
          : publisherAction === "revoke"
            ? `${name}'s publisher access was revoked immediately.`
            : publisherAction === "restore"
              ? `${name}'s publisher access was restored successfully.`
              : `${name}'s account was deleted. Provider content was preserved.`;

      setPublisherAction(null);
      setPublisherTarget(null);
      setPublisherActionError("");
      setNewPublisherPassword("");
      setConfirmPublisherPassword("");
      setShowNewPublisherPassword(false);
      setAdminToast({ type: "success", text: successText });
    } catch (e: any) {
      const message = e?.message || "Unable to complete this publisher action.";
      setPublisherActionError(message);
      setAdminToast({ type: "error", text: message });
    } finally {
      setPublisherActionLoading(false);
    }
  };

  async function loadProviderReviews(filter = providerReviewFilter) {
    const user = auth.currentUser;
    if (!user) return;

    try {
      setProviderReviewsLoading(true);
      setProviderReviewError("");
      const token = await user.getIdToken();

      const suffix = filter !== "all" ? `?state=${encodeURIComponent(filter)}` : "";
      const res = await fetch(`${API_BASE_URL}/api/admin/provider-reviews${suffix}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const payload = await res.json().catch(() => []);

      if (!res.ok) {
        setProviderReviewError(payload?.message || "Unable to load provider reviews.");
        return;
      }

      setProviderReviews(Array.isArray(payload) ? payload : []);
    } catch (e) {
      console.error("Provider review list failed:", e);
      setProviderReviewError("Unable to load provider reviews.");
    } finally {
      setProviderReviewsLoading(false);
    }
  }

  const openProviderReview = async (companyId: string) => {
    const user = auth.currentUser;
    if (!user) return;

    try {
      setProviderReviewLoading(true);
      setProviderReviewError("");
      setProviderDecisionNote("");
      setProviderReviewModalOpen(true);
      const token = await user.getIdToken();

      const res = await fetch(`${API_BASE_URL}/api/admin/provider-reviews/${companyId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const payload = await res.json().catch(() => null);

      if (!res.ok) {
        setProviderReviewError(payload?.message || "Unable to load this provider profile.");
        return;
      }

      setSelectedProviderReview(payload);
    } catch (e) {
      console.error("Provider review loading failed:", e);
      setProviderReviewError("Unable to load this provider profile.");
    } finally {
      setProviderReviewLoading(false);
    }
  };

  const closeProviderReview = () => {
    if (providerDecisionLoading) return;
    setProviderReviewModalOpen(false);
    setSelectedProviderReview(null);
    setProviderDecisionNote("");
    setProviderReviewError("");
    setProviderConfirmAction(null);
  };

  const handleProviderDecision = async (
    action: "approve" | "request_revision" | "reject" | "unpublish" | "republish"
  ) => {
    const user = auth.currentUser;
    const companyId = selectedProviderReview?.company?.id;

    if (!user || !companyId) return;

    if (
      (action === "request_revision" || action === "reject" || action === "unpublish") &&
      !providerDecisionNote.trim()
    ) {
      setProviderReviewError(
        action === "request_revision"
          ? "Add revision notes before sending the profile back."
          : action === "reject"
            ? "Add a rejection reason before rejecting the profile."
            : "Add a reason before unpublishing the profile."
      );
      return;
    }

    try {
      setProviderDecisionLoading(true);
      setProviderReviewError("");
      const token = await user.getIdToken();

      const res = await fetch(
        `${API_BASE_URL}/api/admin/provider-reviews/${companyId}/decision`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            action,
            note: providerDecisionNote.trim(),
          }),
        }
      );

      const payload = await res.json().catch(() => null);

      if (!res.ok) {
        setProviderReviewError(payload?.message || "Unable to complete this moderation action.");
        return;
      }

      await loadProviderReviews();
      await openProviderReview(companyId);

      setProviderConfirmAction(null);
      setAdminToast({
        type: "success",
        text:
          action === "approve"
            ? "Provider profile approved and published."
            : action === "request_revision"
              ? "Revision requested from the publisher."
              : action === "reject"
                ? "Provider profile rejected."
                : action === "republish"
                  ? "Provider profile republished."
                  : "Provider profile unpublished.",
      });
    } catch (e) {
      console.error("Provider moderation failed:", e);
      setProviderReviewError("Unable to complete this moderation action.");
    } finally {
      setProviderDecisionLoading(false);
    }
  };

  const deleteProviderProfile = async () => {
    const user = auth.currentUser;
    const companyId = selectedProviderReview?.company?.id;
    const companyName = selectedProviderReview?.company?.name || "this provider profile";

    if (!user || !companyId) return;

    try {
      setProviderDecisionLoading(true);
      setProviderReviewError("");
      const token = await user.getIdToken();

      const res = await fetch(
        `${API_BASE_URL}/api/admin/provider-reviews/${companyId}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      const payload = await res.json().catch(() => null);

      if (!res.ok) {
        setProviderReviewError(payload?.message || "Unable to delete this provider profile.");
        return;
      }

      setProviderConfirmAction(null);
      closeProviderReview();
      await loadProviderReviews();
      setAdminToast({ type: "success", text: `${companyName} was permanently deleted.` });
    } catch (e) {
      console.error("Provider deletion failed:", e);
      setProviderReviewError("Unable to delete this provider profile.");
    } finally {
      setProviderDecisionLoading(false);
    }
  };

  async function loadAuditLogs() {
    const user = auth.currentUser;
    if (!user) return;

    try {
      setAuditLoading(true);
      setAuditError("");
      const token = await user.getIdToken();

      const params = new URLSearchParams();
      params.set("limit", "250");

      if (auditRole !== "all") params.set("actorRole", auditRole);
      if (auditAction !== "all") params.set("action", auditAction);
      if (auditCompany !== "all") params.set("companyId", auditCompany);
      if (auditDateFrom) params.set("dateFrom", auditDateFrom);
      if (auditDateTo) params.set("dateTo", auditDateTo);

      const res = await fetch(
        `${API_BASE_URL}/api/admin/audit-logs?${params.toString()}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      const payload = await res.json().catch(() => []);

      if (!res.ok) {
        setAuditError(payload?.message || "Unable to load audit logs.");
        return;
      }

      setAuditLogs(Array.isArray(payload) ? payload : []);
    } catch (e) {
      console.error("Audit logs fetch failed:", e);
      setAuditError("Unable to load audit logs.");
    } finally {
      setAuditLoading(false);
    }
  }

  const requestProviderConfirmation = (action: ProviderConfirmAction) => {
    setProviderReviewError("");

    if (
      (action === "request_revision" || action === "reject" || action === "unpublish") &&
      !providerDecisionNote.trim()
    ) {
      setProviderReviewError(
        action === "request_revision"
          ? "Add revision notes before sending the profile back."
          : action === "reject"
            ? "Add a rejection reason before rejecting the profile."
            : "Add a reason before unpublishing the profile."
      );
      return;
    }

    setProviderConfirmAction(action);
  };

  const providerConfirmCopy = (() => {
    const companyName = selectedProviderReview?.company?.name || "this provider profile";

    switch (providerConfirmAction) {
      case "approve":
        return {
          title: "Approve & Publish?",
          text: `This will approve ${companyName} and make the submitted version publicly visible.`,
          confirm: "Approve & Publish",
          tone: "success",
          Icon: CircleCheck,
        };
      case "request_revision":
        return {
          title: "Request Revision?",
          text: `This will return ${companyName} to the publisher with your moderation notes.`,
          confirm: "Request Revision",
          tone: "info",
          Icon: RotateCcw,
        };
      case "reject":
        return {
          title: "Reject Provider Profile?",
          text: `This will reject ${companyName}. The publisher will see the rejection reason you entered.`,
          confirm: "Reject Profile",
          tone: "danger",
          Icon: Ban,
        };
      case "unpublish":
        return {
          title: "Unpublish Provider Profile?",
          text: `This will immediately remove ${companyName} from the public provider directory while preserving its approved data.`,
          confirm: "Unpublish",
          tone: "warning",
          Icon: EyeOff,
        };
      case "republish":
        return {
          title: "Republish Provider Profile?",
          text: `This will restore ${companyName} to the public provider directory using its approved version.`,
          confirm: "Republish",
          tone: "success",
          Icon: CircleCheck,
        };
      case "delete":
        return {
          title: "Delete Provider Profile?",
          text: `This will permanently delete ${companyName}. This action cannot be undone.`,
          confirm: "Delete Profile",
          tone: "danger",
          Icon: Trash2,
        };
      default:
        return null;
    }
  })();

  const confirmProviderAction = async () => {
    if (!providerConfirmAction) return;

    if (providerConfirmAction === "delete") {
      await deleteProviderProfile();
      return;
    }

    await handleProviderDecision(providerConfirmAction);
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
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');

        *, *::before, *::after { box-sizing: border-box; }

        .adm-root {
          display: flex; height: 100vh; background: #f4f6f9;
          font-family: "Plus Jakarta Sans", sans-serif; overflow: hidden;
          font-weight: 400;
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


        /* ══ ACCESS CONTROL ══ */
        .adm-access-head {
          display: flex; align-items: center; justify-content: space-between; gap: 18px;
          padding: 16px 18px; border-bottom: 1px solid #f0f0f0; background: #fff;
          flex-shrink: 0;
        }
        .adm-access-copy { min-width: 0; }
        .adm-access-title {
          font-size: 14px; font-weight: 700; color: #0d1117;
          letter-spacing: -0.018em; margin: 0 0 3px;
        }
        .adm-access-sub {
          font-size: 11px; font-weight: 400; color: #9ca3af;
          line-height: 1.5; margin: 0;
        }
        .adm-access-empty {
          flex: 1; display: flex; align-items: center; justify-content: center;
          padding: 48px 24px; text-align: center;
        }
        .adm-access-empty-icon {
          width: 48px; height: 48px; border-radius: 16px; margin: 0 auto 14px;
          display: flex; align-items: center; justify-content: center;
          background: #f7f8fa; border: 1px solid #eceff3; color: #8b95a5;
        }
        .adm-access-empty-title {
          font-size: 14px; font-weight: 700; color: #111827; margin-bottom: 5px;
        }
        .adm-access-empty-text {
          font-size: 11px; line-height: 1.6; color: #9ca3af; max-width: 320px;
        }
        @media (max-width: 720px) {
          .adm-access-head { align-items: flex-start; flex-direction: column; }
          .adm-access-head .adm-create-pub-btn { width: 100%; }
        }

        /* ══ PUBLISHER CREATION ══ */
        .adm-create-pub-btn {
          display: inline-flex; align-items: center; justify-content: center; gap: 7px;
          padding: 8px 14px; border-radius: 999px; border: 1px solid #111827;
          background: #111827; color: #fff; font-family: inherit;
          font-size: 12px; font-weight: 700; cursor: pointer; white-space: nowrap;
          box-shadow: 0 4px 14px rgba(17,24,39,0.12);
          transition: transform .2s cubic-bezier(.22,1,.36,1), box-shadow .2s cubic-bezier(.22,1,.36,1), background .2s ease;
        }
        .adm-create-pub-btn:hover { transform: translateY(-1px); background: #000; box-shadow: 0 8px 20px rgba(17,24,39,0.16); }
        .adm-create-pub-btn:active { transform: scale(.985); }

        .adm-pub-badge {
          display: inline-flex; align-items: center; gap: 5px;
          padding: 3px 10px; border-radius: 999px;
          background: #eef2ff; color: #4338ca;
          font-size: 11px; font-weight: 700;
        }

        .adm-access-status {
          display:inline-flex; align-items:center; gap:5px; margin-left:7px;
          padding:3px 8px; border-radius:999px; font-size:9px; font-weight:800;
          text-transform:uppercase; letter-spacing:.045em;
          background:#f0fdf4; color:#15803d; vertical-align:middle;
        }
        .adm-access-status.disabled { background:#fef2f2; color:#b91c1c; }

        .adm-row-actions { position:relative; display:flex; justify-content:flex-end; }
        .adm-more-btn {
          width:31px; height:31px; border-radius:999px; border:1px solid #e5e7eb;
          background:#fff; color:#6b7280; display:flex; align-items:center; justify-content:center;
          cursor:pointer; transition:background .15s ease,color .15s ease,border-color .15s ease;
        }
        .adm-more-btn:hover, .adm-more-btn.active { background:#111827; border-color:#111827; color:#fff; }
        .adm-action-menu {
          position:absolute; top:37px; right:0; z-index:45; width:184px; padding:6px;
          background:#fff; border:1px solid #e6e9ee; border-radius:15px;
          box-shadow:0 18px 48px rgba(15,23,42,.16);
        }
        .adm-action-item {
          width:100%; min-height:37px; padding:0 10px; border:none; border-radius:10px;
          background:transparent; color:#374151; display:flex; align-items:center; gap:9px;
          font-family:inherit; font-size:11px; font-weight:700; cursor:pointer; text-align:left;
        }
        .adm-action-item:hover:not(:disabled) { background:#f5f6f8; color:#111827; }
        .adm-action-item.warn { color:#9a6700; }
        .adm-action-item.restore { color:#166534; }
        .adm-action-item.restore:hover:not(:disabled) { background:#f0fdf4; color:#14532d; }
        .adm-action-item.danger { color:#b91c1c; }
        .adm-action-item.danger:hover:not(:disabled) { background:#fef2f2; color:#991b1b; }
        .adm-action-item:disabled { opacity:.42; cursor:not-allowed; }

        .adm-account-modal-icon {
          width:46px; height:46px; border-radius:15px; display:flex; align-items:center;
          justify-content:center; margin-bottom:16px; background:#f5f7fa;
          border:1px solid #e8ebef; color:#111827;
        }
        .adm-account-modal-icon.warn { background:#fffbeb; border-color:#fde68a; color:#a16207; }
        .adm-account-modal-icon.restore { background:#f0fdf4; border-color:#bbf7d0; color:#166534; }
        .adm-account-modal-icon.danger { background:#fef2f2; border-color:#fee2e2; color:#dc2626; }
        .adm-account-summary {
          margin:2px 0 18px; padding:11px 13px; border:1px solid #eceff3;
          border-radius:14px; background:#f8fafc; font-size:11px; line-height:1.55; color:#697386;
        }
        .adm-account-summary strong { color:#111827; }

        .adm-toast-wrap {
          position:fixed; top:18px; right:18px; z-index:140; pointer-events:none;
        }
        .adm-toast {
          min-width:280px; max-width:min(420px,calc(100vw - 36px));
          display:flex; align-items:flex-start; gap:10px; padding:12px 14px;
          border-radius:15px; background:#111827; color:#fff;
          box-shadow:0 16px 44px rgba(15,23,42,.22);
          font-size:11px; line-height:1.5; font-weight:600;
        }
        .adm-toast.error { background:#991b1b; }

        .adm-confirm-overlay {
          position:fixed; inset:0; z-index:125; display:flex; align-items:center; justify-content:center;
          padding:20px; background:rgba(15,23,42,.34);
          backdrop-filter:blur(10px); -webkit-backdrop-filter:blur(10px);
        }
        .adm-confirm-modal {
          width:min(430px,94vw); background:#fff; border:1px solid rgba(15,23,42,.08);
          border-radius:24px; padding:24px; box-shadow:0 28px 90px rgba(15,23,42,.22);
        }
        .adm-confirm-icon {
          width:46px; height:46px; border-radius:15px; display:flex; align-items:center; justify-content:center;
          margin-bottom:16px; background:#f5f7fa; border:1px solid #e8ebef; color:#111827;
        }
        .adm-confirm-icon.success { background:#f0fdf4; border-color:#bbf7d0; color:#15803d; }
        .adm-confirm-icon.info { background:#eff6ff; border-color:#bfdbfe; color:#1d4ed8; }
        .adm-confirm-icon.warning { background:#fffbeb; border-color:#fde68a; color:#92400e; }
        .adm-confirm-icon.danger { background:#fef2f2; border-color:#fecaca; color:#b91c1c; }
        .adm-confirm-title {
          margin:0 0 8px; font-size:18px; line-height:1.25; font-weight:800;
          color:#111827; letter-spacing:-.03em;
        }
        .adm-confirm-text {
          margin:0; font-size:11.5px; line-height:1.65; color:#7c8594;
        }
        .adm-confirm-actions {
          display:flex; align-items:center; justify-content:flex-end; gap:9px; margin-top:22px;
        }
        .adm-confirm-cancel,
        .adm-confirm-submit {
          min-height:40px; padding:0 16px; border-radius:999px; font-family:inherit;
          font-size:11px; font-weight:800; cursor:pointer;
        }
        .adm-confirm-cancel {
          border:1px solid #e5e7eb; background:#fff; color:#4b5563;
        }
        .adm-confirm-submit {
          border:1px solid #111827; background:#111827; color:#fff;
          display:inline-flex; align-items:center; justify-content:center; gap:6px;
        }
        .adm-confirm-submit.success { background:#15803d; border-color:#15803d; }
        .adm-confirm-submit.info { background:#1d4ed8; border-color:#1d4ed8; }
        .adm-confirm-submit.warning { background:#92400e; border-color:#92400e; }
        .adm-confirm-submit.danger { background:#b91c1c; border-color:#b91c1c; }
        .adm-confirm-submit:disabled,
        .adm-confirm-cancel:disabled { opacity:.48; cursor:not-allowed; }

        .adm-pub-overlay {
          position: fixed; inset: 0; z-index: 70;
          display: flex; align-items: center; justify-content: center;
          padding: 22px; background: rgba(15,23,42,.30);
          backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
        }
        .adm-pub-modal {
          width: min(460px,100%); background: rgba(255,255,255,.98);
          border: 1px solid rgba(15,23,42,.08); border-radius: 26px;
          box-shadow: 0 30px 90px rgba(15,23,42,.18); overflow: hidden;
          font-family: "Plus Jakarta Sans", sans-serif;
        }
        .adm-pub-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 18px; padding: 25px 26px 18px; }
        .adm-pub-icon {
          width: 42px; height: 42px; border-radius: 14px;
          display: flex; align-items: center; justify-content: center;
          background: #f5f7fa; border: 1px solid #e8ebef; color: #111827; margin-bottom: 17px;
        }
        .adm-pub-title { margin: 0 0 6px; color: #0f172a; font-size: 20px; line-height: 1.2; font-weight: 800; letter-spacing: -.035em; }
        .adm-pub-sub { margin: 0; color: #7c8594; font-size: 12px; line-height: 1.65; font-weight: 400; max-width: 345px; }
        .adm-pub-close {
          width: 34px; height: 34px; border-radius: 999px; border: 1px solid #e5e7eb;
          background: #fff; color: #6b7280; display: flex; align-items: center; justify-content: center;
          cursor: pointer; flex-shrink: 0; transition: transform .18s ease, background .18s ease, color .18s ease;
        }
        .adm-pub-close:hover { background: #f5f5f5; color: #111; transform: rotate(4deg); }

        .adm-pub-body { padding: 4px 26px 26px; }
        .adm-pub-field { margin-bottom: 15px; }
        .adm-pub-label {
          display: block; margin: 0 0 7px 2px; font-size: 10px; font-weight: 700;
          color: #747d8c; letter-spacing: .07em; text-transform: uppercase;
        }
        .adm-pub-input-wrap { position: relative; }
        .adm-pub-input {
          width: 100%; height: 46px; border: 1.5px solid #e6e9ee; border-radius: 999px;
          outline: none; background: #fafbfc; color: #111827; padding: 0 17px;
          font-family: inherit; font-size: 13px; font-weight: 400;
          transition: border-color .2s ease, box-shadow .2s ease, background .2s ease, transform .2s cubic-bezier(.22,1,.36,1);
        }
        .adm-pub-input::placeholder { color: #b0b6c0; }
        .adm-pub-input:focus { border-color: #111827; background: #fff; box-shadow: 0 0 0 4px rgba(17,24,39,.055); transform: translateY(-1px); }
        .adm-pub-input.password { padding-right: 48px; }
        .adm-pub-eye {
          position: absolute; top: 50%; right: 16px; transform: translateY(-50%);
          width: 26px; height: 26px; border: none; border-radius: 999px;
          background: transparent; color: #9aa1ad; cursor: pointer;
          display: flex; align-items: center; justify-content: center; transition: color .15s ease, background .15s ease;
        }
        .adm-pub-eye:hover { background: #f1f3f5; color: #111827; }

        .adm-pub-role-note {
          display: flex; align-items: flex-start; gap: 10px; margin: 6px 0 18px; padding: 11px 13px;
          border-radius: 14px; background: #f8fafc; border: 1px solid #edf0f3;
          color: #697386; font-size: 11px; line-height: 1.55;
        }
        .adm-pub-role-note strong { color: #202938; font-weight: 700; }
        .adm-pub-error {
          margin: 0 0 15px; padding: 10px 13px; border-radius: 14px;
          background: #fff5f5; border: 1px solid #fee2e2; color: #b91c1c;
          font-size: 11px; line-height: 1.5; font-weight: 500;
        }
        .adm-pub-actions { display: flex; align-items: center; justify-content: flex-end; gap: 9px; padding-top: 4px; }
        .adm-pub-secondary, .adm-pub-primary {
          min-height: 42px; padding: 0 18px; border-radius: 999px; font-family: inherit;
          font-size: 12px; font-weight: 700; cursor: pointer;
          transition: transform .18s cubic-bezier(.22,1,.36,1), box-shadow .18s ease, opacity .18s ease, background .18s ease;
        }
        .adm-pub-secondary { border: 1.5px solid #e4e7eb; background: #fff; color: #4b5563; }
        .adm-pub-secondary:hover:not(:disabled) { background: #f7f8fa; transform: translateY(-1px); }
        .adm-pub-primary {
          border: 1px solid #111827; background: #111827; color: #fff;
          display: inline-flex; align-items: center; justify-content: center; gap: 7px;
          box-shadow: 0 5px 16px rgba(17,24,39,.14);
        }
        .adm-pub-primary:hover:not(:disabled) { background: #000; transform: translateY(-1px); box-shadow: 0 9px 22px rgba(17,24,39,.18); }
        .adm-pub-primary:active:not(:disabled) { transform: scale(.985); }
        .adm-pub-primary:disabled, .adm-pub-secondary:disabled { opacity: .48; cursor: not-allowed; }
        .adm-pub-spinner {
          width: 13px; height: 13px; border-radius: 50%;
          border: 1.8px solid rgba(255,255,255,.35); border-top-color: #fff;
          animation: adm-spin .65s linear infinite;
        }
        @keyframes adm-spin { to { transform: rotate(360deg); } }

        @media (max-width: 720px) {
          .adm-toolbar { flex-wrap: wrap; }
          .adm-search-center { order: 3; width: 100%; flex-basis: 100%; }
          .adm-sw { max-width: none; }
          .adm-pub-modal { border-radius: 22px; }
          .adm-pub-head { padding: 22px 20px 16px; }
          .adm-pub-body { padding: 4px 20px 20px; }
          .adm-pub-actions { justify-content: stretch; }
          .adm-pub-secondary, .adm-pub-primary { flex: 1; }
        }


        /* ══ PROVIDER REVIEWS ══ */
        .adm-review-shell {
          background:#fff; border:1.5px solid #ebebeb; border-radius:22px;
          overflow:hidden; box-shadow:0 1px 4px rgba(0,0,0,.05);
          display:flex; flex-direction:column; flex:1; min-height:0;
        }
        .adm-review-head {
          display:flex; align-items:center; justify-content:space-between; gap:16px;
          padding:16px 18px; border-bottom:1px solid #f0f0f0; flex-shrink:0;
        }
        .adm-review-title { margin:0 0 3px; font-size:14px; font-weight:800; color:#111827; letter-spacing:-.02em; }
        .adm-review-sub { margin:0; font-size:11px; color:#9ca3af; line-height:1.55; }
        .adm-review-filters { display:flex; align-items:center; gap:7px; flex-wrap:wrap; }
        .adm-review-filter {
          height:32px; padding:0 11px; border-radius:999px;
          border:1px solid #e5e7eb; background:#fff; color:#6b7280;
          font-family:inherit; font-size:10px; font-weight:700; cursor:pointer;
          transition:all .16s ease;
        }
        .adm-review-filter:hover { background:#f7f8fa; color:#111827; }
        .adm-review-filter.active { background:#111827; border-color:#111827; color:#fff; }
        .adm-review-list { flex:1; overflow:auto; padding:12px; display:flex; flex-direction:column; gap:9px; }
        .adm-review-list::-webkit-scrollbar { width:0; }
        .adm-review-row {
          display:grid; grid-template-columns:minmax(0,1.3fr) minmax(0,1fr) 140px 110px 34px;
          align-items:center; gap:14px; padding:13px 14px; border:1px solid #eceef1;
          border-radius:16px; background:#fff; transition:transform .17s ease,box-shadow .17s ease,border-color .17s ease;
        }
        .adm-review-row:hover { transform:translateY(-1px); border-color:#dfe3e8; box-shadow:0 8px 20px rgba(15,23,42,.045); }
        .adm-review-company { display:flex; align-items:center; gap:10px; min-width:0; }
        .adm-review-company-icon {
          width:34px; height:34px; border-radius:11px; flex-shrink:0;
          display:flex; align-items:center; justify-content:center; background:#f5f6f8;
          border:1px solid #eaecf0; color:#66707f;
        }
        .adm-review-name { font-size:12px; font-weight:800; color:#111827; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .adm-review-slug { margin-top:2px; font-size:9.5px; color:#a0a7b2; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .adm-review-publisher { min-width:0; }
        .adm-review-publisher strong { display:block; font-size:10.5px; color:#374151; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .adm-review-publisher span { display:block; margin-top:2px; font-size:9px; color:#a0a7b2; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .adm-review-state {
          display:inline-flex; align-items:center; justify-content:center; width:max-content;
          padding:5px 9px; border-radius:999px; font-size:8.5px; font-weight:800;
          text-transform:uppercase; letter-spacing:.05em; background:#f5f6f8; color:#6b7280;
        }
        .adm-review-state.pending_review { background:#fff7ed; color:#c2410c; }
        .adm-review-state.approved { background:#f0fdf4; color:#15803d; }
        .adm-review-state.changes_requested { background:#eff6ff; color:#1d4ed8; }
        .adm-review-state.rejected { background:#fef2f2; color:#b91c1c; }
        .adm-review-date { font-size:9.5px; color:#9ca3af; }
        .adm-review-open {
          width:32px; height:32px; border-radius:999px; border:1px solid #e5e7eb;
          background:#fff; color:#6b7280; display:flex; align-items:center; justify-content:center;
          cursor:pointer; transition:background .15s ease,color .15s ease;
        }
        .adm-review-open:hover { background:#111827; color:#fff; border-color:#111827; }
        .adm-review-empty { flex:1; display:flex; align-items:center; justify-content:center; text-align:center; padding:44px 22px; }
        .adm-review-empty-icon {
          width:48px; height:48px; margin:0 auto 13px; border-radius:15px;
          display:flex; align-items:center; justify-content:center; background:#f6f7f9;
          border:1px solid #e9ebef; color:#8b95a5;
        }
        .adm-review-empty-title { font-size:14px; font-weight:800; color:#111827; margin-bottom:5px; }
        .adm-review-empty-copy { font-size:10.5px; color:#9ca3af; line-height:1.6; max-width:330px; }

        .adm-review-overlay {
          position:fixed; inset:0; z-index:90; display:flex; align-items:center; justify-content:center;
          padding:20px; background:rgba(15,23,42,.34); backdrop-filter:blur(10px);
        }
        .adm-review-modal {
          width:min(980px,96vw); max-height:90vh; background:#f6f7f9; border-radius:28px;
          overflow:hidden; border:1px solid rgba(255,255,255,.7);
          box-shadow:0 30px 100px rgba(15,23,42,.22); display:flex; flex-direction:column;
        }
        .adm-review-modal-head {
          flex-shrink:0; display:flex; align-items:flex-start; justify-content:space-between; gap:18px;
          padding:22px 24px 17px; background:#fff; border-bottom:1px solid #e9ebef;
        }
        .adm-review-modal-title { margin:0 0 4px; font-size:20px; font-weight:800; letter-spacing:-.035em; color:#111827; }
        .adm-review-modal-meta { font-size:10px; color:#929aa6; line-height:1.55; }
        .adm-review-close {
          width:34px; height:34px; flex-shrink:0; border-radius:999px; border:1px solid #e5e7eb;
          background:#fff; color:#6b7280; display:flex; align-items:center; justify-content:center; cursor:pointer;
        }
        .adm-review-modal-body {
          flex:1; min-height:0; overflow:auto; padding:18px 18px 120px;
        }
        .adm-review-modal-body::-webkit-scrollbar { width:0; }

        .adm-review-sticky-footer {
          flex-shrink:0;
          background:rgba(255,255,255,.98);
          border-top:1px solid #e7e9ed;
          padding:13px 18px;
          box-shadow:0 -10px 28px rgba(15,23,42,.06);
          backdrop-filter:blur(12px);
          -webkit-backdrop-filter:blur(12px);
        }

        .adm-review-sticky-footer .adm-review-actions {
          margin:0;
          padding:0;
          border-top:none;
        }
        .adm-review-section {
          background:#fff; border:1px solid #e7e9ed; border-radius:20px; padding:18px; margin-bottom:12px;
        }
        .adm-review-section h4 { margin:0 0 12px; font-size:11px; font-weight:800; text-transform:uppercase; letter-spacing:.06em; color:#111827; }
        .adm-review-info-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:10px; }
        .adm-review-info {
          border:1px solid #eef0f2; border-radius:14px; background:#fafbfc; padding:11px 12px; min-width:0;
        }
        .adm-review-info label {
          display:block;
          font-size:8.5px;
          font-weight:800;
          text-transform:uppercase;
          letter-spacing:.05em;
          color:#1e3a8a;
          margin-bottom:4px;
        }
        .adm-review-info div { font-size:10.5px; line-height:1.5; color:#374151; word-break:break-word; }

        .adm-review-status-pill {
          display:inline-flex; align-items:center; justify-content:center;
          width:max-content; padding:5px 9px; border-radius:999px;
          font-size:8.5px !important; line-height:1 !important; font-weight:800;
          text-transform:uppercase; letter-spacing:.05em;
          border:1px solid transparent;
        }
        .adm-review-status-pill.published,
        .adm-review-status-pill.approved {
          background:#f0fdf4; color:#15803d; border-color:#bbf7d0;
        }
        .adm-review-status-pill.pending_review,
        .adm-review-status-pill.pending {
          background:#fff7ed; color:#c2410c; border-color:#fed7aa;
        }
        .adm-review-status-pill.draft {
          background:#f5f6f8; color:#6b7280; border-color:#e5e7eb;
        }
        .adm-review-status-pill.changes_requested,
        .adm-review-status-pill.revision {
          background:#eff6ff; color:#1d4ed8; border-color:#bfdbfe;
        }
        .adm-review-status-pill.rejected,
        .adm-review-status-pill.unpublished {
          background:#fef2f2; color:#b91c1c; border-color:#fecaca;
        }
        .adm-review-content-grid { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:9px; }
        .adm-review-count {
          border:1px solid #eceef1; border-radius:15px; padding:12px; background:#fafbfc;
        }
        .adm-review-count strong { display:block; font-size:18px; font-weight:800; color:#111827; }
        .adm-review-count span { display:block; margin-top:3px; font-size:8.5px; text-transform:uppercase; letter-spacing:.05em; font-weight:700; color:#9ca3af; }
        .adm-review-note {
          width:100%; min-height:88px; resize:vertical; border:1.5px solid #e5e7eb;
          border-radius:16px; padding:12px 13px; background:#fafafa; color:#111827;
          font-family:inherit; font-size:11px; line-height:1.55; outline:none;
        }
        .adm-review-note:focus { background:#fff; border-color:#111827; box-shadow:0 0 0 3px rgba(17,24,39,.05); }
        .adm-review-error {
          margin-bottom:12px; padding:10px 12px; border-radius:13px;
          background:#fff5f5; border:1px solid #fee2e2; color:#b91c1c; font-size:10.5px; line-height:1.55;
        }
        .adm-review-actions {
          display:flex; align-items:center; gap:8px; flex-wrap:wrap; padding-top:13px; margin-top:12px; border-top:1px solid #f0f1f3;
        }
        .adm-moderation-btn {
          min-height:36px; padding:0 13px; border-radius:999px; border:1px solid #e4e7eb;
          background:#fff; color:#4b5563; font-family:inherit; font-size:9.5px; font-weight:800;
          display:inline-flex; align-items:center; gap:6px; cursor:pointer; transition:all .16s ease;
        }
        .adm-moderation-btn:hover:not(:disabled) { transform:translateY(-1px); background:#f7f8fa; }
        .adm-moderation-btn.approve { background:#111827; border-color:#111827; color:#fff; }
        .adm-moderation-btn.approve:hover:not(:disabled) {
          background:#111827; border-color:#111827; color:#fff;
          box-shadow:0 6px 16px rgba(17,24,39,.16);
        }
        .adm-moderation-btn.revision { color:#1d4ed8; background:#eff6ff; border-color:#dbeafe; }
        .adm-moderation-btn.reject { color:#b91c1c; background:#fef2f2; border-color:#fee2e2; }
        .adm-moderation-btn.unpublish { color:#92400e; background:#fffbeb; border-color:#fde68a; }
        .adm-moderation-btn.delete { color:#b91c1c; margin-left:auto; }
        .adm-moderation-btn:disabled { opacity:.45; cursor:not-allowed; }

        @media(max-width:900px){
          .adm-review-row{grid-template-columns:minmax(0,1fr) 125px 34px}
          .adm-review-publisher,.adm-review-date{display:none}
          .adm-review-info-grid{grid-template-columns:1fr 1fr}
          .adm-review-content-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
        }
        @media(max-width:620px){
          .adm-review-head{align-items:flex-start;flex-direction:column}
          .adm-review-row{grid-template-columns:minmax(0,1fr) 34px}
          .adm-review-row>.adm-review-state{display:none}
          .adm-review-info-grid{grid-template-columns:1fr}
          .adm-review-modal{width:100%;max-height:94vh;border-radius:22px}
          .adm-review-modal-head{padding:19px 18px 14px}
          .adm-review-modal-body{padding:12px 12px 118px}
          .adm-review-sticky-footer{padding:11px 12px}
          .adm-moderation-btn.delete{margin-left:0}
        }


        /* ══ AUDIT LOGS ══ */
        .adm-audit-shell {
          background:#fff; border:1.5px solid #ebebeb; border-radius:22px;
          overflow:hidden; box-shadow:0 1px 4px rgba(0,0,0,.05);
          display:flex; flex-direction:column; flex:1; min-height:0;
        }
        .adm-audit-head {
          padding:16px 18px; border-bottom:1px solid #f0f0f0;
          display:flex; align-items:flex-start; justify-content:space-between; gap:16px;
          flex-shrink:0;
        }
        .adm-audit-title { margin:0 0 3px; font-size:14px; font-weight:800; color:#111827; letter-spacing:-.02em; }
        .adm-audit-sub { margin:0; color:#9ca3af; font-size:11px; line-height:1.55; }
        .adm-audit-refresh {
          height:32px; padding:0 11px; border-radius:999px; border:1px solid #e5e7eb;
          background:#fff; color:#66707f; display:inline-flex; align-items:center; gap:6px;
          font-family:inherit; font-size:9.5px; font-weight:800; cursor:pointer;
        }
        .adm-audit-refresh:hover { background:#f7f8fa; color:#111827; }
        .adm-audit-filters {
          padding:12px 18px; display:grid;
          grid-template-columns:minmax(200px,1.5fr) repeat(3,minmax(120px,.7fr)) repeat(2,minmax(125px,.65fr));
          gap:8px; border-bottom:1px solid #f0f0f0; background:#fafbfc; flex-shrink:0;
        }
        .adm-audit-search-wrap { position:relative; }
        .adm-audit-search-icon {
          position:absolute; left:11px; top:50%; transform:translateY(-50%); color:#a0a7b2; pointer-events:none;
        }
        .adm-audit-input,.adm-audit-select {
          width:100%; height:34px; border:1px solid #e5e7eb; border-radius:999px;
          background:#fff; color:#4b5563; font-family:inherit; font-size:9.5px;
          font-weight:600; outline:none;
        }
        .adm-audit-input { padding:0 11px 0 31px; }
        .adm-audit-select { padding:0 10px; }
        .adm-audit-input:focus,.adm-audit-select:focus { border-color:#111827; }
        .adm-audit-list { flex:1; min-height:0; overflow:auto; padding:12px; display:flex; flex-direction:column; gap:8px; }
        .adm-audit-list::-webkit-scrollbar { width:0; }
        .adm-audit-row {
          display:grid; grid-template-columns:38px minmax(150px,1.1fr) minmax(130px,.9fr) minmax(130px,.9fr) minmax(0,1.6fr) 135px;
          gap:11px; align-items:center; padding:12px 13px; border:1px solid #eceef1;
          border-radius:16px; background:#fff; transition:transform .16s ease,box-shadow .16s ease;
        }
        .adm-audit-row:hover { transform:translateY(-1px); box-shadow:0 8px 18px rgba(15,23,42,.045); }
        .adm-audit-icon {
          width:34px; height:34px; border-radius:11px; background:#f5f6f8; border:1px solid #eaecf0;
          display:flex; align-items:center; justify-content:center; color:#778190;
        }
        .adm-audit-action { font-size:10.5px; font-weight:800; color:#111827; word-break:break-word; }
        .adm-audit-resource { margin-top:3px; color:#a0a7b2; font-size:8.5px; }
        .adm-audit-role {
          display:inline-flex; width:max-content; padding:4px 8px; border-radius:999px;
          background:#f5f6f8; color:#6b7280; font-size:8.5px; font-weight:800; text-transform:uppercase;
        }
        .adm-audit-role.admin { background:#fef3c7; color:#92400e; }
        .adm-audit-role.publisher { background:#eef2ff; color:#4338ca; }
        .adm-audit-company,.adm-audit-note { min-width:0; font-size:9.5px; color:#66707f; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .adm-audit-state {
          display:flex; align-items:center; gap:5px; min-width:0; color:#7b8492; font-size:9px;
        }
        .adm-audit-state span {
          padding:4px 7px; border-radius:999px; background:#f6f7f9; border:1px solid #eceef1;
          overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:105px;
        }
        .adm-audit-time { font-size:8.8px; line-height:1.45; color:#9ca3af; text-align:right; }
        .adm-audit-empty {
          flex:1; display:flex; align-items:center; justify-content:center; text-align:center; padding:42px 20px;
        }
        .adm-audit-empty-icon {
          width:48px; height:48px; border-radius:15px; margin:0 auto 12px; background:#f6f7f9;
          border:1px solid #e9ebef; color:#8b95a5; display:flex; align-items:center; justify-content:center;
        }
        .adm-audit-empty-title { font-size:13px; font-weight:800; color:#111827; }
        .adm-audit-empty-copy { margin-top:5px; font-size:10px; line-height:1.6; color:#9ca3af; }
        .adm-audit-summary {
          padding:10px 18px; border-top:1px solid #f0f0f0; background:#fff;
          display:flex; align-items:center; justify-content:space-between; gap:10px;
          color:#9ca3af; font-size:9px; flex-shrink:0;
        }

        @media(max-width:1100px){
          .adm-audit-filters{grid-template-columns:1fr 1fr 1fr}
          .adm-audit-row{grid-template-columns:38px minmax(150px,1fr) 100px minmax(0,1fr) 120px}
          .adm-audit-company{display:none}
        }
        @media(max-width:720px){
          .adm-audit-head{flex-direction:column}
          .adm-audit-filters{grid-template-columns:1fr 1fr}
          .adm-audit-search-wrap{grid-column:1 / -1}
          .adm-audit-row{grid-template-columns:34px minmax(0,1fr) 90px}
          .adm-audit-state,.adm-audit-note,.adm-audit-company{display:none}
          .adm-audit-time{text-align:right}
        }
        @media(max-width:460px){
          .adm-audit-filters{grid-template-columns:1fr}
          .adm-audit-search-wrap{grid-column:auto}
          .adm-audit-row{grid-template-columns:32px minmax(0,1fr)}
          .adm-audit-time{grid-column:2;text-align:left}
        }

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
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-6 gap-5 mb-6">
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
                        <div className="flex items-center gap-2 text-gray-500 text-sm mb-3">
                          <UserCog size={15} />
                          Granted Users
                        </div>
                        <h3 className="text-2xl font-semibold text-gray-900 mb-3">
                          {dashboardGrantedTotal}
                        </h3>
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-[11px] font-semibold" style={{ color: "#16a34a" }}>Active</p>
                            <p className="text-sm font-semibold" style={{ color: "#16a34a" }}>{dashboardGrantedActive}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-[11px] font-semibold" style={{ color: "#dc2626" }}>Revoked</p>
                            <p className="text-sm font-semibold" style={{ color: "#dc2626" }}>{dashboardGrantedRevoked}</p>
                          </div>
                        </div>
                      </div>

                      <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition">
                        <div className="flex items-center gap-2 text-gray-500 text-sm mb-3">
                          <Building2 size={15} />
                          Profiles
                        </div>
                        <h3 className="text-2xl font-semibold text-gray-900 mb-3">
                          {dashboardProfilesTotal}
                        </h3>
                        <div className="space-y-1.5 text-sm font-semibold">
                          <div className="flex items-center justify-between">
                            <span className="text-green-600">Approved:</span>
                            <span className="text-green-600">{dashboardProfilesApproved}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-orange-500">Pending:</span>
                            <span className="text-orange-500">{dashboardProfilesPending}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-red-600">Rejected:</span>
                            <span className="text-red-600">{dashboardProfilesRejected}</span>
                          </div>
                        </div>
                      </div>

                      <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition">
                        <div className="flex items-center gap-2 text-gray-500 text-sm mb-3"><Bug size={15} />Bug Reports</div>
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-xs font-semibold" style={{ color: "#f97316" }}>Opened</p>
                            <p className="text-lg font-semibold" style={{ color: "#f97316" }}>{data.openBugs ?? 0}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs font-semibold" style={{ color: "#16a34a" }}>Resolved</p>
                            <p className="text-lg font-semibold" style={{ color: "#16a34a" }}>{data.resolvedBugs ?? 0}</p>
                          </div>
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
                      <span className="adm-tb-title">Platform Users</span>
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
                                <span className="adm-rbadge">user</span>
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

                {/* ══════════ ACCESS CONTROL / RBAC ══════════ */}
                {activeMenu === "access" && (
                  <div className="adm-tc">
                    <div className="adm-access-head">
                      <div className="adm-access-copy">
                        <h3 className="adm-access-title">Publisher Access</h3>
                        <p className="adm-access-sub">
                          Manage role-based publisher accounts separately from normal platform users.
                        </p>
                      </div>

                      <button
                        className="adm-create-pub-btn"
                        onClick={() => {
                          resetPublisherForm();
                          setPublisherModalOpen(true);
                        }}
                      >
                        <UserPlus size={14} />
                        Create Publisher
                      </button>
                    </div>

                    {publisherUsers.length > 0 ? (
                      <div className="adm-tbody-scroll">
                        <table className="adm-table">
                          <thead>
                            <tr>
                              <th>Name</th>
                              <th className="hide-mob">Email</th>
                              <th>Role</th>
                              <th className="hide-mob">Joined</th>
                              <th style={{ width: 54, textAlign: "right" }}>Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {publisherUsers.map((user: any) => (
                              <tr key={user.id}>
                                <td>
                                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                    <div className="adm-uav">
                                      {user.fullName?.charAt(0)?.toUpperCase() || "?"}
                                    </div>
                                    <span style={{ fontWeight: 600, color: "#0d1117", fontSize: 13 }}>
                                      {user.fullName}
                                    </span>
                                  </div>
                                </td>
                                <td className="hide-mob" style={{ color: "#6b7280", fontSize: 13 }}>
                                  {user.email}
                                </td>
                                <td>
                                  <span className="adm-pub-badge">
                                    <UserPlus size={11} />
                                    Publisher
                                  </span>
                                  <span className={`adm-access-status ${(user.status || "active").toLowerCase() === "disabled" ? "disabled" : ""}`}>
                                    {(user.status || "active").toLowerCase() === "disabled" ? "Revoked" : "Active"}
                                  </span>
                                </td>
                                <td className="hide-mob" style={{ color: "#9ca3af", fontSize: 12 }}>
                                  {user.createdAt ? new Date(user.createdAt).toLocaleDateString("en-GB") : "—"}
                                </td>
                                <td style={{ textAlign: "right", position: "relative" }}>
                                  <div className="adm-row-actions" onClick={(e) => e.stopPropagation()}>
                                    <button
                                      className={`adm-more-btn ${publisherMenuUid === user.id ? "active" : ""}`}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setPublisherMenuUid((current) => current === user.id ? null : user.id);
                                      }}
                                      aria-label={`Manage ${user.fullName || user.email}`}
                                    >
                                      <MoreVertical size={15} />
                                    </button>

                                    <AnimatePresence>
                                      {publisherMenuUid === user.id && (
                                        <motion.div
                                          className="adm-action-menu"
                                          initial={{ opacity: 0, y: -4, scale: .98 }}
                                          animate={{ opacity: 1, y: 0, scale: 1 }}
                                          exit={{ opacity: 0, y: -3, scale: .985 }}
                                          transition={{ duration: .14 }}
                                        >
                                          <button
                                            className="adm-action-item"
                                            disabled={(user.status || "active").toLowerCase() === "disabled"}
                                            onClick={() => openPublisherAction(user, "password")}
                                          >
                                            <KeyRound size={14} />
                                            Change Password
                                          </button>
                                          {(user.status || "active").toLowerCase() === "disabled" ? (
                                            <button
                                              className="adm-action-item restore"
                                              onClick={() => openPublisherAction(user, "restore")}
                                            >
                                              <RotateCcw size={14} />
                                              Restore Access
                                            </button>
                                          ) : (
                                            <button
                                              className="adm-action-item warn"
                                              onClick={() => openPublisherAction(user, "revoke")}
                                            >
                                              <ShieldOff size={14} />
                                              Revoke Access
                                            </button>
                                          )}
                                          <button
                                            className="adm-action-item danger"
                                            onClick={() => openPublisherAction(user, "delete")}
                                          >
                                            <Trash2 size={14} />
                                            Delete User
                                          </button>
                                        </motion.div>
                                      )}
                                    </AnimatePresence>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="adm-access-empty">
                        <div>
                          <div className="adm-access-empty-icon">
                            <UserCog size={20} />
                          </div>
                          <div className="adm-access-empty-title">No publisher accounts yet</div>
                          <div className="adm-access-empty-text">
                            Publisher accounts created by Matthias will appear here and remain separate from normal registered users.
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* ══════════ PROVIDER REVIEWS ══════════ */}
                {activeMenu === "reviews" && (
                  <div className="adm-review-shell">
                    <div className="adm-review-head">
                      <div>
                        <h3 className="adm-review-title">Provider Profile Moderation</h3>
                        <p className="adm-review-sub">
                          Review publisher submissions, request revisions, approve profiles and manage published visibility.
                        </p>
                      </div>

                      <div className="adm-review-filters">
                        {[
                          ["all", "All"],
                          ["pending_review", "Pending"],
                          ["approved", "Approved"],
                          ["changes_requested", "Revision"],
                          ["rejected", "Rejected"],
                        ].map(([value, label]) => (
                          <button
                            key={value}
                            className={`adm-review-filter ${providerReviewFilter === value ? "active" : ""}`}
                            onClick={() => setProviderReviewFilter(value)}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {providerReviewError && !providerReviewModalOpen && (
                      <div style={{ padding: 14 }}>
                        <div className="adm-review-error">{providerReviewError}</div>
                      </div>
                    )}

                    {providerReviewsLoading ? (
                      <div className="adm-review-empty">
                        <div>
                          <div className="adm-review-empty-icon"><Clock3 size={19} /></div>
                          <div className="adm-review-empty-title">Loading provider profiles…</div>
                        </div>
                      </div>
                    ) : providerReviews.length === 0 ? (
                      <div className="adm-review-empty">
                        <div>
                          <div className="adm-review-empty-icon"><ClipboardCheck size={20} /></div>
                          <div className="adm-review-empty-title">No profiles in this view</div>
                          <div className="adm-review-empty-copy">
                            Submitted provider profiles will appear here as publishers move them through the review workflow.
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="adm-review-list">
                        {providerReviews.map((review) => (
                          <motion.div
                            key={review.id}
                            className="adm-review-row"
                            initial={{ opacity: 0, y: 4 }}
                            animate={{ opacity: 1, y: 0 }}
                          >
                            <div className="adm-review-company">
                              <div className="adm-review-company-icon"><Building2 size={15} /></div>
                              <div style={{ minWidth: 0 }}>
                                <div className="adm-review-name">{review.name || "Untitled company"}</div>
                                <div className="adm-review-slug">/{review.slug || review.id}</div>
                              </div>
                            </div>

                            <div className="adm-review-publisher">
                              <strong>{review.publisherName || "Publisher"}</strong>
                              <span>{review.publisherEmail || "—"}</span>
                            </div>

                            <div className={`adm-review-state ${review.moderationState}`}>
                              {review.moderationState.replaceAll("_", " ")}
                            </div>

                            <div className="adm-review-date">
                              {review.submittedAt
                                ? new Date(review.submittedAt).toLocaleDateString("en-GB")
                                : review.updatedAt
                                  ? new Date(review.updatedAt).toLocaleDateString("en-GB")
                                  : "—"}
                            </div>

                            <button
                              className="adm-review-open"
                              onClick={() => openProviderReview(review.id)}
                              aria-label={`Review ${review.name}`}
                            >
                              <ChevronRight size={14} />
                            </button>
                          </motion.div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* ══════════ AUDIT LOGS ══════════ */}
                {activeMenu === "audit" && (
                  <div className="adm-audit-shell">
                    <div className="adm-audit-head">
                      <div>
                        <h3 className="adm-audit-title">Activity & Audit History</h3>
                        <p className="adm-audit-sub">
                          Read-only operational history for provider, moderation, media and publisher actions.
                        </p>
                      </div>

                      <button
                        className="adm-audit-refresh"
                        onClick={loadAuditLogs}
                        disabled={auditLoading}
                      >
                        <RefreshCw size={11} className={auditLoading ? "animate-spin" : ""} />
                        Refresh
                      </button>
                    </div>

                    <div className="adm-audit-filters">
                      <div className="adm-audit-search-wrap">
                        <Search size={12} className="adm-audit-search-icon" />
                        <input
                          className="adm-audit-input"
                          value={auditSearch}
                          onChange={(e) => setAuditSearch(e.target.value)}
                          placeholder="Search action, company, resource, note or UID…"
                        />
                      </div>

                      <select
                        className="adm-audit-select"
                        value={auditRole}
                        onChange={(e) => setAuditRole(e.target.value)}
                      >
                        <option value="all">All roles</option>
                        <option value="admin">Admin</option>
                        <option value="publisher">Publisher</option>
                      </select>

                      <select
                        className="adm-audit-select"
                        value={auditAction}
                        onChange={(e) => setAuditAction(e.target.value)}
                      >
                        <option value="all">All actions</option>
                        {auditActions.map((action) => (
                          <option key={action} value={action}>{action.replaceAll("_", " ")}</option>
                        ))}
                      </select>

                      <select
                        className="adm-audit-select"
                        value={auditCompany}
                        onChange={(e) => setAuditCompany(e.target.value)}
                      >
                        <option value="all">All companies</option>
                        {auditCompanyOptions.map((companyId) => {
                          const known = providerReviews.find((review) => review.id === companyId);
                          return (
                            <option key={companyId} value={companyId}>
                              {known?.name || companyId}
                            </option>
                          );
                        })}
                      </select>

                      <input
                        className="adm-audit-select"
                        type="date"
                        value={auditDateFrom}
                        onChange={(e) => setAuditDateFrom(e.target.value)}
                        aria-label="Audit date from"
                      />

                      <input
                        className="adm-audit-select"
                        type="date"
                        value={auditDateTo}
                        onChange={(e) => setAuditDateTo(e.target.value)}
                        aria-label="Audit date to"
                      />
                    </div>

                    {auditError ? (
                      <div style={{ padding: 14 }}>
                        <div className="adm-review-error">{auditError}</div>
                      </div>
                    ) : auditLoading ? (
                      <div className="adm-audit-empty">
                        <div>
                          <div className="adm-audit-empty-icon"><Clock3 size={18} /></div>
                          <div className="adm-audit-empty-title">Loading audit history…</div>
                        </div>
                      </div>
                    ) : visibleAuditLogs.length === 0 ? (
                      <div className="adm-audit-empty">
                        <div>
                          <div className="adm-audit-empty-icon"><History size={19} /></div>
                          <div className="adm-audit-empty-title">No audit entries found</div>
                          <div className="adm-audit-empty-copy">
                            Adjust the filters or perform a provider workflow action to create new history.
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="adm-audit-list">
                        {visibleAuditLogs.map((log) => (
                          <motion.div
                            key={log.id}
                            className="adm-audit-row"
                            initial={{ opacity: 0, y: 3 }}
                            animate={{ opacity: 1, y: 0 }}
                          >
                            <div className="adm-audit-icon"><Activity size={14} /></div>

                            <div style={{ minWidth: 0 }}>
                              <div className="adm-audit-action">
                                {log.action.replaceAll(".", " · ").replaceAll("_", " ")}
                              </div>
                              <div className="adm-audit-resource">
                                {log.resourceType || "system"}
                                {log.resourceId ? ` · ${log.resourceId}` : ""}
                              </div>
                            </div>

                            <div>
                              <span className={`adm-audit-role ${log.actorRole}`}>
                                {log.actorRole || "unknown"}
                              </span>
                            </div>

                            <div className="adm-audit-company">
                              {providerReviews.find((review) => review.id === log.companyId)?.name ||
                                log.companyId ||
                                "—"}
                            </div>

                            <div style={{ minWidth: 0 }}>
                              {(log.fromState || log.toState) && (
                                <div className="adm-audit-state">
                                  {log.fromState && <span>{log.fromState.replaceAll("_", " ")}</span>}
                                  {log.fromState && log.toState && <ChevronRight size={10} />}
                                  {log.toState && <span>{log.toState.replaceAll("_", " ")}</span>}
                                </div>
                              )}
                              {log.note && (
                                <div className="adm-audit-note" title={log.note}>
                                  {log.note}
                                </div>
                              )}
                            </div>

                            <div className="adm-audit-time">
                              {log.createdAt
                                ? new Date(log.createdAt).toLocaleString("en-GB", {
                                    day: "2-digit",
                                    month: "short",
                                    year: "numeric",
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })
                                : "—"}
                            </div>
                          </motion.div>
                        ))}
                      </div>
                    )}

                    <div className="adm-audit-summary">
                      <span>{visibleAuditLogs.length} visible entr{visibleAuditLogs.length === 1 ? "y" : "ies"}</span>
                      <span>Read-only · newest first</span>
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

      {/* ══ PROVIDER REVIEW MODAL ══ */}
      <AnimatePresence>
        {providerReviewModalOpen && (
          <motion.div
            className="adm-review-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) closeProviderReview();
            }}
          >
            <motion.div
              className="adm-review-modal"
              initial={{ opacity: 0, y: 18, scale: .98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: .985 }}
              transition={{ duration: .24, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="adm-review-modal-head">
                <div>
                  <h2 className="adm-review-modal-title">
                    {selectedProviderReview?.company?.name || "Provider Profile Review"}
                  </h2>
                  <div className="adm-review-modal-meta">
                    {selectedProviderReview?.publisher?.fullName || "Publisher"}
                    {selectedProviderReview?.publisher?.email
                      ? ` · ${selectedProviderReview.publisher.email}`
                      : ""}
                  </div>
                </div>

                <button className="adm-review-close" onClick={closeProviderReview} disabled={providerDecisionLoading}>
                  <X size={15} />
                </button>
              </div>

              <div className="adm-review-modal-body">
                {providerReviewError && <div className="adm-review-error">{providerReviewError}</div>}

                {providerReviewLoading || !selectedProviderReview ? (
                  <div className="adm-review-empty" style={{ minHeight: 300 }}>
                    <div>
                      <div className="adm-review-empty-icon"><Clock3 size={19} /></div>
                      <div className="adm-review-empty-title">Loading submitted profile…</div>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="adm-review-section">
                      <h4>Company Profile</h4>
                      <div className="adm-review-info-grid">
                        <div className="adm-review-info">
                          <label>Status</label>
                          <div
                            className={`adm-review-status-pill ${String(selectedProviderReview.company.status || "draft").trim().toLowerCase()}`}
                          >
                            {String(selectedProviderReview.company.status || "draft").replaceAll("_", " ")}
                          </div>
                        </div>
                        <div className="adm-review-info">
                          <label>Moderation</label>
                          <div
                            className={`adm-review-status-pill ${String(selectedProviderReview.company.moderationState || "draft").trim().toLowerCase()}`}
                          >
                            {String(selectedProviderReview.company.moderationState || "draft").replaceAll("_", " ")}
                          </div>
                        </div>
                        <div className="adm-review-info">
                          <label>Slug</label>
                          <div>/{selectedProviderReview.company.slug || "—"}</div>
                        </div>
                        <div className="adm-review-info">
                          <label>Website</label>
                          <div>{selectedProviderReview.company.websiteUrl || "—"}</div>
                        </div>
                        <div className="adm-review-info">
                          <label>Email</label>
                          <div>{selectedProviderReview.company.email || "—"}</div>
                        </div>
                        <div className="adm-review-info">
                          <label>Phone</label>
                          <div>{selectedProviderReview.company.phone || "—"}</div>
                        </div>
                        <div className="adm-review-info" style={{ gridColumn: "1 / -1" }}>
                          <label>Short Description</label>
                          <div>{selectedProviderReview.company.shortDescription || "—"}</div>
                        </div>
                        <div className="adm-review-info" style={{ gridColumn: "1 / -1" }}>
                          <label>Address</label>
                          <div>{selectedProviderReview.company.address || "—"}</div>
                        </div>
                      </div>
                    </div>

                    <div className="adm-review-section">
                      <h4>About</h4>
                      <div className="adm-review-info-grid">
                        <div className="adm-review-info" style={{ gridColumn: "1 / -1" }}>
                          <label>Headline</label>
                          <div>{selectedProviderReview.about?.headline || "—"}</div>
                        </div>
                        <div className="adm-review-info" style={{ gridColumn: "1 / -1" }}>
                          <label>Overview</label>
                          <div>{selectedProviderReview.about?.overview || "—"}</div>
                        </div>
                        <div className="adm-review-info">
                          <label>Founded</label>
                          <div>{selectedProviderReview.about?.foundedYear || "—"}</div>
                        </div>
                        <div className="adm-review-info">
                          <label>Employees</label>
                          <div>{selectedProviderReview.about?.employeeRange || "—"}</div>
                        </div>
                        <div className="adm-review-info">
                          <label>Headquarters</label>
                          <div>{selectedProviderReview.about?.headquarters || "—"}</div>
                        </div>
                      </div>
                    </div>

                    <div className="adm-review-section">
                      <h4>Structured Content</h4>
                      <div className="adm-review-content-grid">
                        {[
                          ["Posts", selectedProviderReview.posts.length],
                          ["Whitepapers", selectedProviderReview.whitepapers.length],
                          ["Products", selectedProviderReview.products.length],
                          ["Contacts", selectedProviderReview.contacts.length],
                          ["Appointments", selectedProviderReview.appointments.length],
                          ["Webinars", selectedProviderReview.webinars.length],
                          ["Events", selectedProviderReview.events.length],
                          ["Approved Version", Number(selectedProviderReview.company.approvedVersion || 0)],
                        ].map(([label, value]) => (
                          <div className="adm-review-count" key={String(label)}>
                            <strong>{String(value)}</strong>
                            <span>{String(label)}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="adm-review-section">
                      <h4>Moderation Note</h4>
                      <textarea
                        className="adm-review-note"
                        value={providerDecisionNote}
                        onChange={(e) => setProviderDecisionNote(e.target.value)}
                        placeholder="Add approval notes, revision instructions or rejection reason…"
                        disabled={providerDecisionLoading}
                      />

                    </div>
                  </>
                )}
              </div>

              {!providerReviewLoading && selectedProviderReview && (
                <div className="adm-review-sticky-footer">
                  <div className="adm-review-actions">
                    {selectedProviderReview.company.moderationState === "pending_review" && (
                      <>
                        <button
                          className="adm-moderation-btn approve"
                          onClick={() => requestProviderConfirmation("approve")}
                          disabled={providerDecisionLoading}
                        >
                          <CircleCheck size={12} />
                          Approve & Publish
                        </button>

                        <button
                          className="adm-moderation-btn revision"
                          onClick={() => requestProviderConfirmation("request_revision")}
                          disabled={providerDecisionLoading}
                        >
                          <RotateCcw size={12} />
                          Request Revision
                        </button>

                        <button
                          className="adm-moderation-btn reject"
                          onClick={() => requestProviderConfirmation("reject")}
                          disabled={providerDecisionLoading}
                        >
                          <Ban size={12} />
                          Reject
                        </button>
                      </>
                    )}

                    {selectedProviderReview.company.status === "published" && (
                      <button
                        className="adm-moderation-btn unpublish"
                        onClick={() => requestProviderConfirmation("unpublish")}
                        disabled={providerDecisionLoading}
                      >
                        <EyeOff size={12} />
                        Unpublish
                      </button>
                    )}

                    {selectedProviderReview.company.status === "unpublished" &&
                      Number(selectedProviderReview.company.approvedVersion || 0) > 0 && (
                        <button
                          className="adm-moderation-btn approve"
                          onClick={() => requestProviderConfirmation("republish")}
                          disabled={providerDecisionLoading}
                        >
                          <CircleCheck size={12} />
                          Republish
                        </button>
                      )}

                    <button
                      className="adm-moderation-btn delete"
                      onClick={() => requestProviderConfirmation("delete")}
                      disabled={providerDecisionLoading}
                    >
                      <Trash2 size={12} />
                      Delete Profile
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ══ PROVIDER ACTION CONSENT MODAL ══ */}
      <AnimatePresence>
        {providerConfirmAction && providerConfirmCopy && (
          <motion.div
            className="adm-confirm-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onMouseDown={(e) => {
              if (e.target === e.currentTarget && !providerDecisionLoading) {
                setProviderConfirmAction(null);
              }
            }}
          >
            <motion.div
              className="adm-confirm-modal"
              initial={{ opacity: 0, y: 14, scale: .985 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: .99 }}
              transition={{ duration: .2, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className={`adm-confirm-icon ${providerConfirmCopy.tone}`}>
                <providerConfirmCopy.Icon size={19} />
              </div>

              <h3 className="adm-confirm-title">{providerConfirmCopy.title}</h3>
              <p className="adm-confirm-text">{providerConfirmCopy.text}</p>

              <div className="adm-confirm-actions">
                <button
                  className="adm-confirm-cancel"
                  onClick={() => setProviderConfirmAction(null)}
                  disabled={providerDecisionLoading}
                >
                  Cancel
                </button>

                <button
                  className={`adm-confirm-submit ${providerConfirmCopy.tone}`}
                  onClick={confirmProviderAction}
                  disabled={providerDecisionLoading}
                >
                  {providerDecisionLoading ? (
                    <>
                      <span className="adm-pub-spinner" />
                      Processing…
                    </>
                  ) : (
                    <>
                      <providerConfirmCopy.Icon size={13} />
                      {providerConfirmCopy.confirm}
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ══ CREATE PUBLISHER MODAL ══ */}
      <AnimatePresence>
        {publisherModalOpen && (
          <motion.div
            className="adm-pub-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) closePublisherModal();
            }}
          >
            <motion.div
              className="adm-pub-modal"
              initial={{ opacity: 0, y: 18, scale: 0.975 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.985 }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="adm-pub-head">
                <div>
                  <div className="adm-pub-icon"><UserPlus size={18} /></div>
                  <h2 className="adm-pub-title">Create Publisher</h2>
                  <p className="adm-pub-sub">
                    Create a secure publisher account. The publisher will choose and create their own company profile later.
                  </p>
                </div>
                <button
                  className="adm-pub-close"
                  onClick={closePublisherModal}
                  disabled={publisherCreating}
                  aria-label="Close create publisher dialog"
                >
                  <X size={15} />
                </button>
              </div>

              <div className="adm-pub-body">
                {publisherError && (
                  <motion.div className="adm-pub-error" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}>
                    {publisherError}
                  </motion.div>
                )}

                <div className="adm-pub-field">
                  <label className="adm-pub-label">Full Name</label>
                  <input
                    className="adm-pub-input"
                    value={publisherName}
                    onChange={(e) => setPublisherName(e.target.value)}
                    placeholder="Publisher's full name"
                    autoComplete="off"
                    disabled={publisherCreating}
                  />
                </div>

                <div className="adm-pub-field">
                  <label className="adm-pub-label">Email Address</label>
                  <input
                    className="adm-pub-input"
                    type="email"
                    value={publisherEmail}
                    onChange={(e) => setPublisherEmail(e.target.value)}
                    placeholder="publisher@company.com"
                    autoComplete="off"
                    disabled={publisherCreating}
                  />
                </div>

                <div className="adm-pub-field">
                  <label className="adm-pub-label">Temporary Password</label>
                  <div className="adm-pub-input-wrap">
                    <input
                      className="adm-pub-input password"
                      type={showPublisherPassword ? "text" : "password"}
                      value={publisherPassword}
                      onChange={(e) => setPublisherPassword(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !publisherCreating) handleCreatePublisher();
                      }}
                      placeholder="Minimum 6 characters"
                      autoComplete="new-password"
                      disabled={publisherCreating}
                    />
                    <button
                      type="button"
                      className="adm-pub-eye"
                      onClick={() => setShowPublisherPassword(v => !v)}
                      disabled={publisherCreating}
                      aria-label={showPublisherPassword ? "Hide password" : "Show password"}
                    >
                      {showPublisherPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </div>

                <div className="adm-pub-role-note">
                  <LockKeyhole size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                  <span>
                    Role will be set to <strong>Publisher</strong>. No company will be assigned to this account.
                  </span>
                </div>

                <div className="adm-pub-actions">
                  <button className="adm-pub-secondary" onClick={closePublisherModal} disabled={publisherCreating}>
                    Cancel
                  </button>
                  <button className="adm-pub-primary" onClick={handleCreatePublisher} disabled={publisherCreating}>
                    {publisherCreating ? (
                      <>
                        <span className="adm-pub-spinner" />
                        Creating…
                      </>
                    ) : (
                      <>
                        <UserPlus size={14} />
                        Create Publisher
                      </>
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ══ PUBLISHER ACCOUNT ACTION MODAL ══ */}
      <AnimatePresence>
        {publisherAction && publisherTarget && (
          <motion.div
            className="adm-pub-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) closePublisherAction();
            }}
          >
            <motion.div
              className="adm-pub-modal"
              initial={{ opacity: 0, y: 16, scale: .98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 9, scale: .985 }}
              transition={{ duration: .24, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="adm-pub-head">
                <div>
                  <div className={`adm-account-modal-icon ${publisherAction === "delete" ? "danger" : publisherAction === "revoke" ? "warn" : publisherAction === "restore" ? "restore" : ""}`}>
                    {publisherAction === "password"
                      ? <KeyRound size={19} />
                      : publisherAction === "revoke"
                        ? <ShieldOff size={19} />
                        : publisherAction === "restore"
                          ? <RotateCcw size={19} />
                          : <Trash2 size={19} />}
                  </div>

                  <h2 className="adm-pub-title">
                    {publisherAction === "password"
                      ? "Change Password"
                      : publisherAction === "revoke"
                        ? "Revoke Publisher Access"
                        : publisherAction === "restore"
                          ? "Restore Publisher Access"
                          : "Delete Publisher"}
                  </h2>

                  <p className="adm-pub-sub">
                    {publisherAction === "password"
                      ? "Set a new password for this publisher. Existing sessions will be invalidated immediately."
                      : publisherAction === "revoke"
                        ? "This publisher will be blocked from signing in and all current sessions will be revoked."
                        : publisherAction === "restore"
                          ? "This publisher will be re-enabled and allowed to sign in again with their existing credentials."
                          : "This permanently removes the publisher login account. Existing provider/company content will be preserved."}
                  </p>
                </div>

                <button
                  className="adm-pub-close"
                  onClick={closePublisherAction}
                  disabled={publisherActionLoading}
                  aria-label="Close publisher action dialog"
                >
                  <X size={15} />
                </button>
              </div>

              <div className="adm-pub-body">
                <div className="adm-account-summary">
                  <strong>{publisherTarget.fullName || "Publisher"}</strong>
                  <br />
                  {publisherTarget.email || "No email available"}
                </div>

                {publisherActionError && (
                  <motion.div
                    className="adm-pub-error"
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                  >
                    {publisherActionError}
                  </motion.div>
                )}

                {publisherAction === "password" && (
                  <>
                    <div className="adm-pub-field">
                      <label className="adm-pub-label">New Password</label>
                      <div className="adm-pub-input-wrap">
                        <input
                          className="adm-pub-input password"
                          type={showNewPublisherPassword ? "text" : "password"}
                          value={newPublisherPassword}
                          onChange={(e) => setNewPublisherPassword(e.target.value)}
                          placeholder="Minimum 8 characters"
                          autoComplete="new-password"
                          disabled={publisherActionLoading}
                        />
                        <button
                          type="button"
                          className="adm-pub-eye"
                          onClick={() => setShowNewPublisherPassword(v => !v)}
                          disabled={publisherActionLoading}
                        >
                          {showNewPublisherPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                        </button>
                      </div>
                    </div>

                    <div className="adm-pub-field">
                      <label className="adm-pub-label">Confirm Password</label>
                      <input
                        className="adm-pub-input"
                        type={showNewPublisherPassword ? "text" : "password"}
                        value={confirmPublisherPassword}
                        onChange={(e) => setConfirmPublisherPassword(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !publisherActionLoading) executePublisherAction();
                        }}
                        placeholder="Repeat the new password"
                        autoComplete="new-password"
                        disabled={publisherActionLoading}
                      />
                    </div>
                  </>
                )}

                {publisherAction === "revoke" && (
                  <div className="adm-pub-role-note" style={{ background: "#fffbeb", borderColor: "#fde68a", color: "#92400e" }}>
                    <ShieldOff size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                    <span>
                      Confirm that you want to revoke this publisher's access. Their company and provider content will remain intact.
                    </span>
                  </div>
                )}

                {publisherAction === "restore" && (
                  <div className="adm-pub-role-note" style={{ background: "#f0fdf4", borderColor: "#bbf7d0", color: "#166534" }}>
                    <RotateCcw size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                    <span>
                      Restoring access will re-enable this publisher account. Their existing company and provider content will remain unchanged.
                    </span>
                  </div>
                )}

                {publisherAction === "delete" && (
                  <div className="adm-pub-role-note" style={{ background: "#fef2f2", borderColor: "#fee2e2", color: "#991b1b" }}>
                    <Trash2 size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                    <span>
                      This action cannot be undone. The Firebase Authentication account and user record will be deleted, but provider content will not be deleted.
                    </span>
                  </div>
                )}

                <div className="adm-pub-actions">
                  <button
                    className="adm-pub-secondary"
                    onClick={closePublisherAction}
                    disabled={publisherActionLoading}
                  >
                    Cancel
                  </button>

                  <button
                    className="adm-pub-primary"
                    onClick={executePublisherAction}
                    disabled={publisherActionLoading}
                    style={publisherAction === "delete"
                      ? { background: "#dc2626", borderColor: "#dc2626" }
                      : publisherAction === "revoke"
                        ? { background: "#92400e", borderColor: "#92400e" }
                        : publisherAction === "restore"
                          ? { background: "#166534", borderColor: "#166534" }
                          : undefined}
                  >
                    {publisherActionLoading ? (
                      <>
                        <span className="adm-pub-spinner" />
                        Processing…
                      </>
                    ) : publisherAction === "password" ? (
                      <>
                        <KeyRound size={14} />
                        Change Password
                      </>
                    ) : publisherAction === "revoke" ? (
                      <>
                        <ShieldOff size={14} />
                        Revoke Access
                      </>
                    ) : publisherAction === "restore" ? (
                      <>
                        <RotateCcw size={14} />
                        Restore Access
                      </>
                    ) : (
                      <>
                        <Trash2 size={14} />
                        Delete User
                      </>
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ══ ACTION TOAST ══ */}
      <AnimatePresence>
        {adminToast && (
          <div className="adm-toast-wrap">
            <motion.div
              className={`adm-toast ${adminToast.type === "error" ? "error" : ""}`}
              initial={{ opacity: 0, x: 22, y: -4 }}
              animate={{ opacity: 1, x: 0, y: 0 }}
              exit={{ opacity: 0, x: 18 }}
            >
              {adminToast.type === "success"
                ? <CircleCheck size={16} style={{ flexShrink: 0, marginTop: 1 }} />
                : <X size={16} style={{ flexShrink: 0, marginTop: 1 }} />}
              <span>{adminToast.text}</span>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

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