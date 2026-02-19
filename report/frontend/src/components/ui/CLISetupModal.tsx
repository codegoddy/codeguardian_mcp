'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { X, Terminal, Copy, CheckCircle, AlertCircle, ExternalLink } from 'lucide-react';
import { useState, useEffect } from 'react';
import { toast } from '../../lib/toast';

interface CLISetupModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function CLISetupModal({
  isOpen,
  onClose,
}: CLISetupModalProps) {
  const [apiToken, setApiToken] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [step, setStep] = useState<'intro' | 'generate' | 'setup'>('intro');

  const handleClose = () => {
    setStep('intro');
    setApiToken('');
    setCopied(false);
    onClose();
  };

  const generateToken = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/cli/generate-token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to generate API token');
      }

      const data = await response.json();
      setApiToken(data.token);
      setStep('setup');
      toast.success('API Token Generated', 'Your CLI token has been created successfully.');
    } catch (err) {
      console.error('Failed to generate token:', err);
      toast.error('Generation Failed', 'Could not generate API token. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success('Copied!', 'Command copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Copy Failed', 'Could not copy to clipboard');
    }
  };

  const getOS = () => {
    const userAgent = window.navigator.userAgent;
    if (userAgent.indexOf('Win') !== -1) return 'windows';
    if (userAgent.indexOf('Mac') !== -1) return 'macos';
    return 'linux';
  };

  const [os, setOS] = useState<'windows' | 'macos' | 'linux'>('linux');

  useEffect(() => {
    setOS(getOS());
  }, []);

  const getInstallCommand = () => {
    // Use environment variable or fallback to placeholder
    const cliBaseUrl = process.env.NEXT_PUBLIC_CLI_BASE_URL || 'https://your-domain.com/cli';
    
    switch (os) {
      case 'macos':
        return `curl -fsSL ${cliBaseUrl}/install-macos.sh | sh`;
      case 'windows':
        return `curl -fsSL ${cliBaseUrl}/install-windows.ps1 | powershell`;
      default:
        return `curl -fsSL ${cliBaseUrl}/install.sh | sh`;
    }
  };

  const getConfigCommand = () => {
    return `devhq config set api-token ${apiToken}`;
  };

  return (
    <Dialog.Root open={isOpen} onOpenChange={handleClose}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50" />
        <Dialog.Content
          className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-lg shadow-xl p-6 w-full max-w-2xl z-50 max-h-[90vh] overflow-y-auto"
          style={{
            border: '1px solid #171717',
            boxShadow: '2px 2px 0px #171717'
          }}
        >
          <div className="flex items-start justify-between mb-6">
            <div>
              <Dialog.Title className="text-xl font-semibold text-gray-900 flex items-center gap-2">
                <Terminal size={24} className="text-purple-600" />
                DevHQ CLI Setup
              </Dialog.Title>
              <Dialog.Description className="text-sm text-gray-600 mt-1">
                {step === 'intro' && 'Set up the CLI for local time tracking'}
                {step === 'generate' && 'Generate your API token'}
                {step === 'setup' && 'Install and configure the CLI'}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button
                className="text-gray-400 hover:text-gray-600 transition-colors"
                aria-label="Close"
                disabled={loading}
              >
                <X size={20} />
              </button>
            </Dialog.Close>
          </div>

          {/* Progress Steps */}
          <div className="flex items-center justify-between mb-8">
            {(['intro', 'generate', 'setup'] as const).map((s, index, steps) => (
              <div key={s} className="flex items-center flex-1">
                <div className="flex flex-col items-center flex-1">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-all ${
                      step === s
                        ? 'bg-purple-600 text-white'
                        : steps.indexOf(step) > index
                        ? 'bg-green-500 text-white'
                        : 'bg-gray-200 text-gray-500'
                    }`}
                  >
                    {steps.indexOf(step) > index ? (
                      <CheckCircle size={16} />
                    ) : (
                      index + 1
                    )}
                  </div>
                  <span className="text-xs mt-1 text-gray-600 capitalize">{s}</span>
                </div>
                {index < steps.length - 1 && (
                  <div
                    className={`h-0.5 flex-1 mx-2 transition-all ${
                      steps.indexOf(step) > index
                        ? 'bg-green-500'
                        : 'bg-gray-200'
                    }`}
                  />
                )}
              </div>
            ))}
          </div>

          <div className="space-y-4">
            {/* Step 1: Introduction */}
            {step === 'intro' && (
              <div className="space-y-4">
                <div className="p-4 bg-purple-50 border border-purple-200 rounded-lg">
                  <h3 className="font-semibold text-purple-900 mb-2">Why use the CLI?</h3>
                  <ul className="text-sm text-purple-800 space-y-2">
                    <li className="flex items-start gap-2">
                      <CheckCircle size={16} className="flex-shrink-0 mt-0.5 text-green-600" />
                      <span><strong>Automatic time tracking</strong> - Start/stop from terminal</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle size={16} className="flex-shrink-0 mt-0.5 text-green-600" />
                      <span><strong>Git integration</strong> - Auto-create commits with tracking codes</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle size={16} className="flex-shrink-0 mt-0.5 text-green-600" />
                      <span><strong>Abandoned session prevention</strong> - Auto-pause after inactivity</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle size={16} className="flex-shrink-0 mt-0.5 text-green-600" />
                      <span><strong>Background daemon</strong> - Survives terminal closure</span>
                    </li>
                  </ul>
                </div>

                <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <h3 className="font-semibold text-blue-900 mb-2">How it works</h3>
                  <div className="text-sm text-blue-800 space-y-2">
                    <p>1. Generate an API token for secure authentication</p>
                    <p>2. Install the DevHQ CLI on your machine</p>
                    <p>3. Configure the CLI with your token</p>
                    <p>4. Start tracking time with <code className="bg-blue-100 px-2 py-0.5 rounded">devhq start WEB-123</code></p>
                  </div>
                </div>

                <button
                  onClick={() => setStep('generate')}
                  className="w-full px-4 py-3 text-sm font-medium purple-button flex items-center justify-center"
                  disabled={loading}
                >
                  Get Started
                </button>
              </div>
            )}

            {/* Step 2: Generate Token */}
            {step === 'generate' && (
              <div className="space-y-4">
                <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <div className="flex items-start gap-2">
                    <AlertCircle size={20} className="flex-shrink-0 text-yellow-600 mt-0.5" />
                    <div className="text-sm text-yellow-800">
                      <p className="font-semibold mb-1">Security Notice</p>
                      <p>Your API token will only be shown once. Make sure to copy and save it securely.</p>
                    </div>
                  </div>
                </div>

                {!apiToken ? (
                  <button
                    onClick={generateToken}
                    className="w-full px-4 py-3 text-sm font-medium purple-button flex items-center justify-center"
                    disabled={loading}
                  >
                    {loading ? 'Generating...' : 'Generate API Token'}
                  </button>
                ) : (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Your API Token
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={apiToken}
                          readOnly
                          className="flex-1 px-4 py-2 border border-gray-300 rounded-lg bg-gray-50 font-mono text-sm"
                          style={{ border: '1px solid #171717' }}
                        />
                        <button
                          onClick={() => copyToClipboard(apiToken)}
                          className="px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                          style={{ border: '1px solid #171717' }}
                        >
                          {copied ? <CheckCircle size={20} className="text-green-600" /> : <Copy size={20} />}
                        </button>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        Keep this token secure. Do not share it publicly.
                      </p>
                    </div>

                    <button
                      onClick={() => setStep('setup')}
                      className="w-full px-4 py-3 text-sm font-medium purple-button flex items-center justify-center"
                    >
                      Continue to Installation
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Step 3: Installation & Setup */}
            {step === 'setup' && apiToken && (
              <div className="space-y-4">
                {/* OS Selector */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Your Operating System
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { value: 'macos' as const, label: 'macOS' },
                      { value: 'linux' as const, label: 'Linux' },
                      { value: 'windows' as const, label: 'Windows' },
                    ].map((option) => (
                      <button
                        key={option.value}
                        onClick={() => setOS(option.value)}
                        className={`px-4 py-2 rounded-lg border-2 text-sm font-medium transition-all ${
                          os === option.value
                            ? 'border-purple-600 bg-purple-50 text-purple-900'
                            : 'border-gray-200 text-gray-700 hover:border-purple-300'
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Installation Command */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    1. Install the CLI
                  </label>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 px-4 py-3 bg-gray-900 text-green-400 rounded-lg font-mono text-sm">
                      {getInstallCommand()}
                    </code>
                    <button
                      onClick={() => copyToClipboard(getInstallCommand())}
                      className="px-3 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                      style={{ border: '1px solid #171717' }}
                    >
                      <Copy size={20} />
                    </button>
                  </div>
                </div>

                {/* Configuration Command */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    2. Configure your API token
                  </label>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 px-4 py-3 bg-gray-900 text-green-400 rounded-lg font-mono text-sm break-all">
                      {getConfigCommand()}
                    </code>
                    <button
                      onClick={() => copyToClipboard(getConfigCommand())}
                      className="px-3 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                      style={{ border: '1px solid #171717' }}
                    >
                      <Copy size={20} />
                    </button>
                  </div>
                </div>

                {/* Usage Examples */}
                <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                  <h3 className="font-semibold text-green-900 mb-3">Quick Start Examples</h3>
                  <div className="space-y-2 text-sm text-green-800">
                    <div>
                      <code className="bg-green-100 px-2 py-1 rounded">devhq start WEB-123</code>
                      <span className="ml-2">- Start tracking time for WEB-123</span>
                    </div>
                    <div>
                      <code className="bg-green-100 px-2 py-1 rounded">devhq stop --complete</code>
                      <span className="ml-2">- Stop and mark deliverable as complete</span>
                    </div>
                    <div>
                      <code className="bg-green-100 px-2 py-1 rounded">devhq pause</code>
                      <span className="ml-2">- Pause active session</span>
                    </div>
                    <div>
                      <code className="bg-green-100 px-2 py-1 rounded">devhq status</code>
                      <span className="ml-2">- View active sessions</span>
                    </div>
                  </div>
                </div>

                {/* Documentation Link */}
                <a
                  href="https://docs.devhq.io/cli"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 text-sm text-purple-600 hover:text-purple-700 transition-colors"
                >
                  <span>View full documentation</span>
                  <ExternalLink size={16} />
                </a>

                <button
                  onClick={handleClose}
                  className="w-full px-4 py-3 text-sm font-medium purple-button"
                >
                  Done
                </button>
              </div>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
