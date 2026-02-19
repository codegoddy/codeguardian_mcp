'use client';

import { useEffect, useState, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useConnectGitHub } from '@/hooks/useGitIntegrations';

function GitHubCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const connectGitHub = useConnectGitHub();
  const hasAttempted = useRef(false);

  useEffect(() =>{
    // Prevent multiple connection attempts
    if (hasAttempted.current) {
      return;
    }

    const code = searchParams.get('code');
    const errorParam = searchParams.get('error');

    if (errorParam) {
      setError('GitHub authorization was denied or failed');
      setTimeout(() => {
        router.push('/integrations');
      }, 3000);
      return;
    }

    if (!code) {
      setError('No authorization code received');
      setTimeout(() => {
        router.push('/integrations');
      }, 3000);
      return;
    }

    // Mark as attempted
    hasAttempted.current = true;

    // Exchange code for token
    connectGitHub.mutate(code, {
      onSuccess: (data) => {
        console.log('GitHub connected successfully:', data);
        // Redirect to integrations page with success message
        router.push('/integrations?github_connected=true');
      },
      onError: (err) => {
        console.error('Failed to connect GitHub:', err);
        setError(err.message || 'Failed to connect GitHub');
        setTimeout(() => {
          router.push('/integrations');
        }, 3000);
      },
    });
  }, [searchParams, router, connectGitHub]);


  return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <div className="email-card p-8 max-w-md w-full">
        {error ? (
          <div>
            <h1 className="text-2xl font-black tracking-tighter mb-4">
              Connection Failed
            </h1>
            <p className="text-red-600 mb-4">{error}</p>
            <p className="text-sm">Redirecting to integrations page...</p>
          </div>
        ) : (
          <div>
            <h1 className="text-2xl font-black tracking-tighter mb-4">
              Connecting GitHub...
            </h1>
            <div className="flex items-center space-x-2">
              <div className="w-4 h-4 bg-[#ccff00] rounded-full animate-pulse"></div>
              <div className="w-4 h-4 bg-[#ccff00] rounded-full animate-pulse delay-75"></div>
              <div className="w-4 h-4 bg-[#ccff00] rounded-full animate-pulse delay-150"></div>
            </div>
            <p className="text-sm mt-4">
              Please wait while we connect your GitHub account...
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function GitHubCallbackPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="email-card p-8 max-w-md w-full">
          <h1 className="text-2xl font-black tracking-tighter mb-4">
            Loading...
          </h1>
          <div className="flex items-center space-x-2">
            <div className="w-4 h-4 bg-[#ccff00] rounded-full animate-pulse"></div>
            <div className="w-4 h-4 bg-[#ccff00] rounded-full animate-pulse delay-75"></div>
            <div className="w-4 h-4 bg-[#ccff00] rounded-full animate-pulse delay-150"></div>
          </div>
        </div>
      </div>
    }>
      <GitHubCallbackContent />
    </Suspense>
  );
}
