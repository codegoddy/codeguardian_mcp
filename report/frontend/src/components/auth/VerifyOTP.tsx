'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { authService } from '@/services/auth';
import { toast } from 'sonner';
import { useAuthContext } from '@/contexts/AuthContext';
import { createClient } from '@/utils/supabase/client';

export default function VerifyOTP() {
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const { refreshAuth } = useAuthContext();
  const supabase = createClient();
  const searchParams = useSearchParams();
  const email = searchParams.get('email');

  useEffect(() => {
    if (!email) {
      router.push('/signup');
    }
  }, [email, router]);

  const handleChange = (index: number, value: string) => {
    if (value.length > 1) {
      // Handle paste
      const pastedData = value.slice(0, 6).split('');
      const newOtp = [...otp];
      pastedData.forEach((char, i) => {
        if (index + i < 6) newOtp[index + i] = char;
      });
      setOtp(newOtp);
      
      // Auto-focus next input or verify if full
      const nextIndex = Math.min(index + pastedData.length, 5);
      const nextInput = document.getElementById(`otp-${nextIndex}`);
      nextInput?.focus();
      return;
    }

    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);

    // Auto-focus next input
    if (value && index < 5) {
      const nextInput = document.getElementById(`otp-${index + 1}`);
      nextInput?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      const prevInput = document.getElementById(`otp-${index - 1}`);
      prevInput?.focus();
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = otp.join('');
    if (token.length !== 6) {
      setError('Please enter all 6 digits');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await authService.verifyOtp({
        email: email as string,
        otp: token,
      });

      if (!response.success) {
        throw new Error(response.error || 'Verification failed');
      }

      // Set the Supabase session with the tokens from backend
      if (response.data?.access_token && response.data?.refresh_token) {
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: response.data.access_token,
          refresh_token: response.data.refresh_token,
        });
        if (sessionError) {
          console.error('Failed to set Supabase session:', sessionError);
          throw new Error('Failed to initialize session');
        }
      }

      toast.success('Account verified!', {
        description: 'Welcome to DevHQ. Redirecting to dashboard...',
      });

      // Refresh auth state before redirecting to prevent AuthGuard from redirecting to login
      await refreshAuth();
      router.push('/dashboard');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Verification failed';
      setError(msg);
      toast.error('Verification failed', {
        description: msg,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (!email) return;
    setLoading(true);
    setError(null);
    try {
      const response = await authService.resendOtp({
        email: email as string,
      });
      if (!response.success) throw new Error(response.error || 'Failed to resend code');
      
      toast.success('Code resent', {
        description: 'Please check your email for the new 6-digit code.',
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to resend code';
      setError(msg);
      toast.error('Resend failed', {
        description: msg,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md bg-white p-8 border-2 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
      <h2 className="text-3xl font-black mb-4 text-black text-center uppercase tracking-tighter">
        Verify Email
      </h2>
      <p className="text-center text-gray-600 font-bold mb-8">
        We sent a 6-digit code to <span className="text-black">{email}</span>
      </p>

      {error && (
        <div className="mb-6 p-4 bg-red-100 border-2 border-red-500 text-red-700 font-bold text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleVerify} className="space-y-8">
        <div className="flex justify-between gap-2">
          {otp.map((digit, index) => (
            <input
              key={index}
              id={`otp-${index}`}
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              value={digit}
              onChange={(e) => handleChange(index, e.target.value)}
              onKeyDown={(e) => handleKeyDown(index, e)}
              className="w-12 h-14 text-center text-2xl font-black border-2 border-black focus:outline-none focus:bg-[#ccff00] focus:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all"
            />
          ))}
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full email-button p-4 font-black text-lg uppercase flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? (
            <Loader2 className="w-6 h-6 animate-spin" />
          ) : (
            'Verify Account'
          )}
        </button>
      </form>

      <div className="mt-8 text-center">
        <button
          onClick={handleResend}
          disabled={loading}
          className="text-black font-bold underline decoration-2 decoration-[#ccff00] hover:bg-[#ccff00] transition-colors px-1"
        >
          Resend verification code
        </button>
      </div>
    </div>
  );
}
