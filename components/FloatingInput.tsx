"use client";

import { useState } from "react";

export default function FloatingInput({
  label,
  value,
  onChange,
  type = "text",
  error = false,
}: {
  label: string;
  value: string;
  onChange: (val: string) => void;
  type?: string;
  error?: boolean;
}) {
  const [focused, setFocused] = useState(false);

  const isActive = focused || value;

  return (
    <div className="relative mb-4">
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        className={`w-full px-5 py-3 rounded-full border bg-white outline-none transition-all duration-300
        ${error ? "border-red-500" : "border-gray-300"}
        focus:ring-2 focus:ring-black`}
      />

      {/* FLOATING LABEL */}
      <label
        className={`absolute left-4 pointer-events-none transition-all duration-300 bg-white px-1 text-gray-500
        ${isActive
            ? "-top-2 text-xs text-black"
            : "top-1/2 -translate-y-1/2 text-sm"
        }`}
      >
        {label}
      </label>
    </div>
  );
}