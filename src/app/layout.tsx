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
  applicationName: "Nexbail",
  title: "Nexbail — Gestion immobilière",
  description: "Tableau de bord MVP SaaS pour la gestion immobilière locative au Québec.",
  manifest: "/site.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icons/nexbail-icon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/icons/nexbail-icon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/nexbail-icon-48x48.png", sizes: "48x48", type: "image/png" },
      { url: "/icons/nexbail-icon-192x192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/nexbail-icon-512x512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-icon.png", sizes: "180x180", type: "image/png" }],
  },
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
