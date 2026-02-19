
import type { Metadata } from "next";
// import { Inter } from "next/font/google";
import { Providers } from "../contexts/AuthContext";
import ToastProvider from "../components/ui/ToastProvider";
import AppLayout from "../components/AppLayout";
import { WebSocketProvider } from "../components/WebSocketProvider";
import "./globals.css";

// const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL("https://www.devhq.site"),
  title: "DevHQ - Stop Scope Creep & Get Paid | Automated Retainer Management for Developers",
  description: "Financial and project guardrails for developers and app builders. Automated retainer monitoring, access control, and auto-refill payments. Stop chasing invoices and protect your work until it's paid for.",
  alternates: {
    canonical: "/",
  },
  verification: {
    google: "13raNQ3w-hBeP6Mih7onwSwB-8R2lYwSCqfpHv_qpQ8",
  },
  keywords: [
    "retainer management",
    "scope creep prevention",
    "developer payments",
    "automated billing",
    "project management",
    "git access control",
    "freelance developer tools",
    "client payment automation",
    "WordPress developer tools",
    "app builder payments"
  ],
  authors: [{ name: "DevHQ" }],
  creator: "DevHQ",
  publisher: "DevHQ",
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://www.devhq.site/",
    siteName: "DevHQ",
    title: "DevHQ - Stop Scope Creep & Get Paid",
    description: "Financial and project guardrails for developers and app builders. Automated retainer monitoring, access control, and auto-refill payments.",
    images: [
      {
        url: "/dashboard-mockup.png",
        width: 1200,
        height: 630,
        alt: "DevHQ Dashboard - Automated Retainer Management",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "DevHQ - Stop Scope Creep & Get Paid",
    description: "Financial and project guardrails for developers and app builders. Automated retainer monitoring, access control, and auto-refill payments.",
    images: ["/dashboard-mockup.png"],
    creator: "@devhq",
  },
  icons: {
    icon: [
      {
        url: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'%3E%3Cpath d='M20 40V22L36 13V31L20 40Z' fill='%23111111'/%3E%3Cpath d='M20 40L4 31V13L20 22V40Z' fill='black'/%3E%3Cpath d='M20 22L36 13L20 4L4 13L20 22Z' fill='%23ccff00'/%3E%3C/svg%3E",
        type: "image/svg+xml",
      },
    ],
    shortcut: "/dev_logo.png",
    apple: "/dev_logo.png",
  },
  manifest: "/manifest.json",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
      <html lang="en">
        <body
          className="antialiased"
          style={{
            backgroundColor: 'var(--background)',
            color: 'var(--foreground)'
          }}
        >
          <Providers>
            <WebSocketProvider>
              <AppLayout>
                {children}
              </AppLayout>
              <ToastProvider />
            </WebSocketProvider>
          </Providers>
        </body>
      </html>
  );
}
