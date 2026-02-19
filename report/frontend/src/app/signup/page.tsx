/** @format */

"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthContext } from "@/contexts/AuthContext";
import { Logo } from "@/components/Logo";
import SignupForm from "@/components/auth/SignupForm";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function Signup() {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuthContext();

  useEffect(() => {
    // If user is not authenticated and not loading, redirect to waitlist
    if (!isLoading && !isAuthenticated) {
      router.replace("/waitlist");
    }
  }, [isAuthenticated, isLoading, router]);

  // Show loading state while checking auth
  if (isLoading) {
    return (
      <div className="min-h-screen bg-white text-black relative flex items-center justify-center">
        <div className="fixed inset-0 z-0 pointer-events-none" style={{
          backgroundImage: 'radial-gradient(#e5e7eb 1px, transparent 1px)',
          backgroundSize: '24px 24px'
        }} />
        <div className="relative z-10">
          <div className="animate-pulse text-xl font-bold">Loading...</div>
        </div>
      </div>
    );
  }

  // If not authenticated, don't render the signup form (will redirect)
  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="min-h-screen bg-white text-black relative">
      {/* Grid Background - Same as landing page */}
      <div className="fixed inset-0 z-0 pointer-events-none" style={{
        backgroundImage: 'radial-gradient(#e5e7eb 1px, transparent 1px)',
        backgroundSize: '24px 24px'
      }} />


      <main className="relative z-10 flex flex-col items-center justify-center min-h-screen px-6 py-12">
        <Link href="/" className="mb-10 hover:opacity-80 transition-opacity">
          <Logo />
        </Link>

        <div className="w-full flex flex-col items-center">
            <SignupForm />

            <Link
              href="/"
              className="mt-12 text-xs font-black uppercase tracking-[0.2em] text-gray-400 hover:text-black transition-colors flex items-center gap-2"
            >
              <ArrowLeft className="w-3 h-3" />
              Back to Home
            </Link>
        </div>
      </main>
    </div>
  );
}
