'use client';

import { X, Sparkles, AlertCircle, Check, Edit2, Save, DollarSign } from 'lucide-react';
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { DeliverableEstimate, TemplateEstimateResponse, BudgetAnalysis } from '../../services/aiEstimation';
import { clientsApi } from '../../services/clients';
import { toast } from 'sonner';
import { useCurrencyFormat } from '../../hooks/use-currency-format';

interface AIEstimationModalProps {
  isOpen: boolean;
  onClose: () => void;
  estimation: TemplateEstimateResponse | null;
  templateName: string;
  isSystemTemplate: boolean;
  clientId?: string;
  clientHourlyRate?: number;
  clientChangeRequestRate?: number;
  userCurrency?: string;
  onAccept: (adjustedEstimates: DeliverableEstimate[], saveAsCustom: boolean, customName?: string) => void;
  onClientRateUpdate?: () => void;
}

export default function AIEstimationModal({
  isOpen,
  onClose,
  estimation,
  templateName,
  isSystemTemplate,
  clientId,
  clientHourlyRate,
  clientChangeRequestRate,
  userCurrency = 'USD',
  onAccept,
  onClientRateUpdate
}: AIEstimationModalProps) {
  const [adjustedEstimates, setAdjustedEstimates] = useState<DeliverableEstimate[]>([]);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  const [saveAsCustomTemplate, setSaveAsCustomTemplate] = useState(false);
  const [customTemplateName, setCustomTemplateName] = useState('');
  const [mounted, setMounted] = useState(false);
  
  // Currency formatting
  const { formatWithCurrency } = useCurrencyFormat();
  
  // Hourly rate editing state
  const [editableHourlyRate, setEditableHourlyRate] = useState<number | undefined>(clientHourlyRate);
  const [isEditingRate, setIsEditingRate] = useState(false);
  const [rateEditValue, setRateEditValue] = useState<string>('');
  const [recalculatedBudget, setRecalculatedBudget] = useState<BudgetAnalysis | undefined>(estimation?.budget_analysis);
  const [isUpdatingClient, setIsUpdatingClient] = useState(false);
  
  // Rate update confirmation modal state
  const [showRateConfirmModal, setShowRateConfirmModal] = useState(false);
  const [pendingRateUpdate, setPendingRateUpdate] = useState<{
    newRate: number;
    newCRRate: number;
  } | null>(null);

  // Ensure we're on client side for portal
  useEffect(() => {
    setMounted(true);
  }, []);

  // Initialize adjusted estimates from AI estimation
  useEffect(() => {
    if (estimation && estimation.deliverables) {
      setAdjustedEstimates([...estimation.deliverables]);
    }
  }, [estimation]);

  // Don't render if not open, no estimation data, or not mounted (SSR)
  if (!isOpen || !estimation || !mounted) return null;

  const handleStartEdit = (index: number, currentHours: number) => {
    setEditingIndex(index);
    setEditValue(currentHours.toString());
  };

  const handleSaveEdit = (index: number) => {
    const newHours = parseFloat(editValue);
    if (!isNaN(newHours) && newHours > 0) {
      const updated = [...adjustedEstimates];
      updated[index] = { 
        ...updated[index], 
        estimated_hours: newHours,
        manually_adjusted: true
      };
      setAdjustedEstimates(updated);
    }
    setEditingIndex(null);
  };

  const handleAcceptAll = () => {
    onAccept(
      adjustedEstimates, 
      saveAsCustomTemplate,
      saveAsCustomTemplate ? customTemplateName : undefined
    );
    onClose();
  };

  const handleUseOriginal = () => {
    // Use original template estimates
    const originalEstimates = estimation.deliverables.map(d => ({
      ...d,
      estimated_hours: d.original_hours
    }));
    onAccept(originalEstimates, false);
    onClose();
  };

  // Calculate suggested hourly rate to fit budget
  const calculateSuggestedRate = (): number | null => {
    if (!estimation?.budget_analysis) return null;
    const { total_budget } = estimation.budget_analysis;
    if (!total_budget || totalAdjusted === 0) return null;
    return total_budget / totalAdjusted;
  };

  // Calculate proportional change request rate (maintain ratio)
  const calculateProportionalCRRate = (newHourlyRate: number): number => {
    if (!clientHourlyRate || !clientChangeRequestRate || clientHourlyRate === 0) {
      return newHourlyRate; // Default to same as hourly rate
    }
    const ratio = clientChangeRequestRate / clientHourlyRate;
    return newHourlyRate * ratio;
  };

  // Recalculate budget analysis with new hourly rate
  const recalculateBudgetAnalysis = (newRate: number): BudgetAnalysis | undefined => {
    if (!estimation?.budget_analysis) return undefined;
    
    const { total_budget } = estimation.budget_analysis;
    if (!total_budget) return undefined; // Avoid division by zero if total_budget is 0 or null
    
    const budgetHours = total_budget / newRate;
    const estimatedCost = totalAdjusted * newRate;
    const budgetVariance = total_budget - estimatedCost;
    const budgetUtilization = (totalAdjusted / budgetHours * 100);
    const variancePercentage = (budgetVariance / total_budget * 100);
    
    let budgetStatus: 'under' | 'on_track' | 'over' | 'critical';
    let recommendation: string;
    
    if (variancePercentage >= 20) {
      budgetStatus = 'under';
      recommendation = `✅ Under budget by ${formatWithCurrency(budgetVariance, userCurrency)}. You have room for scope additions or buffer.`;
    } else if (variancePercentage >= 0) {
      budgetStatus = 'on_track';
      recommendation = `✅ On track. Estimated cost ${formatWithCurrency(estimatedCost, userCurrency)} is within budget.`;
    } else if (variancePercentage >= -20) {
      budgetStatus = 'over';
      recommendation = `⚠️ Over budget by ${formatWithCurrency(Math.abs(budgetVariance), userCurrency)}. Consider reducing scope or negotiating budget increase.`;
    } else {
      budgetStatus = 'critical';
      recommendation = `🚨 Critical: ${formatWithCurrency(Math.abs(budgetVariance), userCurrency)} over budget (${Math.abs(variancePercentage).toFixed(0)}%). Scope reduction required.`;
    }
    
    return {
      total_budget,
      hourly_rate: newRate,
      budget_hours: Math.round(budgetHours * 10) / 10,
      estimated_cost: Math.round(estimatedCost * 100) / 100,
      budget_variance: Math.round(budgetVariance * 100) / 100,
      budget_utilization: Math.round(budgetUtilization * 10) / 10,
      budget_status: budgetStatus,
      recommendation
    };
  };

  // Start editing hourly rate
  const handleStartRateEdit = () => {
    setIsEditingRate(true);
    setRateEditValue(editableHourlyRate?.toString() || '');
  };

  // Apply suggested rate
  const applySuggestedRate = async () => {
    const suggestedRate = calculateSuggestedRate();
    if (!suggestedRate) return;
    
    await updateClientRate(suggestedRate);
  };

  // Update client rate with confirmation
  const updateClientRate = async (newRate: number) => {
    if (!clientId || !clientHourlyRate || !clientChangeRequestRate) {
      toast.error('Cannot update rate', { description: 'Client information is missing' });
      return;
    }

    // Ensure newRate is a number
    const numericNewRate = Number(newRate);
    if (isNaN(numericNewRate)) {
      toast.error('Invalid Rate', { description: 'Please enter a valid number' });
      return;
    }

    const newCRRate = calculateProportionalCRRate(numericNewRate);
    
    // Show confirmation modal instead of browser alert
    setPendingRateUpdate({ newRate: numericNewRate, newCRRate });
    setShowRateConfirmModal(true);
  };
  
  // Confirm and apply rate update
  const confirmRateUpdate = async () => {
    if (!pendingRateUpdate || !clientId) return;
    
    const { newRate, newCRRate } = pendingRateUpdate;

    setIsUpdatingClient(true);
    try {
      await clientsApi.updateClient(clientId, {
        default_hourly_rate: newRate,
        change_request_rate: newCRRate
      });

      // Update local state
      setEditableHourlyRate(newRate);
      setIsEditingRate(false);
      
      // Recalculate budget
      const newBudget = recalculateBudgetAnalysis(newRate);
      setRecalculatedBudget(newBudget);

      toast.success('Rates Updated', { description: `Hourly rate updated to ${formatWithCurrency(newRate, userCurrency)}` });
      
      // Notify parent to refresh client data
      onClientRateUpdate?.();
      
      // Close modal and reset
      setShowRateConfirmModal(false);
      setPendingRateUpdate(null);
    } catch (error) {
      console.error('Failed to update client rates:', error);
      toast.error('Update Failed', { description: 'Could not update client rates' });
    } finally {
      setIsUpdatingClient(false);
    }
  };
  
  // Cancel rate update
  const cancelRateUpdate = () => {
    setShowRateConfirmModal(false);
    setPendingRateUpdate(null);
    setIsEditingRate(false);
  };

  // Handle rate edit save
  const handleSaveRateEdit = () => {
    const newRate = parseFloat(rateEditValue);
    if (isNaN(newRate) || newRate <= 0) {
      toast.error('Invalid Rate', { description: 'Please enter a valid hourly rate' });
      return;
    }
    updateClientRate(newRate);
  };

  const totalAdjusted = adjustedEstimates.reduce((sum, d) => sum + d.estimated_hours, 0);
  const hasManualAdjustments = adjustedEstimates.some(d => d.manually_adjusted);

  // Use portal to render outside ProjectModal's DOM tree
  // This prevents ProjectModal's onInteractOutside from capturing clicks
  const modalContent = (
    <div 
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4"
      onClick={(e) => {
        // Close modal if clicking the backdrop
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className="bg-white rounded-lg w-full max-w-5xl max-h-[90vh] flex flex-col relative"
        style={{
          border: "2px solid #000",
          boxShadow: "4px 4px 0px 0px #000",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header - Fixed at top */}
        <div className="flex-shrink-0 bg-white border-b-2 border-black p-6 flex items-center justify-between z-10">
          <div>
            <h2 className="text-2xl font-black tracking-tighter">
              AI Time Estimation
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              {templateName}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        {/* Content - Scrollable */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Timeline Analysis Banner */}
          {estimation.timeline_analysis && (
            <div className={`mb-6 p-4 rounded-lg border-2 ${
              estimation.timeline_analysis.includes('High Risk') 
                ? 'bg-red-50 border-red-500'
                : estimation.timeline_analysis.includes('Moderate Risk')
                ? 'bg-yellow-50 border-yellow-500'
                : 'bg-green-50 border-green-500'
            }`}>
              <div className="flex items-start gap-3">
                <AlertCircle className={`flex-shrink-0 mt-0.5 ${
                  estimation.timeline_analysis.includes('High Risk')
                    ? 'text-red-600'
                    : estimation.timeline_analysis.includes('Moderate Risk')
                    ? 'text-yellow-600'
                    : 'text-green-600'
                }`} size={20} strokeWidth={3} />
                <p className={`text-sm font-bold ${
                  estimation.timeline_analysis.includes('High Risk')
                    ? 'text-red-900'
                    : estimation.timeline_analysis.includes('Moderate Risk')
                    ? 'text-yellow-900'
                    : 'text-green-900'
                }`}>{estimation.timeline_analysis}</p>
              </div>
            </div>
          )}

          {/* Budget Analysis Banner */}
          {(recalculatedBudget || estimation.budget_analysis) && (() => {
            const budgetData = recalculatedBudget || estimation.budget_analysis!;
            const suggestedRate = calculateSuggestedRate();
            const showSuggestedRate = suggestedRate && budgetData.budget_status === 'over' || budgetData.budget_status === 'critical';
            
            return (
              <div className={`mb-6 p-4 rounded-lg border-2 ${
                budgetData.budget_status === 'critical'
                  ? 'bg-red-50 border-red-500'
                  : budgetData.budget_status === 'over'
                  ? 'bg-orange-50 border-orange-500'
                  : budgetData.budget_status === 'on_track'
                  ? 'bg-blue-50 border-blue-500'
                  : 'bg-green-50 border-green-500'
              }`}>
                <div className="flex items-start gap-3">
                  <span className="text-xl flex-shrink-0">
                    {budgetData.budget_status === 'critical' ? '🚨' :
                     budgetData.budget_status === 'over' ? '⚠️' :
                     budgetData.budget_status === 'on_track' ? '✅' : '💰'}
                  </span>
                  <div className="flex-1">
                    <p className={`text-sm font-bold ${
                      budgetData.budget_status === 'critical'
                        ? 'text-red-900'
                        : budgetData.budget_status === 'over'
                        ? 'text-orange-900'
                        : budgetData.budget_status === 'on_track'
                        ? 'text-blue-900'
                        : 'text-green-900'
                    }`}>{budgetData.recommendation}</p>
                    
                    {/* Hourly Rate Editor */}
                    <div className="mt-3 flex items-center gap-2">
                      <span className="text-xs font-bold text-gray-600">Hourly Rate:</span>
                      {isEditingRate ? (
                        <div className="flex items-center gap-2">
                          <div className="relative">
                            <DollarSign className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500" size={14} />
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={rateEditValue}
                              onChange={(e) => setRateEditValue(e.target.value)}
                              className="w-24 pl-6 pr-2 py-1 border-2 border-black rounded-lg font-black text-sm focus:outline-none focus:ring-2 focus:ring-[#ccff00]"
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSaveRateEdit();
                                if (e.key === 'Escape') setIsEditingRate(false);
                              }}
                              disabled={isUpdatingClient}
                            />
                          </div>
                          <button
                            onClick={handleSaveRateEdit}
                            disabled={isUpdatingClient}
                            className="p-1.5 bg-[#ccff00] text-black border-2 border-black rounded-lg hover:bg-[#b8e600] transition-colors disabled:opacity-50"
                          >
                            <Save size={14} strokeWidth={3} />
                          </button>
                          <button
                            onClick={() => setIsEditingRate(false)}
                            disabled={isUpdatingClient}
                            className="p-1.5 bg-white text-black border-2 border-black rounded-lg hover:bg-gray-100 transition-colors"
                          >
                            <X size={14} strokeWidth={3} />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-black text-gray-900">{formatWithCurrency(Number(editableHourlyRate || 0), userCurrency)}/hr</span>
                          {clientId && (
                            <button
                              onClick={handleStartRateEdit}
                              className="p-1 hover:bg-gray-100 rounded transition-colors"
                              title="Edit hourly rate"
                            >
                              <Edit2 size={14} className="text-gray-400" strokeWidth={3} />
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Suggested Rate Button */}
                    {showSuggestedRate && suggestedRate && !isEditingRate && clientId && (
                      <button
                        onClick={applySuggestedRate}
                        disabled={isUpdatingClient}
                        className="mt-3 px-3 py-1.5 text-xs font-bold bg-white border-2 border-black rounded-lg hover:bg-[#ccff00] transition-colors disabled:opacity-50"
                      >
                        💡 Use Suggested Rate: {formatWithCurrency(Number(suggestedRate), userCurrency)}/hr
                      </button>
                    )}
                    
                    <div className="mt-3 grid grid-cols-3 gap-4 text-xs">
                      <div>
                        <span className="font-bold text-gray-500">Budget:</span>
                        <span className="ml-1 font-black text-gray-800">{formatWithCurrency(budgetData.total_budget, userCurrency)}</span>
                      </div>
                      <div>
                        <span className="font-bold text-gray-500">Est. Cost:</span>
                        <span className="ml-1 font-black text-gray-800">{formatWithCurrency(budgetData.estimated_cost, userCurrency)}</span>
                      </div>
                      <div>
                        <span className="font-bold text-gray-500">Budget Hours:</span>
                        <span className="ml-1 font-black text-gray-800">{budgetData.budget_hours}h</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Summary Cards */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            {/* Original Estimate */}
            <div className="email-card p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm font-bold text-white uppercase tracking-wide">
                  Original Estimate
                </span>
              </div>
              <div className="text-3xl font-black text-white">
                {estimation.total_original_hours}h
              </div>
            </div>

            {/* AI Estimate */}
            <div className="email-card p-4">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="text-[#ccff00]" size={20} />
                <span className="text-sm font-bold text-white uppercase tracking-wide">
                  AI Estimate
                </span>
              </div>
              <div className="text-3xl font-black text-white">
                {totalAdjusted.toFixed(1)}h
              </div>
              <p className={`text-sm font-bold mt-1 ${
                estimation.adjustment_percentage > 0 ? 'text-orange-400' : 'text-green-400'
              }`}>
                {estimation.adjustment_percentage > 0 ? '+' : ''}
                {estimation.adjustment_percentage.toFixed(1)}%
              </p>
            </div>

            {/* Confidence */}
            <div className="email-card p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm font-bold text-white uppercase tracking-wide">
                  Confidence
                </span>
              </div>
              <div className="text-3xl font-black text-white">
                {estimation.confidence_score.toFixed(0)}%
              </div>
              <div className="mt-2 h-2 bg-gray-700 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-[#ccff00] transition-all"
                  style={{ width: `${estimation.confidence_score}%` }}
                />
              </div>
            </div>
          </div>

          {/* First-Time User Notice */}
          {estimation.is_first_time_user && (
            <div className="mb-6 p-4 bg-blue-50 rounded-lg border-2 border-blue-500">
              <div className="flex items-start gap-3">
                <AlertCircle size={20} className="text-blue-600 flex-shrink-0 mt-0.5" strokeWidth={3} />
                <div>
                  <p className="text-sm font-bold text-blue-900">First-Time User Estimates</p>
                  <p className="text-xs text-blue-800 mt-1">
                    These estimates are based on industry benchmarks and aggregate data. 
                    As you complete projects, AI will learn your personal velocity and provide more accurate estimates.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Deliverables List with Inline Editing */}
          <div className="space-y-3 mb-6">
            {adjustedEstimates.map((deliverable, index) => (
              <div 
                key={index}
                className="p-4 bg-white rounded-lg border-2 border-black transition-all"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h4 className="font-bold text-gray-900">{deliverable.title}</h4>
                      {deliverable.original_hours === 0 && (
                        <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-[10px] font-black border border-blue-300 rounded uppercase">
                          Platform Added
                        </span>
                      )}
                    </div>
                    {deliverable.description && (
                      <p className="text-sm text-gray-600 mt-1">{deliverable.description}</p>
                    )}
                  </div>
                  {deliverable.manually_adjusted && (
                    <span className="px-2 py-1 bg-[#ccff00] text-black text-xs font-bold border border-black">
                      EDITED
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-4 mb-3">
                  {/* Original */}
                  <div>
                    <p className="text-xs font-bold text-gray-500 mb-1">ORIGINAL</p>
                    <p className="text-xl font-black text-gray-700">
                      {deliverable.original_hours}h
                    </p>
                  </div>

                  {/* AI Estimate with Edit */}
                  <div>
                    <p className="text-xs font-bold text-gray-500 mb-1">AI ESTIMATE</p>
                    {editingIndex === index ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          step="0.5"
                          min="0.5"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          className="w-20 px-2 py-1 border-2 border-black rounded-lg font-black text-lg focus:outline-none focus:ring-2 focus:ring-[#ccff00]"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveEdit(index);
                            if (e.key === 'Escape') setEditingIndex(null);
                          }}
                        />
                        <button
                          onClick={() => handleSaveEdit(index)}
                          className="p-1.5 bg-[#ccff00] text-black border-2 border-black rounded-lg hover:bg-[#b8e600] transition-colors"
                        >
                          <Save size={14} strokeWidth={3} />
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-col">
                        <div className="flex items-center gap-2">
                          <p className="text-xl font-black text-black">
                            {deliverable.estimated_hours}h
                          </p>
                          <button
                            onClick={() => handleStartEdit(index, deliverable.estimated_hours)}
                            className="p-1 hover:bg-gray-100 rounded transition-colors"
                            title="Edit estimate"
                          >
                            <Edit2 size={14} className="text-gray-400" strokeWidth={3} />
                          </button>
                        </div>
                        {deliverable.optimistic_hours !== undefined && deliverable.pessimistic_hours !== undefined && (
                          <p className="text-[10px] font-bold text-gray-400 uppercase">
                            Range: {deliverable.optimistic_hours}-{deliverable.pessimistic_hours}h
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Confidence */}
                  <div>
                    <p className="text-xs font-bold text-gray-500 mb-1">CONFIDENCE</p>
                    <p className="text-xl font-black text-black">
                      {deliverable.confidence.toFixed(0)}%
                    </p>
                  </div>
                </div>

                {/* AI Reasoning */}
                <div className="p-3 bg-gray-50 rounded-lg border-2 border-gray-300">
                  <p className="text-xs font-bold text-gray-600 mb-1">AI REASONING:</p>
                  <p className="text-sm font-medium text-gray-800">{deliverable.reasoning}</p>
                  {deliverable.similar_count > 0 && (
                    <p className="text-xs font-bold text-gray-500 mt-2">
                      📊 Based on {deliverable.similar_count} similar deliverables
                    </p>
                  )}
                </div>

                {/* Risk Factors */}
                {deliverable.risk_factors && deliverable.risk_factors.length > 0 && (
                  <div className="mt-3 flex items-start gap-2">
                    <AlertCircle size={16} className="text-orange-600 flex-shrink-0 mt-0.5" strokeWidth={3} />
                    <div>
                      <p className="text-xs font-bold text-orange-700">RISK FACTORS:</p>
                      <ul className="text-xs font-medium text-gray-700 mt-1 space-y-2">
                        {deliverable.risk_factors.map((risk, i) => (
                          <li key={i} className="flex flex-col">
                            <span className="font-bold">• {risk.factor}</span>
                            <span className="text-gray-500 pl-3">Mitigation: {risk.mitigation}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Save as Custom Template Option */}
          {isSystemTemplate && hasManualAdjustments && (
            <div className="mb-6 p-4 bg-purple-50 rounded-lg border-2 border-purple-500">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={saveAsCustomTemplate}
                  onChange={(e) => setSaveAsCustomTemplate(e.target.checked)}
                  className="w-4 h-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500"
                />
                <div>
                  <p className="font-bold text-gray-900">Save as Custom Template</p>
                  <p className="text-sm text-gray-600">
                    Save these adjusted estimates as your own reusable template
                  </p>
                </div>
              </label>
              {saveAsCustomTemplate && (
                <input
                  type="text"
                  placeholder="Custom template name..."
                  value={customTemplateName}
                  onChange={(e) => setCustomTemplateName(e.target.value)}
                  className="mt-3 w-full px-4 py-3 border-2 border-black rounded-lg focus:outline-none focus:ring-2 focus:ring-[#ccff00]"
                />
              )}
            </div>
          )}

        </div>

        {/* Footer - Fixed at bottom */}
        <div className="flex-shrink-0 bg-white border-t-2 border-black p-6 flex items-center justify-between z-10">
          <button
            onClick={handleUseOriginal}
            className="px-6 py-2 text-sm font-medium border-2 border-black rounded-lg hover:bg-gray-50 transition-colors"
          >
            Keep Original
          </button>
          <button
            onClick={handleAcceptAll}
            className="email-button px-6 py-2 text-sm font-medium flex items-center gap-2"
          >
            <Check size={18} />
            Use {hasManualAdjustments ? 'Adjusted' : 'AI'} Estimates
          </button>
        </div>
      </div>

      {/* Rate Update Confirmation Modal */}
      {showRateConfirmModal && pendingRateUpdate && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[110] p-4">
          <div 
            className="bg-white rounded-lg p-6 max-w-md w-full" 
            style={{
              border: '2px solid #000',
              boxShadow: '4px 4px 0px 0px #000'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-xl font-black text-gray-900 mb-4">Update Client Rates?</h3>
            
            <div className="space-y-4 mb-6">
              <p className="text-sm text-gray-600">
                This will permanently update the client&apos;s rates for all future projects, contracts, and time tracking.
              </p>
              
              <div className="bg-gray-50 p-4 rounded-lg border-2 border-gray-200 space-y-2">
                <div className="flex justify-between items-center text-sm">
                  <span className="font-bold text-gray-500">Hourly Rate:</span>
                  <div className="flex items-center gap-2">
                    <span className="text-gray-400 line-through">
                      {formatWithCurrency(Number(clientHourlyRate), userCurrency)}
                    </span>
                    <span className="text-gray-400">→</span>
                    <span className="font-black text-gray-900">
                      {formatWithCurrency(pendingRateUpdate.newRate, userCurrency)}
                    </span>
                  </div>
                </div>
                
                <div className="flex justify-between items-center text-sm">
                  <span className="font-bold text-gray-500">Change Request:</span>
                  <div className="flex items-center gap-2">
                    <span className="text-gray-400 line-through">
                      {formatWithCurrency(Number(clientChangeRequestRate), userCurrency)}
                    </span>
                    <span className="text-gray-400">→</span>
                    <span className="font-black text-gray-900">
                      {formatWithCurrency(pendingRateUpdate.newCRRate, userCurrency)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end space-x-3">
              <button
                onClick={cancelRateUpdate}
                className="px-4 py-2 text-sm font-bold text-gray-700 hover:bg-gray-100 rounded-lg border-2 border-transparent hover:border-gray-200 transition-all"
                disabled={isUpdatingClient}
              >
                Cancel
              </button>
              <button
                onClick={confirmRateUpdate}
                className="px-4 py-2 text-sm font-bold bg-[#ccff00] text-black border-2 border-black rounded-lg hover:bg-[#b8e600] hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all"
                disabled={isUpdatingClient}
              >
                {isUpdatingClient ? 'Updating...' : 'Update Rates'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  // Render through portal to escape ProjectModal's DOM tree
  return createPortal(modalContent, document.body);
}
