import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AuthRouteGate } from "@/components/AuthRouteGate";
import { ClientOnly } from "@/components/ClientOnly";
import { AuthProvider } from "@/lib/auth/AuthProvider";
import "./globals.css";

const themeScript = `
(() => {
  try {
    const params = new URLSearchParams(window.location.search);
    const requested = params.get("theme");
    const stored = window.localStorage.getItem("theme");
    const theme = requested === "light" || requested === "dark" ? requested : stored === "light" || stored === "dark" ? stored : "dark";
    document.documentElement.dataset.theme = theme;
  } catch {
    document.documentElement.dataset.theme = "dark";
  }
})();
`;

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
      data-theme="dark"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script id="theme-initializer" dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="custom-scrollbar min-h-full flex flex-col">
        <ClientOnly>
          <AuthProvider>
            <AuthRouteGate>
              {children}
            </AuthRouteGate>
          </AuthProvider>
        </ClientOnly>
      </body>
    </html>
  );
}
