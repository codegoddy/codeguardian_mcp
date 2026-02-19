/** @format */

"use client";

import { usePathname } from "next/navigation";
import { useAuthContext } from "../contexts/AuthContext";
import { useState, useEffect } from "react";
import Sidebar from "./Sidebar";
import RightSidebar from "./RightSidebar";
import Header from "./Header";
import TimeReviewModal from "./TimeReviewModal";
import HelpChatWidget from "./HelpChatWidget";

const authRoutes = [
  "/login",
  "/signup",
  "/forgot-password",
  "/verify-otp",
  "/client-portal/login",
];

function shouldShowLayout(pathname: string): boolean {
  // Don't show layout on landing page
  if (pathname === "/") {
    return false;
  }

  // Don't show layout on auth routes
  if (authRoutes.some((route) => pathname.startsWith(route))) {
    return false;
  }

  // Never show developer layout on client-portal routes
  // Client portal has its own layout/design
  if (pathname.startsWith("/client-portal/")) {
    return false;
  }

  // Don't show layout on contract signing routes
  if (pathname.startsWith("/contracts/sign/")) {
    return false;
  }

  return true;
}

interface AppLayoutProps {
  children: React.ReactNode;
}

export default function AppLayout({ children }: AppLayoutProps) {
  const { isAuthenticated } = useAuthContext();
  const pathname = usePathname();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isTimeReviewModalOpen, setIsTimeReviewModalOpen] = useState(false);
  const [isHelpChatOpen, setIsHelpChatOpen] = useState(false);

  const showLayout =
    shouldShowLayout(pathname) &&
    (isAuthenticated ||
      pathname.startsWith("/client-portal/") ||
      pathname === "/settings");

  // Listen for session stopped events from WebSocket to auto-open review modal
  // This makes the review modal available globally, not just on the dashboard
  useEffect(() => {
    const handleSessionStopped = (event: Event) => {
      const customEvent = event as CustomEvent;
      console.log(
        "[AppLayout] Session stopped event received:",
        customEvent.detail,
      );
      // Open the time review modal immediately
      setIsTimeReviewModalOpen(true);
    };

    window.addEventListener("session-stopped", handleSessionStopped);

    return () => {
      window.removeEventListener("session-stopped", handleSessionStopped);
    };
  }, []);

  return (
    <>
      {showLayout && (
        <>
          <Sidebar
            isOpen={isMobileMenuOpen}
            onClose={() => setIsMobileMenuOpen(false)}
            onHelpClick={() => setIsHelpChatOpen(true)}
          />
          <RightSidebar />
          <Header onMenuClick={() => setIsMobileMenuOpen(true)} />
        </>
      )}
      <main className={showLayout ? "lg:pl-80 lg:pr-96 pt-16 lg:pt-0" : ""}>
        {children}
      </main>

      {/* Global Time Review Modal - opens on any page when session stops */}
      {isAuthenticated && (
        <TimeReviewModal
          isOpen={isTimeReviewModalOpen}
          onClose={() => setIsTimeReviewModalOpen(false)}
        />
      )}

      {/* Global Help Chat Widget */}
      {isAuthenticated && (
        <HelpChatWidget
          isOpen={isHelpChatOpen}
          onClose={() => setIsHelpChatOpen(false)}
        />
      )}
    </>
  );
}
