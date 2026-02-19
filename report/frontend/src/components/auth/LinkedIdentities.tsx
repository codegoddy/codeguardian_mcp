/** @format */

'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { identityService, UserIdentity } from '@/services/auth';
import { toast } from '@/lib/toast';
import LoadingSpinner from '@/components/LoadingSpinner';
import ConfirmationModal from '@/components/ui/ConfirmationModal';

// Provider configuration
const PROVIDER_CONFIG: Record<string, { name: string; icon: string; color: string }> = {
  google: {
    name: 'Google',
    icon: '/google-calendar.png',
    color: '#4285F4',
  },
  github: {
    name: 'GitHub',
    icon: '/github.png',
    color: '#171717',
  },
  gitlab: {
    name: 'GitLab',
    icon: '/gitlab.png',
    color: '#FC6D26',
  },
  bitbucket: {
    name: 'Bitbucket',
    icon: '/bitbucket.png',
    color: '#0052CC',
  },
  email: {
    name: 'Email',
    icon: '',
    color: '#6B7280',
  },
};

interface LinkedIdentitiesProps {
  onIdentityChange?: () => void;
}

export default function LinkedIdentities({ onIdentityChange }: LinkedIdentitiesProps) {
  const [identities, setIdentities] = useState<UserIdentity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLinking, setIsLinking] = useState<string | null>(null);
  const [isUnlinking, setIsUnlinking] = useState(false);
  const [canUnlink, setCanUnlink] = useState(false);
  const [identityToUnlink, setIdentityToUnlink] = useState<UserIdentity | null>(null);
  const [showUnlinkModal, setShowUnlinkModal] = useState(false);

  // Fetch identities on mount
  useEffect(() => {
    loadIdentities();
  }, []);

  const loadIdentities = async () => {
    setIsLoading(true);
    try {
      const [identitiesResult, canUnlinkResult] = await Promise.all([
        identityService.getUserIdentities(),
        identityService.canUnlinkIdentities(),
      ]);

      if (identitiesResult.success && identitiesResult.data) {
        setIdentities(identitiesResult.data);
      } else if (identitiesResult.error) {
        toast.error('Failed to load linked accounts', identitiesResult.error);
      }

      if (canUnlinkResult.success && canUnlinkResult.data !== undefined) {
        setCanUnlink(canUnlinkResult.data);
      }
    } catch (error) {
      console.error('Error loading identities:', error);
      toast.error('Failed to load linked accounts');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLinkIdentity = async (provider: 'google' | 'github') => {
    setIsLinking(provider);
    try {
      const scopes = provider === 'google' 
        ? 'https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/calendar.events'
        : 'repo read:user';

      const result = await identityService.linkIdentity(provider, {
        redirectTo: `${window.location.origin}/settings?identity_linked=${provider}`,
        scopes,
      });

      if (!result.success) {
        throw new Error(result.error || 'Failed to link identity');
      }
      
      // The page will redirect to the OAuth provider, so no success toast needed here
    } catch (error) {
      console.error(`Error linking ${provider}:`, error);
      toast.error(
        'Connection Failed',
        error instanceof Error ? error.message : `Failed to connect ${provider}`
      );
      setIsLinking(null);
    }
  };

  const handleUnlinkClick = (identity: UserIdentity) => {
    setIdentityToUnlink(identity);
    setShowUnlinkModal(true);
  };

  const handleConfirmUnlink = async () => {
    if (!identityToUnlink) return;

    setIsUnlinking(true);
    try {
      const result = await identityService.unlinkIdentity(identityToUnlink);

      if (result.success) {
        toast.success(
          'Account Unlinked',
          `Your ${PROVIDER_CONFIG[identityToUnlink.provider]?.name || identityToUnlink.provider} account has been unlinked.`
        );
        await loadIdentities();
        onIdentityChange?.();
      } else {
        throw new Error(result.error || 'Failed to unlink identity');
      }
    } catch (error) {
      console.error('Error unlinking identity:', error);
      toast.error(
        'Unlink Failed',
        error instanceof Error ? error.message : 'Failed to unlink account'
      );
    } finally {
      setIsUnlinking(false);
      setShowUnlinkModal(false);
      setIdentityToUnlink(null);
    }
  };

  const getProviderInfo = (provider: string) => {
    return PROVIDER_CONFIG[provider] || { 
      name: provider.charAt(0).toUpperCase() + provider.slice(1), 
      icon: '',
      color: '#6B7280'
    };
  };

  // Filter out email identity for display (it's the default)
  const oauthIdentities = identities.filter(i => i.provider !== 'email');
  const hasEmailIdentity = identities.some(i => i.provider === 'email');

  // Available providers to link
  const availableProviders = [
    { id: 'google', name: 'Google', disabled: isLinking === 'google' },
    { id: 'github', name: 'GitHub', disabled: isLinking === 'github' },
  ].filter(p => !identities.some(i => i.provider === p.id));

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <LoadingSpinner size="sm" color="black" />
        <span className="ml-3 text-gray-500 text-sm">Loading linked accounts...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Current Linked Accounts */}
      {oauthIdentities.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-gray-700 mb-3">Connected Accounts</h3>
          <div className="space-y-2">
            {oauthIdentities.map((identity) => {
              const providerInfo = getProviderInfo(identity.provider);
              return (
                <div
                  key={identity.identity_id}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200"
                >
                  <div className="flex items-center space-x-3">
                    {providerInfo.icon && (
                      <div className="relative w-8 h-8 flex-shrink-0">
                        <Image
                          src={providerInfo.icon}
                          alt={providerInfo.name}
                          width={32}
                          height={32}
                          className="rounded"
                        />
                      </div>
                    )}
                    <div>
                      <p className="text-sm font-medium text-gray-900">{providerInfo.name}</p>
                      {identity.identity_data?.email && (
                        <p className="text-xs text-gray-500">{identity.identity_data.email}</p>
                      )}
                    </div>
                  </div>
                  {canUnlink && (
                    <button
                      onClick={() => handleUnlinkClick(identity)}
                      className="px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      disabled={isUnlinking}
                    >
                      Unlink
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          {!canUnlink && identities.length > 0 && (
            <p className="mt-2 text-xs text-gray-500">
              You need at least two sign-in methods to unlink an account.
            </p>
          )}
        </div>
      )}

      {/* Email Identity Info */}
      {hasEmailIdentity && (
        <div className="flex items-center space-x-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
          <div className="w-8 h-8 flex items-center justify-center bg-blue-100 rounded">
            <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-900">Email & Password</p>
            <p className="text-xs text-gray-500">Primary sign-in method</p>
          </div>
        </div>
      )}

      {/* Add New Provider */}
      {availableProviders.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-gray-700 mb-3">Link Another Account</h3>
          <div className="flex flex-wrap gap-2">
            {availableProviders.map((provider) => (
              <button
                key={provider.id}
                onClick={() => handleLinkIdentity(provider.id as 'google' | 'github')}
                disabled={provider.disabled || isLinking !== null}
                className="flex items-center space-x-2 px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ border: '1px solid #171717' }}
              >
                {provider.id === 'google' && (
                  <Image src="/google-calendar.png" alt="Google" width={20} height={20} className="rounded" />
                )}
                {provider.id === 'github' && (
                  <Image src="/github.png" alt="GitHub" width={20} height={20} className="rounded" />
                )}
                <span className="text-sm font-medium text-gray-700">
                  {provider.disabled ? 'Connecting...' : `Connect ${provider.name}`}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* No Identities Message */}
      {oauthIdentities.length === 0 && availableProviders.length === 0 && (
        <p className="text-sm text-gray-500 text-center py-4">
          No OAuth accounts linked. Sign in with OAuth to link an account.
        </p>
      )}

      {/* Info Box */}
      <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
        <p className="text-xs text-yellow-800">
          <strong>Why link accounts?</strong> Linking multiple accounts allows you to sign in with any of them 
          and ensures you can still access your account if one login method is unavailable.
        </p>
      </div>

      {/* Unlink Confirmation Modal */}
      <ConfirmationModal
        isOpen={showUnlinkModal}
        onClose={() => {
          setShowUnlinkModal(false);
          setIdentityToUnlink(null);
        }}
        onConfirm={handleConfirmUnlink}
        title="Unlink Account"
        description={`Are you sure you want to unlink your ${
          identityToUnlink ? getProviderInfo(identityToUnlink.provider).name : ''
        } account? You'll no longer be able to sign in with this method.`}
        confirmText="Unlink"
        cancelText="Cancel"
        variant="danger"
        isLoading={isUnlinking}
      />
    </div>
  );
}
