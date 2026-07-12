import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AuthRouteGate } from "@/components/AuthRouteGate";
import { ClientOnly } from "@/components/ClientOnly";
import { OnboardingGate } from "@/components/OnboardingGate";
import { AuthProvider } from "@/lib/auth/AuthProvider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Tableau de bord Triplex Saint-Sauveur",
  description: "Tableau de bord MVP SaaS pour la gestion immobilière locative au Québec.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="fr-CA"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="custom-scrollbar min-h-full flex flex-col">
        <ClientOnly>
          <AuthProvider>
            <AuthRouteGate>
              <OnboardingGate>{children}</OnboardingGate>
            </AuthRouteGate>
          </AuthProvider>
        </ClientOnly>
      </body>
    </html>
  );
}
