/** @format */

"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import AuthGuard from "../../components/AuthGuard";
import LoadingSpinner from "../../components/LoadingSpinner";
import ProjectModal from "../../components/ui/ProjectModal";
import ClientModal from "../../components/ui/ClientModal";
import ProjectDetailsSidebar from "../../components/ProjectDetailsSidebar";
import ContractDetailsSidebar from "../../components/ContractDetailsSidebar";
import TemplateEditModal from "../../components/ui/TemplateEditModal";
import CreateTemplateModal from "../../components/ui/CreateTemplateModal";
import AITemplateGeneratorModal from "../../components/ui/AITemplateGeneratorModal";
import { useProjects, useDeleteProject, projectKeys } from "../../hooks/useProjects";
import { useContracts, contractKeys } from "../../hooks/useContracts";
import { useSystemTemplates, useCustomTemplates, useDeleteTemplate } from "../../hooks/useTemplates";
import { useContractSigned } from "../../hooks/nats";
import { Project } from "../../services/projects";
import { ProjectTemplate } from "../../services/templates";
import { Client } from "../../services/clients";
import { ContractSignature } from "../../services/contracts";
import { Trash2 } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/Select";
import { toast } from "../../lib/toast";

export default function Projects() {
  const router = useRouter();
  const queryClient = useQueryClient();

  // Filter state
  const [filterValue, setFilterValue] = useState<string>("all");

  // Use the projects hook with filter
  const {
    data: projects,
    isLoading,
    isError,
    refetch,
  } = useProjects(filterValue !== "all" ? filterValue : undefined);
  
  const deleteMutation = useDeleteProject();

  // Modal states
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
  const [isClientModalOpen, setIsClientModalOpen] = useState(false);
  const [isProjectDetailsOpen, setIsProjectDetailsOpen] = useState(false);
  const [selectedProject, setSelectedProject] = useState<Project | null>(
    null
  );

  // Tab state
  const [activeTab, setActiveTab] = useState<
    "projects" | "templates" | "contract"
  >("projects");

  // Templates state (using hooks) - only fetch when templates tab is active
  const { data: systemTemplates = [], isLoading: isLoadingSystemTemplates } = useSystemTemplates(activeTab === "templates");
  const { data: customTemplates = [], isLoading: isLoadingCustomTemplates } = useCustomTemplates(activeTab === "templates");
  const deleteTemplateMutation = useDeleteTemplate();
  const [selectedTemplate, setSelectedTemplate] = useState<ProjectTemplate | null>(null);
  const [isTemplateEditModalOpen, setIsTemplateEditModalOpen] = useState(false);
  const [isCreateTemplateModalOpen, setIsCreateTemplateModalOpen] = useState(false);
  const [isAITemplateModalOpen, setIsAITemplateModalOpen] = useState(false);
  const [deleteTemplateConfirm, setDeleteTemplateConfirm] = useState<ProjectTemplate | null>(null);

  // Contracts state (using hook) - only fetch when contracts tab is active
  const { data: contracts = [], isLoading: isLoadingContracts } = useContracts(activeTab === "contract");
  const [selectedContract, setSelectedContract] = useState<ContractSignature | null>(null);
  const [isContractDetailsOpen, setIsContractDetailsOpen] = useState(false);

  // Listen for contract signed events to refresh projects
  // Listen for contract signed events to refresh projects and contracts
  useContractSigned({
    onEvent: (event) => {
      console.log('[Projects] Contract signed event received:', event);
      // Invalidate projects query to refresh the UI with updated contract status
      queryClient.invalidateQueries({ queryKey: projectKeys.all });
      // Invalidate contracts query to refresh the UI with updated contract status
      queryClient.invalidateQueries({ queryKey: contractKeys.all });
      console.log('[Projects] Invalidated projects and contracts queries after contract signed');
    }
  });

  useEffect(() => {
    const handleOpenProjectModal = () => {
      setIsProjectModalOpen(true);
    };

    window.addEventListener("openProjectModal", handleOpenProjectModal);

    return () => {
      window.removeEventListener("openProjectModal", handleOpenProjectModal);
    };
  }, []);

  useEffect(() => {
    const handleOpenClientModal = () => {
      setIsProjectModalOpen(true);
    };

    window.addEventListener("openClientModal", handleOpenClientModal);

    return () => {
      window.removeEventListener("openClientModal", handleOpenClientModal);
    };
  }, []);

  const getStatusBadgeColor = (status: string) => {
    const statusLower = status.toLowerCase();
    
    // Clean pill-shaped badges matching risk/vulnerability styling
    if (statusLower === "active" || statusLower === "healthy") {
      return "bg-[#ccff00] text-black";
    } else if (statusLower === "paused") {
      return "bg-red-500 text-white";
    } else if (statusLower === "at_risk") {
      return "bg-red-500 text-white";
    } else if (statusLower === "contract_sent" || statusLower === "awaiting_contract") {
      return "bg-blue-500 text-white";
    } else if (statusLower === "completed") {
      return "bg-purple-500 text-white";
    } else if (statusLower === "cancelled") {
      return "bg-gray-400 text-white";
    } else {
      return "bg-[#1a1a2e] text-white";
    }
  };

  const handleFilterChange = (value: string) => {
    setFilterValue(value);
    // TODO: Implement filtering logic
    console.log("Filter changed to:", value);
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteMutation.mutateAsync(id);
      setDeleteConfirmId(null);
    } catch (error) {
      alert(`Failed to delete project: ${(error as Error).message}`);
    }
  };

  const filterOptions = [
    { value: "all", label: "All Projects" },
    { value: "healthy", label: "Healthy Projects" },
    { value: "at_risk", label: "At Risk Projects" },
    { value: "paused", label: "Paused Projects" },
    { value: "active", label: "Active Projects" },
    { value: "recent", label: "Recent (Last 7 days)" },
    { value: "older", label: "Older (7+ days)" },
  ];



  // Handle project creation
  const handleProjectCreated = () => {
    setIsProjectModalOpen(false);
    // Refresh the projects list without navigating away
    refetch();
  };

  // Handle editing a template
  const handleEditTemplate = (template: ProjectTemplate) => {
    setSelectedTemplate(template);
    setIsTemplateEditModalOpen(true);
  };

  // Handle deleting a template - opens confirmation modal
  const handleDeleteTemplate = (template: ProjectTemplate) => {
    if (template.is_system_template) {
      toast.error("Cannot Delete", "System templates cannot be deleted");
      return;
    }
    setDeleteTemplateConfirm(template);
  };

  // Actually delete the template after modal confirmation
  const handleConfirmDeleteTemplate = async () => {
    if (!deleteTemplateConfirm) return;
    
    try {
      await deleteTemplateMutation.mutateAsync(deleteTemplateConfirm.id);
      toast.success("Template Deleted", "Template deleted successfully!");
      setDeleteTemplateConfirm(null);
    } catch (error) {
      console.error("Failed to delete template:", error);
      toast.error(
        "Delete Failed",
        "Failed to delete template. Please try again."
      );
    }
  };

  // Handle opening client modal from project modal
  const handleOpenClientModalFromProject = () => {
    setIsProjectModalOpen(false);
    setIsClientModalOpen(true);
  };

  // Handle client creation
  const handleClientCreated = (client: Client) => {
    setIsClientModalOpen(false);
    // Navigate to the new client or refresh the projects
    router.push(`/clients/${client.id}`);
  };

  // Handle project details sidebar
  const handleViewProject = (project: Project) => {
    setSelectedProject(project);
    setIsProjectDetailsOpen(true);
  };

  const handleCloseProjectDetails = () => {
    setIsProjectDetailsOpen(false);
    setSelectedProject(null);
  };



  const getContractStatusColor = (contract: ContractSignature) => {
    if (contract.signed) {
      return "bg-[#ccff00] text-black";
    } else if (contract.developer_signed) {
      return "bg-blue-500 text-white";  // Sent to client, awaiting client signature
    } else {
      return "bg-amber-500 text-white";  // Awaiting developer signature
    }
  };

  const getContractStatusText = (contract: ContractSignature) => {
    if (contract.signed) {
      return "SIGNED";
    } else if (contract.developer_signed) {
      return "SENT";  // Sent to client
    } else {
      return "SIGN NOW";  // Awaiting developer signature
    }
  };

  return (
    <AuthGuard>
      <div className="min-h-screen" style={{ backgroundColor: "#F5F5F5" }}>
        <main>
          <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
            {/* Tab Navigation */}
            <div className="mb-6">
              <nav className="flex space-x-8">
                <button
                  onClick={() => setActiveTab("projects")}
                  className={`py-2 px-1 border-b-2 font-medium text-sm transition-colors duration-200 ${
                    activeTab === "projects"
                      ? "border-black text-black"
                      : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                  }`}
                >
                  Projects
                </button>
                <button
                  onClick={() => setActiveTab("templates")}
                  className={`py-2 px-1 border-b-2 font-medium text-sm transition-colors duration-200 ${
                    activeTab === "templates"
                      ? "border-black text-black"
                      : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                  }`}
                >
                  Templates
                </button>
                <button
                  onClick={() => setActiveTab("contract")}
                  className={`py-2 px-1 border-b-2 font-medium text-sm transition-colors duration-200 ${
                    activeTab === "contract"
                      ? "border-black text-black"
                      : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                  }`}
                >
                  Contract
                </button>
              </nav>
            </div>

            {/* Page Header */}
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-2xl font-normal text-black">
                {activeTab === "projects"
                  ? "Projects"
                  : activeTab === "templates"
                    ? "Templates"
                    : "Contract"}
              </h2>
              {activeTab === "projects" && (
                <div className="flex items-center space-x-4">
                  <button
                    className="inline-flex items-center px-4 py-2 text-sm font-medium rounded-full hover:scale-105 transition-transform duration-200"
                    style={{ backgroundColor: "#ccff00", color: "#000" }}
                    onClick={() => setIsProjectModalOpen(true)}
                  >
                    Create Project
                  </button>
                </div>
              )}
            </div>

            {/* Tab Content */}
            {activeTab === "projects" && (
              <>
                {/* Loading Spinner */}
                {isLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="flex items-center">
                      <LoadingSpinner />
                      <span className="ml-3 text-gray-600">
                        Loading projects...
                      </span>
                    </div>
                  </div>
                ) : isError ? (
                  /* Error Message */
                  <div className="mb-6 p-4 rounded-lg border-l-4 border-red-500 bg-red-50">
                    <div className="flex">
                      <div className="w-5 h-5 text-red-400 mr-2" />
                      <p className="text-sm text-red-700">
                        Failed to load projects. Please try again.
                      </p>
                    </div>
                  </div>
                ) : (
                  /* Projects Table */
                  <div className="mb-8 rounded-2xl p-6 bg-white">
                    <div className="mb-6 flex items-center justify-between">
                      <h3 className="text-xl font-medium text-black">
                        All Projects
                      </h3>
                      <div className="w-48">
                        <Select
                          value={filterValue}
                          onValueChange={handleFilterChange}
                        >
                          <SelectTrigger className="email-button">
                            <SelectValue placeholder="Filter Projects" />
                          </SelectTrigger>
                          <SelectContent>
                            {filterOptions.map((option) => (
                              <SelectItem
                                key={option.value}
                                value={option.value}
                              >
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {projects && projects.length > 0 ? (
                      <div className="pt-6">
                        {/* Table Header */}
                        <div className="pb-4 border-b-2 border-gray-300">
                          <div className="flex items-center space-x-4">
                            <div
                              className="text-xs font-semibold text-gray-700 uppercase tracking-wide"
                              style={{ width: "80px" }}
                            >
                              Status
                            </div>
                            <div className="flex-1 grid grid-cols-2 gap-6">
                              <div className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
                                Project Name
                              </div>
                              <div className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
                                Client Name
                              </div>
                            </div>
                            <div
                              className="text-xs font-semibold text-gray-700 uppercase tracking-wide"
                              style={{ width: "100px" }}
                            >
                              Date
                            </div>
                            <div
                              className="text-xs font-semibold text-gray-700 uppercase tracking-wide"
                              style={{ width: "100px" }}
                            >
                              Actions
                            </div>
                          </div>
                        </div>

                        {/* Project Rows */}
                        {projects.map((project, index) => (
                          <div
                            key={project.id}
                            className={`py-4 ${index !== projects.length - 1 ? "border-b border-gray-200" : ""}`}
                          >
                            <div className="flex items-center space-x-4">
                              <span
                                className={`px-3 py-1 text-xs font-medium rounded-full ${getStatusBadgeColor(
                                  project.status
                                )}`}
                                style={{ minWidth: "80px", textAlign: "center", display: "inline-block" }}
                              >
                                {project.status.replace(/_/g, " ").toUpperCase()}
                              </span>
                              <div className="flex-1 grid grid-cols-2 gap-6">
                                <div className="text-sm font-semibold text-gray-900">
                                  {project.name}
                                </div>
                                <div className="text-sm text-gray-600">
                                  {project.client_name || `Client ID: ${project.client_id}`}
                                </div>
                              </div>
                              <div
                                className="flex items-center text-xs text-gray-600"
                                style={{ width: "100px" }}
                              >
                                {new Date(
                                  project.updated_at
                                ).toLocaleDateString("en-GB")}
                              </div>
                              <div className="flex items-center gap-2" style={{ width: "100px" }}>
                                <button
                                  onClick={() => handleViewProject(project)}
                                  className="px-3 py-1 text-xs font-medium text-black rounded-full hover:scale-105 transition-transform duration-200"
                                  style={{
                                    backgroundColor: "#ccff00",
                                  }}
                                >
                                  View
                                </button>
                                <button
                                  onClick={() => setDeleteConfirmId(project.id)}
                                  className="p-1.5 hover:bg-red-100 rounded transition-colors"
                                  title="Delete project"
                                >
                                  <Trash2 className="w-4 h-4 text-red-600" />
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-12">
                        <div className="text-gray-400 mb-4">
                          <svg
                            className="mx-auto h-12 w-12"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                            />
                          </svg>
                        </div>
                        <h3 className="text-lg font-medium text-gray-900 mb-2">
                          No projects yet
                        </h3>
                        <p className="text-gray-500 mb-6">
                          Create your first project to get started!
                        </p>
                        <button
                          onClick={() => setIsProjectModalOpen(true)}
                          className="px-4 py-2 text-sm font-medium email-button"
                        >
                          Create Project
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}

            {activeTab === "templates" && (
              <div className="mb-8 rounded-2xl p-6 bg-white">
                <div className="mb-6 flex items-center justify-between">
                  <div>
                    <h3 className="text-xl font-medium text-black">
                      Project Templates
                    </h3>
                    <p className="text-sm text-gray-500 mt-1">
                      Edit templates to customize them. Changes to system
                      templates will be saved as custom templates.
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setIsAITemplateModalOpen(true)}
                      className="px-4 py-2 text-sm font-medium rounded-full hover:scale-105 transition-transform duration-200 flex items-center gap-2"
                      style={{ backgroundColor: "#171717", color: "#fff" }}
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                      </svg>
                      Generate with AI
                    </button>
                    <button
                      onClick={() => setIsCreateTemplateModalOpen(true)}
                      className="px-4 py-2 text-sm font-medium rounded-full hover:scale-105 transition-transform duration-200"
                      style={{ backgroundColor: "#ccff00", color: "#000" }}
                    >
                      Start from Scratch
                    </button>
                  </div>
                </div>

                {/* System Templates */}
                {isLoadingSystemTemplates ? (
                  <div className="mb-8 flex items-center justify-center py-12">
                    <LoadingSpinner size="lg" color="black" />
                    <span className="ml-3 text-gray-400">Loading system templates...</span>
                  </div>
                ) : systemTemplates.length > 0 && (
                  <div className="mb-8">
                    <h4 className="text-lg font-semibold text-gray-900 mb-4">
                      System Templates
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {systemTemplates.map((template: ProjectTemplate) => (
                        <div
                          key={template.id}
                          className="border rounded-lg p-4 flex flex-col h-full hover:shadow-md transition-shadow"
                          style={{ border: "1px solid #171717" }}
                        >
                          <div className="flex justify-between items-start mb-4">
                            <div className="flex-1">
                              <h3 className="text-lg font-medium text-gray-900">
                                {template.name}
                              </h3>
                              {template.category && (
                                <span className="inline-block mt-2 px-2.5 py-0.5 text-xs font-medium bg-gray-100 text-gray-800 rounded-full">
                                  {template.category}
                                </span>
                              )}
                            </div>
                            {template.is_system_template && (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                System
                              </span>
                            )}
                          </div>
                          <div className="mb-4 flex-1">
                            {template.description && (
                              <p className="text-sm text-gray-600">
                                {template.description}
                              </p>
                            )}
                          </div>
                          <div className="mt-auto">
                            <button
                              onClick={() => handleEditTemplate(template)}
                              className="w-full px-4 py-2 text-sm font-medium rounded-full transition-transform duration-200 hover:scale-105"
                              style={{ backgroundColor: "#ccff00", color: "#000" }}
                            >
                              Edit Template
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Custom Templates */}
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="text-lg font-semibold text-gray-900">
                      Your Custom Templates
                    </h4>
                    <button
                      onClick={() => setIsCreateTemplateModalOpen(true)}
                      className="px-3 py-1.5 text-xs font-medium rounded transition-colors"
                      style={{
                        backgroundColor: "#ccff00",
                        color: "#171717",
                        border: "1px solid #171717",
                      }}
                    >
                      + New Template
                    </button>
                  </div>

                  {isLoadingCustomTemplates ? (
                    <div className="flex items-center justify-center py-12">
                      <LoadingSpinner size="lg" color="black" />
                      <span className="ml-3 text-gray-400">Loading custom templates...</span>
                    </div>
                  ) : customTemplates.length === 0 ? (
                    <div
                      className="text-center py-12 rounded-lg"
                      style={{
                        border: "2px dashed #171717",
                        backgroundColor: "#f9fafb",
                      }}
                    >
                      <div className="text-gray-400 mb-4">
                        <svg
                          className="mx-auto h-12 w-12"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                          />
                        </svg>
                      </div>
                      <h3 className="text-lg font-medium text-gray-900 mb-2">
                        No custom templates yet
                      </h3>
                      <p className="text-gray-500 mb-6">
                        Create your first custom template to get started.
                      </p>
                      <button
                        onClick={() => setIsCreateTemplateModalOpen(true)}
                        className="px-4 py-2 text-sm font-medium email-button"
                      >
                        Create Your First Template
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {customTemplates.map((template) => (
                        <div
                          key={template.id}
                          className="border rounded-lg p-4 flex flex-col h-full hover:shadow-md transition-shadow"
                          style={{ border: "1px solid #171717" }}
                        >
                          <div className="flex justify-between items-start mb-4">
                            <div className="flex-1">
                              <h3 className="text-lg font-medium text-gray-900">
                                {template.name}
                              </h3>
                              {template.category && (
                                <span className="inline-block mt-2 px-2.5 py-0.5 text-xs font-medium bg-gray-100 text-gray-800 rounded-full">
                                  {template.category}
                                </span>
                              )}
                            </div>
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                              Custom
                            </span>
                          </div>
                          <div className="mb-4 flex-1">
                            {template.description && (
                              <p className="text-sm text-gray-600">
                                {template.description}
                              </p>
                            )}
                          </div>
                          <div className="mt-auto space-y-2">
                            <button
                              onClick={() => handleEditTemplate(template)}
                              className="w-full px-4 py-2 text-sm font-medium rounded-full transition-transform duration-200 hover:scale-105"
                              style={{ backgroundColor: "#ccff00", color: "#000" }}
                            >
                              Edit Template
                            </button>
                            <button
                              onClick={() => handleDeleteTemplate(template)}
                              className="w-full px-4 py-2 text-sm font-medium border border-red-300 text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                              style={{ border: "1px solid #dc2626" }}
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === "contract" && (
              <div className="mb-8 rounded-2xl p-6 bg-white">
                <div className="mb-6 flex items-center justify-between">
                  <h3 className="text-xl font-medium text-black">
                    All Contracts
                  </h3>
                  <button
                    onClick={() => router.push("/projects/contract-template")}
                    className="px-4 py-2 text-sm font-medium email-button"
                  >
                    Edit Contract Template
                  </button>
                </div>

                {isLoadingContracts ? (
                  <div className="flex items-center justify-center py-12">
                    <LoadingSpinner size="lg" color="black" />
                    <span className="ml-3 text-gray-400">Loading contracts...</span>
                  </div>
                ) : contracts.length > 0 ? (
                  <div className="pt-6">
                    {/* Table Header */}
                    <div className="pb-4 border-b-2 border-gray-300">
                      <div className="flex items-center space-x-4">
                        <div
                          className="text-xs font-semibold text-gray-700 uppercase tracking-wide"
                          style={{ width: "80px" }}
                        >
                          Status
                        </div>
                        <div className="flex-1 grid grid-cols-2 gap-6">
                          <div className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
                            Project Name
                          </div>
                          <div className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
                            Client Name
                          </div>
                        </div>
                        <div
                          className="text-xs font-semibold text-gray-700 uppercase tracking-wide"
                          style={{ width: "100px" }}
                        >
                          Date
                        </div>
                        <div
                          className="text-xs font-semibold text-gray-700 uppercase tracking-wide"
                          style={{ width: "140px" }}
                        >
                          Action
                        </div>
                      </div>
                    </div>

                    {/* Contract Rows */}
                    {contracts.map((contract, index) => (
                      <div
                        key={contract.id}
                        className={`py-4 ${index !== contracts.length - 1 ? "border-b border-gray-200" : ""}`}
                      >
                        <div className="flex items-center space-x-4">
                          <span
                            className={`px-3 py-1 text-xs font-medium rounded-full ${getContractStatusColor(
                              contract
                            )}`}
                            style={{ minWidth: "80px", textAlign: "center", display: "inline-block" }}
                          >
                            {getContractStatusText(contract)}
                          </span>
                          <div className="flex-1 grid grid-cols-2 gap-6">
                            <div className="text-sm font-semibold text-gray-900">
                              {contract.project_name}
                            </div>
                            <div className="text-sm text-gray-600">
                              {contract.client_name}
                            </div>
                          </div>
                          <div
                            className="flex items-center text-xs text-gray-600"
                            style={{ width: "100px" }}
                          >
                            {new Date(contract.created_at).toLocaleDateString(
                              "en-GB"
                            )}
                          </div>
                          <div
                            className="flex items-center space-x-2"
                            style={{ width: "140px" }}
                          >
                            {/* Show Sign Contract button if developer hasn't signed yet AND contract is not fully signed */}
                            {!contract.developer_signed && !contract.signed && (
                              <Link
                                href={`/contracts/developer-sign/${contract.id}`}
                                className="px-3 py-1 text-xs font-medium text-black rounded-full hover:scale-105 transition-transform duration-200 bg-amber-400"
                              >
                                Sign
                              </Link>
                            )}
                            {/* Show client signing link only after developer has signed */}
                            {contract.developer_signed && !contract.signed &&
                              contract.signing_token && (
                                <Link
                                  href={`/contracts/sign/${contract.signing_token}`}
                                  target="_blank"
                                  className="px-3 py-1 text-xs font-medium text-white rounded-full hover:scale-105 transition-transform duration-200 bg-blue-500"
                                >
                                  Link
                                </Link>
                              )}
                            <button
                              onClick={() => {
                                setSelectedContract(contract);
                                setIsContractDetailsOpen(true);
                              }}
                              className="px-3 py-1 text-xs font-medium text-black rounded-full hover:scale-105 transition-transform duration-200"
                              style={{
                                backgroundColor: "#ccff00",
                              }}
                            >
                              View
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <div className="text-gray-400 mb-4">
                      <svg
                        className="mx-auto h-12 w-12"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                        />
                      </svg>
                    </div>
                    <h3 className="text-lg font-medium text-gray-900 mb-2">
                      No contracts yet
                    </h3>
                    <p className="text-gray-500 mb-6">
                      Edit your contract template to start sending contracts to
                      clients.
                    </p>
                    <button
                      onClick={() => router.push("/projects/contract-template")}
                      className="px-4 py-2 text-sm font-medium email-button"
                    >
                      Edit Contract Template
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </main>

        {/* Project Modal */}
        <ProjectModal
          isOpen={isProjectModalOpen}
          onClose={() => setIsProjectModalOpen(false)}
          onProjectCreated={handleProjectCreated}
          onClientModalOpen={handleOpenClientModalFromProject}
        />

        {/* Client Modal */}
        <ClientModal
          isOpen={isClientModalOpen}
          onClose={() => setIsClientModalOpen(false)}
          onClientCreated={handleClientCreated}
        />

        {/* Project Details Sidebar */}
        <ProjectDetailsSidebar
          project={selectedProject}
          isOpen={isProjectDetailsOpen}
          onClose={handleCloseProjectDetails}
        />

        {/* Template Edit Modal */}
        <TemplateEditModal
          isOpen={isTemplateEditModalOpen}
          onClose={() => setIsTemplateEditModalOpen(false)}
          template={selectedTemplate}
          onTemplateSaved={() => {
            // Templates will auto-refresh via React Query invalidation
          }}
        />

        {/* Create Template Modal */}
        <CreateTemplateModal
          isOpen={isCreateTemplateModalOpen}
          onClose={() => setIsCreateTemplateModalOpen(false)}
          onTemplateCreated={() => {
            // Invalidate custom templates query to refresh the list
            queryClient.invalidateQueries({ queryKey: ["templates", "list", "custom"] });
          }}
        />

        {/* AI Template Generator Modal */}
        <AITemplateGeneratorModal
          isOpen={isAITemplateModalOpen}
          onClose={() => setIsAITemplateModalOpen(false)}
          onTemplateCreated={() => {
            // Invalidate custom templates query to refresh the list
            queryClient.invalidateQueries({ queryKey: ["templates", "list", "custom"] });
          }}
        />

        {/* Delete Project Confirmation Modal */}
        {deleteConfirmId && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" style={{ willChange: 'backdrop-filter' }}>
            <div className="bg-white rounded-lg p-6 max-w-md w-full" style={{
              border: '1px solid #171717',
              boxShadow: '2px 2px 0px #171717'
            }}>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Delete Project</h3>
              <p className="text-gray-600 mb-6">
                Are you sure you want to delete this project? This action cannot be undone.
              </p>
              <div className="flex justify-end space-x-4">
                <button
                  onClick={() => setDeleteConfirmId(null)}
                  className="px-4 py-2 text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded font-medium transition-colors duration-200"
                  disabled={deleteMutation.isPending}
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleDelete(deleteConfirmId)}
                  className="px-4 py-2 email-button-red text-white rounded hover:scale-105 hover:shadow-lg transition-transform duration-200"
                  disabled={deleteMutation.isPending}
                >
                  {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Delete Template Confirmation Modal */}
        {deleteTemplateConfirm && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" style={{ willChange: 'backdrop-filter' }}>
            <div className="bg-white rounded-lg p-6 max-w-md w-full" style={{
              border: '1px solid #171717',
              boxShadow: '2px 2px 0px #171717'
            }}>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Delete Template</h3>
              <p className="text-gray-600 mb-6">
                Are you sure you want to delete &quot;{deleteTemplateConfirm.name}&quot;? This action cannot be undone.
              </p>
              <div className="flex justify-end space-x-4">
                <button
                  onClick={() => setDeleteTemplateConfirm(null)}
                  className="px-4 py-2 text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded font-medium transition-colors duration-200"
                  disabled={deleteTemplateMutation.isPending}
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmDeleteTemplate}
                  className="px-4 py-2 email-button-red text-white rounded hover:scale-105 hover:shadow-lg transition-transform duration-200"
                  disabled={deleteTemplateMutation.isPending}
                >
                  {deleteTemplateMutation.isPending ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Contract Details Sidebar */}
        <ContractDetailsSidebar
          contract={selectedContract}
          isOpen={isContractDetailsOpen}
          onClose={() => {
            setIsContractDetailsOpen(false);
            setSelectedContract(null);
          }}
        />
      </div>
    </AuthGuard>
  );
}
