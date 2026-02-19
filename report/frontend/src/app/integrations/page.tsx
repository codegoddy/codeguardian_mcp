"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import AuthGuard from "../../components/AuthGuard";
import LoadingSpinner from "../../components/LoadingSpinner";
import Image from "next/image";
import { useIntegrationsBundle } from "../../hooks/useIntegrationsBundle";
import { useDisconnectGit } from "../../hooks/useGitIntegrations";
import ConfirmationModal from "../../components/ui/ConfirmationModal";
import { useConnectTimeTracker, useDisconnectTimeTracker } from "../../hooks/useIntegrations";
import { toast } from "../../lib/toast";
import { authenticatedApiCall } from "../../services/auth";
import { googleCalendarApi } from "../../services/planning";
import { gitIntegrationApi } from "../../services/gitIntegration";
import { useQueryClient } from "@tanstack/react-query";
import { createClient } from "../../utils/supabase/client";

interface CLIToken {
  id: string;
  name: string;
  is_active: boolean;
  created_at: string;
  last_used_at: string | null;
  token_preview: string;
}

interface Integration {
  id: string;
  provider: "github" | "gitlab" | "toggl" | "harvest" | "google_calendar";
  provider_username: string;
  provider_user_id: string;
  api_token?: string;
  connected_at: string;
  is_active: boolean;
  type: "git" | "time_tracking" | "calendar";
}

const INTEGRATION_PROVIDERS = [
  {
    id: "github",
    name: "GitHub",
    type: "git" as const,
    description: "Connect your GitHub repositories to track commits and time automatically",
    logo: "/github.png",
    color: "#171717",
    features: [
      "Automatic commit tracking",
      "Time entry from commit messages",
      "Real-time notifications",
      "Repository webhooks"
    ]
  },
  {
    id: "gitlab",
    name: "GitLab",
    type: "git" as const,
    description: "Integrate GitLab to monitor your development activity and time spent",
    logo: "/gitlab.png",
    color: "#FC6D26",
    comingSoon: true,
    features: [
      "Commit-based time tracking",
      "Merge request monitoring",
      "Pipeline integration",
      "Project webhooks"
    ]
  },
  {
    id: "google_calendar",
    name: "Google Calendar",
    type: "calendar" as const,
    description: "Sync your planned work schedule and get reminders for deliverables",
    logo: "/google-calendar.png",
    color: "#4285F4",
    features: [
      "Sync planned time blocks to calendar",
      "Get notifications before scheduled work",
      "Two-way sync with DevHQ",
      "Automatic event creation and updates"
    ]
  },
  {
    id: "toggl",
    name: "Toggl Track",
    type: "time_tracking" as const,
    description: "Import time entries from your Toggl Track account to sync with DevHQ projects",
    logo: "/toggl-track_logotype_stacked_pink.png",
    color: "#E57CD8",
    features: [
      "Import time entries automatically",
      "Sync with DevHQ projects",
      "User-owned account (your API token)",
      "Real-time time tracking sync"
    ]
  },
  {
    id: "harvest",
    name: "Harvest",
    type: "time_tracking" as const,
    description: "Connect your Harvest account to import time entries and sync with projects",
    logo: "/harvest.png",
    color: "#FA5D00",
    features: [
      "Import time entries from Harvest",
      "Project and task mapping",
      "User-owned account (your API token)",
      "Automatic time sync"
    ]
  }
];

function IntegrationsContent() {
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<'available' | 'connected'>('available');
  const [isConnecting] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [cliTokens, setCLITokens] = useState<CLIToken[]>([]);
  const [loadingTokens, setLoadingTokens] = useState(true);
  const [showApiTokenModal, setShowApiTokenModal] = useState(false);
  const [apiToken, setApiToken] = useState("");
  const [accountId, setAccountId] = useState("");
  
  // Disconnect confirmation modal state
  const [disconnectModal, setDisconnectModal] = useState<{
    isOpen: boolean;
    integrationId: string;
    provider: string;
    type: 'git' | 'time_tracking' | 'calendar';
  }>({
    isOpen: false,
    integrationId: '',
    provider: '',
    type: 'git'
  });
  const [isDisconnecting, setIsDisconnecting] = useState(false);

  const queryClient = useQueryClient();

  // Use the bundled integrations hook - single API call for all integrations
  const { data: bundle, isLoading: isLoadingBundle, isError: isErrorBundle } = useIntegrationsBundle();

  const connectTimeTracker = useConnectTimeTracker();
  const disconnectTimeTracker = useDisconnectTimeTracker();

  const disconnectGit = useDisconnectGit();

  // Show success toast if redirected from GitHub callback
  useEffect(() => {
    if (searchParams.get('success') === 'true') {
      toast.success('Integration Connected!', 'Your integration has been successfully connected.');
      queryClient.invalidateQueries({ queryKey: ['integrations-bundle'] });
    } else if (searchParams.get('error')) {
      toast.error('Integration Failed', searchParams.get('error') || 'Failed to connect integration');
    }
  }, [searchParams, queryClient]);

  // Fetch CLI tokens function
  const fetchCLITokens = async () => {
    try {
      setLoadingTokens(true);
      const response = await authenticatedApiCall('/api/cli/tokens', {
        method: 'GET',
      });

      if (response.success && response.data) {
        setCLITokens(response.data as CLIToken[]);
      }
    } catch (err) {
      console.error('Failed to fetch CLI tokens:', err);
    } finally {
      setLoadingTokens(false);
    }
  };

  // Fetch CLI tokens on mount
  useEffect(() => {
    fetchCLITokens();
  }, []);

  // Extract data from bundle
  const timeTrackerIntegrations = bundle?.time_tracker || [];
  const gitIntegrations = bundle?.git || [];
  const googleCalendarStatus = bundle?.google_calendar || { connected: false };

  // Combine time tracker and git integrations
  const timeTrackerMapped: Integration[] = timeTrackerIntegrations.map(ti => ({
    id: ti.id,
    provider: ti.provider as Integration['provider'],
    provider_username: ti.provider_username || '',
    provider_user_id: ti.provider_username || '',
    connected_at: ti.created_at || new Date().toISOString(),
    is_active: ti.is_active,
    type: 'time_tracking' as const
  }));

  const gitMapped: Integration[] = gitIntegrations.map(gi => ({
    id: gi.id,
    provider: gi.platform as Integration['provider'],
    provider_username: gi.username || '',
    provider_user_id: gi.id,
    connected_at: gi.connected_at || new Date().toISOString(),
    is_active: true,
    type: 'git' as const
  }));

  // Add Google Calendar if connected
  const googleCalendarMapped: Integration[] = googleCalendarStatus.connected ? [{
    id: 'google_calendar',
    provider: 'google_calendar' as const,
    provider_username: googleCalendarStatus.google_email || '',
    provider_user_id: googleCalendarStatus.calendar_id || '',
    connected_at: googleCalendarStatus.last_sync_at || new Date().toISOString(),
    is_active: googleCalendarStatus.sync_enabled || false,
    type: 'calendar' as const
  }] : [];

  const integrations: Integration[] = [...timeTrackerMapped, ...gitMapped, ...googleCalendarMapped];

  const isLoading = isLoadingBundle || loadingTokens;
  const isError = isErrorBundle;
  const error = isError ? 'Failed to load integrations. Please try again.' : null;



  const supabase = createClient();

  const handleConnect = async (providerId: string) => {
    const provider = INTEGRATION_PROVIDERS.find(p => p.id === providerId);
    
    if (provider?.type === 'time_tracking') {
      // For time tracking tools, show API token modal
      setSelectedProvider(providerId);
      setShowApiTokenModal(true);
    } else if (providerId === 'google_calendar') {
      // For Google Calendar, use Supabase OAuth
      try {
        const { error } = await supabase.auth.linkIdentity({
          provider: 'google',
          options: {
            redirectTo: `${window.location.origin}/integrations/callback?provider=google`,
            scopes: 'https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/calendar.events',
          },
        });
        
        if (error) throw error;
      } catch (err) {
        console.error('Failed to connect Google Calendar:', err);
        toast.error('Connection Failed', 'Failed to connect Google Calendar. Please try again.');
      }
    } else if (providerId === 'github') {
      // For GitHub, use backend OAuth flow (not Supabase linkIdentity)
      // This gives us the GitHub API token needed for repository access
      try {
        const clientId = process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID;
        const apiUrl = process.env.NEXT_PUBLIC_API_URL;
        
        if (!clientId) {
          throw new Error('GitHub OAuth not configured');
        }
        if (!apiUrl) {
          throw new Error('API URL not configured');
        }
        
        const redirectUri = `${apiUrl}/api/integrations/git/github/callback`;
        const scope = 'repo read:user admin:repo_hook';
        const state = encodeURIComponent(JSON.stringify({ 
          redirect_to: '/integrations',
          timestamp: Date.now() 
        }));
        
        const githubAuthUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}&state=${state}`;
        
        window.location.href = githubAuthUrl;
      } catch (err) {
        console.error(`Failed to connect GitHub:`, err);
        toast.error('Connection Failed', 'Failed to connect GitHub. Please try again.');
      }
    } else {
      // For other Git providers (GitLab) - coming soon
      toast.info('Coming Soon', `${provider?.name} integration will be available soon!`);
    }
  };

  const handleApiTokenSubmit = async () => {
    if (!apiToken || !selectedProvider) return;
    
    // For Harvest, require account ID
    if (selectedProvider === 'harvest' && !accountId) {
      toast.error('Account ID Required', 'Please enter your Harvest Account ID to continue.');
      return;
    }

    try {
      await connectTimeTracker.mutateAsync({
        provider: selectedProvider as 'toggl' | 'harvest',
        api_token: apiToken,
        account_id: selectedProvider === 'harvest' ? accountId : undefined
      });
      
      toast.success('Connected Successfully!', `${selectedProvider} has been connected to your account.`);
      setShowApiTokenModal(false);
      setApiToken("");
      setAccountId("");
      setSelectedProvider(null);
    } catch (err) {
      console.error(`Failed to save API token:`, err);
      toast.error('Connection Failed', 'Please check your API token and try again.');
    }
  };

  const openDisconnectModal = (integrationId: string, provider: string, type: 'git' | 'time_tracking' | 'calendar') => {
    setDisconnectModal({
      isOpen: true,
      integrationId,
      provider,
      type
    });
  };

  const closeDisconnectModal = () => {
    setDisconnectModal(prev => ({ ...prev, isOpen: false }));
  };

  const handleDisconnectConfirm = async () => {
    const { integrationId, provider, type } = disconnectModal;
    setIsDisconnecting(true);

    try {
      if (type === 'git') {
        await disconnectGit.mutateAsync(provider.toLowerCase());
      } else if (type === 'calendar') {
        await googleCalendarApi.disconnect();
      } else {
        await disconnectTimeTracker.mutateAsync(provider as 'toggl' | 'harvest');
      }
      // Invalidate the integrations bundle to update both tabs
      await queryClient.invalidateQueries({ queryKey: ['integrations-bundle'] });
      toast.success('Disconnected', `${provider} has been disconnected from your account.`);
      closeDisconnectModal();
    } catch (err) {
      console.error(`Failed to disconnect ${provider}:`, err);
      toast.error('Disconnection Failed', `Failed to disconnect ${provider}. Please try again.`);
    } finally {
      setIsDisconnecting(false);
    }
  };

  const isConnected = (providerId: string) => {
    return integrations.some(i => i.provider === providerId && i.is_active);
  };

  const getIntegration = (providerId: string) => {
    return integrations.find(i => i.provider === providerId && i.is_active);
  };

  return (
    <AuthGuard>
      <div className="min-h-screen" style={{ backgroundColor: "#F5F5F5" }}>
        <main>
          <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
            {/* Page Header */}
            <div className="mb-6">
              <h2 className="text-2xl font-normal text-black">Integrations</h2>
              <p className="text-sm text-gray-600 mt-2">
                Connect Git providers for commit tracking and time tracking tools to sync your work hours
              </p>
            </div>

            {/* Tab Navigation */}
            <div className="mb-6">
              <nav className="flex space-x-8">
                <button
                  onClick={() => setActiveTab('available')}
                  className={`py-2 px-1 border-b-2 font-medium text-sm transition-colors duration-200 ${
                    activeTab === 'available'
                      ? 'border-black text-black'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  Available Integrations
                </button>
                <button
                  onClick={() => setActiveTab('connected')}
                  className={`py-2 px-1 border-b-2 font-medium text-sm transition-colors duration-200 ${
                    activeTab === 'connected'
                      ? 'border-black text-black'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  Connected ({integrations.filter(i => i.is_active).length})
                </button>
              </nav>
            </div>

            {/* Error Message */}
            {error && (
              <div className="mb-6 p-4 rounded-lg border-l-4 border-red-500 bg-red-50">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <p className="text-sm text-red-800">{error}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Loading State */}
            {isLoading && (
              <div className="flex items-center justify-center py-12">
                <div className="flex items-center">
                  <LoadingSpinner />
                  <span className="ml-3 text-gray-600">Loading integrations...</span>
                </div>
              </div>
            )}

            {/* Available Integrations Tab */}
            {!isLoading && activeTab === 'available' && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {INTEGRATION_PROVIDERS.map((provider) => {
                  const connected = isConnected(provider.id);
                  const integration = getIntegration(provider.id);

                  return (
                    <div
                      key={provider.id}
                      className="bg-white rounded-2xl p-6 flex flex-col h-full hover:shadow-lg transition-shadow duration-200"
                      style={{ border: '1px solid #171717' }}
                    >
                      {/* Provider Header */}
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center space-x-3">
                          <div className="relative w-12 h-12 flex-shrink-0">
                            <Image
                              src={provider.logo}
                              alt={`${provider.name} logo`}
                              width={48}
                              height={48}
                              className="rounded-lg"
                            />
                          </div>
                          <div>
                            <h3 className="text-lg font-semibold text-gray-900">
                              {provider.name}
                            </h3>
                            {connected && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                                Connected
                              </span>
                            )}
                            {'comingSoon' in provider && provider.comingSoon && !connected && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800">
                                Coming Soon
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Description */}
                      <p className="text-sm text-gray-600 mb-4 flex-grow">
                        {provider.description}
                      </p>

                      {/* Features */}
                      <div className="mb-6">
                        <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">
                          Features
                        </h4>
                        <ul className="space-y-1">
                          {provider.features.map((feature, index) => (
                            <li key={index} className="flex items-start text-sm text-gray-600">
                              <svg className="h-4 w-4 text-green-500 mr-2 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                              </svg>
                              {feature}
                            </li>
                          ))}
                        </ul>
                      </div>

                      {/* Connected Info */}
                      {connected && integration && (
                        <div className="mb-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
                          <div className="text-xs text-gray-600">
                            <div className="flex justify-between mb-1">
                              <span className="font-medium">Username:</span>
                              <span>{integration.provider_username}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="font-medium">Connected:</span>
                              <span>{new Date(integration.connected_at).toLocaleDateString()}</span>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Webhook Permission Notice for GitHub */}
                      {connected && provider.id === 'github' && (
                        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                          <div className="flex items-start gap-2">
                            <svg className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <p className="text-xs text-blue-800">
                              <strong>Auto-webhook Setup:</strong> If you see "webhook setup failed" when creating projects, 
                              please <strong>disconnect and reconnect</strong> GitHub to enable automatic webhook configuration.
                            </p>
                          </div>
                        </div>
                      )}

                      {/* Action Button */}
                      <div className="mt-auto">
                        {connected ? (
                          <button
                            onClick={() => integration && openDisconnectModal(integration.id, provider.name, integration.type)}
                            className="w-full px-4 py-2 text-sm font-medium border rounded-lg transition-all duration-200 hover:scale-105"
                            style={{
                              border: '1px solid #dc2626',
                              color: '#dc2626',
                              backgroundColor: 'white'
                            }}
                          >
                            Disconnect
                          </button>
                        ) : 'comingSoon' in provider && provider.comingSoon ? (
                          <button
                            disabled
                            className="w-full px-4 py-2 text-sm font-medium border rounded-lg cursor-not-allowed opacity-60"
                            style={{
                              border: '1px solid #9ca3af',
                              color: '#6b7280',
                              backgroundColor: '#f3f4f6'
                            }}
                          >
                            Coming Soon
                          </button>
                        ) : (
                          <button
                            onClick={() => handleConnect(provider.id)}
                            className="w-full email-button px-4 py-2 text-sm font-medium transition-all duration-200 hover:scale-105"
                          >
                            Connect {provider.name}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Connected Integrations Tab */}
            {!isLoading && activeTab === 'connected' && (
              <div className="bg-white rounded-2xl p-6">
                {integrations.filter(i => i.is_active).length === 0 ? (
                  <div className="text-center py-12">
                    <div className="text-gray-400 mb-4">
                      <svg className="mx-auto h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                      </svg>
                    </div>
                    <h3 className="text-lg font-medium text-gray-900 mb-2">No integrations connected</h3>
                    <p className="text-gray-500 mb-6">Connect a Git provider to start tracking your commits automatically.</p>
                    <button
                      onClick={() => setActiveTab('available')}
                      className="px-4 py-2 text-sm font-medium email-button"
                    >
                      Browse Available Integrations
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {integrations.filter(i => i.is_active).map((integration) => {
                      const provider = INTEGRATION_PROVIDERS.find(p => p.id === integration.provider);
                      if (!provider) return null;

                      return (
                        <div
                          key={integration.id}
                          className="flex items-center justify-between p-4 border rounded-lg hover:shadow-md transition-shadow"
                          style={{ border: '1px solid #171717' }}
                        >
                          <div className="flex items-center space-x-4">
                            <div className="relative w-10 h-10 flex-shrink-0">
                              <Image
                                src={provider.logo}
                                alt={`${provider.name} logo`}
                                width={40}
                                height={40}
                                className="rounded"
                              />
                            </div>
                            <div>
                              <h4 className="text-base font-semibold text-gray-900">{provider.name}</h4>
                              <p className="text-sm text-gray-600">@{integration.provider_username}</p>
                            </div>
                          </div>
                          <div className="flex items-center space-x-4">
                            <div className="text-right">
                              <p className="text-xs text-gray-500">Connected</p>
                              <p className="text-sm font-medium text-gray-900">
                                {new Date(integration.connected_at).toLocaleDateString()}
                              </p>
                            </div>
                            <button
                              onClick={() => openDisconnectModal(integration.id, provider.name, integration.type)}
                              className="px-3 py-1.5 text-xs font-medium border rounded-lg transition-all duration-200 hover:scale-105"
                              style={{
                                border: '1px solid #dc2626',
                                color: '#dc2626',
                                backgroundColor: 'white'
                              }}
                            >
                              Disconnect
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* CLI Setup Section */}
            <div className="mt-8 bg-white rounded-2xl p-6" style={{ border: '1px solid #171717' }}>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    DevHQ CLI Setup
                  </h3>
                  <p className="text-sm text-gray-600 mt-1">
                    Install our CLI tool to track time directly from your terminal
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                {/* API Token Section */}
                <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h4 className="text-sm font-semibold text-gray-900">API Token</h4>
                      <p className="text-xs text-gray-600 mt-1">
                        Use this token to configure the DevHQ CLI
                      </p>
                    </div>
                    <button
                      onClick={async () => {
                        try {
                          const response = await authenticatedApiCall('/api/cli/generate-token', {
                            method: 'POST',
                          });
                          
                          if (!response.success || !response.data) {
                            throw new Error('Failed to generate token');
                          }
                          
                          // Copy to clipboard
                          const tokenData = response.data as { token: string; token_preview: string; created_at: string };
                          await navigator.clipboard.writeText(tokenData.token);
                          toast.success('Token Generated!', `API token copied to clipboard. Token starts with: ${tokenData.token_preview}...`);
                          
                          // Refresh token list
                          await fetchCLITokens();
                        } catch (err) {
                          console.error('Failed to generate token:', err);
                          toast.error('Generation Failed', 'Could not generate API token. Please try again.');
                        }
                      }}
                      className="px-3 py-1.5 text-xs font-medium rounded-lg transition-all duration-200 hover:scale-105 email-button"
                    >
                      Generate New Token
                    </button>
                  </div>
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                    <p className="text-xs text-yellow-800">
                      <strong>Security Notice:</strong> Your API token will only be shown once when generated. Make sure to copy it immediately.
                    </p>
                  </div>

                  {/* Active Tokens List */}
                  {loadingTokens ? (
                    <div className="mt-4 flex items-center justify-center py-4">
                      <LoadingSpinner size="sm" color="black" />
                      <span className="ml-2 text-sm text-gray-500">Loading tokens...</span>
                    </div>
                  ) : cliTokens.length > 0 ? (
                    <div className="mt-4">
                      <h5 className="text-xs font-semibold text-gray-700 mb-2">Active Tokens</h5>
                      <div className="space-y-2">
                        {cliTokens.map((token) => (
                          <div
                            key={token.id}
                            className="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-lg"
                          >
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <code className="text-xs font-mono bg-gray-100 px-2 py-1 rounded">
                                  {token.token_preview}
                                </code>
                                <span className="text-xs text-gray-500">
                                  Created {new Date(token.created_at).toLocaleDateString()}
                                </span>
                              </div>
                              {token.last_used_at && (
                                <p className="text-xs text-gray-400 mt-1">
                                  Last used: {new Date(token.last_used_at).toLocaleString()}
                                </p>
                              )}
                            </div>
                            <button
                              onClick={async () => {
                                if (!confirm('Are you sure you want to delete this token? This action cannot be undone.')) {
                                  return;
                                }
                                try {
                                  const response = await authenticatedApiCall(`/api/cli/tokens/${token.id}`, {
                                    method: 'DELETE',
                                  });
                                  
                                  if (response.success) {
                                    toast.success('Token Deleted', 'CLI token has been removed');
                                    await fetchCLITokens();
                                  } else {
                                    throw new Error('Failed to delete token');
                                  }
                                } catch (err) {
                                  console.error('Failed to delete token:', err);
                                  toast.error('Delete Failed', 'Could not delete token. Please try again.');
                                }
                              }}
                              className="px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            >
                              Delete
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="mt-4 text-center py-4">
                      <p className="text-xs text-gray-500">No active tokens. Generate one to get started.</p>
                    </div>
                  )}
                </div>

                {/* Installation Instructions */}
                <div className="p-4 border border-gray-200 rounded-lg">
                  <h4 className="text-sm font-semibold text-gray-900 mb-3">Installation</h4>
                  <div className="space-y-3">
                    <div>
                      <p className="text-xs text-gray-600 mb-2">1. Install the CLI:</p>
                      <code className="block bg-gray-900 text-green-400 px-4 py-2 rounded-lg text-xs font-mono overflow-x-auto">
                        curl -fsSL https://www.devhq.site/cli/install.sh | sh
                      </code>
                    </div>
                    <div>
                      <p className="text-xs text-gray-600 mb-2">2. Configure with your API token:</p>
                      <code className="block bg-gray-900 text-green-400 px-4 py-2 rounded-lg text-xs font-mono overflow-x-auto">
                        devhq config set api-token YOUR_TOKEN
                      </code>
                    </div>
                    <div>
                      <p className="text-xs text-gray-600 mb-2">3. Start tracking:</p>
                      <code className="block bg-gray-900 text-green-400 px-4 py-2 rounded-lg text-xs font-mono overflow-x-auto">
                        devhq start TRACKING_CODE
                      </code>
                    </div>
                  </div>
                  <div className="mt-4 pt-4 border-t border-gray-200">
                    <a
                      href="/download"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
                    >
                      View full installation guide
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </a>
                  </div>
                </div>
              </div>
            </div>

            {/* Info Section */}
            <div className="mt-8 bg-blue-50 rounded-2xl p-6 border border-blue-200">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-blue-800">How it works</h3>
                  <div className="mt-2 text-sm text-blue-700">
                    <ul className="list-disc list-inside space-y-1">
                      <li><strong>Git Providers:</strong> Connect using OAuth to track commits automatically</li>
                      <li><strong>Time Tracking Tools:</strong> Use your own API token to import time entries</li>
                      <li>Link repositories and projects to DevHQ</li>
                      <li>Review and approve time entries</li>
                      <li>Track project progress and budget in real-time</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </main>

        {/* API Token Modal */}
        {showApiTokenModal && selectedProvider && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div 
              className="bg-white rounded-lg p-6 w-full max-w-md" 
              style={{ 
                border: '1px solid #171717',
                boxShadow: '2px 2px 0px #171717'
              }}
            >
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-xl font-semibold text-gray-900">
                    Connect {INTEGRATION_PROVIDERS.find(p => p.id === selectedProvider)?.name}
                  </h3>
                  <p className="text-sm text-gray-600 mt-1">
                    Enter your API token to connect your account
                  </p>
                </div>
                <button
                  onClick={() => {
                    setShowApiTokenModal(false);
                    setApiToken("");
                    setSelectedProvider(null);
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  API Token <span className="text-red-500">*</span>
                </label>
                <input
                  type="password"
                  value={apiToken}
                  onChange={(e) => setApiToken(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Enter your API token"
                  style={{ border: '1px solid #171717' }}
                />
                <p className="text-xs text-gray-500 mt-2">
                  Get your API token from your {INTEGRATION_PROVIDERS.find(p => p.id === selectedProvider)?.name} account settings
                </p>
              </div>

              {/* Account ID field for Harvest */}
              {selectedProvider === 'harvest' && (
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Account ID <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={accountId}
                    onChange={(e) => setAccountId(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Enter your Harvest Account ID"
                    style={{ border: '1px solid #171717' }}
                  />
                  <p className="text-xs text-gray-500 mt-2">
                    Find your Account ID in your Harvest account settings
                  </p>
                </div>
              )}

              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4">
                <p className="text-xs text-yellow-800">
                  <strong>Your data, your control:</strong> We securely store your API token (encrypted) and only use it to fetch your time entries. You can disconnect anytime.
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowApiTokenModal(false);
                    setApiToken("");
                    setAccountId("");
                    setSelectedProvider(null);
                  }}
                  className="flex-1 px-4 py-2 text-sm font-medium border rounded-lg"
                  style={{ border: '1px solid #171717' }}
                  disabled={isConnecting}
                >
                  Cancel
                </button>
                <button
                  onClick={handleApiTokenSubmit}
                  disabled={!apiToken || (selectedProvider === 'harvest' && !accountId) || isConnecting}
                  className={`flex-1 px-4 py-2 text-sm font-medium rounded-lg ${
                    apiToken && (selectedProvider !== 'harvest' || accountId) && !isConnecting
                      ? 'email-button' 
                      : 'bg-gray-200 text-gray-500 cursor-not-allowed'
                  }`}
                >
                  {isConnecting ? 'Connecting...' : 'Connect'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Disconnect Confirmation Modal */}
        <ConfirmationModal
          isOpen={disconnectModal.isOpen}
          onClose={closeDisconnectModal}
          onConfirm={handleDisconnectConfirm}
          title={`Disconnect ${disconnectModal.provider}`}
          description={`Are you sure you want to disconnect ${disconnectModal.provider}? This will stop syncing ${
            disconnectModal.type === 'git'
              ? 'commits and time entries'
              : disconnectModal.type === 'calendar'
              ? 'planned time blocks to your calendar'
              : 'time entries'
          } from this provider.`}
          confirmText="Disconnect"
          cancelText="Cancel"
          variant="danger"
          isLoading={isDisconnecting}
        />
      </div>
    </AuthGuard>
  );
}

export default function Integrations() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><LoadingSpinner /></div>}>
      <IntegrationsContent />
    </Suspense>
  );
}
