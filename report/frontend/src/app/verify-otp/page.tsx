import { Suspense } from 'react';
import VerifyOTP from '@/components/auth/VerifyOTP';
import { Loader2 } from 'lucide-react';
import Link from 'next/link';
import { Logo } from '@/components/Logo';

export default function VerifyOTPPage() {
  return (
    <main className="min-h-screen bg-white flex flex-col items-center justify-center p-6 relative overflow-hidden">
      {/* Grid Background */}
      <div className="fixed inset-0 z-0 pointer-events-none" style={{ 
        backgroundImage: 'radial-gradient(#e5e7eb 1px, transparent 1px)', 
        backgroundSize: '24px 24px' 
      }} />

      <Link href="/" className="mb-10 hover:opacity-80 transition-opacity z-10">
        <Logo />
      </Link>
      
      <div className="z-10 w-full flex flex-col items-center">
        <Suspense fallback={
          <div className="w-full max-w-md bg-white p-8 border-2 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] flex flex-col items-center justify-center min-h-[400px]">
            <Loader2 className="w-12 h-12 animate-spin text-black mb-4" />
            <p className="font-bold uppercase tracking-widest text-sm">Loading verification...</p>
          </div>
        }>
          <VerifyOTP />
        </Suspense>

        <div className="mt-12 text-xs font-black text-gray-400 uppercase tracking-[0.2em] flex gap-6">
          <Link href="/privacy" className="hover:text-black transition-colors">Privacy</Link>
          <Link href="/terms" className="hover:text-black transition-colors">Terms</Link>
          <Link href="/help" className="hover:text-black transition-colors">Help</Link>
        </div>
      </div>
    </main>
  );
}
