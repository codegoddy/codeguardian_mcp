'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Logo } from '@/components/Logo';
import { Loader2, Mail, ArrowLeft, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const response = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || 'Failed to send reset email');
      }

      setSuccess(true);
      toast.success('Reset code sent', {
        description: 'Check your email for the 6-digit code.',
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Something went wrong';
      toast.error('Failed to send reset code', {
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
              Check Your Email
            </h2>
            
            <p className="text-black font-medium mb-2">
              We&apos;ve sent a 6-digit code to
            </p>
            <p className="text-black font-bold mb-6">
              {email}
            </p>
            
            <button
              onClick={() => router.push(`/reset-password?email=${encodeURIComponent(email)}`)}
              className="w-full email-button p-4 font-black text-lg uppercase flex items-center justify-center gap-2 mb-4"
            >
              Enter Reset Code <span aria-hidden="true">&rarr;</span>
            </button>

            <p className="text-sm text-gray-500 mb-4">
              Didn&apos;t receive it? Check your spam folder or{' '}
              <button 
                onClick={() => setSuccess(false)} 
                className="font-bold underline hover:text-black"
              >
                try again
              </button>
            </p>
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
            Reset Password
          </h2>
          <p className="text-center text-gray-600 font-medium mb-8">
            Enter your email to receive a reset code
          </p>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-bold mb-2 uppercase px-4" htmlFor="email">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
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
                  Send Reset Code <span aria-hidden="true">&rarr;</span>
                </>
              )}
            </button>
          </form>

          <div className="mt-8 text-center">
            <p className="text-black font-medium">
              Remember your password?{' '}
              <Link href="/login" className="font-bold underline decoration-2 decoration-[#ccff00] hover:bg-[#ccff00] transition-colors px-1">
                Sign in
              </Link>
            </p>
          </div>
        </div>

        <Link 
          href="/" 
          className="mt-12 text-xs font-black uppercase tracking-[0.2em] text-gray-400 hover:text-black transition-colors flex items-center gap-2"
        >
          <ArrowLeft className="w-3 h-3" />
          Back to Home
        </Link>
      </main>
    </div>
  );
}
