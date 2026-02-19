'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { Loader2 } from 'lucide-react';
import { gitIntegrationApi } from '@/services/gitIntegration';
import { googleCalendarApi } from '@/services/planning';
import { toast } from 'sonner';

function AuthCallbackContent() {
  const router = useRouter();
  const supabase = createClient();
  const [status, setStatus] = useState('Completing sign in, please wait...');

  useEffect(() => {
    const handleCallback = async () => {
      try {
        // Supabase handles the session exchange automatically on the client side 
        // when the URL contains the access_token in the hash,
        // but for server-side auth support we need to ensure the cookies are set.
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        
        if (sessionError) {
          console.error('Auth callback error:', sessionError);
          router.push('/login?error=auth_callback_failed');
          return;
        }

        if (!session) {
          console.error('No session found');
          router.push('/login?error=no_session');
          return;
        }

        const provider = session.user?.app_metadata?.provider;
        const providerToken = session.provider_token;
        const providerRefreshToken = session.provider_refresh_token;

        // Check if this is an identity linking callback (user already logged in)
        const urlParams = new URLSearchParams(window.location.search);
        const identityLinked = urlParams.get('identity_linked') || urlParams.get('linked');
        
        if (identityLinked) {
          // This is an identity linking flow - redirect to settings with success
          toast.success('Account Linked!', {
            description: `Your ${identityLinked} account has been successfully linked.`,
          });
          router.push('/settings?identity_linked=success');
          return;
        }
        
        // Handle GitHub OAuth signup - Auto-setup GitHub integration
        if (provider === 'github' && providerToken) {
          setStatus('Setting up GitHub integration...');
          
          const githubUsername = session.user?.user_metadata?.user_name || 
                                session.user?.user_metadata?.preferred_username ||
                                session.user?.user_metadata?.name;
          
          if (githubUsername) {
            try {
              await gitIntegrationApi.autoSetupGitHub(providerToken, githubUsername);
              toast.success('GitHub connected!', {
                description: 'Your GitHub account has been automatically connected for repository access.',
              });
            } catch (setupError) {
              console.error('GitHub auto-setup error:', setupError);
              toast.error('GitHub setup pending', {
                description: 'You can connect your GitHub account later from the integrations page.',
              });
            }
          }
        }

        // Handle Google OAuth signup - Auto-setup Google Calendar integration
        if (provider === 'google' && providerToken) {
          setStatus('Setting up Google Calendar integration...');
          
          const googleEmail = session.user?.email;
          const googleUserId = session.user?.id; // Supabase uses Google's sub as the user id
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
                description: 'Your Google Calendar has been automatically connected for planning features.',
              });
            } catch (setupError) {
              console.error('Google Calendar auto-setup error:', setupError);
              toast.error('Google Calendar setup pending', {
                description: 'You can connect your Google Calendar later from the integrations page.',
              });
            }
          }
        }

        // Redirect to dashboard
        router.push('/dashboard');
      } catch (error) {
        console.error('Unexpected error in auth callback:', error);
        router.push('/login?error=auth_callback_failed');
      }
    };

    handleCallback();
  }, [router, supabase.auth]);

  return (
    <main className="min-h-screen bg-[#f0f0f0] flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md bg-white p-8 border-2 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] flex flex-col items-center justify-center min-h-[300px]">
        <Loader2 className="w-16 h-16 animate-spin text-black mb-6" />
        <h2 className="text-2xl font-black text-black uppercase tracking-tighter mb-2">
          Authenticating
        </h2>
        <p className="font-bold text-gray-500 uppercase tracking-widest text-xs">
          {status}
        </p>
      </div>
    </main>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-[#f0f0f0] flex flex-col items-center justify-center p-4">
          <div className="w-full max-w-md bg-white p-8 border-2 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] flex flex-col items-center justify-center min-h-[300px]">
            <Loader2 className="w-16 h-16 animate-spin text-black mb-6" />
            <h2 className="text-2xl font-black text-black uppercase tracking-tighter mb-2">
              Loading...
            </h2>
          </div>
        </main>
      }
    >
      <AuthCallbackContent />
    </Suspense>
  );
}
