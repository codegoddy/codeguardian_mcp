import { useMemo } from "react";
import { useDashboardBundle } from "./useDashboardBundle";
import type { ChangeRequest } from "../services/changeRequests";

export interface ProjectStatus {
  id: string;
  name: string;
  clientName: string;
  status: "active" | "paused" | "at_risk" | "healthy" | "completed";
  budgetRemaining: number;
  budgetTotal: number;
  budgetPercentage: number;
  lastActivity: string;
  isPaused: boolean;
  total_revenue: number;
}

export interface BudgetWarning {
  id: string;
  projectId: string;
  projectName: string;
  clientName: string;
  budgetRemaining: number;
  budgetPercentage: number;
  severity: "critical" | "warning";
  message: string;
}

export function useDashboard() {
  const { data: bundle, isLoading, error, refetch } = useDashboardBundle();

  const projectsData = useMemo((): ProjectStatus[] => {
    if (!bundle?.projects) return [];

    return bundle.projects.map((project) => {
      const budgetPercentage = project.budget_percentage;

      let status: "active" | "paused" | "at_risk" | "healthy" = "healthy";
      if (budgetPercentage < 20) {
        status = "at_risk";
      } else if (project.status === "active" || project.status === "in_progress") {
        status = "active";
      }

      return {
        id: project.id,
        name: project.name,
        clientName: project.client_name,
        status,
        budgetRemaining: project.current_budget_remaining,
        budgetTotal: project.project_budget,
        budgetPercentage,
        lastActivity: project.updated_at || "",
        isPaused: budgetPercentage < 20,
        total_revenue: project.total_revenue,
      };
    });
  }, [bundle?.projects]);

  const budgetWarnings = useMemo((): BudgetWarning[] => {
    return projectsData
      .filter((project) => {
        return project.budgetPercentage < 20 || project.isPaused;
      })
      .map((project) => ({
        id: project.id,
        projectId: project.id,
        projectName: project.name,
        clientName: project.clientName,
        budgetRemaining: project.budgetRemaining,
        budgetPercentage: project.budgetPercentage,
        severity:
          project.budgetPercentage < 10 || project.isPaused
            ? "critical"
            : "warning",
        message: project.isPaused
          ? "Auto-Pause active - repository access revoked"
          : "Budget below 20% threshold - consider requesting replenishment",
      }));
  }, [projectsData]);

  const pendingChangeRequests = useMemo((): ChangeRequest[] => {
    if (!bundle?.change_requests) return [];
    return bundle.change_requests.filter((cr) => cr.status === "pending") as unknown as ChangeRequest[];
  }, [bundle?.change_requests]);

  return {
    projects: projectsData,
    budgetWarnings,
    pendingChangeRequests,
    isLoading,
    isError: !!error,
    error,
    refetch,
  };
}
