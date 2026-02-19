'use client';

import { useEffect, useState, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { gitIntegrationApi } from '@/services/gitIntegration';
import { googleCalendarApi } from '@/services/planning';
import { authenticatedApiCall } from '@/services/auth';
import { toast } from 'sonner';

function IntegrationCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();
  const [status, setStatus] = useState('Completing connection...');
  const [error, setError] = useState<string | null>(null);
  const hasAttempted = useRef(false);

  useEffect(() => {
    const handleCallback = async () => {
      // Prevent multiple connection attempts
      if (hasAttempted.current) {
        return;
      }
      hasAttempted.current = true;

      try {
        const provider = searchParams.get('provider');
        const code = searchParams.get('code');
        const errorParam = searchParams.get('error');
        const errorMsg = searchParams.get('message');
        
        if (errorParam) {
          setError(errorMsg || `Connection failed: ${errorParam}`);
          setTimeout(() => router.push('/integrations'), 3000);
          return;
        }
        
        if (!provider) {
          setError('No provider specified');
          setTimeout(() => router.push('/integrations'), 3000);
          return;
        }

        // Handle GitHub via backend OAuth (code-based flow)
        if (provider === 'github') {
          if (!code) {
            setError('No authorization code received. Please try again.');
            setTimeout(() => router.push('/integrations'), 3000);
            return;
          }
          
          setStatus('Connecting GitHub...');
          
          try {
            // Exchange code for token via backend
            const result = await authenticatedApiCall('/api/integrations/git/github/connect', {
              method: 'POST',
              body: JSON.stringify({ code }),
            });
            
            if (!result.success) {
              throw new Error(result.error || 'Failed to connect GitHub');
            }
            
            const data = result.data as { username: string; message: string };
            
            toast.success('GitHub connected!', {
              description: `Connected as ${data.username}`,
            });
            router.push('/integrations?github_connected=true');
            return;
          } catch (setupError) {
            console.error('GitHub setup error:', setupError);
            setError(setupError instanceof Error ? setupError.message : 'Failed to complete GitHub setup.');
            setTimeout(() => router.push('/integrations'), 3000);
            return;
          }
        }

        // Handle Google via Supabase OAuth (token-based flow)
        if (provider === 'google') {
          setStatus('Connecting Google Calendar...');
          
          // Get the current session which should include the OAuth tokens
          const { data: { session }, error: sessionError } = await supabase.auth.getSession();
          
          if (sessionError || !session) {
            setError('Session error. Please try again.');
            setTimeout(() => router.push('/integrations'), 3000);
            return;
          }
          
          const providerToken = session.provider_token;
          const providerRefreshToken = session.provider_refresh_token;
          
          if (!providerToken) {
            setError('No provider token received. Please try again.');
            setTimeout(() => router.push('/integrations'), 3000);
            return;
          }
          
          const googleEmail = session.user?.email;
          const googleUserId = session.user?.id;
          const expiresAt = session.expires_at;
          
          if (googleEmail && googleUserId) {
            try {
              await googleCalendarApi.autoSetup(
                providerToken,
                googleUserId,
                googleEmail,
                providerRefreshToken ?? undefined,
                expiresAt ?? undefined
              );
              
              toast.success('Google Calendar connected!', {
                description: 'Your Google Calendar has been connected successfully.',
              });
              router.push('/integrations?success=true');
              return;
            } catch (setupError) {
              console.error('Google Calendar setup error:', setupError);
              setError('Failed to complete Google Calendar setup.');
              setTimeout(() => router.push('/integrations'), 3000);
              return;
            }
          }
        }

        // If we get here, something went wrong
        setError('Failed to complete connection.');
        setTimeout(() => router.push('/integrations'), 3000);
        
      } catch (error) {
        console.error('Unexpected error in integration callback:', error);
        setError('An unexpected error occurred.');
        setTimeout(() => router.push('/integrations'), 3000);
      }
    };

    handleCallback();
  }, [router, searchParams, supabase]);

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
              {status}
            </h1>
            <div className="flex items-center space-x-2">
              <div className="w-4 h-4 bg-[#ccff00] rounded-full animate-pulse"></div>
              <div className="w-4 h-4 bg-[#ccff00] rounded-full animate-pulse delay-75"></div>
              <div className="w-4 h-4 bg-[#ccff00] rounded-full animate-pulse delay-150"></div>
            </div>
            <p className="text-sm mt-4">
              Please wait while we complete the connection...
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function IntegrationCallbackPage() {
  return (
    <Suspense
      fallback={
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
      }
    >
      <IntegrationCallbackContent />
    </Suspense>
  );
}
