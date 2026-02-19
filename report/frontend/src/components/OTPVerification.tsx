"use client";
import Link from "next/link";
import { useState, FormEvent, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { authService, OTPVerify } from "@/services/auth";
import { useAuthStore } from "@/hooks/useAuth";
import { createClient } from "@/utils/supabase/client";
import { Zap } from "lucide-react";
import { toast } from "@/lib/toast";

export default function OTPVerification() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const searchParams = useSearchParams();
  const router = useRouter();
  const email = searchParams.get("email") || "";
  const authStore = useAuthStore();
  const supabase = createClient();

  useEffect(() => {
    if (!email) {
      // Redirect back if no email provided
      router.push("/signup");
    }
  }, [email, router]);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    // Prevent multiple simultaneous submissions
    if (isSubmitting) return;

    setError("");
    setIsLoading(true);
    setIsSubmitting(true);

    try {
      const formData = new FormData(e.currentTarget);
      const otp = formData.get("otp") as string;

      // Basic validation
      if (!otp || otp.length !== 6) {
        throw new Error("Please enter a valid 6-digit OTP");
      }

      const otpData: OTPVerify = { email, otp };
      const response = await authService.verifyOtp(otpData);

      if (response.success && response.data) {
        // Set the Supabase session with the tokens from backend
        if (response.data.access_token && response.data.refresh_token) {
          const { error: sessionError } = await supabase.auth.setSession({
            access_token: response.data.access_token,
            refresh_token: response.data.refresh_token,
          });
          if (sessionError) {
            console.error("Failed to set Supabase session:", sessionError);
            throw new Error("Failed to initialize session");
          }
        }
        
        // OTP verified successfully - update auth store
        authStore.setAuthenticated(true);
        authStore.setUser({
          email: email,
        });
        
        toast.success("Email Verified!", "Redirecting to your dashboard...");
        console.log("OTP verified, login successful, redirecting to dashboard");
        
        // Re-initialize to fetch full user data
        await authStore.initialize();
        
        router.push("/dashboard");
      } else {
        const errorMsg = response.error || "Invalid OTP";
        setError(errorMsg);
        toast.error("Verification Failed", errorMsg);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "An unexpected error occurred";
      setError(errorMsg);
      toast.error("Verification Failed", errorMsg);
    } finally {
      setIsLoading(false);
      setIsSubmitting(false);
    }
  };

  const handleResendOTP = async () => {
    // Prevent multiple simultaneous resend requests
    if (isResending) return;

    setError("");
    setIsResending(true);

    try {
      // For resend, we can call forgotPassword or assume registration
      // TODO: Implement proper resend logic based on context
      const response = await authService.forgotPassword({ email });

      if (response.success) {
        setError("OTP resent successfully");
        toast.success("Code Resent", "Check your email for the new verification code");
      } else {
        const errorMsg = response.error || "Failed to resend OTP";
        setError(errorMsg);
        toast.error("Resend Failed", errorMsg);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Failed to resend OTP";
      setError(errorMsg);
      toast.error("Resend Failed", errorMsg);
    } finally {
      setIsResending(false);
    }
  };

  return (
    <div className="min-h-screen bg-white text-black relative">
      {/* Grid Background */}
      <div className="fixed inset-0 z-0 pointer-events-none" style={{ 
        backgroundImage: 'radial-gradient(#e5e7eb 1px, transparent 1px)', 
        backgroundSize: '24px 24px' 
      }} />

      <header className="relative z-10 w-full border-b-2 border-black bg-white">
        <nav className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <div className="w-10 h-10 bg-black text-white flex items-center justify-center rounded-lg border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,0.2)]">
              <Zap className="w-6 h-6 text-[#ccff00]" fill="#ccff00" />
            </div>
            <span className="text-xl font-bold tracking-tight">DevHQ</span>
          </Link>
          <div className="flex items-center gap-4">
            <Link href="/login" className="text-sm font-bold hover:underline transition-all">
              Login
            </Link>
            <Link href="/signup" className="email-button px-6 py-2.5 text-sm border-2 border-black">
              Sign Up
            </Link>
          </div>
        </nav>
      </header>

      <main className="relative z-10 flex items-center justify-center py-12 px-6">
        <div className="max-w-md w-full bg-white border-2 border-black rounded-2xl p-8 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
          <h1 className="text-3xl font-black text-center mb-4 uppercase tracking-tight">
            Verify Your Email
          </h1>
          <p className="text-center font-medium text-gray-600 mb-8">
            We&apos;ve sent a 6-digit code to <span className="font-bold text-black">{email}</span>. Enter it below to verify your account.
          </p>

          {error && (
            <div className={`px-4 py-3 rounded-lg mb-4 font-bold shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] border-2 border-black ${error.includes("resent") || error.includes("successful") ? "bg-green-100 text-green-900" : "bg-red-100 text-red-900"}`}>
              {error}
            </div>
          )}

          <form className="space-y-6" onSubmit={handleSubmit}>
            <div>
              <label htmlFor="otp" className="block text-sm font-bold mb-2 text-center uppercase tracking-wide">
                Verification Code
              </label>
              <input
                type="text"
                id="otp"
                name="otp"
                className="w-full px-4 py-4 border-2 border-black rounded-lg focus:outline-none focus:ring-2 focus:ring-[#ccff00] focus:border-black text-center text-2xl font-mono tracking-[0.5em] font-bold shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
                placeholder="123456"
                maxLength={6}
                required
                disabled={isLoading}
              />
            </div>
            <button
              type="submit"
              className="w-full px-4 py-3 email-button border-2 border-black disabled:opacity-50 text-base"
              disabled={isLoading}
            >
              {isLoading ? "Verifying..." : "Verify"}
            </button>
          </form>

          <div className="mt-6 text-center space-y-3">
            <button
              type="button"
              className="text-sm font-bold underline hover:text-gray-600 disabled:opacity-50"
              onClick={handleResendOTP}
              disabled={isResending || isLoading}
            >
              {isResending ? "Resending..." : "Resend code"}
            </button>
            <p className="text-sm font-medium">
              Wrong email?{" "}
              <Link href="/signup" className="font-bold underline hover:text-gray-600">
                Change it
              </Link>
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
