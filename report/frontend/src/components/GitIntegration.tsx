'use client';

import { useState } from 'react';
import { gitIntegrationApi } from '@/services/gitIntegration';

interface GitIntegrationProps {
  projectId: string;
  repositories: string[];
  onRepositoriesUpdate: (repos: string[]) => void;
}

export default function GitIntegration({
  projectId,
  repositories,
  onRepositoriesUpdate,
}: GitIntegrationProps) {
  const [repoUrl, setRepoUrl] = useState('');
  const [provider, setProvider] = useState<'github' | 'gitlab' | 'bitbucket'>('github');
  const [isValidating, setIsValidating] = useState(false);
  const [isSettingUpWebhook, setIsSettingUpWebhook] = useState(false);
  const [validationResult, setValidationResult] = useState<{
    valid: boolean;
    repo_name?: string;
    owner?: string;
    full_name?: string;
    private?: boolean;
    error?: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleValidateRepository = async () => {
    if (!repoUrl.trim()) {
      setError('Please enter a repository URL');
      return;
    }

    setIsValidating(true);
    setError(null);
    setValidationResult(null);

    try {
      const result = await gitIntegrationApi.validateRepository(provider, repoUrl);

      setValidationResult(result);

      if (!result.valid) {
        setError(result.error || 'Repository validation failed');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to validate repository');
    } finally {
      setIsValidating(false);
    }
  };

  const handleSetupWebhooks = async () => {
    if (!validationResult?.valid) {
      setError('Please validate the repository first');
      return;
    }

    setIsSettingUpWebhook(true);
    setError(null);

    try {
      const result = await gitIntegrationApi.setupWebhooks(
        projectId,
        provider,
        repoUrl,
        ['push', 'pull_request']
      );

      if (result.success) {
        // Add repository to the list
        const updatedRepos = [...repositories, repoUrl];
        onRepositoriesUpdate(updatedRepos);

        // Reset form
        setRepoUrl('');
        setValidationResult(null);
        alert('Webhooks configured successfully!');
      } else {
        setError(result.error || 'Failed to setup webhooks');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to setup webhooks');
    } finally {
      setIsSettingUpWebhook(false);
    }
  };

  const handleRemoveRepository = (repo: string) => {
    if (confirm(`Remove repository ${repo}?`)) {
      const updatedRepos = repositories.filter((r) => r !== repo);
      onRepositoriesUpdate(updatedRepos);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-4">Git Repository Management</h3>
        <p className="text-sm text-gray-600 mb-4">
          Connect your Git repositories to enable automated time tracking and deliverable verification.
        </p>
      </div>

      {/* Add Repository Form */}
      <div className="border border-gray-200 rounded-lg p-6 space-y-4">
        <h4 className="font-medium">Add Repository</h4>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Git Provider
          </label>
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value as 'github' | 'gitlab' | 'bitbucket')}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="github">GitHub</option>
            <option value="gitlab">GitLab</option>
            <option value="bitbucket">Bitbucket</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Repository URL
          </label>
          <input
            type="text"
            value={repoUrl}
            onChange={(e) => setRepoUrl(e.target.value)}
            placeholder="https://github.com/username/repo"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
            {error}
          </div>
        )}

        {validationResult && validationResult.valid && (
          <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded">
            <p className="font-medium">✓ Repository validated successfully</p>
            <p className="text-sm mt-1">
              {validationResult.full_name} ({validationResult.private ? 'Private' : 'Public'})
            </p>
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={handleValidateRepository}
            disabled={isValidating || !repoUrl.trim()}
            className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            {isValidating ? 'Validating...' : 'Validate Repository'}
          </button>

          {validationResult?.valid && (
            <button
              onClick={handleSetupWebhooks}
              disabled={isSettingUpWebhook}
              className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:bg-indigo-300 disabled:cursor-not-allowed"
            >
              {isSettingUpWebhook ? 'Setting up...' : 'Setup Webhooks & Add'}
            </button>
          )}
        </div>
      </div>

      {/* Connected Repositories List */}
      {repositories.length > 0 && (
        <div className="border border-gray-200 rounded-lg p-6">
          <h4 className="font-medium mb-4">Connected Repositories</h4>
          <div className="space-y-3">
            {repositories.map((repo, index) => (
              <div
                key={index}
                className="flex items-center justify-between p-3 bg-gray-50 rounded-md"
              >
                <div className="flex items-center gap-3">
                  <svg
                    className="w-5 h-5 text-gray-600"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 0C4.477 0 0 4.477 0 10c0 4.42 2.865 8.17 6.839 9.49.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.463-1.11-1.463-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0110 4.836c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C17.137 18.165 20 14.418 20 10c0-5.523-4.477-10-10-10z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <div>
                    <p className="font-medium text-sm">{repo}</p>
                    <p className="text-xs text-gray-500">Webhooks configured</p>
                  </div>
                </div>
                <button
                  onClick={() => handleRemoveRepository(repo)}
                  className="text-red-600 hover:text-red-800 text-sm font-medium"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Information Box */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h4 className="font-medium text-blue-900 mb-2">How it works</h4>
        <ul className="text-sm text-blue-800 space-y-1">
          <li>• Commits with task references (e.g., &quot;DEVHQ-101&quot;) are automatically tracked</li>
          <li>• Time entries are generated based on commit timestamps</li>
          <li>• Pull requests are linked to deliverables automatically</li>
          <li>• Merged PRs mark deliverables as completed</li>
        </ul>
      </div>
    </div>
  );
}
