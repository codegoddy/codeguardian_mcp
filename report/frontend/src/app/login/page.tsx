/** @format */

"use client";

import { Logo } from "@/components/Logo";
import LoginForm from "@/components/auth/LoginForm";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function Login() {
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
          <LoginForm />
          
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
