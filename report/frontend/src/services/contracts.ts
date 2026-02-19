import ApiService from "./api";

// All IDs are UUIDs represented as strings

export interface ContractTemplate {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  template_content: string;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface ContractTemplateResponse {
  id: string | null;
  template_content: string;
  is_saved: boolean;
}

export interface ContractSignature {
  id: string;
  project_id?: string;
  client_id?: string;
  project_name: string;
  client_name: string;
  client_email: string;
  status: "draft" | "sent" | "signed" | "expired";
  contract_content?: string;
  contract_pdf_url?: string;
  signed?: boolean;
  signed_at?: string;
  signature_ip?: string;
  signature_user_agent?: string;
  client_name_typed?: string;
  // Developer signature fields
  developer_signed?: boolean;
  developer_signed_at?: string;
  developer_name_typed?: string;
  signing_token?: string;
  signing_token_expires_at?: string;
  expires_at?: string;
  created_at: string;
}

export interface DeveloperContractPreview {
  id: string;
  project_id: string;
  project_name: string;
  client_name: string;
  client_email: string;
  contract_content: string;
  developer_signed: boolean;
  developer_signed_at: string | null;
  developer_name_typed: string | null;
  client_signed: boolean;
  created_at: string;
}

export interface DeveloperSignResponse {
  success: boolean;
  message: string;
  data: {
    id: string;
    developer_signed: boolean;
    developer_signed_at: string;
    project_status: string;
    signing_url: string;
  };
}

export const contractsApi = {
  // List all contracts
  listContracts: async (): Promise<ContractSignature[]> => {
    return await ApiService.get<ContractSignature[]>("/api/contracts");
  },

  // Get the contract template (either from DB or default)
  getDefaultTemplate: async (): Promise<ContractTemplateResponse> => {
    return await ApiService.get<ContractTemplateResponse>(
      "/api/contracts/templates/default"
    );
  },

  // Save the contract template (creates or updates in DB)
  saveDefaultTemplate: async (
    templateContent: string
  ): Promise<ContractTemplate> => {
    return await ApiService.post<ContractTemplate>(
      "/api/contracts/templates/default",
      { template_content: templateContent }
    );
  },

  // List all templates
  listTemplates: async (): Promise<ContractTemplate[]> => {
    return await ApiService.get<ContractTemplate[]>("/api/contracts/templates");
  },

  // Generate a contract for a project
  generateContract: async (data: { project_id: string; template_id: string }): Promise<ContractSignature> => {
    return await ApiService.post<ContractSignature>("/api/contracts/generate", data);
  },

  // Upload a custom contract PDF
  uploadContract: async (data: { project_id: string; contract_pdf_url: string }): Promise<ContractSignature> => {
    return await ApiService.post<ContractSignature>("/api/contracts/upload", data);
  },

  // Send contract to client
  sendContract: async (data: { project_id: string }): Promise<{ message: string; signing_url: string; expires_at: string }> => {
    return await ApiService.post<{ message: string; signing_url: string; expires_at: string }>("/api/contracts/send", data);
  },

  // Resend contract signing email
  resendContractEmail: async (contractId: string): Promise<{ message: string; signing_url: string; expires_at: string }> => {
    return await ApiService.post<{ message: string; signing_url: string; expires_at: string }>(`/api/contracts/${contractId}/resend`, {});
  },

  // Get contract preview for developer to review before signing
  getDeveloperContractPreview: async (contractId: string): Promise<DeveloperContractPreview> => {
    return await ApiService.get<DeveloperContractPreview>(`/api/contracts/${contractId}/developer-preview`);
  },

  // Developer signs the contract
  developerSignContract: async (contractId: string, data: { developer_name_typed: string }): Promise<DeveloperSignResponse> => {
    return await ApiService.post<DeveloperSignResponse>(`/api/contracts/${contractId}/developer-sign`, data);
  },
};

