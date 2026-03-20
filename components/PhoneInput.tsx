"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { countries } from "@/utils/countries";
import {
  parsePhoneNumberFromString,
  AsYouType,
} from "libphonenumber-js";

export default function PhoneInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (val: string) => void;
}) {
  const getDefault = () =>
    countries.find((c) => c.code === "DE") ?? countries[0];

  const [selected, setSelected] = useState(getDefault);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");

  const dropdownRef = useRef<HTMLDivElement>(null);

  // 🔍 SEARCH FILTER
  const filtered = useMemo(() => {
    return countries.filter((c) =>
      `${c.name} ${c.code} ${c.dial}`
        .toLowerCase()
        .includes(search.toLowerCase())
    );
  }, [search]);

  // ✅ Derive display value — strip dial code so it never shows in input
  const displayValue = value.startsWith(selected.dial)
    ? value.slice(selected.dial.length).trim()
    : value;

  // 📞 HANDLE INPUT
  const handleChange = (input: string) => {
    // Only keep digits, max 15
    const digits = input.replace(/\D/g, "").slice(0, 15);

    // Build full E.164 for validation
    const full = selected.dial + digits;
    const phone = parsePhoneNumberFromString(full);

    if (phone && phone.isValid()) {
      // ✅ Valid: pass full E.164 to parent, clear error
      setError("");
      onChange(phone.number);
    } else {
      // ✅ Still typing: only show error after 10+ digits (clearly wrong)
      setError(digits.length >= 10 ? "Invalid phone number" : "");
      // Pass full E.164 so parent always has dial code + digits
      onChange(full);
    }
  };

  // ❌ CLOSE ON OUTSIDE CLICK
  useEffect(() => {
    const handleClickOutside = (e: any) => {
      if (!dropdownRef.current?.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative mt-1" ref={dropdownRef}>
      <div
        className={`flex items-center rounded-2xl px-3 py-3 bg-white shadow-sm transition ${
          error
            ? "ring-2 ring-red-300"
            : "focus-within:ring-2 focus-within:ring-cyan-300"
        }`}
      >
        {/* COUNTRY SELECT */}
        <div
          onClick={() => setOpen((prev) => !prev)}
          className="flex items-center gap-2 cursor-pointer pr-3 border-r"
        >
          <span className="text-lg">{selected.flag}</span>
          <span className="text-sm font-medium">{selected.code}</span>
          <span className="text-xs">⌄</span>
        </div>

        {/* DIAL CODE (display only) */}
        <span className="ml-3 text-sm text-gray-500">{selected.dial}</span>

        {/* INPUT — shows only local digits, never the dial code */}
        <input
          type="tel"
          value={displayValue}
          onChange={(e) => handleChange(e.target.value)}
          placeholder="Phone number"
          className="ml-3 flex-1 outline-none bg-transparent text-sm"
        />
      </div>

      {/* ERROR */}
      {error && <p className="text-red-500 text-xs mt-1">{error}</p>}

      {/* DROPDOWN */}
      {open && (
        <div className="absolute left-0 top-full mt-2 w-[70%] bg-white rounded-2xl shadow-2xl overflow-hidden animate-dropdown z-50">
          {/* SEARCH */}
          <div className="flex items-center px-3 py-3 border-b">
            <span className="text-gray-400 mr-2">🔍</span>
            <input
              placeholder="Search for countries"
              className="w-full outline-none text-sm"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {/* LIST */}
          <div className="max-h-72 overflow-y-auto">
            {filtered.map((c) => (
              <div
                key={c.code}
                onClick={() => {
                  setSelected(c);
                  setOpen(false);
                  setError("");
                  onChange(""); // reset on country change
                }}
                className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 cursor-pointer transition"
              >
                <div className="flex items-center gap-3">
                  <span className="text-lg">{c.flag}</span>
                  <span className="text-sm">{c.name}</span>
                </div>
                <span className="text-xs bg-gray-100 px-2 py-1 rounded-full text-gray-600">
                  {c.dial}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}