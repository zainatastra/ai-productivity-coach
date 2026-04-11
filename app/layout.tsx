import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/services/AuthContext";
import { LanguageProvider } from "@/services/LanguageContext";

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Ey Eric! Make me Productive!",
  description: "Optimize your professional life with AI insights.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${inter.className} bg-gray-50 text-gray-800`}>
        <AuthProvider>
          <LanguageProvider>
            {/* Layout now only provides providers and base structure */}
            <div className="min-h-screen">
              {children}
            </div>
          </LanguageProvider>
        </AuthProvider>
      </body>
    </html>
  );
}