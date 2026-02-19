'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { Loader2, Github, Gitlab, Eye, EyeOff } from 'lucide-react';
import type { AuthError } from '@supabase/supabase-js';
import Link from 'next/link';
import { authService } from '@/services/auth';
import { toast } from 'sonner';

export default function SignupForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const supabase = createClient();

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await authService.register({
        email,
        password,
        full_name: fullName,
      });
      
      if (!response.success) {
        throw new Error(response.error || 'Failed to sign up');
      }

      toast.success('Registration successful!', {
        description: 'Please check your email for the verification code.',
      });

      // Redirect to verification page with email in query
      // This matches the backend workflow which sends an OTP
      router.push(`/verify-otp?email=${encodeURIComponent(email)}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to sign up';
      setError(msg);
      toast.error('Signup failed', {
        description: msg,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleOAuthLogin = async (provider: 'github' | 'google' | 'gitlab') => {
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: `${location.origin}/auth/callback`,
        },
      });
      if (error) throw error;
    } catch (err) {
      const error = err as AuthError;
      setError(error.message || `Failed to sign up with ${provider}`);
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md bg-white p-8 border-2 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
      <h2 className="text-3xl font-black mb-8 text-black text-center uppercase tracking-tighter">
        Get Started
      </h2>

      {error && (
        <div className="mb-6 p-4 bg-red-100 border-2 border-red-500 text-red-700 font-bold text-sm">
          {error}
        </div>
      )}

      <div className="space-y-4 mb-8">
        <button
          onClick={() => handleOAuthLogin('github')}
          disabled={loading}
          className="w-full flex items-center justify-center gap-3 oauth-button p-3 font-bold disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Github className="w-5 h-5 text-black" />
          Sign up with GitHub
        </button>
        <button
          onClick={() => handleOAuthLogin('google')}
          disabled={loading}
          className="w-full flex items-center justify-center gap-3 oauth-button p-3 font-bold disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              fill="#4285F4"
            />
            <path
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              fill="#34A853"
            />
            <path
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              fill="#FBBC05"
            />
            <path
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              fill="#EA4335"
            />
          </svg>
          Sign up with Google
        </button>
        <button
          onClick={() => handleOAuthLogin('gitlab')}
          disabled={loading}
          className="w-full flex items-center justify-center gap-3 oauth-button p-3 font-bold disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Gitlab className="w-5 h-5 text-[#FC6D26]" />
          Sign up with GitLab
        </button>
      </div>

      <div className="relative mb-8">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t-2 border-black"></div>
        </div>
        <div className="relative flex justify-center text-sm">
          <span className="px-4 bg-white text-black font-bold">OR</span>
        </div>
      </div>

      <form onSubmit={handleSignup} className="space-y-6">
        <div>
          <label className="block text-sm font-bold mb-2 uppercase px-4" htmlFor="name">
            Full Name
          </label>
          <input
            id="name"
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            autoComplete="name"
            className="w-full p-3 border-2 border-black font-medium focus:outline-none focus:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-shadow rounded-full px-6"
            required
            placeholder="John Doe"
          />
        </div>

        <div>
          <label className="block text-sm font-bold mb-2 uppercase px-4" htmlFor="email">
            Email Address
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            className="w-full p-3 border-2 border-black font-medium focus:outline-none focus:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-shadow rounded-full px-6"
            required
            placeholder="john@example.com"
          />
        </div>

        <div>
           <label className="block text-sm font-bold mb-2 uppercase px-4" htmlFor="password">
              Password
            </label>
          <div className="relative">
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              className="w-full p-3 border-2 border-black font-medium focus:outline-none focus:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-shadow rounded-full px-6 pr-12"
              required
              placeholder="••••••••"
              minLength={6}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-4 top-1/2 -translate-y-1/2 p-1 text-gray-500 hover:text-black transition-colors"
            >
              {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
            </button>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full email-button p-4 font-black text-lg uppercase flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? (
            <Loader2 className="w-6 h-6 animate-spin" />
          ) : (
            <>
              Create Account <span aria-hidden="true">&rarr;</span>
            </>
          )}
        </button>
      </form>

      <div className="mt-8 text-center">
        <p className="text-black font-medium">
          Already have an account?{' '}
          <Link href="/login" className="font-bold underline decoration-2 decoration-[#ccff00] hover:bg-[#ccff00] transition-colors px-1">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
