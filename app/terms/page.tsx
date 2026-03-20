"use client";

import { useState } from "react";

type Lang = "en" | "de";

export default function TermsPage() {
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
          <div className="flex bg-white/10 backdrop-blur-md rounded-full p-1 border border-white/20">

            <button
              onClick={() => setLang("en")}
              className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm transition ${
                lang === "en"
                  ? "bg-white text-black"
                  : "text-white/80 hover:text-white"
              }`}
            >
              🇺🇸 EN
            </button>

            <button
              onClick={() => setLang("de")}
              className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm transition ${
                lang === "de"
                  ? "bg-white text-black"
                  : "text-white/80 hover:text-white"
              }`}
            >
              🇩🇪 DE
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

// 🌍 TRANSLATIONS

const translations = {
  en: {
    title: "Terms & Conditions",
    effective: "Effective Date: March 20, 2026 (v1.0)",

    sections: [
      {
        title: "1. Acceptance of Terms",
        content: (
          <>
            <p>
              By accessing or using AI-Productivity Coach, you agree to be bound by these Terms & Conditions.
            </p>
            <p>
              If you do not agree, you must not use the Service.
            </p>
          </>
        ),
      },

      {
        title: "2. Description of Service",
        content: (
          <p>
            AI-Productivity Coach provides AI-powered productivity insights, recommendations, and text-based assistance designed to improve professional efficiency.
          </p>
        ),
      },

      {
        title: "3. User Responsibilities",
        content: (
          <ul className="list-disc pl-6">
            <li>Provide accurate and truthful information</li>
            <li>Maintain the confidentiality of your account</li>
            <li>Use the platform in compliance with all applicable laws</li>
          </ul>
        ),
      },

      {
        title: "4. Prohibited Use",
        content: (
          <ul className="list-disc pl-6">
            <li>Illegal or fraudulent activities</li>
            <li>Attempting to hack or disrupt the system</li>
            <li>Generating harmful, abusive, or misleading content</li>
          </ul>
        ),
      },

      {
        title: "5. AI Limitations Disclaimer",
        content: (
          <>
            <p>
              AI-generated responses may not always be accurate, complete, or reliable.
            </p>
            <p>
              The service does not constitute professional, legal, financial, or medical advice.
            </p>
          </>
        ),
      },

      {
        title: "6. Intellectual Property",
        content: (
          <>
            <p>
              All platform content, design, and technology belong to AI-Productivity Coach.
            </p>
            <p>
              Users retain ownership of their inputs but grant us a license to process them.
            </p>
          </>
        ),
      },

      {
        title: "7. Account Termination",
        content: (
          <p>
            We reserve the right to suspend or terminate accounts that violate these terms or engage in misuse.
          </p>
        ),
      },

      {
        title: "8. Limitation of Liability",
        content: (
          <>
            <p>
              AI-Productivity Coach is not liable for any direct, indirect, or consequential damages arising from use of the service.
            </p>
          </>
        ),
      },

      {
        title: "9. Privacy",
        content: (
          <p>
            Your use of the service is also governed by our Privacy Policy.
          </p>
        ),
      },

      {
        title: "10. Modifications",
        content: (
          <p>
            We may update these Terms at any time. Continued use of the service constitutes acceptance of the updated terms.
          </p>
        ),
      },

      {
        title: "11. Governing Law",
        content: (
          <p>
            These terms are governed by applicable international and local laws.
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
    title: "Allgemeine Geschäftsbedingungen",
    effective: "Gültig ab: 20. März 2026 (v1.0)",

    sections: [
      {
        title: "1. Zustimmung",
        content: (
          <>
            <p>
              Durch die Nutzung von AI-Productivity Coach stimmen Sie diesen Bedingungen zu.
            </p>
          </>
        ),
      },

      {
        title: "2. Beschreibung des Dienstes",
        content: (
          <p>
            KI-basierte Produktivitätsunterstützung und Empfehlungen.
          </p>
        ),
      },

      {
        title: "3. Nutzerpflichten",
        content: (
          <ul className="list-disc pl-6">
            <li>Korrekte Angaben machen</li>
            <li>Konto schützen</li>
            <li>Gesetzeskonform handeln</li>
          </ul>
        ),
      },

      {
        title: "4. Verbotene Nutzung",
        content: (
          <ul className="list-disc pl-6">
            <li>Illegale Aktivitäten</li>
            <li>Systemmissbrauch</li>
            <li>Schädliche Inhalte</li>
          </ul>
        ),
      },

      {
        title: "5. KI-Haftungsausschluss",
        content: (
          <p>
            KI-Ergebnisse sind nicht immer korrekt und keine professionelle Beratung.
          </p>
        ),
      },

      {
        title: "6. Geistiges Eigentum",
        content: (
          <p>
            Alle Inhalte gehören AI-Productivity Coach.
          </p>
        ),
      },

      {
        title: "7. Kündigung",
        content: (
          <p>
            Konten können bei Verstoß gesperrt werden.
          </p>
        ),
      },

      {
        title: "8. Haftung",
        content: (
          <p>
            Keine Haftung für Schäden durch Nutzung.
          </p>
        ),
      },

      {
        title: "9. Datenschutz",
        content: (
          <p>
            Siehe Datenschutzerklärung.
          </p>
        ),
      },

      {
        title: "10. Änderungen",
        content: (
          <p>
            Änderungen sind jederzeit möglich.
          </p>
        ),
      },

      {
        title: "11. Recht",
        content: (
          <p>
            Es gelten internationale Gesetze.
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