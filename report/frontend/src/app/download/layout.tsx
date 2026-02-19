import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Download DevHQ CLI | Time Tracking for Developers",
  description: "Download the DevHQ CLI for automated time tracking, git integration, and seamless retainer management. Available for Windows, macOS, and Linux.",
  openGraph: {
    title: "Download DevHQ CLI | Time Tracking for Developers",
    description: "Download the DevHQ CLI for automated time tracking and git integration. Available for all platforms.",
    url: "https://www.devhq.site/download",
  },
  twitter: {
    title: "Download DevHQ CLI | Time Tracking for Developers",
    description: "Download the DevHQ CLI for automated time tracking and git integration. Available for all platforms.",
  },
};

export default function DownloadLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
