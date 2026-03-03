"use client";

import { useEffect, useState } from "react";
import { getAuth, onAuthStateChanged, signOut } from "firebase/auth";
import { adminApp } from "@/services/firebase";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

import {
  LayoutDashboard,
  Bug,
  FileText,
  Settings,
  LogOut,
  Users,
  MessageSquare,
  TrendingUp,
  TrendingDown,
  Search,
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

export default function AdminDashboard() {
  const auth = getAuth(adminApp);

  // ============================
  // STATE (ALL HOOKS AT TOP)
  // ============================

const [data, setData] = useState<DashboardData | null>(null);
const [loading, setLoading] = useState(true);
const [unauthorized, setUnauthorized] = useState(false);

type AdminMenu =
  | "dashboard"
  | "users"
  | "bugs"
  | "content"
  | "settings";

const [activeMenu, setActiveMenu] =
  useState<AdminMenu>("dashboard");

/* ✅ ADD THESE TWO STATES RIGHT HERE */
const [searchTerm, setSearchTerm] = useState("");
const [visibleCount, setVisibleCount] = useState(10);
const [roleFilter, setRoleFilter] = useState("All");
const [showLogoutModal, setShowLogoutModal] = useState(false);
const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

const handleLogout = async () => {
  try {
    await signOut(auth);
    window.location.href = "/admin/login";
  } catch (error) {
    console.error("Logout failed:", error);
  }
};

  // =========================================
  // FETCH DASHBOARD
  // =========================================
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setUnauthorized(true);
        setLoading(false);
        return;
      }

      try {
        const token = await user.getIdToken();

        const res = await fetch(
          "https://ai-productivity-coach-mlnn.onrender.com/api/admin/dashboard",
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        if (!res.ok) {
          setUnauthorized(true);
          setLoading(false);
          return;
        }

        const json = await res.json();
        setData(json);
      } catch (error) {
        console.error("Dashboard fetch error:", error);
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  // =========================================
  // LOADING
  // =========================================
  if (loading)
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-gray-500 text-lg">Loading dashboard...</p>
      </div>
    );

  // =========================================
  // UNAUTHORIZED
  // =========================================
  if (unauthorized) {
    if (typeof window !== "undefined") {
      window.location.href = "/admin/login";
    }
    return null;
  }

if (!data) return null;

// ============================
// USERS FILTERING
// ============================
const filteredUsers = data.users
  .filter((user: any) =>
    user.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.email.toLowerCase().includes(searchTerm.toLowerCase())
  )
  .filter((user: any) =>
    roleFilter === "All" ? true : user.role === roleFilter
  );

  // =========================================
  // FORMAT MAIN GRAPH
  // =========================================
  const graphEntries = Object.entries(data.graph);

  const graphData = graphEntries.map(([date, value]) => ({
    date: new Date(date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    }),
    responses: value,
  }));

  // =========================================
  // USER GROWTH CALCULATION (7d vs previous 7d)
  // =========================================
  const values = graphEntries.map(([_, value]) => value);

  const last7 = values.slice(-7);
  const previous7 = values.slice(-14, -7);

  const lastTotal = last7.reduce((a, b) => a + b, 0);
  const previousTotal = previous7.reduce((a, b) => a + b, 0);

  let growthPercent = 0;
  let isGrowthUp = true;

  if (previousTotal > 0) {
    growthPercent =
      ((lastTotal - previousTotal) / previousTotal) * 100;
    isGrowthUp = growthPercent >= 0;
  }

  // ============================
  // USER ACQUISITION CALCULATION
  // ============================
  const totalAcquisition =
    data.newUsers +
    data.returningUsers +
    data.inactiveOldUsers;

  const newPercent = totalAcquisition
    ? (data.newUsers / totalAcquisition) * 100
    : 0;

  const returningPercent = totalAcquisition
    ? (data.returningUsers / totalAcquisition) * 100
    : 0;

  const inactivePercent = totalAcquisition
    ? (data.inactiveOldUsers / totalAcquisition) * 100
    : 0;

  const acquisitionData = [
    { name: "New Users", value: data.newUsers, color: "#93c5fd" },
    { name: "Returning Users", value: data.returningUsers, color: "#86efac" },
    { name: "Inactive Old Users", value: data.inactiveOldUsers, color: "#000000" },
  ];

  // ============================
  // ACTIVITY CLASSIFICATION
  // ============================
  const totalActivity =
    data.highlyActiveUsers +
    data.moderateUsers +
    data.inactiveUsers;

  const highPercent = totalActivity
    ? (data.highlyActiveUsers / totalActivity) * 100
    : 0;

  const moderatePercent = totalActivity
    ? (data.moderateUsers / totalActivity) * 100
    : 0;

  const inactiveActivityPercent = totalActivity
    ? (data.inactiveUsers / totalActivity) * 100
    : 0;

  const activityData = [
    { name: "Highly Active", value: data.highlyActiveUsers, color: "#22c55e" },
    { name: "Moderate", value: data.moderateUsers, color: "#1e3a8a" },
    { name: "Inactive", value: data.inactiveUsers, color: "#374151" },
  ];

  // =========================================
  // UI
  // =========================================
  return (
    <div className="flex h-screen bg-gray-100">

      {/* SIDEBAR */}
<>
  {/* MOBILE BACKDROP */}
  <AnimatePresence>
    {mobileSidebarOpen && (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.3 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-0 bg-black z-40 md:hidden"
        onClick={() => setMobileSidebarOpen(false)}
      />
    )}
  </AnimatePresence>

  {/* SIDEBAR */}
  <aside
    className={`
      bg-white
      shadow-[4px_0_15px_-10px_rgba(0,0,0,0.15)]
      flex flex-col
      h-screen
      w-64 md:w-56

      fixed md:static
      top-0 left-0
      z-50 md:z-auto

      transform transition-transform duration-300 ease-out
      ${mobileSidebarOpen ? "translate-x-0" : "-translate-x-full"}
      md:translate-x-0
    `}
  >
    {/* TOP PROFILE SECTION */}
    <div className="px-4 pt-4">
      <div className="flex items-center justify-between cursor-pointer hover:bg-gray-100 rounded-xl p-2 transition-all duration-200">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full border border-gray-200 flex items-center justify-center text-sm font-semibold text-gray-700 bg-white">
            M
          </div>

          <div className="flex flex-col">
            <span className="text-sm font-semibold text-gray-900">
              Matthias Scheffer
            </span>
            <span className="text-xs text-gray-500">
              Admin
            </span>
          </div>
        </div>
      </div>
    </div>

    {/* CENTERED MENU */}
    <div className="flex-1 flex items-center">
      <nav className="w-full px-4 space-y-3 text-sm">

        <button
          onClick={() => {
            setActiveMenu("dashboard");
            setMobileSidebarOpen(false);
          }}
          className={`flex items-center gap-3 w-full px-3 py-2 rounded-xl transition-all duration-200 ${
            activeMenu === "dashboard"
              ? "bg-gray-100 text-gray-900 font-medium"
              : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
          }`}
        >
          <LayoutDashboard size={18} />
          Dashboard
        </button>

        <button
          onClick={() => {
            setActiveMenu("users");
            setMobileSidebarOpen(false);
          }}
          className={`flex items-center gap-3 w-full px-3 py-2 rounded-xl transition-all duration-200 ${
            activeMenu === "users"
              ? "bg-gray-100 text-gray-900 font-medium"
              : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
          }`}
        >
          <Users size={18} />
          Users
        </button>

        <button
          onClick={() => {
            setActiveMenu("bugs");
            setMobileSidebarOpen(false);
          }}
          className={`flex items-center gap-3 w-full px-3 py-2 rounded-xl transition-all duration-200 ${
            activeMenu === "bugs"
              ? "bg-gray-100 text-gray-900 font-medium"
              : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
          }`}
        >
          <Bug size={18} />
          Bug Reports
        </button>

        <button
          onClick={() => {
            setActiveMenu("content");
            setMobileSidebarOpen(false);
          }}
          className={`flex items-center gap-3 w-full px-3 py-2 rounded-xl transition-all duration-200 ${
            activeMenu === "content"
              ? "bg-gray-100 text-gray-900 font-medium"
              : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
          }`}
        >
          <FileText size={18} />
          Content
        </button>

        <button
          onClick={() => {
            setActiveMenu("settings");
            setMobileSidebarOpen(false);
          }}
          className={`flex items-center gap-3 w-full px-3 py-2 rounded-xl transition-all duration-200 ${
            activeMenu === "settings"
              ? "bg-gray-100 text-gray-900 font-medium"
              : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
          }`}
        >
          <Settings size={18} />
          Settings
        </button>

      </nav>
    </div>

    {/* LOGOUT */}
    <div className="px-4 pb-5 border-t border-gray-100 pt-4">
      <button
        onClick={() => {
          setShowLogoutModal(true);
          setMobileSidebarOpen(false);
        }}
        className="flex items-center gap-2 text-red-600 hover:bg-red-50 px-4 py-2 rounded-lg transition-all duration-200"
      >
        <LogOut size={16} />
        Logout
      </button>
    </div>
  </aside>
</>

      {/* MAIN CONTENT */}
<main className="flex-1 p-8 overflow-y-auto">

    {/* MOBILE HEADER */}
<div className="md:hidden flex items-center mb-6">
  <button
    onClick={() => setMobileSidebarOpen(true)}
    className="p-2 rounded-lg hover:bg-gray-100 transition"
  >
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="h-6 w-6 text-gray-800"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  </button>
</div>

  <AnimatePresence mode="wait">
    <motion.div
      key={activeMenu}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.25, ease: "easeInOut" }}
    >

      {/* ================= DASHBOARD SCREEN ================= */}
{activeMenu === "dashboard" && (
  <>
    <h2 className="text-2xl font-bold mb-8">
      Admin Dashboard
    </h2>

    {/* ================= KPI CARDS ================= */}
    <div className="grid grid-cols-1 md:grid-cols-4 gap-5 mb-10">

      {/* TOTAL USERS */}
      <div className="bg-white p-6 rounded-2xl shadow-lg border border-gray-100 hover:shadow-xl transition-all duration-300">
        <div className="flex items-center gap-2 text-gray-500 text-sm mb-2">
          <Users size={16} />
          <span>Total Users</span>
        </div>
        <h3 className="text-2xl font-semibold text-gray-900">
          {data.totalUsers}
        </h3>
      </div>

      {/* TOTAL RESPONSES */}
      <div className="bg-white p-6 rounded-2xl shadow-lg border border-gray-100 hover:shadow-xl transition-all duration-300">
        <div className="flex items-center gap-2 text-gray-500 text-sm mb-2">
          <MessageSquare size={16} />
          <span>Total Responses</span>
        </div>
        <h3 className="text-2xl font-semibold text-gray-900">
          {data.totalResponses}
        </h3>
      </div>

      {/* BUG REPORTS */}
      <div className="bg-white p-6 rounded-2xl shadow-lg border border-gray-100 hover:shadow-xl transition-all duration-300">
        <div className="flex items-center gap-2 text-gray-500 text-sm mb-3">
          <Bug size={16} />
          <span>Bug Reports</span>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-500">Opened</p>
            <p className="text-lg font-semibold text-red-600">
              {data.openBugs ?? 0}
            </p>
          </div>

          <div>
            <p className="text-xs text-gray-500">Resolved</p>
            <p className="text-lg font-semibold text-green-600">
              {data.resolvedBugs ?? 0}
            </p>
          </div>
        </div>
      </div>

      {/* USER GROWTH */}
      <div className="bg-white p-6 rounded-2xl shadow-lg border border-gray-100 hover:shadow-xl transition-all duration-300">
        <div className="flex items-center gap-2 text-gray-500 text-sm mb-2">
          <Users size={16} />
          <span>User Growth (7d)</span>
        </div>

        <div className="flex items-center gap-2 mb-2">
          <h3 className="text-xl font-semibold text-gray-900">
            {Math.abs(growthPercent).toFixed(1)}%
          </h3>

          {isGrowthUp ? (
            <TrendingUp size={16} className="text-green-600" />
          ) : (
            <TrendingDown size={16} className="text-red-600" />
          )}
        </div>

        <ResponsiveContainer width="100%" height={45}>
          <LineChart
            data={last7.map((value, index) => ({
              name: index,
              value,
            }))}
          >
            <Line
              type="monotone"
              dataKey="value"
              stroke={isGrowthUp ? "#16a34a" : "#dc2626"}
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

    </div>

    {/* ================= ANALYTICS SECTION ================= */}
    <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-10">

      {/* LEFT: ACTIVITY DONUT */}
      <div className="bg-white p-6 rounded-2xl shadow-lg border border-gray-100 hover:shadow-xl transition-all duration-300">
        <h3 className="font-semibold mb-6">
          User Activity (7 Days)
        </h3>

        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie
              data={activityData}
              dataKey="value"
              innerRadius={60}
              outerRadius={90}
              paddingAngle={4}
            >
              {activityData.map((entry, index) => (
                <Cell key={`cell-activity-${index}`} fill={entry.color} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>

        <div className="mt-6 space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-[#22c55e]" />
              Highly Active
            </div>
            <span>{highPercent.toFixed(1)}%</span>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-[#1e3a8a]" />
              Moderate
            </div>
            <span>{moderatePercent.toFixed(1)}%</span>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-[#374151]" />
              Inactive
            </div>
            <span>{inactiveActivityPercent.toFixed(1)}%</span>
          </div>
        </div>
      </div>

      {/* CENTER: RESPONSES GRAPH */}
      <div className="col-span-1 md:col-span-2 bg-white p-6 rounded-2xl shadow-lg border border-gray-100 hover:shadow-xl transition-all duration-300">
        <h3 className="font-semibold mb-6">
          Responses Generated (7 Days)
        </h3>

        <ResponsiveContainer width="100%" height={300}>
          <LineChart
            data={graphData}
            margin={{ top: 10, right: 20, left: 10, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" />
            <YAxis width={40} />
            <Tooltip />
            <Line
              type="monotone"
              dataKey="responses"
              stroke="#000"
              strokeWidth={2}
              dot={{ r: 4 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* RIGHT: USER ACQUISITION DONUT */}
      <div className="bg-white p-6 rounded-2xl shadow-lg border border-gray-100 hover:shadow-xl transition-all duration-300">
        <h3 className="font-semibold mb-6">
          User Acquisition (30 Days)
        </h3>

        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie
              data={acquisitionData}
              dataKey="value"
              innerRadius={60}
              outerRadius={90}
              paddingAngle={4}
            >
              {acquisitionData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>

        <div className="mt-6 space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-[#93c5fd]" />
              New Users
            </div>
            <span>{newPercent.toFixed(1)}%</span>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-[#86efac]" />
              Returning Users
            </div>
            <span>{returningPercent.toFixed(1)}%</span>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-black" />
              Inactive Old Users
            </div>
            <span>{inactivePercent.toFixed(1)}%</span>
          </div>
        </div>
      </div>

    </div>
  </>
)}

      {/* ================= USERS SCREEN ================= */}
{activeMenu === "users" && (
  <>
    <h2 className="text-2xl font-bold mb-8">
      Users
    </h2>

    <div className="bg-white rounded-2xl shadow-md border border-gray-100 overflow-hidden">

      {/* ===== TABLE HEADER ROW (TITLE + SEARCH + FILTER) ===== */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">

        {/* LEFT: TITLE */}
        <h3 className="font-semibold text-gray-800">
          Users Table
        </h3>

        {/* CENTER: SEARCH */}
        <div className="relative w-1/3">
<span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
  <Search size={16} />
</span>
          <input
            type="text"
            placeholder="Search users..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setVisibleCount(10);
            }}
            className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-black transition"
          />
        </div>

        {/* RIGHT: FILTER */}
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <span>Filter:</span>
          <select
            value={roleFilter}
            onChange={(e) => {
              setRoleFilter(e.target.value);
              setVisibleCount(10);
            }}
            className="border border-gray-200 rounded-lg px-3 py-1 focus:outline-none focus:ring-2 focus:ring-black transition"
          >
            <option value="All">All</option>
            <option value="User">Users</option>
            <option value="Admin">Admin</option>
          </select>
        </div>
      </div>

      {/* ===== TABLE CONTENT ===== */}
      <div className="h-[420px] overflow-y-auto">

        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 border-b border-gray-200 sticky top-0">
            <tr className="text-gray-600">
              <th className="py-4 px-6">Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Joined</th>
            </tr>
          </thead>

          <tbody>
            {filteredUsers.slice(0, visibleCount).map((user: any) => (
              <tr
                key={user.id}
                className="border-b border-gray-100 hover:bg-gray-50 transition"
              >
                <td className="py-4 px-6 flex items-center gap-3 font-medium text-gray-900">
                  <Users size={18} className="text-gray-400" />
                  {user.fullName}
                </td>

                <td className="text-gray-700">
                  {user.email}
                </td>

                <td className="capitalize text-gray-700">
                  {user.role}
                </td>

                <td className="text-gray-500">
                  {new Date(user.createdAt).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ===== LOAD MORE BUTTON ===== */}
      {visibleCount < filteredUsers.length && (
        <div className="py-4 border-t border-gray-200 flex justify-center bg-white">
          <button
            onClick={() => setVisibleCount((prev) => prev + 10)}
            className="px-6 py-2 rounded-lg bg-black text-white text-sm hover:opacity-90 transition"
          >
            Load More Users
          </button>
        </div>
      )}

    </div>
  </>
)}

    </motion.div>
  </AnimatePresence>

  <AnimatePresence>
  {showLogoutModal && (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="bg-white rounded-2xl shadow-xl w-[400px] p-6 text-center"
      >
        <h3 className="text-lg font-semibold text-gray-900 mb-2">
          Are you sure you want to logout?
        </h3>

        <p className="text-sm text-gray-500 mb-6">
          You will be signed out of your account.
        </p>

        <div className="flex justify-center gap-4">
          <button
            onClick={() => setShowLogoutModal(false)}
            className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-100 transition"
          >
            Cancel
          </button>

          <button
            onClick={handleLogout}
            className="px-4 py-2 rounded-lg bg-black text-white hover:opacity-90 transition"
          >
            Yes, Logout
          </button>
        </div>
      </motion.div>
    </motion.div>
  )}
</AnimatePresence>

</main>
    </div>
  );
}