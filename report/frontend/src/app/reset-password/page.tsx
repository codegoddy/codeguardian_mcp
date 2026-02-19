'use client';

import { useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Logo } from '@/components/Logo';
import { Loader2, Lock, ArrowLeft, CheckCircle, Eye, EyeOff, KeyRound } from 'lucide-react';
import { toast } from 'sonner';

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const email = searchParams.get('email') || '';

  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    // Validation
    if (otp.length !== 6) {
      toast.error('Invalid code', {
        description: 'Please enter the 6-digit code',
      });
      setIsLoading(false);
      return;
    }

    if (password !== confirmPassword) {
      toast.error('Passwords do not match');
      setIsLoading(false);
      return;
    }

    if (password.length < 8) {
      toast.error('Password too short', {
        description: 'Password must be at least 8 characters',
      });
      setIsLoading(false);
      return;
    }

    try {
      const response = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          token: otp,
          new_password: password,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || 'Failed to reset password');
      }

      setSuccess(true);
      toast.success('Password reset successful!', {
        description: 'You can now log in with your new password.',
      });

      // Redirect to login after 3 seconds
      setTimeout(() => {
        router.push('/login');
      }, 3000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Something went wrong';
      toast.error('Failed to reset password', {
        description: msg,
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-white text-black relative">
        {/* Grid Background */}
        <div 
          className="fixed inset-0 z-0 pointer-events-none" 
          style={{ 
            backgroundImage: 'radial-gradient(#e5e7eb 1px, transparent 1px)', 
            backgroundSize: '24px 24px' 
          }} 
        />

        <main className="relative z-10 flex flex-col items-center justify-center min-h-screen px-6 py-12">
          <Link href="/" className="mb-10 hover:opacity-80 transition-opacity">
            <Logo />
          </Link>

          <div className="w-full max-w-md bg-white p-8 border-2 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] text-center">
            <div className="flex justify-center mb-6">
              <CheckCircle className="h-16 w-16 text-green-500" />
            </div>
            
            <h2 className="text-3xl font-black mb-4 text-black text-center uppercase tracking-tighter">
              Password Reset!
            </h2>
            
            <p className="text-black font-medium mb-6">
              Your password has been successfully reset. You can now log in with your new password.
            </p>
            
            <p className="text-sm text-gray-500 mb-4">
              Redirecting to login page...
            </p>

            <Link
              href="/login"
              className="inline-block w-full email-button p-4 font-black text-lg uppercase text-center"
            >
              Go to Login Now <span aria-hidden="true">&rarr;</span>
            </Link>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white text-black relative">
      {/* Grid Background */}
      <div 
        className="fixed inset-0 z-0 pointer-events-none" 
        style={{ 
          backgroundImage: 'radial-gradient(#e5e7eb 1px, transparent 1px)', 
          backgroundSize: '24px 24px' 
        }} 
      />

      <main className="relative z-10 flex flex-col items-center justify-center min-h-screen px-6 py-12">
        <Link href="/" className="mb-10 hover:opacity-80 transition-opacity">
          <Logo />
        </Link>

        <div className="w-full max-w-md bg-white p-8 border-2 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
          <h2 className="text-3xl font-black mb-2 text-black text-center uppercase tracking-tighter">
            Create New Password
          </h2>
          <p className="text-center text-gray-600 font-medium mb-8">
            {email ? (
              <>
                Enter the code sent to <span className="font-bold text-black">{email}</span>
              </>
            ) : (
              'Enter the code from your email'
            )}
          </p>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* OTP Input */}
            <div>
              <label className="block text-sm font-bold mb-2 uppercase px-4" htmlFor="otp">
                Verification Code
              </label>
              <div className="relative">
                <KeyRound className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  id="otp"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="123456"
                  required
                  className="w-full p-3 pl-12 border-2 border-black font-medium focus:outline-none focus:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-shadow rounded-full text-center text-lg tracking-widest"
                />
              </div>
              <p className="text-xs text-gray-500 mt-2 px-4">
                Enter the 6-digit code from your email
              </p>
            </div>

            {/* New Password */}
            <div>
              <label className="block text-sm font-bold mb-2 uppercase px-4" htmlFor="password">
                New Password
              </label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  minLength={8}
                  className="w-full p-3 pl-12 pr-12 border-2 border-black font-medium focus:outline-none focus:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-shadow rounded-full"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 p-1 text-gray-500 hover:text-black transition-colors"
                >
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-2 px-4">
                Must be at least 8 characters
              </p>
            </div>

            {/* Confirm Password */}
            <div>
              <label className="block text-sm font-bold mb-2 uppercase px-4" htmlFor="confirmPassword">
                Confirm Password
              </label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  id="confirmPassword"
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full p-3 pl-12 border-2 border-black font-medium focus:outline-none focus:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-shadow rounded-full"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full email-button p-4 font-black text-lg uppercase flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <Loader2 className="w-6 h-6 animate-spin" />
              ) : (
                <>
                  Reset Password <span aria-hidden="true">&rarr;</span>
                </>
              )}
            </button>
          </form>

          <div className="mt-8 text-center space-y-2">
            <p className="text-black font-medium">
              Remember your password?{' '}
              <Link href="/login" className="font-bold underline decoration-2 decoration-[#ccff00] hover:bg-[#ccff00] transition-colors px-1">
                Sign in
              </Link>
            </p>
            
            {!email && (
              <p className="text-sm text-gray-500">
                Didn&apos;t receive the code?{' '}
                <Link href="/forgot-password" className="font-bold hover:text-black">
                  Request a new one
                </Link>
              </p>
            )}
          </div>
        </div>

        <Link 
          href="/login" 
          className="mt-12 text-xs font-black uppercase tracking-[0.2em] text-gray-400 hover:text-black transition-colors flex items-center gap-2"
        >
          <ArrowLeft className="w-3 h-3" />
          Back to Login
        </Link>
      </main>
    </div>
  );
}

// Loading fallback
function ResetPasswordLoading() {
  return (
    <div className="min-h-screen bg-white text-black relative">
      <div 
        className="fixed inset-0 z-0 pointer-events-none" 
        style={{ 
          backgroundImage: 'radial-gradient(#e5e7eb 1px, transparent 1px)', 
          backgroundSize: '24px 24px' 
        }} 
      />
      <main className="relative z-10 flex flex-col items-center justify-center min-h-screen px-6 py-12">
        <div className="w-16 h-16 border-4 border-black border-t-transparent rounded-full animate-spin" />
      </main>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<ResetPasswordLoading />}>
      <ResetPasswordForm />
    </Suspense>
  );
}
