"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FileCheck,
  Layers,
  UserCog,
  ShieldOff,
  Bot,
  Copyright,
  UserX,
  AlertTriangle,
  Lock,
  RefreshCw,
  Gavel,
  Mail,
  Info,
  CheckCircle2,
  Calendar,
  Shield,
} from "lucide-react";

type Lang = "en" | "de";

const tocItems = [
  { id: "sec1",  Icon: FileCheck,     label: { en: "Acceptance of Terms",     de: "Zustimmung" } },
  { id: "sec2",  Icon: Layers,        label: { en: "Description of Service",  de: "Dienstbeschreibung" } },
  { id: "sec3",  Icon: UserCog,       label: { en: "User Responsibilities",   de: "Nutzerpflichten" } },
  { id: "sec4",  Icon: ShieldOff,     label: { en: "Prohibited Use",          de: "Verbotene Nutzung" } },
  { id: "sec5",  Icon: Bot,           label: { en: "AI Limitations",          de: "KI-Haftungsausschluss" } },
  { id: "sec6",  Icon: Copyright,     label: { en: "Intellectual Property",   de: "Geistiges Eigentum" } },
  { id: "sec7",  Icon: UserX,         label: { en: "Account Termination",     de: "Kündigung" } },
  { id: "sec8",  Icon: AlertTriangle, label: { en: "Limitation of Liability", de: "Haftung" } },
  { id: "sec9",  Icon: Lock,          label: { en: "Privacy",                 de: "Datenschutz" } },
  { id: "sec10", Icon: RefreshCw,     label: { en: "Modifications",           de: "Änderungen" } },
  { id: "sec11", Icon: Gavel,         label: { en: "Governing Law",           de: "Recht" } },
  { id: "sec12", Icon: Mail,          label: { en: "Contact Us",              de: "Kontakt" } },
];

const translations = {
  en: {
    title: "Terms & Conditions",
    effective: "Effective Date: March 20, 2026 (v1.0)",
    heroBadge: "Please Read Carefully",
    heroSub: "By using AI-Productivity Coach you agree to these terms. They protect both you and us.",
    contactUs: "Contact Us",
    sections: {
      sec1: {
        title: "1. Acceptance of Terms",
        content: [
          'By accessing or using AI-Productivity Coach ("the Service"), you confirm that you have read, understood, and agree to be bound by these Terms & Conditions and all applicable laws and regulations.',
          "If you do not agree with any part of these terms, you must immediately discontinue use of the Service. Your continued access constitutes full acceptance.",
          "These terms apply to all users, including visitors, registered users, and paying subscribers.",
        ],
        infoBox: "We recommend saving or printing a copy of these terms for your records. They were last updated on March 20, 2026.",
      },
      sec2: {
        title: "2. Description of Service",
        content: [
          "AI-Productivity Coach provides AI-powered productivity insights, smart recommendations, workflow automation suggestions, and text-based assistance designed to improve professional efficiency and output.",
          "The Service is accessible via web browser and mobile applications. Features may vary depending on your subscription plan.",
        ],
        items: [
          "AI-powered task prioritization and time management guidance",
          "Personalized productivity coaching based on your work patterns",
          "Smart scheduling recommendations and deadline tracking",
          "Integration support with popular productivity tools",
        ],
        successBox: "We continuously improve the Service. New features are rolled out regularly to all eligible subscribers.",
      },
      sec3: {
        title: "3. User Responsibilities",
        content: "As a user of the Service, you agree to the following obligations:",
        items: [
          "Provide accurate, current, and complete information during registration and at all times thereafter",
          "Maintain the confidentiality of your account credentials and immediately notify us of any unauthorized access",
          "Use the platform in full compliance with all applicable local, national, and international laws",
          "Not share your account with any third party or allow others to access the Service under your credentials",
          "Ensure that any content you submit does not infringe on the rights of others",
        ],
      },
      sec4: {
        title: "4. Prohibited Use",
        content: "The following activities are strictly prohibited on our platform:",
        items: [
          "Engaging in illegal, fraudulent, or deceptive activities of any kind",
          "Attempting to hack, reverse-engineer, or disrupt the Service or its underlying systems",
          "Generating harmful, abusive, discriminatory, or misleading content via the AI",
          "Using the Service to send spam, conduct phishing, or distribute malware",
          "Scraping, harvesting, or extracting data from the platform without written authorization",
          "Impersonating any person, organization, or entity",
        ],
        infoBox: "Violations may result in immediate account suspension and potential legal action.",
      },
      sec5: {
        title: "5. AI Limitations Disclaimer",
        content: [
          "AI-generated responses and recommendations may not always be accurate, complete, current, or suitable for your specific situation. The quality of output depends significantly on the quality and clarity of your input.",
          "The Service does not constitute professional, legal, financial, medical, or psychological advice. Always consult a qualified professional before making important decisions based on AI-generated content.",
          "We are continuously working to improve accuracy, but no AI system is infallible. Users are responsible for verifying important information independently.",
        ],
        infoBox: "Never rely solely on AI-generated output for critical decisions. Use it as a helpful starting point, not a final authority.",
      },
      sec6: {
        title: "6. Intellectual Property",
        content: [
          "All platform content, design, technology, algorithms, branding, and underlying software are the exclusive intellectual property of AI-Productivity Coach and are protected by applicable copyright, trademark, and patent laws.",
          "Users retain full ownership of the content and prompts they submit to the Service. By submitting content, you grant us a limited, non-exclusive, royalty-free license to process and display your content solely for the purpose of providing the Service.",
          "You may not copy, reproduce, modify, distribute, or create derivative works from any part of the platform without our prior written consent.",
        ],
      },
      sec7: {
        title: "7. Account Termination",
        content: [
          "We reserve the right to suspend, restrict, or permanently terminate your account at our sole discretion if you violate these Terms, engage in misuse, or if we determine your use poses a risk to others or the integrity of the Service.",
          "You may also terminate your account at any time by contacting us or using the account deletion feature in your settings.",
        ],
        items: [
          "Termination for violations may occur without prior notice",
          "Upon termination, your access to the Service will be immediately revoked",
          "Data deletion follows the schedule outlined in our Privacy Policy",
          "Subscription fees are non-refundable upon termination for cause",
        ],
      },
      sec8: {
        title: "8. Limitation of Liability",
        content: [
          "To the fullest extent permitted by applicable law, AI-Productivity Coach, its directors, employees, agents, and partners shall not be liable for any direct, indirect, incidental, special, consequential, or punitive damages arising from your use of, or inability to use, the Service.",
          "This includes but is not limited to loss of data, loss of profits, business interruption, or any other commercial damages or losses, even if we have been advised of the possibility of such damages.",
          "Our total liability to you for any claims arising out of these Terms or your use of the Service shall not exceed the amount you paid us in the 12 months preceding the claim.",
        ],
        infoBox: "Some jurisdictions do not allow the exclusion of certain warranties or the limitation of liability. In such cases, our liability is limited to the minimum extent permitted by law.",
      },
      sec9: {
        title: "9. Privacy",
        content: [
          "Your use of the Service is also governed by our Privacy Policy, which is incorporated by reference into these Terms & Conditions.",
          "By using the Service, you consent to the collection, use, and processing of your personal data as described in our Privacy Policy. We are fully GDPR compliant.",
        ],
        successBox: "We take your privacy seriously. Your data is never sold to third parties. Read our full Privacy Policy for details.",
      },
      sec10: {
        title: "10. Modifications to Terms",
        content: [
          "We reserve the right to update, modify, or replace any part of these Terms & Conditions at any time. Changes will be effective immediately upon posting to the platform.",
          "We will make reasonable efforts to notify registered users of significant changes via email or in-app notification. However, it is your responsibility to review these terms periodically.",
          "Continued use of the Service following any changes constitutes your acceptance of the revised terms.",
        ],
      },
      sec11: {
        title: "11. Governing Law",
        content: [
          "These Terms & Conditions are governed by and construed in accordance with applicable international and local laws, without regard to conflict of law principles.",
          "Any disputes arising out of or relating to these Terms shall first be attempted to be resolved through good-faith negotiation. If unresolved, disputes shall be submitted to binding arbitration or the competent courts of the applicable jurisdiction.",
        ],
        infoBox: "If any provision of these Terms is found to be unenforceable, the remaining provisions will continue in full force and effect.",
      },
      sec12: {
        title: "12. Contact Us",
        intro: "If you have any questions, concerns, or requests regarding these Terms & Conditions, please reach out to us:",
        infoBox: "We aim to respond to all inquiries within 2 business days.",
      },
    },
  },
  de: {
    title: "Allgemeine Geschäftsbedingungen",
    effective: "Gültig ab: 20. März 2026 (v1.0)",
    heroBadge: "Bitte sorgfältig lesen",
    heroSub: "Mit der Nutzung von AI-Productivity Coach stimmen Sie diesen Bedingungen zu. Sie schützen sowohl Sie als auch uns.",
    contactUs: "Kontaktieren",
    sections: {
      sec1: {
        title: "1. Zustimmung zu den Bedingungen",
        content: [
          'Durch den Zugriff auf oder die Nutzung von AI-Productivity Coach bestätigen Sie, dass Sie diese Allgemeinen Geschäftsbedingungen gelesen und verstanden haben und ihnen zustimmen.',
          "Wenn Sie mit einem Teil dieser Bedingungen nicht einverstanden sind, müssen Sie die Nutzung des Dienstes sofort einstellen.",
          "Diese Bedingungen gelten für alle Nutzer, einschließlich Besucher, registrierte Nutzer und zahlende Abonnenten.",
        ],
        infoBox: "Wir empfehlen, eine Kopie dieser Bedingungen für Ihre Unterlagen zu speichern.",
      },
      sec2: {
        title: "2. Beschreibung des Dienstes",
        content: [
          "AI-Productivity Coach bietet KI-gestützte Produktivitätseinblicke, intelligente Empfehlungen und textbasierte Unterstützung zur Verbesserung der beruflichen Effizienz.",
          "Der Dienst ist über Webbrowser und mobile Anwendungen zugänglich. Die Funktionen können je nach Abonnementplan variieren.",
        ],
        items: [
          "KI-gestützte Aufgabenpriorisierung und Zeitmanagement",
          "Personalisiertes Produktivitäts-Coaching",
          "Intelligente Terminempfehlungen und Fristenverfolgung",
          "Integrationsunterstützung mit gängigen Produktivitätstools",
        ],
        successBox: "Wir verbessern den Dienst kontinuierlich. Neue Funktionen werden regelmäßig für alle berechtigten Abonnenten eingeführt.",
      },
      sec3: {
        title: "3. Nutzerpflichten",
        content: "Als Nutzer des Dienstes stimmen Sie folgenden Verpflichtungen zu:",
        items: [
          "Genaue, aktuelle und vollständige Informationen bei der Registrierung angeben",
          "Vertraulichkeit der Kontodaten wahren und unbefugten Zugriff sofort melden",
          "Die Plattform in Übereinstimmung mit allen anwendbaren Gesetzen nutzen",
          "Konto nicht mit Dritten teilen",
          "Sicherstellen, dass eingereichte Inhalte keine Rechte Dritter verletzen",
        ],
      },
      sec4: {
        title: "4. Verbotene Nutzung",
        content: "Folgende Aktivitäten sind auf unserer Plattform streng verboten:",
        items: [
          "Illegale, betrügerische oder täuschende Aktivitäten",
          "Versuche, das System zu hacken oder zu stören",
          "Generierung schädlicher, missbräuchlicher oder irreführender Inhalte",
          "Spam, Phishing oder Malware-Verbreitung",
          "Unbefugtes Scraping oder Extrahieren von Daten",
          "Identitätsdiebstahl oder Imitieren anderer Personen",
        ],
        infoBox: "Verstöße können zur sofortigen Kontosperrung und rechtlichen Schritten führen.",
      },
      sec5: {
        title: "5. KI-Haftungsausschluss",
        content: [
          "KI-generierte Antworten und Empfehlungen sind möglicherweise nicht immer korrekt, vollständig oder für Ihre spezifische Situation geeignet.",
          "Der Dienst stellt keine professionelle, rechtliche, finanzielle, medizinische oder psychologische Beratung dar. Konsultieren Sie immer einen qualifizierten Fachmann.",
          "Nutzer sind dafür verantwortlich, wichtige Informationen unabhängig zu überprüfen.",
        ],
        infoBox: "Verlassen Sie sich bei wichtigen Entscheidungen niemals ausschließlich auf KI-generierte Ausgaben.",
      },
      sec6: {
        title: "6. Geistiges Eigentum",
        content: [
          "Alle Plattforminhalte, Designs, Technologien und Software sind das ausschließliche geistige Eigentum von AI-Productivity Coach.",
          "Nutzer behalten das volle Eigentum an den von ihnen eingereichten Inhalten. Durch die Einreichung gewähren Sie uns eine begrenzte Lizenz zur Verarbeitung.",
          "Sie dürfen keine Teile der Plattform ohne unsere vorherige schriftliche Zustimmung kopieren oder verteilen.",
        ],
      },
      sec7: {
        title: "7. Kontokündigung",
        content: [
          "Wir behalten uns das Recht vor, Ihr Konto zu sperren oder zu kündigen, wenn Sie gegen diese Bedingungen verstoßen.",
          "Sie können Ihr Konto jederzeit über die Kontoeinstellungen oder durch Kontaktaufnahme mit uns kündigen.",
        ],
        items: [
          "Kündigung bei Verstößen kann ohne Vorankündigung erfolgen",
          "Zugang wird sofort nach Kündigung gesperrt",
          "Datenlöschung gemäß Datenschutzerklärung",
          "Abonnementgebühren werden bei Kündigung aus wichtigem Grund nicht erstattet",
        ],
      },
      sec8: {
        title: "8. Haftungsbeschränkung",
        content: [
          "AI-Productivity Coach haftet nicht für direkte, indirekte, zufällige oder Folgeschäden aus der Nutzung des Dienstes.",
          "Dies umfasst Datenverlust, entgangene Gewinne und Betriebsunterbrechungen.",
          "Unsere Gesamthaftung übersteigt nicht den in den letzten 12 Monaten gezahlten Betrag.",
        ],
        infoBox: "In einigen Ländern sind bestimmte Haftungsbeschränkungen nicht zulässig. In diesen Fällen gilt die gesetzlich zulässige Mindesthaftung.",
      },
      sec9: {
        title: "9. Datenschutz",
        content: [
          "Ihre Nutzung des Dienstes unterliegt auch unserer Datenschutzerklärung, die in diese Bedingungen aufgenommen wird.",
          "Mit der Nutzung des Dienstes stimmen Sie der Erhebung und Verarbeitung Ihrer personenbezogenen Daten gemäß unserer Datenschutzerklärung zu.",
        ],
        successBox: "Wir nehmen Ihre Privatsphäre ernst. Ihre Daten werden niemals an Dritte verkauft.",
      },
      sec10: {
        title: "10. Änderungen der Bedingungen",
        content: [
          "Wir behalten uns das Recht vor, diese Bedingungen jederzeit zu aktualisieren. Änderungen gelten ab dem Zeitpunkt der Veröffentlichung.",
          "Wir werden registrierte Nutzer über wesentliche Änderungen per E-Mail oder In-App-Benachrichtigung informieren.",
          "Die weitere Nutzung des Dienstes nach Änderungen gilt als Zustimmung.",
        ],
      },
      sec11: {
        title: "11. Geltendes Recht",
        content: [
          "Diese Bedingungen unterliegen den anwendbaren internationalen und lokalen Gesetzen.",
          "Streitigkeiten werden zunächst durch Verhandlungen gelöst. Bei Erfolglosigkeit werden sie einem verbindlichen Schiedsverfahren oder den zuständigen Gerichten vorgelegt.",
        ],
        infoBox: "Sollte eine Bestimmung dieser Bedingungen unwirksam sein, bleiben die übrigen Bestimmungen in Kraft.",
      },
      sec12: {
        title: "12. Kontakt",
        intro: "Wenn Sie Fragen zu diesen Bedingungen haben, wenden Sie sich bitte an uns:",
        infoBox: "Wir bemühen uns, alle Anfragen innerhalb von 2 Werktagen zu beantworten.",
      },
    },
  },
};

export default function TermsPage() {
  const [lang, setLang] = useState<Lang>("en");
  const [activeSection, setActiveSection] = useState("sec1");
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

  const t = translations[lang];

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) setActiveSection(entry.target.id);
        });
      },
      { rootMargin: "-20% 0px -70% 0px" }
    );
    Object.values(sectionRefs.current).forEach((ref) => {
      if (ref) observer.observe(ref);
    });
    return () => observer.disconnect();
  }, [lang]);

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const sec = t.sections;

  return (
    <div style={{ background: "#f4f6f9", minHeight: "100vh", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap');
        * { box-sizing: border-box; }
        .hero {
          background: linear-gradient(135deg, #3b0088 0%, #6a00c8 40%, #7c3aed 70%, #5b21b6 100%);
          padding: 72px 24px 100px; position: relative; overflow: hidden; text-align: center;
        }
        .hero::before {
          content: ""; position: absolute; inset: 0;
          background: radial-gradient(ellipse 700px 450px at 30% 40%, rgba(255,255,255,0.06) 0%, transparent 70%);
          pointer-events: none;
        }
        .dots-grid {
          position: absolute; inset: 0;
          background-image: radial-gradient(circle, rgba(255,255,255,0.12) 1px, transparent 1px);
          background-size: 30px 30px; animation: driftGrid 20s linear infinite; pointer-events: none;
        }
        @keyframes driftGrid { 0% { background-position: 0 0; } 100% { background-position: 30px 30px; } }
        .hero::after {
          content: ""; position: absolute; bottom: -2px; left: 0; right: 0; height: 64px;
          background: #f4f6f9; clip-path: ellipse(55% 100% at 50% 100%);
        }
        .hero-inner { position: relative; z-index: 1; max-width: 640px; margin: 0 auto; }
        .hero-badge {
          display: inline-flex; align-items: center; gap: 8px; padding: 6px 18px;
          background: rgba(255,255,255,0.12); border: 1px solid rgba(255,255,255,0.22);
          border-radius: 999px; font-size: 11px; font-weight: 700; letter-spacing: 0.08em;
          text-transform: uppercase; color: rgba(255,255,255,0.9); margin-bottom: 20px;
        }
        .hero h1 {
          font-size: clamp(32px, 5vw, 52px); font-weight: 800; color: #fff;
          line-height: 1.1; letter-spacing: -0.03em; margin-bottom: 14px;
        }
        .hero h1 .hl { color: #c4b5fd; }
        .hero-sub { font-size: 15px; color: rgba(255,255,255,0.68); line-height: 1.7; margin-bottom: 20px; }
        .hero-date-pill {
          display: inline-flex; align-items: center; gap: 8px; padding: 6px 18px;
          background: rgba(255,255,255,0.10); border: 1px solid rgba(255,255,255,0.18);
          border-radius: 999px; font-size: 13px; color: rgba(255,255,255,0.72); margin-bottom: 24px;
        }
        .lang-switcher { display: flex; justify-content: center; margin-top: 8px; }
        .lang-track {
          position: relative; display: flex; background: rgba(255,255,255,0.10);
          backdrop-filter: blur(12px); border: 1px solid rgba(255,255,255,0.20);
          border-radius: 999px; padding: 4px; width: 164px;
        }
        .lang-btn {
          position: relative; z-index: 10; flex: 1; display: flex; align-items: center;
          justify-content: center; gap: 6px; padding: 8px 0; font-size: 13px; font-weight: 600;
          border: none; background: transparent; cursor: pointer; border-radius: 999px;
          transition: color 0.2s; font-family: inherit;
        }
        .doc-layout {
          max-width: 1060px; margin: 0 auto; padding: 56px 24px 96px;
          display: grid; grid-template-columns: 252px 1fr; gap: 36px; align-items: start;
        }
        .toc {
          position: sticky; top: 28px; background: #fff; border: 1.5px solid #e5e7eb;
          border-radius: 20px; padding: 24px 20px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.04);
        }
        .toc-label {
          font-size: 11px; font-weight: 800; text-transform: uppercase;
          letter-spacing: 0.08em; color: #9ca3af; margin-bottom: 14px;
        }
        .toc ul { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 2px; }
        .toc-link {
          display: flex; align-items: center; gap: 10px; padding: 8px 12px; border-radius: 12px;
          font-size: 13px; font-weight: 500; color: #6b7280; cursor: pointer; border: none;
          background: transparent; width: 100%; text-align: left;
          transition: color 0.18s, background 0.18s; font-family: inherit;
        }
        .toc-link:hover { color: #7c3aed; background: rgba(124,58,237,0.07); }
        .toc-link.active { color: #7c3aed; background: rgba(124,58,237,0.09); font-weight: 700; }
        .doc-section {
          background: #fff; border: 1.5px solid #e5e7eb; border-radius: 20px;
          padding: 32px; margin-bottom: 16px; scroll-margin-top: 28px;
          transition: border-color 0.22s, box-shadow 0.22s;
          box-shadow: 0 1px 3px rgba(0,0,0,0.05);
        }
        .doc-section:hover { border-color: rgba(124,58,237,0.28); box-shadow: 0 4px 20px rgba(124,58,237,0.06); }
        .sec-header { display: flex; align-items: center; gap: 14px; margin-bottom: 18px; }
        .sec-num {
          width: 42px; height: 42px; border-radius: 12px; background: rgba(124,58,237,0.09);
          color: #7c3aed; display: flex; align-items: center; justify-content: center; flex-shrink: 0;
        }
        .sec-header h2 { font-size: 18px; font-weight: 800; letter-spacing: -0.015em; color: #0d1117; margin: 0; }
        .sec-body p { font-size: 15px; color: #4b5563; line-height: 1.8; margin-bottom: 10px; }
        .sec-body p:last-child { margin-bottom: 0; }
        .sec-body ul { list-style: none; padding: 0; margin: 10px 0 0; display: flex; flex-direction: column; gap: 8px; }
        .sec-body ul li { display: flex; align-items: flex-start; gap: 10px; font-size: 15px; color: #4b5563; line-height: 1.7; }
        .sec-body ul li::before {
          content: ""; width: 6px; height: 6px; border-radius: 50%;
          background: #7c3aed; flex-shrink: 0; margin-top: 9px;
        }
        .info-box {
          background: rgba(124,58,237,0.06); border: 1.5px solid rgba(124,58,237,0.15);
          border-radius: 12px; padding: 14px 18px; display: flex; align-items: flex-start;
          gap: 12px; margin-top: 16px;
        }
        .info-box p { font-size: 14px; color: #4b5563; margin: 0 !important; line-height: 1.7; }
        .success-box {
          background: rgba(16,185,129,0.07); border: 1.5px solid rgba(16,185,129,0.2);
          border-radius: 12px; padding: 14px 18px; display: flex; align-items: flex-start;
          gap: 12px; margin-top: 16px;
        }
        .success-box p { font-size: 14px; color: #4b5563; margin: 0 !important; line-height: 1.7; }
        .contact-card {
          background: linear-gradient(135deg, rgba(124,58,237,0.06), rgba(91,33,182,0.04));
          border: 1.5px solid rgba(124,58,237,0.16); border-radius: 14px;
          padding: 20px 24px; display: flex; align-items: center; justify-content: space-between;
          flex-wrap: wrap; gap: 12px; margin-top: 12px;
        }
        .contact-card-left { display: flex; align-items: center; gap: 14px; }
        .contact-avatar {
          width: 46px; height: 46px; background: linear-gradient(135deg, #7c3aed, #5b21b6);
          border-radius: 12px; display: flex; align-items: center; justify-content: center;
          color: white; flex-shrink: 0;
        }
        .contact-card strong { display: block; font-size: 14px; font-weight: 700; color: #0d1117; }
        .contact-card a { font-size: 13px; color: #7c3aed; text-decoration: none; font-weight: 500; }
        .contact-card a:hover { text-decoration: underline; }
        .contact-btn {
          display: inline-flex; align-items: center; gap: 8px; padding: 9px 20px;
          background: #7c3aed; color: #fff; font-size: 13px; font-weight: 600; border-radius: 999px;
          text-decoration: none; border: none; cursor: pointer; font-family: inherit;
          transition: background 0.18s, transform 0.18s;
        }
        .contact-btn:hover { background: #5b21b6; transform: translateY(-1px); }
        strong { color: #0d1117; }
        @media (max-width: 900px) { .doc-layout { grid-template-columns: 1fr; } .toc { display: none; } }
        @media (max-width: 640px) { .doc-layout { padding: 40px 16px 60px; } .doc-section { padding: 24px 20px; } }
      `}</style>

      {/* HERO */}
      <div className="hero">
        <div className="dots-grid" />
        <div className="hero-inner">
          <div className="hero-badge">
            <FileCheck size={13} />
            {t.heroBadge}
          </div>
          <h1>
            {lang === "en"
              ? <>Terms &amp; <span className="hl">Conditions</span></>
              : <>Allgemeine <span className="hl">Geschäftsbedingungen</span></>
            }
          </h1>
          <p className="hero-sub">{t.heroSub}</p>
          <div className="hero-date-pill">
            <Calendar size={13} />
            {t.effective}
          </div>

          {/* Language Switcher */}
          <div className="lang-switcher">
            <div className="lang-track">
              <motion.div
                initial={false}
                animate={{ x: lang === "en" ? 0 : "100%" }}
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
                style={{
                  position: "absolute", top: 4, left: 4,
                  width: "calc(50% - 4px)", height: "calc(100% - 8px)",
                  background: "#fff", borderRadius: 999,
                }}
              />
              {(["en", "de"] as Lang[]).map((l) => (
                <button
                  key={l}
                  onClick={() => setLang(l)}
                  className="lang-btn"
                  style={{ color: lang === l ? "#0d1117" : "rgba(255,255,255,0.7)" }}
                >
                  <img
                    src={`/${l === "en" ? "us" : "de"}.png`}
                    alt={l.toUpperCase()}
                    style={{ width: 16, height: 16, borderRadius: 3, objectFit: "cover" }}
                    onError={(e) => { e.currentTarget.style.display = "none"; }}
                  />
                  {l.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* LAYOUT */}
      <div className="doc-layout">

        {/* TOC */}
        <nav className="toc">
          <div className="toc-label">Table of Contents</div>
          <ul>
            {tocItems.map(({ id, Icon, label }) => (
              <li key={id}>
                <button
                  className={`toc-link${activeSection === id ? " active" : ""}`}
                  onClick={() => scrollTo(id)}
                >
                  <Icon size={14} style={{ flexShrink: 0 }} />
                  {label[lang]}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        {/* CONTENT */}
        <AnimatePresence mode="wait">
          <motion.div
            key={lang}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
          >

            {/* 1 */}
            <div id="sec1" className="doc-section" ref={(el) => { sectionRefs.current["sec1"] = el; }}>
              <div className="sec-header">
                <div className="sec-num"><FileCheck size={20} /></div>
                <h2>{sec.sec1.title}</h2>
              </div>
              <div className="sec-body">
                {sec.sec1.content.map((p, i) => <p key={i}>{p}</p>)}
                <div className="info-box">
                  <Info size={16} style={{ color: "#7c3aed", flexShrink: 0, marginTop: 2 }} />
                  <p>{sec.sec1.infoBox}</p>
                </div>
              </div>
            </div>

            {/* 2 */}
            <div id="sec2" className="doc-section" ref={(el) => { sectionRefs.current["sec2"] = el; }}>
              <div className="sec-header">
                <div className="sec-num"><Layers size={20} /></div>
                <h2>{sec.sec2.title}</h2>
              </div>
              <div className="sec-body">
                {sec.sec2.content.map((p, i) => <p key={i}>{p}</p>)}
                <ul>{sec.sec2.items.map((item, i) => <li key={i}>{item}</li>)}</ul>
                <div className="success-box">
                  <CheckCircle2 size={16} style={{ color: "#059669", flexShrink: 0, marginTop: 2 }} />
                  <p>{sec.sec2.successBox}</p>
                </div>
              </div>
            </div>

            {/* 3 */}
            <div id="sec3" className="doc-section" ref={(el) => { sectionRefs.current["sec3"] = el; }}>
              <div className="sec-header">
                <div className="sec-num"><UserCog size={20} /></div>
                <h2>{sec.sec3.title}</h2>
              </div>
              <div className="sec-body">
                <p>{sec.sec3.content}</p>
                <ul>{sec.sec3.items.map((item, i) => <li key={i}>{item}</li>)}</ul>
              </div>
            </div>

            {/* 4 */}
            <div id="sec4" className="doc-section" ref={(el) => { sectionRefs.current["sec4"] = el; }}>
              <div className="sec-header">
                <div className="sec-num"><ShieldOff size={20} /></div>
                <h2>{sec.sec4.title}</h2>
              </div>
              <div className="sec-body">
                <p>{sec.sec4.content}</p>
                <ul>{sec.sec4.items.map((item, i) => <li key={i}>{item}</li>)}</ul>
                <div className="info-box">
                  <Info size={16} style={{ color: "#7c3aed", flexShrink: 0, marginTop: 2 }} />
                  <p>{sec.sec4.infoBox}</p>
                </div>
              </div>
            </div>

            {/* 5 */}
            <div id="sec5" className="doc-section" ref={(el) => { sectionRefs.current["sec5"] = el; }}>
              <div className="sec-header">
                <div className="sec-num"><Bot size={20} /></div>
                <h2>{sec.sec5.title}</h2>
              </div>
              <div className="sec-body">
                {sec.sec5.content.map((p, i) => <p key={i}>{p}</p>)}
                <div className="info-box">
                  <Info size={16} style={{ color: "#7c3aed", flexShrink: 0, marginTop: 2 }} />
                  <p>{sec.sec5.infoBox}</p>
                </div>
              </div>
            </div>

            {/* 6 */}
            <div id="sec6" className="doc-section" ref={(el) => { sectionRefs.current["sec6"] = el; }}>
              <div className="sec-header">
                <div className="sec-num"><Copyright size={20} /></div>
                <h2>{sec.sec6.title}</h2>
              </div>
              <div className="sec-body">
                {sec.sec6.content.map((p, i) => <p key={i}>{p}</p>)}
              </div>
            </div>

            {/* 7 */}
            <div id="sec7" className="doc-section" ref={(el) => { sectionRefs.current["sec7"] = el; }}>
              <div className="sec-header">
                <div className="sec-num"><UserX size={20} /></div>
                <h2>{sec.sec7.title}</h2>
              </div>
              <div className="sec-body">
                {sec.sec7.content.map((p, i) => <p key={i}>{p}</p>)}
                <ul>{sec.sec7.items.map((item, i) => <li key={i}>{item}</li>)}</ul>
              </div>
            </div>

            {/* 8 */}
            <div id="sec8" className="doc-section" ref={(el) => { sectionRefs.current["sec8"] = el; }}>
              <div className="sec-header">
                <div className="sec-num"><AlertTriangle size={20} /></div>
                <h2>{sec.sec8.title}</h2>
              </div>
              <div className="sec-body">
                {sec.sec8.content.map((p, i) => <p key={i}>{p}</p>)}
                <div className="info-box">
                  <Info size={16} style={{ color: "#7c3aed", flexShrink: 0, marginTop: 2 }} />
                  <p>{sec.sec8.infoBox}</p>
                </div>
              </div>
            </div>

            {/* 9 */}
            <div id="sec9" className="doc-section" ref={(el) => { sectionRefs.current["sec9"] = el; }}>
              <div className="sec-header">
                <div className="sec-num"><Lock size={20} /></div>
                <h2>{sec.sec9.title}</h2>
              </div>
              <div className="sec-body">
                {sec.sec9.content.map((p, i) => <p key={i}>{p}</p>)}
                <div className="success-box">
                  <CheckCircle2 size={16} style={{ color: "#059669", flexShrink: 0, marginTop: 2 }} />
                  <p>{sec.sec9.successBox}</p>
                </div>
              </div>
            </div>

            {/* 10 */}
            <div id="sec10" className="doc-section" ref={(el) => { sectionRefs.current["sec10"] = el; }}>
              <div className="sec-header">
                <div className="sec-num"><RefreshCw size={20} /></div>
                <h2>{sec.sec10.title}</h2>
              </div>
              <div className="sec-body">
                {sec.sec10.content.map((p, i) => <p key={i}>{p}</p>)}
              </div>
            </div>

            {/* 11 */}
            <div id="sec11" className="doc-section" ref={(el) => { sectionRefs.current["sec11"] = el; }}>
              <div className="sec-header">
                <div className="sec-num"><Gavel size={20} /></div>
                <h2>{sec.sec11.title}</h2>
              </div>
              <div className="sec-body">
                {sec.sec11.content.map((p, i) => <p key={i}>{p}</p>)}
                <div className="info-box">
                  <Info size={16} style={{ color: "#7c3aed", flexShrink: 0, marginTop: 2 }} />
                  <p>{sec.sec11.infoBox}</p>
                </div>
              </div>
            </div>

            {/* 12 */}
            <div id="sec12" className="doc-section" ref={(el) => { sectionRefs.current["sec12"] = el; }}>
              <div className="sec-header">
                <div className="sec-num"><Mail size={20} /></div>
                <h2>{sec.sec12.title}</h2>
              </div>
              <div className="sec-body">
                <p>{sec.sec12.intro}</p>
                <div className="contact-card">
                  <div className="contact-card-left">
                    <div className="contact-avatar"><Shield size={22} /></div>
                    <div>
                      <strong>AI-Productivity Coach — Legal Team</strong>
                      <a href="mailto:info@aiproductivitycoach.com">info@aiproductivitycoach.com</a>
                    </div>
                  </div>
                  <a href="mailto:info@aiproductivitycoach.com" className="contact-btn">
                    <Mail size={14} />{t.contactUs}
                  </a>
                </div>
                <div className="info-box" style={{ marginTop: 16 }}>
                  <Info size={16} style={{ color: "#7c3aed", flexShrink: 0, marginTop: 2 }} />
                  <p>{sec.sec12.infoBox}</p>
                </div>
              </div>
            </div>

          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
