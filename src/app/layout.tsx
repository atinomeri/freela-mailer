import type { Metadata, Viewport } from "next";
import { Inter, Noto_Sans_Georgian } from "next/font/google";
import "./globals.css";
import { ToastProvider } from "@/components/ui/toast";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";

export const runtime = "nodejs";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#5c6cf9" },
    { media: "(prefers-color-scheme: dark)", color: "#5c6cf9" }
  ]
};

const inter = Inter({ subsets: ["latin", "cyrillic"], display: "swap", variable: "--font-inter" });
const georgian = Noto_Sans_Georgian({ subsets: ["georgian"], display: "swap", variable: "--font-georgian" });

export const metadata: Metadata = {
  title: { default: "Freela Mailer", template: "%s | Freela Mailer" },
  description: "Email campaign management"
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const messages = await getMessages();

  const themeInitScript = `
(() => {
  try {
    const key = "freela-mailer-theme";
    const stored = window.localStorage.getItem(key);
    const theme = stored === "light" || stored === "dark" ? stored : "light";
    const root = window.document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(theme);
  } catch {}
})();
`.trim();

  return (
    <html lang={locale} className={`${inter.variable} ${georgian.variable} light`} suppressHydrationWarning>
      <head>
        <meta name="mobile-web-app-capable" content="yes" />
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-dvh font-sans antialiased">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <ToastProvider>{children}</ToastProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
