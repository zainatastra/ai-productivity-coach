// ✅ AUTO-GENERATED — No hardcoding. All 240+ countries from libphonenumber-js.
// Production-safe (NO emoji flags, uses flag-icons via ISO codes)

import { getCountries, getCountryCallingCode, CountryCode } from "libphonenumber-js";

export interface Country {
  code: CountryCode;   // ISO 3166-1 alpha-2, e.g. "PK"
  name: string;        // English display name
  dial: string;        // With + prefix, e.g. "+92"
}

// ── English display name from built-in Intl API ───────────────────────────────
const displayNames = new Intl.DisplayNames(["en"], { type: "region" });

const fallbackNames: Record<string, string> = {
  PK: "Pakistan",
  US: "United States",
  DE: "Germany",
  AE: "United Arab Emirates",
  SA: "Saudi Arabia",
};

function toName(regionCode: string): string {
  return displayNames.of(regionCode) || fallbackNames[regionCode] || regionCode;
}

// ── Build the full list (runs once, very fast) ───────────────────────────────
export const countries: Country[] = getCountries()
  .map((code) => ({
    code,
    name: toName(code),
    dial: `+${getCountryCallingCode(code)}`,
  }))
  .sort((a, b) => a.name.localeCompare(b.name));

// ── Helpers ───────────────────────────────────────────────────────────────────
export function findByCode(code: string): Country | undefined {
  return countries.find((c) => c.code === code);
}

export function findByDial(dial: string): Country | undefined {
  return countries.find((c) => c.dial === dial);
}

export const DEFAULT_COUNTRY_CODE: CountryCode = "DE";