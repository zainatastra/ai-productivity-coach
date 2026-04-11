"use client";

import { useState } from "react";

import { motion } from "framer-motion";

type Lang = "en" | "de";

export default function PrivacyPolicyPage() {
  const [lang, setLang] = useState<Lang>("en");

  const t = translations[lang];

  return (
    <div className="min-h-screen bg-white">

      {/* HEADER */}
      <div className="bg-gradient-to-r from-purple-700 to-purple-900 text-center py-24 rounded-b-[80px]">

        <h1 className="text-4xl md:text-5xl font-bold !text-white">
          {t.title}
        </h1>

        <p className="mt-4 text-sm !text-white/80">
          {t.effective}
        </p>

        {/* 🔥 LANGUAGE SWITCHER */}
<div className="flex justify-center mt-6">
  <div className="relative flex bg-white/10 backdrop-blur-md rounded-full p-1 border border-white/20 w-[160px]">

    {/* 🔥 SLIDING PILL */}
    <motion.div
      initial={false}
      animate={{ x: lang === "en" ? 0 : "100%" }}
      transition={{
        type: "spring",
        stiffness: 400,
        damping: 30
      }}
      className="absolute top-1 left-1 w-1/2 h-[calc(100%-8px)] bg-white rounded-full"
    />

    {/* EN */}
    <button
      onClick={() => setLang("en")}
      className={`relative z-10 flex items-center justify-center gap-2 flex-1 py-2 text-sm font-medium ${
        lang === "en" ? "text-black" : "text-white/70"
      }`}
    >
      <img
        src="/us.png"
        alt="EN"
        className="w-4 h-4 rounded-sm object-cover"
        onError={(e) => {
          e.currentTarget.style.display = "none";
        }}
      />
      EN
    </button>

    {/* DE */}
    <button
      onClick={() => setLang("de")}
      className={`relative z-10 flex items-center justify-center gap-2 flex-1 py-2 text-sm font-medium ${
        lang === "de" ? "text-black" : "text-white/70"
      }`}
    >
      <img
        src="/de.png"
        alt="DE"
        className="w-4 h-4 rounded-sm object-cover"
        onError={(e) => {
          e.currentTarget.style.display = "none";
        }}
      />
      DE
    </button>

  </div>
</div>

      </div>

      {/* CONTENT */}
      <div className="max-w-5xl mx-auto px-6 py-14 text-gray-800 text-[15px] leading-7">

        {t.sections.map((sec: any, i: number) => (
          <Section key={i} title={sec.title}>
            {sec.content}
          </Section>
        ))}

      </div>
    </div>
  );
}

// 🔹 SECTION COMPONENT
function Section({ title, children }: any) {
  return (
    <div className="mb-10">
      <h2 className="font-semibold text-lg mb-3">{title}</h2>
      <div className="text-justify space-y-3">{children}</div>
    </div>
  );
}


// 🌍 TRANSLATIONS (EN + DE)

const translations = {
  en: {
    title: "Privacy Policy",
    effective: "Effective Date: March 20, 2026 (v1.0)",

    sections: [
      {
        title: "1. Introduction",
        content: (
          <>
            <p>
              AI-Productivity Coach ("we", "our", "us") is committed to protecting your privacy and ensuring that your personal data is handled in a secure, transparent, and lawful manner.
            </p>
            <p>
              This Privacy Policy explains how we collect, use, process, store, and protect your personal data when you use our Service.
            </p>
            <p>
              We fully comply with the General Data Protection Regulation (GDPR).
            </p>
          </>
        ),
      },

      {
        title: "2. Data Controller",
        content: (
          <>
            <p><strong>AI-Productivity Coach</strong></p>
            <p>info@aiproductivitycoach.com</p>
          </>
        ),
      },

      {
        title: "3. Personal Data We Collect",
        content: (
          <>
            <ul className="list-disc pl-6">
              <li>Full Name, Email, Phone, Company</li>
              <li>AI prompts and responses</li>
              <li>Device and browser data</li>
              <li>Usage analytics</li>
            </ul>
          </>
        ),
      },

      {
        title: "4. How We Use Your Data",
        content: (
          <ul className="list-disc pl-6">
            <li>Provide and improve the service</li>
            <li>Generate AI responses</li>
            <li>Ensure security</li>
            <li>Legal compliance</li>
          </ul>
        ),
      },

      {
        title: "5. Legal Basis (GDPR)",
        content: (
          <ul className="list-disc pl-6">
            <li>Contract</li>
            <li>Legitimate interest</li>
            <li>Consent</li>
            <li>Legal obligation</li>
          </ul>
        ),
      },

      {
        title: "6. Data Processing Agreement (DPA)",
        content: (
          <p>
            We use Firebase (Google Cloud). All processors are GDPR compliant and bound by DPAs.
          </p>
        ),
      },

      {
        title: "7. Data Storage & Retention",
        content: (
          <p>
            Data is stored securely and retained only as long as necessary.
          </p>
        ),
      },

      {
        title: "8. Data Sharing",
        content: (
          <p>
            We do not sell your data. Data is only shared with trusted providers and legal authorities if required.
          </p>
        ),
      },

      {
        title: "9. Your Rights",
        content: (
          <ul className="list-disc pl-6">
            <li>Access</li>
            <li>Correction</li>
            <li>Deletion</li>
            <li>Portability</li>
          </ul>
        ),
      },

      {
        title: "10. Right to Erasure",
        content: (
          <p>
            You can delete your data anytime via your account settings or by contacting us.
          </p>
        ),
      },

      {
        title: "11. Security",
        content: (
          <p>
            We use encryption, authentication, and monitoring systems.
          </p>
        ),
      },

      {
        title: "12. Contact",
        content: (
          <p>info@aiproductivitycoach.com</p>
        ),
      },
    ],
  },


  de: {
    title: "Datenschutzerklärung",
    effective: "Gültig ab: 20. März 2026 (v1.0)",

    sections: [
      {
        title: "1. Einführung",
        content: (
          <>
            <p>
              AI-Productivity Coach ("wir", "uns", "unser") verpflichtet sich zum Schutz Ihrer personenbezogenen Daten.
            </p>
            <p>
              Diese Datenschutzerklärung erklärt, wie wir Ihre Daten verarbeiten.
            </p>
            <p>
              Wir erfüllen vollständig die DSGVO (GDPR).
            </p>
          </>
        ),
      },

      {
        title: "2. Verantwortlicher",
        content: (
          <>
            <p><strong>AI-Productivity Coach</strong></p>
            <p>info@aiproductivitycoach.com</p>
          </>
        ),
      },

      {
        title: "3. Erhobene Daten",
        content: (
          <ul className="list-disc pl-6">
            <li>Name, E-Mail, Telefon, Firma</li>
            <li>AI-Eingaben und Antworten</li>
            <li>Geräte- und Browserdaten</li>
            <li>Nutzungsanalysen</li>
          </ul>
        ),
      },

      {
        title: "4. Nutzung der Daten",
        content: (
          <ul className="list-disc pl-6">
            <li>Bereitstellung des Dienstes</li>
            <li>Verbesserung des Systems</li>
            <li>Sicherheit</li>
            <li>Rechtliche Verpflichtungen</li>
          </ul>
        ),
      },

      {
        title: "5. Rechtsgrundlage",
        content: (
          <ul className="list-disc pl-6">
            <li>Vertrag</li>
            <li>Berechtigtes Interesse</li>
            <li>Einwilligung</li>
            <li>Gesetzliche Pflicht</li>
          </ul>
        ),
      },

      {
        title: "6. Datenverarbeitung (DPA)",
        content: (
          <p>
            Wir nutzen Firebase (Google Cloud). Alle Anbieter sind DSGVO-konform.
          </p>
        ),
      },

      {
        title: "7. Speicherung",
        content: (
          <p>
            Daten werden sicher gespeichert und nur so lange wie nötig aufbewahrt.
          </p>
        ),
      },

      {
        title: "8. Weitergabe",
        content: (
          <p>
            Wir verkaufen keine Daten. Weitergabe nur an vertrauenswürdige Partner oder Behörden.
          </p>
        ),
      },

      {
        title: "9. Ihre Rechte",
        content: (
          <ul className="list-disc pl-6">
            <li>Zugriff</li>
            <li>Berichtigung</li>
            <li>Löschung</li>
            <li>Datenübertragbarkeit</li>
          </ul>
        ),
      },

      {
        title: "10. Recht auf Löschung",
        content: (
          <p>
            Sie können Ihre Daten jederzeit löschen oder löschen lassen.
          </p>
        ),
      },

      {
        title: "11. Sicherheit",
        content: (
          <p>
            Wir nutzen Verschlüsselung und sichere Authentifizierung.
          </p>
        ),
      },

      {
        title: "12. Kontakt",
        content: (
          <p>info@aiproductivitycoach.com</p>
        ),
      },
    ],
  },
};