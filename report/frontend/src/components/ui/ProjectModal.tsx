'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { X, Users, ChevronRight, ChevronLeft, Check, Sparkles, ExternalLink } from 'lucide-react';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { projectsApi, ProjectCreateWithScopeGuardrail } from '../../services/projects';
import { clientsApi, Client } from '../../services/clients';
import { contractsApi } from '../../services/contracts';
import { templatesApi, ProjectTemplate } from '../../services/templates';
import { aiEstimationApi, TemplateEstimateResponse, DeliverableEstimate } from '../../services/aiEstimation';
import AIEstimationModal from './AIEstimationModal';

import { PROJECT_TEMPLATES, NO_CODE_TEMPLATES } from '../../data/projectTemplates';
import CalendarModal from "./CalendarModal";
import { SelectField, SelectItem } from './index';
import { useSettings } from '../../hooks/useSettings';
import { toast } from '../../lib/toast';

interface ProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onProjectCreated: (projectId: string) => void;
  onClientModalOpen?: () => void;
}

type WizardStep = 'type' | 'details' | 'template' | 'guardrail' | 'contract';
type ProjectType = 'code-based' | 'no-code' | null;

export default function ProjectModal({
  isOpen,
  onClose,
  onProjectCreated,
  onClientModalOpen,
}: ProjectModalProps) {
  const [currentStep, setCurrentStep] = useState<WizardStep>('type');
  const [projectType, setProjectType] = useState<ProjectType>(null);
  const [clients, setClients] = useState<Client[]>([]);
  
  // Get user's currency from settings
  const { data: settings } = useSettings();
  const userCurrency = settings?.default_currency || 'USD';
  
  // Map currency codes to symbols
  const getCurrencyDisplay = (currency: string) => {
    const symbolMap: Record<string, string> = {
      'USD': '$',
      'EUR': '€',
      'GBP': '£',
      'JPY': '¥',
      'CNY': '¥',
      'INR': '₹',
      'AUD': 'A$',
      'CAD': 'C$',
      'CHF': 'CHF',
      'SEK': 'kr',
      'NZD': 'NZ$',
    };
    return symbolMap[currency] || currency;
  };
  
  const currencySymbol = getCurrencyDisplay(userCurrency);
  const [projectTemplates, setProjectTemplates] = useState<ProjectTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<ProjectTemplate | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('Creating project...');
  const [isCalendarModalOpen, setIsCalendarModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    clientId: '',
    name: '',
    description: '',
    startDate: '',
    dueDate: '',
    projectBudget: '',
    autoReplenish: false,
    autoPauseThreshold: '10',
    maxRevisions: '3',
    allowedRepositories: '',
    contractTemplateId: '',
    timeTrackerProvider: '',
    timeTrackerProjectId: '',
    timeTrackerProjectName: '',
  });
  
  // Time tracker state
  const [hasTimeTracker, setHasTimeTracker] = useState(false);
  const [timeTrackerProjects, setTimeTrackerProjects] = useState<Array<{id: string; name: string; client_name: string | null}>>([]);
  const [loadingTimeTrackerProjects, setLoadingTimeTrackerProjects] = useState(false);
  const [timeTrackerProjectsLoaded, setTimeTrackerProjectsLoaded] = useState(false);

  // Git integration state
  const [hasGitIntegration, setHasGitIntegration] = useState(false);
  const [gitRepositories, setGitRepositories] = useState<Array<{id: number; name: string; full_name: string; url: string}>>([]);
  const [loadingGitRepos, setLoadingGitRepos] = useState(false);
  const [gitReposLoaded, setGitReposLoaded] = useState(false);

  // AI estimation state
  const [aiEstimation, setAiEstimation] = useState<TemplateEstimateResponse | null>(null);
  const [showAIModal, setShowAIModal] = useState(false);
  const [loadingAI, setLoadingAI] = useState(false);


  const handleClose = () => {
    setCurrentStep('type');
    setProjectType(null);
    setSelectedTemplate(null);
    setTimeTrackerProjects([]);
    setTimeTrackerProjectsLoaded(false);
    setGitReposLoaded(false);
    setFormData({
      clientId: '',
      name: '',
      description: '',
      startDate: '',
      dueDate: '',
      projectBudget: '',
      autoReplenish: false,
      autoPauseThreshold: '10',
      maxRevisions: '3',
      allowedRepositories: '',
      contractTemplateId: '',
      timeTrackerProvider: '',
      timeTrackerProjectId: '',
      timeTrackerProjectName: '',
    });
    onClose();
  };

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen]);

  // Auto-load Git repositories for code-based projects
  useEffect(() => {
    const loadGitRepos = async () => {
      if (projectType === 'code-based' && !gitReposLoaded && !loadingGitRepos && isOpen) {
        setLoadingGitRepos(true);
        try {
          const { gitIntegrationApi } = await import('../../services/gitIntegration');
          
          // First check if user has any Git integrations
          const integrations = await gitIntegrationApi.listIntegrations();
          const hasGitHubIntegration = integrations.some(i => i.platform === 'github');
          
          if (!hasGitHubIntegration) {
            setHasGitIntegration(false);
            setGitReposLoaded(true);
            setLoadingGitRepos(false);
            return;
          }
          
          // User has integration, now try to fetch repositories
          setHasGitIntegration(true);
          try {
            const repos = await gitIntegrationApi.listRepositories('github');
            setGitRepositories(repos);
          } catch (repoError) {
            console.error('Failed to load GitHub repositories:', repoError);
            // User has integration but couldn't fetch repos (token expired, etc.)
            // Still show as connected, but with empty repo list
            setGitRepositories([]);
          }
          setGitReposLoaded(true);
        } catch (error) {
          console.error('Failed to check Git integrations:', error);
          setHasGitIntegration(false);
          setGitReposLoaded(true);
        } finally {
          setLoadingGitRepos(false);
        }
      }
    };

    loadGitRepos();
  }, [projectType, isOpen, gitReposLoaded, loadingGitRepos]);

  // Auto-load time tracker projects when user has time tracker integration
  useEffect(() => {
    const loadTimeTrackerProjects = async () => {
      if (hasTimeTracker && !timeTrackerProjectsLoaded && !loadingTimeTrackerProjects && isOpen) {
        setLoadingTimeTrackerProjects(true);
        try {
          const { integrationsApi } = await import('../../services/integrations');
          const integrations = await integrationsApi.getTimeTrackerIntegrations();
          if (integrations.length > 0) {
            const provider = integrations[0].provider;
            const projects = await integrationsApi.getTimeTrackerProjects(provider);
            setTimeTrackerProjects(projects);
            setFormData(prev => ({ ...prev, timeTrackerProvider: provider }));
            setTimeTrackerProjectsLoaded(true);
          }
        } catch (error) {
          console.error('Failed to auto-load time tracker projects:', error);
          setTimeTrackerProjectsLoaded(true); // Mark as loaded even on error to prevent retry loop
        } finally {
          setLoadingTimeTrackerProjects(false);
        }
      }
    };

    loadTimeTrackerProjects();
  }, [hasTimeTracker, isOpen, timeTrackerProjectsLoaded, loadingTimeTrackerProjects]);

  const loadData = async () => {
    try {
      const [clientsData, contractTemplateResponse] = await Promise.all([
        clientsApi.getClients(),
        contractsApi.getDefaultTemplate(),
      ]);
      setClients(clientsData.filter(client => client.is_active));
      
      // Set the default/saved template automatically
      if (contractTemplateResponse) {
        setFormData(prev => ({ ...prev, contractTemplateId: contractTemplateResponse.id?.toString() || 'default' }));
      }
      
      // Fetch both system and custom templates from the backend API
      try {
        const [systemTemplates, customTemplates] = await Promise.all([
          templatesApi.getSystemTemplates(),
          templatesApi.getCustomTemplates()
        ]);
        // Combine system templates from backend with custom templates
        setProjectTemplates([...systemTemplates, ...customTemplates]);
      } catch (error) {
        console.error('Failed to fetch templates:', error);
        // Fallback to frontend hardcoded templates if API fails
        const fallbackTemplates = [...PROJECT_TEMPLATES, ...NO_CODE_TEMPLATES];
        setProjectTemplates(fallbackTemplates);
      }
      
      // Check for time tracker integrations
      try {
        const { integrationsApi } = await import('../../services/integrations');
        const integrations = await integrationsApi.getTimeTrackerIntegrations();
        setHasTimeTracker(integrations.length > 0);
      } catch (error) {
        console.error('Failed to check time tracker integrations:', error);
        setHasTimeTracker(false);
      }
    } catch (error) {
      console.error('Failed to load data:', error);
      // Fallback to frontend system templates if everything fails
      setProjectTemplates([...PROJECT_TEMPLATES, ...NO_CODE_TEMPLATES]);
    }
  };

  const handleTemplateSelect = (template: ProjectTemplate) => {
    console.log('[DEBUG] Template selected:', {
      id: template.id,
      name: template.name,
      is_system_template: template.is_system_template,
      template_type: template.template_type,
      milestones_count: template.template_data.milestones?.length || 0
    });
    setSelectedTemplate(template);

    // Pre-fill form data from template
    const templateData = template.template_data;
    setFormData(prev => ({
      ...prev,
      projectBudget: prev.projectBudget || '', // Don't override if already set
      maxRevisions: templateData.max_revisions?.toString() || prev.maxRevisions,
    }));

    // Reset AI estimation state
    setAiEstimation(null);
  };

  const handleAIAccept = async (
    adjustedEstimates: DeliverableEstimate[], 
    saveAsCustom: boolean,
    customName?: string
  ) => {
    if (!selectedTemplate) return;

    // Create project template with adjusted estimates (doesn't modify original)
    const projectTemplate = {
      ...selectedTemplate,
      template_data: {
        ...selectedTemplate.template_data,
        milestones: selectedTemplate.template_data.milestones.map((milestone) => ({
          ...milestone,
          deliverables: milestone.deliverables.map((deliverable) => {
            const aiEstimate = adjustedEstimates.find(e => e.title === deliverable.title);
            return aiEstimate ? {
              ...deliverable,
              estimated_hours: aiEstimate.estimated_hours,
              ai_estimated: true,
              ai_confidence: aiEstimate.confidence,
              ai_reasoning: aiEstimate.reasoning
            } : deliverable;
          })
        }))
      }
    };
    
    // Store for project creation
    setSelectedTemplate(projectTemplate);
    
    // Save as custom template if requested
    if (saveAsCustom && customName) {
      try {
        await templatesApi.createTemplate({
          name: customName,
          description: `Custom version of ${selectedTemplate.name} with AI-adjusted estimates`,
          category: selectedTemplate.category || 'Custom',
          template_type: selectedTemplate.template_type,
          template_data: projectTemplate.template_data,
          is_public: false
        });
        toast.success('Custom Template Saved', 'Your adjusted estimates have been saved as a new template.');
      } catch (error) {
        console.error('Failed to save custom template:', error);
        toast.error('Save Failed', 'Failed to save custom template, but project creation will proceed.');
      }
    }
    
    setShowAIModal(false);
    // Proceed to guardrail step after accepting AI estimates
    setCurrentStep('guardrail');
  };

  const canProceedFromType = projectType !== null;
  const canProceedFromTemplate = selectedTemplate !== null;
  const canProceedFromDetails = formData.name && formData.clientId && formData.startDate && formData.dueDate && formData.projectBudget && clients.length > 0 &&
    // For no-code projects, require time tracker project selection if they have a time tracker
    (projectType === 'code-based' || (!hasTimeTracker || formData.timeTrackerProjectId));
  
  const canProceedFromGuardrail = projectType === 'code-based' 
    ? formData.projectBudget && formData.allowedRepositories
    : formData.projectBudget && formData.maxRevisions;
    
  const canProceedFromContract = true; // Always true since we auto-select the template

  const handleSubmit = async () => {
    // Validate required fields
    if (!formData.name || !formData.clientId || !formData.projectBudget || !formData.startDate || !formData.dueDate || clients.length === 0) {
      toast.error('Missing Required Fields', 'Please fill in all required fields.');
      return;
    }

    // For code-based projects, validate repositories
    if (projectType === 'code-based') {
      if (!formData.allowedRepositories) {
        toast.error('Missing Required Fields', 'Please select a GitHub repository.');
        return;
      }
    }

    // Validate max revisions
    if (!formData.maxRevisions) {
      toast.error('Missing Required Fields', 'Please specify maximum revisions.');
      return;
    }

    setLoading(true);
    setLoadingMessage('Creating project...');

    try {
      // Generate a UUID for project_id
      const generateUUID = () => {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
          const r = (Math.random() * 16) | 0;
          const v = c === 'x' ? r : (r & 0x3) | 0x8;
          return v.toString(16);
        });
      };

      const projectData: ProjectCreateWithScopeGuardrail = {
        project_id: generateUUID(),
        client_id: formData.clientId,
        name: formData.name.trim(),
        description: formData.description?.trim() || null,
        start_date: formData.startDate,
        due_date: formData.dueDate,
        project_budget: parseFloat(formData.projectBudget),
        auto_replenish: formData.autoReplenish,
        auto_pause_threshold: parseFloat(formData.autoPauseThreshold),
        max_revisions: parseInt(formData.maxRevisions),
        // For no-code projects, use empty array for repositories
        allowed_repositories: projectType === 'code-based' 
          ? formData.allowedRepositories.split(',').map(repo => repo.trim()).filter(repo => repo)
          : [],
        contract_template_id: formData.contractTemplateId && formData.contractTemplateId.trim() !== '' && formData.contractTemplateId !== 'default' ? formData.contractTemplateId : null,
      };

      console.log('[DEBUG] Creating project with data:', JSON.stringify(projectData, null, 2));
      // Make API call
      const newProject = await projectsApi.createProjectWithScopeGuardrail(projectData);
      console.log('[DEBUG] Project created successfully:', newProject);

      // Setup webhooks for code-based projects automatically
      if (projectType === 'code-based' && formData.allowedRepositories) {
        try {
          // First, link the repository to the project
          const { gitIntegrationApi } = await import('../../services/gitIntegration');
          
          console.log('[DEBUG] Linking repository to project:', {
            platform: 'github',
            repo_full_name: formData.allowedRepositories,
            project_id: newProject.id
          });
          
          await gitIntegrationApi.linkRepository(
            'github',
            formData.allowedRepositories,
            newProject.id
          );
          
          console.log('[DEBUG] Repository linked successfully');

          // Then setup the webhook
          const { setupGitHubWebhook } = await import('../../services/gitIntegration');
          const webhookResult = await setupGitHubWebhook({
            project_id: newProject.id,
            repo_url: formData.allowedRepositories,
            provider: 'github',
            events: ['push', 'pull_request']
          });

          if (webhookResult.success) {
            toast.success('GitHub Connected!', 'Repository linked and webhook configured automatically');
          } else {
            // Check if error is due to permissions
            const errorMsg = webhookResult.error?.toLowerCase() || '';
            const isPermissionError = errorMsg.includes('permission') || 
                                      errorMsg.includes('scope') || 
                                      errorMsg.includes('access') ||
                                      errorMsg.includes('403') ||
                                      errorMsg.includes('unauthorized');
            
            if (isPermissionError) {
              toast.warning(
                'GitHub Permissions Required',
                'Please reconnect your GitHub account with webhook permissions: Go to Integrations → Disconnect GitHub → Connect GitHub again.'
              );
            } else {
              toast.warning(
                'Webhook Setup Failed',
                `Could not setup webhook: ${webhookResult.error}. You can configure it manually in GitHub settings.`
              );
            }
          }
        } catch (webhookError) {
          console.error('Webhook setup error:', webhookError);
          const errorMsg = (webhookError as Error).message?.toLowerCase() || '';
          const isPermissionError = errorMsg.includes('permission') || 
                                    errorMsg.includes('scope') || 
                                    errorMsg.includes('access') ||
                                    errorMsg.includes('403') ||
                                    errorMsg.includes('unauthorized');
          
          if (isPermissionError) {
            toast.warning(
              'GitHub Permissions Required',
              'Please reconnect your GitHub account with webhook permissions: Go to Integrations → Disconnect GitHub → Connect GitHub again.'
            );
          } else {
            toast.warning(
              'Webhook Setup Failed',
              'Project created successfully but could not setup webhook automatically. You can configure it manually in GitHub repository settings.'
            );
          }
        }
      }

      // If a template was selected, apply it to the project
      if (selectedTemplate) {
        try {
          setLoadingMessage('Applying template...');
          console.log('[DEBUG] Applying template:', selectedTemplate.id, 'to project:', newProject.id);
          console.log('[DEBUG] Selected template details:', {
            id: selectedTemplate.id,
            name: selectedTemplate.name,
            is_system_template: selectedTemplate.is_system_template,
            template_type: selectedTemplate.template_type,
            milestones_count: selectedTemplate.template_data.milestones?.length || 0
          });
          // Pass the template data (which may have AI adjustments) to the API
          const templateResult = await templatesApi.applyTemplateToProject(
            selectedTemplate.id, 
            newProject.id,
            selectedTemplate.template_data
          );
          console.log('[DEBUG] Template application result:', templateResult);
          console.log('[DEBUG] Template applied successfully');
          
          // Notify user about background contract generation
          toast.success(
            'Project Created', 
            'Project created successfully! Contract is being generated and will be sent to the client shortly.'
          );
        } catch (error) {
          console.error('Failed to apply template:', error);
          toast.error('Template Application Failed', 'Project created but template could not be applied.');
        }
      } else {
        console.log('[DEBUG] No template selected for project');
        toast.success('Project Created', 'Your project has been created successfully!');
      }
      
      onProjectCreated(newProject.id);
      handleClose();
    } catch (error) {
      console.error('Failed to create project:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to create project. Please try again.';
      toast.error('Project Creation Failed', errorMessage);
    } finally {
      setLoading(false);
      setLoadingMessage('Creating project...');
    }
  };

  const handleNext = async () => {
    if (currentStep === 'type' && canProceedFromType) {
      // Go to template selection first
      setCurrentStep('template');
    } else if (currentStep === 'template' && canProceedFromTemplate) {
      // Then go to details
      setCurrentStep('details');
    } else if (currentStep === 'details' && canProceedFromDetails) {
      // After details (which has dates), trigger AI estimation
      if (selectedTemplate && formData.startDate && formData.dueDate) {
        // Prevent duplicate calls
        if (loadingAI) return;
        
        setLoadingAI(true);
        try {
          // Get client's hourly rate for budget analysis
          const selectedClient = clients.find(c => c.id === formData.clientId);
          const clientHourlyRate = selectedClient?.default_hourly_rate;
          
          // Parse budget if already entered (from previous step or pre-filled)
          const projectBudget = formData.projectBudget ? parseFloat(formData.projectBudget) : undefined;
          
          const estimation = await aiEstimationApi.estimateTemplate(
            selectedTemplate.template_data,
            projectType === 'code-based' ? 'code' : 'no-code',
            formData.startDate,
            formData.dueDate,
            projectBudget,
            clientHourlyRate
          );
          setAiEstimation(estimation);
          setShowAIModal(true);
        } catch (error) {
          console.error('AI estimation failed:', error);
          const errorMessage = error instanceof Error ? error.message : 'AI service unavailable';
          toast.error('AI Estimation Failed', errorMessage + '. Proceeding with original estimates.');
          // Proceed to guardrail step even if AI fails
          setCurrentStep('guardrail');
        } finally {
          setLoadingAI(false);
        }
      } else {
        // No dates or template, just proceed
        setCurrentStep('guardrail');
      }
    } else if (currentStep === 'guardrail' && canProceedFromGuardrail) {
      setCurrentStep('contract');
    }
  };

  const handleBack = () => {
    if (currentStep === 'contract') {
      setCurrentStep('guardrail');
    } else if (currentStep === 'guardrail') {
      setCurrentStep('details');
    } else if (currentStep === 'details') {
      setCurrentStep('template');
    } else if (currentStep === 'template') {
      setCurrentStep('type');
    }
  };

  const handleDateRangeSelect = (start: Date, end: Date) => {
    // Format dates to YYYY-MM-DD in local timezone to avoid timezone issues
    const formatDate = (date: Date) => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    console.log('[DEBUG] Selected dates:', {
      start: start,
      end: end,
      startFormatted: formatDate(start),
      endFormatted: formatDate(end)
    });

    setFormData(prev => ({ 
      ...prev, 
      startDate: formatDate(start),
      dueDate: formatDate(end)
    }));
  };

  const getStepTitle = () => {
    switch (currentStep) {
      case 'template':
        return 'Choose a Template';
      case 'details':
        return 'Project Details';
      case 'guardrail':
        return 'Scope Guardrail';
      case 'contract':
        return 'Contract Template';
      default:
        return 'Create Project';
    }
  };

  const getStepDescription = () => {
    switch (currentStep) {
      case 'template':
        return 'Select a project template to get started (required)';
      case 'details':
        return 'Basic information about your project';
      case 'guardrail':
        return 'Set budget limits and revision policies';
      case 'contract':
        return 'Select a contract template for auto-generation';
      default:
        return '';
    }
  };

  return (
    <>
      {/* Hide ProjectModal when AI modal is open to prevent event conflicts */}
      <Dialog.Root open={isOpen && !showAIModal} onOpenChange={(open) => { if (!open && !showAIModal) handleClose(); }}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50" />
          <Dialog.Content
            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-lg w-full max-w-2xl z-50 max-h-[90vh] overflow-y-auto"
            style={{
              border: '2px solid #000',
              boxShadow: '4px 4px 0px 0px #000'
            }}
            onPointerDownOutside={(e) => e.preventDefault()}
            onInteractOutside={(e) => e.preventDefault()}
          >
            {/* Header - Sticky like AI Modal */}
            <div className="sticky top-0 bg-white border-b-2 border-black p-6 flex items-center justify-between">
              <div>
                <Dialog.Title className="text-2xl font-black tracking-tighter text-gray-900">
                  {getStepTitle()}
                </Dialog.Title>
                <Dialog.Description className="text-sm text-gray-600 mt-1">
                  {getStepDescription()}
                </Dialog.Description>
              </div>
              <Dialog.Close asChild>
                <button
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                  aria-label="Close"
                  disabled={loading}
                >
                  <X size={24} />
                </button>
              </Dialog.Close>
            </div>
            
            {/* Content with padding */}
            <div className="p-6">

            {/* Progress Steps - Only show after type selection */}
            {currentStep !== 'type' && (
              <div className="flex items-center justify-between mb-8">
                {(['template', 'details', 'guardrail', 'contract'] as WizardStep[]).map((step, index, steps) => (
                <div key={step} className="flex items-center flex-1">
                  <div className="flex flex-col items-center flex-1">
                    <div
                      className={`w-8 h-8 flex items-center justify-center text-sm font-black transition-all border-2 border-black ${
                        currentStep === step
                          ? 'bg-[#ccff00] text-black'
                          : steps.indexOf(currentStep) > index
                          ? 'bg-black text-white'
                          : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      {steps.indexOf(currentStep) > index ? (
                        <Check size={16} strokeWidth={3} />
                      ) : (
                        index + 1
                      )}
                    </div>
                    <span className="text-xs mt-1 font-bold text-gray-600 uppercase tracking-wide">{step}</span>
                  </div>
                  {index < steps.length - 1 && (
                    <div
                      className={`h-0.5 flex-1 mx-2 transition-all ${
                        steps.indexOf(currentStep) > index
                          ? 'bg-black'
                          : 'bg-gray-200'
                      }`}
                    />
                  )}
                </div>
              ))}
              </div>
            )}

            <div className="space-y-4">
              {/* Step 0: Project Type Selection */}
              {currentStep === 'type' && (
                <div className="space-y-6">
                  <div className="mb-4">
                    <p className="text-sm font-medium text-gray-600">
                      Choose how you&apos;ll be working on this project to get the right setup for your workflow.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Code-Based Option */}
                    <button
                      type="button"
                      onClick={() => setProjectType('code-based')}
                      className={`p-6 text-left transition-all ${
                        projectType === 'code-based'
                          ? 'bg-[#ccff00]'
                          : 'bg-white hover:bg-gray-50'
                      }`}
                      style={{
                        border: '2px solid #000',
                        boxShadow: projectType === 'code-based' ? '4px 4px 0px 0px #000' : '2px 2px 0px 0px #000'
                      }}
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div 
                          className="w-12 h-12 flex items-center justify-center bg-black"
                          style={{ border: '2px solid #000' }}
                        >
                          <svg className="w-6 h-6 text-[#ccff00]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                          </svg>
                        </div>
                        {projectType === 'code-based' && (
                          <Check className="text-black" size={24} strokeWidth={3} />
                        )}
                      </div>
                      <h3 className="font-black text-gray-900 mb-2">Code-Based Development</h3>
                      <p className="text-sm font-medium text-gray-600 mb-3">
                        For projects using Git repositories (GitHub, GitLab, Bitbucket)
                      </p>
                      <ul className="text-xs font-bold text-gray-500 space-y-1">
                        <li>• Automatic time tracking from commits</li>
                        <li>• Repository integration</li>
                        <li>• Code-based templates</li>
                        <li>• Scope guardrails with Git tracking</li>
                      </ul>
                    </button>

                    {/* No-Code Option */}
                    <button
                      type="button"
                      onClick={() => setProjectType('no-code')}
                      className={`p-6 text-left transition-all ${
                        projectType === 'no-code'
                          ? 'bg-[#ccff00]'
                          : 'bg-white hover:bg-gray-50'
                      }`}
                      style={{
                        border: '2px solid #000',
                        boxShadow: projectType === 'no-code' ? '4px 4px 0px 0px #000' : '2px 2px 0px 0px #000'
                      }}
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div 
                          className="w-12 h-12 flex items-center justify-center bg-black"
                          style={{ border: '2px solid #000' }}
                        >
                          <svg className="w-6 h-6 text-[#ccff00]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
                          </svg>
                        </div>
                        {projectType === 'no-code' && (
                          <Check className="text-black" size={24} strokeWidth={3} />
                        )}
                      </div>
                      <h3 className="font-black text-gray-900 mb-2">No-Code Platform</h3>
                      <p className="text-sm font-medium text-gray-600 mb-3">
                        For WordPress, Webflow, Wix, or other no-code tools
                      </p>
                      <ul className="text-xs font-bold text-gray-500 space-y-1">
                        <li>• Time tracking via Toggl/Harvest</li>
                        <li>• No-code templates</li>
                        <li>• Manual time entry support</li>
                        <li>• Simplified project setup</li>
                      </ul>
                    </button>
                  </div>

                  {projectType && (
                    <div 
                      className="mt-4 p-3 bg-[#ccff00]"
                      style={{ border: '2px solid #000' }}
                    >
                      <p className="text-sm font-bold text-black">
                        ✓ <strong>{projectType === 'code-based' ? 'Code-Based' : 'No-Code Platform'}</strong> selected. Click Next to continue.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Step 1: Template Selection */}
              {currentStep === 'template' && (
                <div className="space-y-4">
                  {projectTemplates.length === 0 ? (
                    <div className="text-center py-8">
                      <p className="text-gray-500">Loading templates...</p>
                    </div>
                  ) : (
                    <>
                      <div className="mb-4">
                        <p className="text-sm text-gray-600">
                          Choose a template to structure your project with pre-configured milestones and deliverables.
                        </p>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[400px] overflow-y-auto pr-2">
                        {projectTemplates
                          .filter(template => {
                            // Filter templates based on project type
                            if (projectType === 'code-based') {
                              // Show code templates or custom templates without type specified
                              return template.template_type === 'code' || (!template.template_type && !template.is_system_template);
                            } else {
                              // Show no-code templates or custom templates without type specified
                              return template.template_type === 'no-code' || (!template.template_type && !template.is_system_template);
                            }
                          })
                          .map((template) => (
                          <button
                            key={template.id}
                            type="button"
                            onClick={() => handleTemplateSelect(template)}
                            className={`p-4 text-left transition-all ${
                              selectedTemplate?.id === template.id
                                ? 'bg-[#ccff00]'
                                : 'bg-white hover:bg-gray-50'
                            }`}
                            style={{
                              border: '2px solid #000',
                              boxShadow: selectedTemplate?.id === template.id ? '4px 4px 0px 0px #000' : '2px 2px 0px 0px #000'
                            }}
                            disabled={loading}
                          >
                            <div className="flex items-start justify-between mb-2">
                              <div className="flex-1">
                                <h3 className="font-black text-gray-900">{template.name}</h3>
                                {template.is_system_template && (
                                  <span className="text-xs font-bold text-black bg-white px-1 border border-black">PRE-BUILT</span>
                                )}
                                {!template.is_system_template && (
                                  <span className="text-xs font-bold text-white bg-black px-1">CUSTOM</span>
                                )}
                              </div>
                              {selectedTemplate?.id === template.id && (
                                <Check className="text-black flex-shrink-0" size={20} strokeWidth={3} />
                              )}
                            </div>
                            <p className="text-sm font-medium text-gray-600 mb-2 line-clamp-2">{template.description}</p>
                            <div className="flex items-center gap-2 text-xs font-bold text-gray-500">
                              <span className="px-2 py-1 bg-gray-100 border border-black">{template.category}</span>
                              <span>{template.template_data.milestones.length} milestones</span>
                            </div>
                          </button>
                        ))}
                      </div>

                      {selectedTemplate && (
                        <div 
                          className="mt-4 p-3 bg-[#ccff00]"
                          style={{ border: '2px solid #000' }}
                        >
                          <p className="text-sm font-bold text-black">
                            ✓ <strong>{selectedTemplate.name}</strong> selected. Click Next to continue.
                          </p>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* Step 2: Project Details */}
              {currentStep === 'details' && (
                <div className="space-y-4">
                  {selectedTemplate && (
                    <div 
                      className="p-3 bg-black flex items-center gap-2"
                      style={{ border: '2px solid #000' }}
                    >
                      <Sparkles className="text-[#ccff00]" size={16} strokeWidth={3} />
                      <span className="text-sm font-bold text-white">
                        Using template: <strong className="text-[#ccff00]">{selectedTemplate.name}</strong>
                      </span>
                    </div>
                  )}

                  {/* Client Selection */}
                  {clients.length === 0 ? (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Client <span className="text-red-500">*</span>
                      </label>
                      <button
                        type="button"
                        onClick={() => onClientModalOpen?.()}
                        className="w-full px-4 py-2 text-sm font-medium purple-button flex items-center justify-center"
                        disabled={loading}
                      >
                        <Users className="w-4 h-4 mr-2" />
                        Create Your First Client
                      </button>
                      <p className="text-xs text-gray-500 mt-1">
                        You need to create a client before creating a project
                      </p>
                    </div>
                  ) : (
                    <SelectField
                      label="Client"
                      placeholder="Select a client"
                      required
                      disabled={loading}
                      value={formData.clientId}
                      onValueChange={(value) => setFormData(prev => ({ ...prev, clientId: value }))}
                    >
                      {clients.map((client) => (
                        <SelectItem key={client.id} value={client.id}>
                          {client.name} ({client.email})
                        </SelectItem>
                      ))}
                    </SelectField>
                  )}

                  {/* Project Name */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Project Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Enter project name"
                      required
                      disabled={loading}
                      style={{ border: '1px solid #171717' }}
                    />
                  </div>

                  {/* Description */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Description
                    </label>
                    <textarea
                      value={formData.description}
                      onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Brief description of the project"
                      rows={3}
                      disabled={loading}
                      style={{ border: '1px solid #171717' }}
                    />
                  </div>

                  {/* Project Timeline */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Project Timeline <span className="text-red-500">*</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => setIsCalendarModalOpen(true)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-left"
                      disabled={loading}
                      style={{ border: '1px solid #171717' }}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          {formData.startDate && formData.dueDate ? (
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-gray-500">Start:</span>
                                <span className="text-sm font-medium text-gray-900">
                                  {new Date(formData.startDate).toLocaleDateString('en-GB')}
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-gray-500">Due:</span>
                                <span className="text-sm font-medium text-gray-900">
                                  {new Date(formData.dueDate).toLocaleDateString('en-GB')}
                                </span>
                              </div>
                              <div className="text-xs text-gray-500">
                                ({Math.ceil((new Date(formData.dueDate).getTime() - new Date(formData.startDate).getTime()) / (1000 * 60 * 60 * 24)) + 1} days)
                              </div>
                            </div>
                          ) : (
                            <span className="text-gray-500">Select start and due dates</span>
                          )}
                        </div>
                        <svg className="w-5 h-5 text-gray-400 flex-shrink-0 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                      </div>
                    </button>
                    <p className="text-xs text-gray-500 mt-1">
                      Select the project start date and target completion date
                    </p>
                  </div>

                  {/* Project Budget - Moved here for AI estimation */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Project Budget ({userCurrency}) <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-medium">
                        {currencySymbol}
                      </span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={formData.projectBudget}
                        onChange={(e) => setFormData(prev => ({ ...prev, projectBudget: e.target.value }))}
                        className="w-full pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="10000.00"
                        required
                        disabled={loading}
                        style={{ 
                          border: '1px solid #171717',
                          paddingLeft: currencySymbol.length > 1 ? '3.5rem' : '2rem'
                        }}
                      />
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      Used for AI budget analysis and scope guardrails
                    </p>
                  </div>

                  {/* Time Tracker Selection (No-Code Only) */}
                  {projectType === 'no-code' && (
                    <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                      <h4 className="text-sm font-medium text-gray-900 mb-3">
                        Time Tracking Setup <span className="text-red-500">*</span>
                      </h4>
                      {!hasTimeTracker ? (
                        <div className="text-center py-4">
                          <div className="mb-4">
                            <svg className="mx-auto h-12 w-12 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          </div>
                          <p className="text-sm text-gray-900 font-medium mb-2">
                            Time Tracker Required
                          </p>
                          <p className="text-sm text-gray-600 mb-4">
                            No-code projects require a time tracker integration (Toggl or Harvest) to track time entries.
                          </p>
                          <Link
                            href="/integrations"
                            target="_blank"
                            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium email-button"
                          >
                            Configure Time Tracker
                            <ExternalLink size={16} />
                          </Link>
                          <p className="text-xs text-gray-500 mt-3">
                            After configuring, close and reopen this modal
                          </p>
                        </div>
                      ) : (
                        <div>
                          <p className="text-sm text-gray-600 mb-3">
                            Select which time tracker project to link with this DevHQ project.
                          </p>
                          
                          {loadingTimeTrackerProjects ? (
                            <div className="flex items-center justify-center py-4">
                              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-purple-600"></div>
                              <span className="ml-2 text-sm text-gray-600">Loading projects...</span>
                            </div>
                          ) : timeTrackerProjects.length > 0 ? (
                            <div>
                              <SelectField
                                label="Select Time Tracker Project"
                                placeholder="Select a project..."
                                required
                                value={formData.timeTrackerProjectId}
                                onValueChange={(value) => {
                                  const selectedProject = timeTrackerProjects.find(p => p.id === value);
                                  setFormData(prev => ({
                                    ...prev,
                                    timeTrackerProjectId: value,
                                    timeTrackerProjectName: selectedProject?.name || ''
                                  }));
                                }}
                              >
                                {timeTrackerProjects.map((project) => (
                                  <SelectItem key={project.id} value={project.id}>
                                    {project.name} {project.client_name ? `(${project.client_name})` : ''}
                                  </SelectItem>
                                ))}
                              </SelectField>
                              <p className="text-xs text-gray-500 mt-1">
                                Time entries from this project will be synced to DevHQ
                              </p>
                              {!formData.timeTrackerProjectId && (
                                <p className="text-xs text-red-600 mt-2">
                                  Please select a time tracker project to continue
                                </p>
                              )}
                            </div>
                          ) : (
                            <div className="text-center py-4">
                              <p className="text-sm text-gray-500 mb-3">No time tracker projects found</p>
                              <Link
                                href="/integrations"
                                target="_blank"
                                className="inline-flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800"
                              >
                                Check your integration settings
                                <ExternalLink size={14} />
                              </Link>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Step 3: Scope Guardrail */}
              {currentStep === 'guardrail' && (
                <div className="space-y-4">
                  {/* Allowed Repositories (Code-Based Only) */}
                  {projectType === 'code-based' && (
                    <div className="p-4 bg-purple-50 border border-purple-200 rounded-lg">
                      <h4 className="text-sm font-medium text-gray-900 mb-3">
                        Git Integration Setup <span className="text-red-500">*</span>
                      </h4>
                      {!hasGitIntegration ? (
                        <div className="text-center py-4">
                          <div className="mb-4">
                            <svg className="mx-auto h-12 w-12 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                            </svg>
                          </div>
                          <p className="text-sm text-gray-900 font-medium mb-2">
                            GitHub Integration Required
                          </p>
                          <p className="text-sm text-gray-600 mb-4">
                            Code-based projects require a GitHub integration to track commits and manage repositories.
                          </p>
                          <Link
                            href="/integrations"
                            target="_blank"
                            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium email-button"
                          >
                            Connect GitHub
                            <ExternalLink size={14} />
                          </Link>
                        </div>
                      ) : loadingGitRepos ? (
                        <div className="text-center py-4">
                          <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-solid border-purple-600 border-r-transparent"></div>
                          <p className="text-sm text-gray-600 mt-2">Loading repositories...</p>
                        </div>
                      ) : (
                        <div>
                          <div className="flex items-center gap-2 mb-3">
                            <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                            <span className="text-sm text-green-700 font-medium">GitHub Connected</span>
                          </div>
                          {gitRepositories.length > 0 ? (
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-2">
                                Select Repository
                              </label>
                              <SelectField
                                placeholder="Choose a repository"
                                required
                                disabled={loading}
                                value={formData.allowedRepositories}
                                onValueChange={(value) => setFormData(prev => ({ ...prev, allowedRepositories: value }))}
                              >
                                {gitRepositories.map((repo) => (
                                  <SelectItem key={repo.id} value={repo.full_name}>
                                    {repo.full_name}
                                  </SelectItem>
                                ))}
                              </SelectField>
                              <p className="text-xs text-gray-500 mt-2">
                                This repository will be linked to the project for commit tracking
                              </p>
                              {!formData.allowedRepositories && (
                                <p className="text-xs text-red-600 mt-2">
                                  Please select a repository to continue
                                </p>
                              )}
                            </div>
                          ) : (
                            <div className="text-center py-4">
                              <p className="text-sm text-gray-500 mb-3">No repositories found</p>
                              <Link
                                href="/integrations"
                                target="_blank"
                                className="inline-flex items-center gap-2 text-sm text-purple-600 hover:text-purple-800"
                              >
                                Check your integration settings
                                <ExternalLink size={14} />
                              </Link>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Auto-Pause Threshold */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Auto-Pause Threshold (%) <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={formData.autoPauseThreshold}
                      onChange={(e) => setFormData(prev => ({ ...prev, autoPauseThreshold: e.target.value }))}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="10"
                      required
                      disabled={loading}
                      style={{ border: '1px solid #171717' }}
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Project will auto-pause when budget remaining falls below this percentage
                    </p>
                  </div>

                  {/* Max Revisions */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Max Revisions per Deliverable <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={formData.maxRevisions}
                      onChange={(e) => setFormData(prev => ({ ...prev, maxRevisions: e.target.value }))}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="3"
                      required
                      disabled={loading}
                      style={{ border: '1px solid #171717' }}
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Maximum number of revisions included per deliverable
                    </p>
                  </div>

                  {/* Auto-Replenish Toggle */}
                  <div>
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={formData.autoReplenish}
                        onChange={(e) => setFormData(prev => ({ ...prev, autoReplenish: e.target.checked }))}
                        className="mr-2 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        disabled={loading}
                      />
                      <span className="text-sm font-medium text-gray-700">
                        Auto-replenish budget when paused
                      </span>
                    </label>
                    <p className="text-xs text-gray-500 mt-1">
                      Automatically add funds when project budget is low (optional)
                    </p>
                  </div>
                </div>
              )}

              {/* Step 4: Contract Template */}
              {currentStep === 'contract' && (
                <div className="space-y-4">
                  {/* Contract Template Info */}
                  <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                    <div className="flex items-start gap-3">
                      <svg className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <div className="flex-1">
                        <h4 className="text-sm font-semibold text-blue-900 mb-1">
                          Contract Template Ready
                        </h4>
                        <p className="text-sm text-blue-800 mb-2">
                          Your project will use your {formData.contractTemplateId === 'default' ? 'default' : 'custom'} contract template. 
                          The contract will be automatically generated with your project details.
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            window.open('/projects/contract-template', '_blank');
                          }}
                          className="text-sm font-medium text-blue-700 hover:text-blue-900 underline"
                        >
                          Edit contract template in Contract tab →
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Summary */}
                  <div className="mt-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
                    <h4 className="font-semibold text-gray-900 mb-3">Project Summary</h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Project Type:</span>
                        <span className="font-medium text-gray-900">
                          {projectType === 'code-based' ? 'Code-Based Development' : 'No-Code Platform'}
                        </span>
                      </div>
                      {selectedTemplate && (
                        <div className="flex justify-between">
                          <span className="text-gray-600">Template:</span>
                          <span className="font-medium text-gray-900">{selectedTemplate.name}</span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span className="text-gray-600">Project Name:</span>
                        <span className="font-medium text-gray-900">{formData.name || '-'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Client:</span>
                        <span className="font-medium text-gray-900">
                          {clients.find(c => c.id === formData.clientId)?.name || '-'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Budget:</span>
                        <span className="font-medium text-gray-900">
                          {formData.projectBudget ? `${currencySymbol}${parseFloat(formData.projectBudget).toLocaleString()}` : '-'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Start Date:</span>
                        <span className="font-medium text-gray-900">
                          {formData.startDate ? new Date(formData.startDate).toLocaleDateString('en-GB') : '-'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Due Date:</span>
                        <span className="font-medium text-gray-900">
                          {formData.dueDate ? new Date(formData.dueDate).toLocaleDateString('en-GB') : '-'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Navigation Buttons - Neobrutalist Style */}
              <div className="flex gap-3 pt-6 border-t-2 border-black mt-6">
                {currentStep !== 'type' && (
                  <button
                    type="button"
                    onClick={handleBack}
                    className="px-4 py-2 text-sm font-black flex items-center gap-2 bg-white hover:bg-gray-100 transition-colors"
                    style={{
                      border: '2px solid #000',
                      boxShadow: '2px 2px 0px 0px #000'
                    }}
                    disabled={loading}
                  >
                    <ChevronLeft size={16} strokeWidth={3} />
                    Back
                  </button>
                )}
                
                <button
                  type="button"
                  onClick={handleClose}
                  className="px-4 py-2 text-sm font-bold text-gray-700 hover:text-gray-900 transition-colors"
                  disabled={loading}
                >
                  Cancel
                </button>

                <div className="flex-1" />

                {currentStep === 'contract' ? (
                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={loading || !canProceedFromContract}
                    className={`px-6 py-2 text-sm font-black flex items-center gap-2 transition-all rounded-full ${
                      !loading && canProceedFromContract
                        ? 'bg-[#ccff00] text-black hover:scale-105'
                        : 'bg-gray-200 cursor-not-allowed text-gray-500'
                    }`}
                  >
                    {loading ? loadingMessage : 'Create Project'}
                    {!loading && <Check size={16} strokeWidth={3} />}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleNext}
                    disabled={
                      loading ||
                      loadingAI ||
                      (currentStep === 'type' && !canProceedFromType) ||
                      (currentStep === 'template' && !canProceedFromTemplate) ||
                      (currentStep === 'details' && !canProceedFromDetails) ||
                      (currentStep === 'guardrail' && !canProceedFromGuardrail)
                    }
                    className={`px-6 py-2 text-sm font-black flex items-center gap-2 transition-all rounded-full ${
                      !loading &&
                      !loadingAI &&
                      ((currentStep === 'type' && canProceedFromType) ||
                        (currentStep === 'template' && canProceedFromTemplate) ||
                        (currentStep === 'details' && canProceedFromDetails) ||
                        (currentStep === 'guardrail' && canProceedFromGuardrail))
                        ? 'bg-[#ccff00] text-black hover:scale-105'
                        : 'bg-gray-200 cursor-not-allowed text-gray-500'
                    }`}
                  >
                    {loadingAI && currentStep === 'details' ? (
                      <>
                        <Sparkles size={16} className="animate-spin" strokeWidth={3} />
                        Analyzing with AI...
                      </>
                    ) : (
                      <>
                        Next
                        <ChevronRight size={16} strokeWidth={3} />
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* AI Estimation Modal */}
      {showAIModal && (() => {
        const selectedClient = clients.find(c => c.id === formData.clientId);
        return (
          <AIEstimationModal
            isOpen={showAIModal}
            onClose={() => {
              // When user closes AI modal with X, proceed with original estimates
              setShowAIModal(false);
              setCurrentStep('guardrail');
            }}
            estimation={aiEstimation}
            templateName={selectedTemplate?.name || ''}
            isSystemTemplate={selectedTemplate?.is_system_template || false}
            clientId={selectedClient?.id}
            clientHourlyRate={selectedClient?.default_hourly_rate}
            clientChangeRequestRate={selectedClient?.change_request_rate}
            userCurrency={userCurrency}
            onAccept={handleAIAccept}
            onClientRateUpdate={() => {
              // Refresh clients list after rate update
              loadData();
            }}
          />
        );
      })()}

      {/* Calendar Modal for Date Selection */}
      <CalendarModal
        isOpen={isCalendarModalOpen}
        onClose={() => setIsCalendarModalOpen(false)}
        onDateRangeSelect={handleDateRangeSelect}
        mode="range"
        title="Select Project Timeline"
        description="Choose the start date and target completion date for this project"
      />
    </>
  );
}
