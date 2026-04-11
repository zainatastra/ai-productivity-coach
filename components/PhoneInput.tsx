"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { countries } from "@/utils/countries";
import { Search, ChevronDown } from "lucide-react";
import {
  parsePhoneNumberFromString,
  getExampleNumber,
} from "libphonenumber-js";
import examples from "libphonenumber-js/mobile/examples";

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
  const [focused, setFocused] = useState(false);
  const [localDigits, setLocalDigits] = useState("");

  const dropdownRef = useRef<HTMLDivElement>(null);

  // 🔍 FILTER
  const filtered = useMemo(() => {
    return countries.filter((c) =>
      `${c.name} ${c.code} ${c.dial}`
        .toLowerCase()
        .includes(search.toLowerCase())
    );
  }, [search]);

  // 🔥 PLACEHOLDER (000 FORMAT)
  const placeholder = useMemo(() => {
    try {
      const example = getExampleNumber(selected.code as any, examples);
      if (!example) return "Phone number";

      return example.formatNational().replace(/\d/g, "0");
    } catch {
      return "Phone number";
    }
  }, [selected]);

  // 🔥 MAX LENGTH PER COUNTRY
  const maxLength = useMemo(() => {
    try {
      const example = getExampleNumber(selected.code as any, examples);
      if (!example) return 15;

      return example.nationalNumber.length;
    } catch {
      return 15;
    }
  }, [selected]);

  // 🔥 FORMAT DISPLAY
  const displayValue = useMemo(() => {
    if (!localDigits) return "";

    const phone = parsePhoneNumberFromString(
      localDigits,
      selected.code as any
    );

    if (!phone) return localDigits;

    return phone.formatNational();
  }, [localDigits, selected]);

  const isActive = focused || displayValue;

  // 📞 HANDLE INPUT
  const handleChange = (input: string) => {
    let digits = input.replace(/\D/g, "");

    if (digits.startsWith("0")) {
      digits = digits.slice(0, maxLength + 1);
    } else {
      digits = digits.slice(0, maxLength);
    }

    setLocalDigits(digits);

    const phone = parsePhoneNumberFromString(
      digits,
      selected.code as any
    );

    if (phone && phone.isValid()) {
      onChange(phone.number);
      setError("");
    } else {
      onChange(selected.dial + digits);
      setError(digits.length >= maxLength ? "Invalid phone number" : "");
    }
  };

  // ❌ CLOSE DROPDOWN
  useEffect(() => {
    const handleClickOutside = (e: any) => {
      if (!dropdownRef.current?.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () =>
      document.removeEventListener("mousedown", handleClickOutside);
  }, []);

return (
  <div className="relative mb-4" ref={dropdownRef}>
    
    {/* INPUT */}
    <div
      className={`flex items-center rounded-full px-5 py-3 border bg-white transition-all duration-300
      ${error ? "border-red-500" : "border-gray-300"}
      ${focused ? "ring-2 ring-black" : ""}`}
    >

      {/* COUNTRY */}
      <div
        onClick={() => setOpen((prev) => !prev)}
        className="flex items-center gap-2 cursor-pointer pr-3 border-r"
      >
        {/* ✅ PERFECT ROUND FLAG */}
        <div className="w-6 h-6 rounded-full overflow-hidden bg-gray-100">
          <span
            className={`fi fi-${selected.code.toLowerCase()}`}
            style={{
              display: "block",
              width: "100%",
              height: "100%",
              backgroundSize: "cover",
              backgroundPosition: "center",
              borderRadius: "9999px"
            }}
          />
        </div>

        <span className="text-sm font-medium">{selected.code}</span>

        <ChevronDown
          size={20}
          className={`transition-all duration-300 ${
            open ? "rotate-180" : ""
          }`}
        />
      </div>

      {/* DIAL */}
      <span className="ml-3 text-sm text-gray-400">
        {selected.dial}
      </span>

      {/* INPUT FIELD */}
      <input
        type="tel"
        value={displayValue}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={(e) => handleChange(e.target.value)}
        placeholder={placeholder}
        className="ml-3 flex-1 outline-none bg-transparent text-sm"
      />

      {/* FLOAT LABEL */}
      <label
        className={`absolute left-5 pointer-events-none bg-white px-1 transition-all duration-300 text-gray-500
        ${isActive
          ? "-top-2 text-xs text-black"
          : "top-1/2 -translate-y-1/2 text-sm opacity-0"
        }`}
      >
        Phone number *
      </label>
    </div>

    {/* ERROR */}
    {error && (
      <p className="text-red-500 text-xs mt-1 ml-2">
        {error}
      </p>
    )}

    {/* DROPDOWN */}
    <div
      className={`absolute left-0 top-full mt-2 w-[75%] bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden z-50
      transform transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]
      ${open
        ? "opacity-100 translate-y-0 scale-100"
        : "opacity-0 -translate-y-2 scale-95 pointer-events-none"
      }`}
    >
      
      {/* SEARCH */}
      <div className="flex items-center px-3 py-3 border-b">
        <Search size={16} className="text-gray-400 mr-2" />
        <input
          placeholder="Search country"
          className="w-full outline-none text-sm"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* LIST */}
      <div className="max-h-[260px] overflow-y-auto">
        {filtered.map((c) => (
          <div
            key={c.code}
            onClick={() => {
              setSelected(c);
              setOpen(false);
              setLocalDigits("");
              setError("");
              onChange("");
            }}
            className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 cursor-pointer transition-all duration-150"
          >
            <div className="flex items-center gap-3">
              {/* ✅ PERFECT ROUND FLAG */}
              <div className="w-6 h-6 rounded-full overflow-hidden bg-gray-100">
                <span
                  className={`fi fi-${c.code.toLowerCase()}`}
                  style={{
                    display: "block",
                    width: "100%",
                    height: "100%",
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                    borderRadius: "9999px"
                  }}
                />
              </div>

              <span className="text-sm">{c.name}</span>
            </div>

            <span className="text-xs bg-gray-100 px-2 py-1 rounded-full text-gray-600">
              {c.dial}
            </span>
          </div>
        ))}
      </div>
    </div>
  </div>
);
}