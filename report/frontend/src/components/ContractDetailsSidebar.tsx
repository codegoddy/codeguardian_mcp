/** @format */

"use client";

import {
  X,
  Calendar,
  Users,
  FileText,
  CheckCircle,
  Clock,
  Send,
  Copy,
  ExternalLink,
  Mail,
  AlertCircle,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { useResendContractEmail } from "@/hooks/useContracts";
import { ContractSignature } from "@/services/contracts";

interface ContractDetailsSidebarProps {
  contract: ContractSignature | null;
  isOpen: boolean;
  onClose: () => void;
}

export default function ContractDetailsSidebar({
  contract,
  isOpen,
  onClose,
}: ContractDetailsSidebarProps) {
  const resendMutation = useResendContractEmail();

  const handleResendEmail = async () => {
    if (!contract) return;

    try {
      await resendMutation.mutateAsync(contract.id);
      toast.success(
        "Contract Email Sent",
        `Contract signing link has been resent to ${contract.client_email}`
      );
    } catch (err: unknown) {
      console.error("Error resending contract email:", err);
      const errorMessage =
        err && typeof err === "object" && "response" in err
          ? (err as { response?: { data?: { detail?: string } } }).response
              ?.data?.detail || "Failed to resend contract email"
          : "Failed to resend contract email";
      toast.error("Failed to Send Email", errorMessage);
    }
  };

  const handleCopySigningLink = () => {
    if (contract?.signing_token) {
      const signingUrl = `${window.location.origin}/contracts/sign/${contract.signing_token}`;
      navigator.clipboard.writeText(signingUrl);
      toast.success("Copied!", "Signing link copied to clipboard");
    }
  };

  const handleOpenSigningLink = () => {
    if (contract?.signing_token) {
      const signingUrl = `${window.location.origin}/contracts/sign/${contract.signing_token}`;
      window.open(signingUrl, "_blank");
    }
  };

  if (!contract) return null;

  const getStatusIcon = () => {
    switch (contract.status) {
      case "signed":
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case "sent":
        return <Mail className="w-5 h-5 text-blue-500" />;
      case "expired":
        return <AlertCircle className="w-5 h-5 text-red-500" />;
      default:
        return <FileText className="w-5 h-5 text-gray-500" />;
    }
  };

  const getStatusBadgeColor = () => {
    switch (contract.status) {
      case "signed":
        return "email-button-green border border-black";
      case "sent":
        return "email-button-blue border border-black";
      case "expired":
        return "email-button-red border border-black";
      default:
        return "bg-gray-100 text-gray-800 border border-black";
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const isExpired =
    contract.expires_at && new Date(contract.expires_at) < new Date();

  return (
    <div
      className={`fixed top-0 right-0 h-screen w-96 bg-white flex flex-col shadow-lg transition-all duration-300 ease-in-out z-60 ${
        isOpen ? "translate-x-0" : "translate-x-full"
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-6 border-b border-gray-200">
        <div className="flex items-center space-x-3">
          <h2 className="text-xl font-semibold text-black">
            Contract Details
          </h2>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 hover:bg-gray-100 rounded transition-colors"
        >
          <X className="w-6 h-6 text-gray-600" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* Contract Overview */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium text-black">
              {contract.project_name}
            </h3>
            <div className="flex items-center space-x-2">
              {getStatusIcon()}
              <span
                className={`px-3 py-1 text-xs font-medium rounded-full ${getStatusBadgeColor()}`}
              >
                {contract.status.toUpperCase()}
              </span>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center space-x-3 text-sm">
              <Users className="w-4 h-4 text-gray-500" />
              <span className="text-gray-600">Client:</span>
              <span className="font-medium text-black">
                {contract.client_name}
              </span>
            </div>

            <div className="flex items-center space-x-3 text-sm">
              <Mail className="w-4 h-4 text-gray-500" />
              <span className="text-gray-600">Email:</span>
              <span className="font-medium text-black">
                {contract.client_email}
              </span>
            </div>

            <div className="flex items-center space-x-3 text-sm">
              <Calendar className="w-4 h-4 text-gray-500" />
              <span className="text-gray-600">Created:</span>
              <span className="font-medium text-black">
                {formatDate(contract.created_at)}
              </span>
            </div>

            {contract.signed_at && (
              <div className="flex items-center space-x-3 text-sm">
                <CheckCircle className="w-4 h-4 text-gray-500" />
                <span className="text-gray-600">Signed:</span>
                <span className="font-medium text-black">
                  {formatDate(contract.signed_at)}
                </span>
              </div>
            )}

            <div className="flex items-center space-x-3 text-sm">
              <Clock className="w-4 h-4 text-gray-500" />
              <span className="text-gray-600">Expires:</span>
              <span
                className={`font-medium ${
                  isExpired ? "text-red-600" : "text-black"
                }`}
              >
                {contract.expires_at ? formatDate(contract.expires_at) : "N/A"}
              </span>
            </div>
          </div>
        </div>

        {/* Status Information */}
        {contract.status === "signed" ? (
          <div className="mb-8 p-4 rounded-lg border border-green-200 bg-green-50">
            <div className="flex items-start space-x-2">
              <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-green-900 mb-1">
                  Contract Signed
                </p>
                <p className="text-xs text-green-700">
                  The client has successfully signed this contract. The project
                  is ready to begin.
                </p>
              </div>
            </div>
          </div>
        ) : isExpired ? (
          <div className="mb-8 p-4 rounded-lg border border-red-200 bg-red-50">
            <div className="flex items-start space-x-2">
              <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-red-900 mb-1">
                  Contract Expired
                </p>
                <p className="text-xs text-red-700 mb-3">
                  The signing link has expired. Send a new contract to the
                  client.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="mb-8 p-4 rounded-lg border border-blue-200 bg-blue-50">
            <div className="flex items-start space-x-2">
              <Mail className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-blue-900 mb-1">
                  Awaiting Signature
                </p>
                <p className="text-xs text-blue-700">
                  The contract has been sent to the client. They can sign it
                  using the link below.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Signing Link (if not signed) */}
        {contract.status !== "signed" && contract.signing_token && (
          <div className="mb-8 p-4 rounded-lg border border-gray-200 bg-gradient-to-br from-purple-50 to-blue-50">
            <h4 className="text-base font-medium text-black mb-3">
              Signing Link
            </h4>

            <div className="p-3 bg-white rounded-lg border border-gray-200 mb-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-gray-700">
                  Contract Signing URL
                </span>
                {isExpired && (
                  <span className="text-xs px-2 py-1 bg-red-100 text-red-700 rounded-full font-medium">
                    Expired
                  </span>
                )}
              </div>
              <div className="flex items-center space-x-2 mb-2">
                <input
                  type="text"
                  value={`${window.location.origin}/contracts/sign/${contract.signing_token}`}
                  readOnly
                  className="flex-1 text-xs bg-gray-50 px-2 py-1 rounded border border-gray-200 font-mono text-gray-600 truncate"
                />
                <button
                  onClick={handleCopySigningLink}
                  className="p-2 hover:bg-gray-100 rounded transition-colors"
                  title="Copy link"
                >
                  <Copy className="w-4 h-4 text-gray-600" />
                </button>
              </div>
              {contract.expires_at && (
                <p className="text-xs text-gray-500">
                  {isExpired ? "Expired" : "Expires"}:{" "}
                  {formatDate(contract.expires_at)}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <button
                onClick={handleOpenSigningLink}
                className="w-full flex items-center justify-center px-4 py-2 text-sm font-medium purple-button rounded-lg transition-all duration-200 hover:scale-105"
              >
                <ExternalLink className="w-4 h-4 mr-2" />
                Open Signing Page
              </button>

              <button
                onClick={handleResendEmail}
                disabled={resendMutation.isPending}
                className="w-full flex items-center justify-center px-4 py-2 text-sm font-medium email-button rounded-lg transition-all duration-200 hover:scale-105 disabled:opacity-50 disabled:hover:scale-100"
              >
                {resendMutation.isPending ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Sending...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4 mr-2" />
                    Resend Contract Email
                  </>
                )}
              </button>
            </div>

            <div className="mt-3 flex items-start space-x-2 p-2 bg-blue-50 rounded-lg border border-blue-100">
              <AlertCircle className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-blue-700">
                Resending the email will send a new notification to{" "}
                <strong>{contract.client_email}</strong> with the signing link.
              </p>
            </div>
          </div>
        )}

        {/* Contract Information */}
        <div className="mb-8 p-4 rounded-lg border border-gray-200">
          <h4 className="text-base font-medium text-black mb-3">
            Contract Information
          </h4>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Contract ID:</span>
              <span className="text-sm font-medium text-black">
                #{contract.id}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Project:</span>
              <span className="text-sm font-medium text-black">
                {contract.project_name}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Type:</span>
              <span className="text-sm font-medium text-black">
                Auto-Generated
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
