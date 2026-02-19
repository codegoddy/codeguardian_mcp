import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Login to DevHQ | Automated Retainer Management",
  description: "Access your DevHQ account. Manage retainers, track time, and control git access for your development projects.",
  openGraph: {
    title: "Login to DevHQ",
    description: "Access your DevHQ account to manage retainers and projects.",
    url: "https://www.devhq.site/login",
  },
  twitter: {
    title: "Login to DevHQ",
    description: "Access your DevHQ account to manage retainers and projects.",
  },
};

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
