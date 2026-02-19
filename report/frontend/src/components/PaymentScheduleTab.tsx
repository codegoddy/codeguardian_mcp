'use client';

import { useQueryClient } from '@tanstack/react-query';
import { invoiceKeys } from '@/hooks/useInvoices';
import React, { useState, useEffect } from 'react';
import { 
  CheckCircle, 
  Clock, 
  AlertCircle,
  Settings,
  Send,
  Plus,
  Trash2
} from 'lucide-react';
import {
  PaymentSchedule,
  PaymentMilestone,
  PaymentMilestoneCreate,
  getPaymentSchedule,
  setupPaymentSchedule,
  triggerMilestone,
  markMilestonePaid,
  deletePaymentSchedule,
  parsePaymentTerms,
  PAYMENT_PRESETS
} from '@/services/paymentMilestones';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/Select';

interface PaymentScheduleTabProps {
  projectId: string;
  projectBudget: number;
  currency: string;
  onSendInvoice?: (milestone: PaymentMilestone) => void;
}

const formatCurrency = (amount: number, currency: string) => {
  return `${currency} ${amount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
};

const StatusBadge = ({ status }: { status: PaymentMilestone['status'] }) => {
  const configs = {
    pending: { icon: Clock, bg: 'bg-[#1a1a2e] text-white', label: 'Pending' },
    triggered: { icon: AlertCircle, bg: 'bg-yellow-500 text-white', label: 'Due Now' },
    invoiced: { icon: Send, bg: 'bg-blue-500 text-white', label: 'Invoiced' },
    awaiting_confirmation: { icon: Clock, bg: 'bg-orange-500 text-white', label: 'Awaiting' },
    paid: { icon: CheckCircle, bg: 'bg-[#ccff00] text-black', label: 'Paid' }
  };
  
  const config = configs[status];
  const Icon = config.icon;
  
  return (
    <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium ${config.bg}`}>
      <Icon className="w-3 h-3" strokeWidth={2} />
      {config.label}
    </span>
  );
};

const TriggerLabel = ({ type, value }: { type: string; value: string | null }) => {
  const labels: Record<string, string> = {
    contract_signed: 'On contract signed',
    percentage_complete: `At ${value}% complete`,
    milestone_complete: 'On milestone complete',
    date: value ? `On ${value}` : 'On date',
    manual: 'Manual trigger'
  };
  return <span className="text-xs font-bold text-gray-600">{labels[type] || type}</span>;
};

export default function PaymentScheduleTab({ 
  projectId, 
  projectBudget, 
  currency,
  onSendInvoice 
}: PaymentScheduleTabProps) {
  const queryClient = useQueryClient();
  const [schedule, setSchedule] = useState<PaymentSchedule | null>(null);
  const [loading, setLoading] = useState(true);
  const [showSetup, setShowSetup] = useState(false);
  const [setupMilestones, setSetupMilestones] = useState<PaymentMilestoneCreate[]>([]);
  const [saving, setSaving] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [parsingContract, setParsingContract] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);

  useEffect(() => {
    loadSchedule();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const loadSchedule = async () => {
    try {
      const data = await getPaymentSchedule(projectId);
      setSchedule(data);
    } catch (error) {
      console.error('Failed to load payment schedule:', error);
    } finally {
      setLoading(false);
    }
  };

  const handlePresetSelect = (presetKey: keyof typeof PAYMENT_PRESETS) => {
    setSetupMilestones(PAYMENT_PRESETS[presetKey]);
    setParseError(null);
  };

  const handleAutoFillFromContract = async () => {
    setParsingContract(true);
    setParseError(null);
    
    try {
      const result = await parsePaymentTerms(projectId);
      
      if (result.found && result.terms.length > 0) {
        // Convert parsed terms to milestone create format
        const milestones: PaymentMilestoneCreate[] = result.terms.map((term, idx) => ({
          name: term.name,
          percentage: term.percentage,
          trigger_type: term.trigger_type,
          trigger_value: term.trigger_value,
          order: idx
        }));
        setSetupMilestones(milestones);
        setShowSetup(true);
      } else {
        setParseError(result.raw_text || 'No payment terms found in contract. Using default preset.');
        // Fall back to default preset
        setSetupMilestones(PAYMENT_PRESETS['30-40-30']);
        setShowSetup(true);
      }
    } catch (error) {
      console.error('Failed to parse contract:', error);
      setParseError('Failed to parse contract. Using default preset.');
      setSetupMilestones(PAYMENT_PRESETS['30-40-30']);
      setShowSetup(true);
    } finally {
      setParsingContract(false);
    }
  };

  const handleAddMilestone = () => {
    setSetupMilestones([
      ...setupMilestones,
      { name: '', percentage: 0, trigger_type: 'manual', order: setupMilestones.length }
    ]);
  };

  const handleRemoveMilestone = (index: number) => {
    setSetupMilestones(setupMilestones.filter((_, i) => i !== index));
  };

  const handleMilestoneChange = (index: number, field: string, value: string | number) => {
    const updated = [...setupMilestones];
    updated[index] = { ...updated[index], [field]: value };
    setSetupMilestones(updated);
  };

  const handleSaveSchedule = async () => {
    const total = setupMilestones.reduce((sum, m) => sum + Number(m.percentage), 0);
    if (Math.abs(total - 100) > 0.01) {
      alert(`Percentages must sum to 100%. Current total: ${total}%`);
      return;
    }

    setSaving(true);
    try {
      await setupPaymentSchedule(projectId, setupMilestones);
      await loadSchedule();
      setShowSetup(false);
    } catch (error) {
      console.error('Failed to save schedule:', error);
      alert('Failed to save payment schedule');
    } finally {
      setSaving(false);
    }
  };

  const handleTrigger = async (milestone: PaymentMilestone) => {
    setActionLoading(milestone.id);
    try {
      await triggerMilestone(projectId, milestone.id);
      await loadSchedule();
      // Invalidate invoice list to show the new invoice immediately
      queryClient.invalidateQueries({ queryKey: invoiceKeys.lists() });
    } catch (error) {
      console.error('Failed to trigger milestone:', error);
    } finally {
      setActionLoading(null);
    }
  };

  const handleMarkPaid = async (milestone: PaymentMilestone) => {
    setActionLoading(milestone.id);
    try {
      await markMilestonePaid(projectId, milestone.id);
      await loadSchedule();
      // Invalidate invoice list to update status
      queryClient.invalidateQueries({ queryKey: invoiceKeys.lists() });
    } catch (error) {
      console.error('Failed to mark as paid:', error);
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeleteSchedule = async () => {
    if (!confirm('Delete payment schedule? This cannot be undone.')) return;
    
    try {
      await deletePaymentSchedule(projectId);
      await loadSchedule();
    } catch (error) {
      console.error('Failed to delete schedule:', error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-emerald-500"></div>
      </div>
    );
  }

  // Not configured - show setup prompt
  if (!schedule || schedule.status === 'not_configured') {
    return (
      <div className="space-y-6">
        {!showSetup ? (
          <div 
            className="bg-yellow-50 border-2 border-yellow-500 rounded-lg p-6 text-center"
            style={{ boxShadow: "2px 2px 0px 0px #000" }}
          >
            <AlertCircle className="w-12 h-12 text-yellow-600 mx-auto mb-4" strokeWidth={3} />
            <h3 className="text-lg font-black text-gray-900 mb-2 tracking-tight">Payment Schedule Not Configured</h3>
            <p className="text-gray-600 mb-6 max-w-md mx-auto">
              Set up a payment schedule to enable payment gates and automatic invoice generation.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button
                onClick={handleAutoFillFromContract}
                disabled={parsingContract}
                className="email-button-blue text-white px-6 py-2 text-sm font-medium border border-black rounded-lg flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {parsingContract ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                    Parsing Contract...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                    </svg>
                    Auto-fill from Contract (AI)
                  </>
                )}
              </button>
              <button
                onClick={() => {
                  setSetupMilestones(PAYMENT_PRESETS['30-40-30']);
                  setShowSetup(true);
                }}
                className="email-button px-6 py-2 text-sm font-medium"
              >
                Set Up Manually
              </button>
            </div>
          </div>
        ) : (
          <>
            {parseError && (
              <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-3 mb-4">
                <p className="text-sm text-yellow-800">{parseError}</p>
              </div>
            )}
            <SetupForm
              milestones={setupMilestones}
              projectBudget={projectBudget}
              currency={currency}
              saving={saving}
              onPresetSelect={handlePresetSelect}
              onAddMilestone={handleAddMilestone}
              onRemoveMilestone={handleRemoveMilestone}
              onMilestoneChange={handleMilestoneChange}
              onSave={handleSaveSchedule}
              onCancel={() => {
                setShowSetup(false);
                setParseError(null);
              }}
            />
          </>
        )}
      </div>
    );
  }

  // Configured - show schedule
  return (
    <div className="space-y-6">
      {/* Summary Header */}
      <div className="grid grid-cols-3 gap-4">
        <div className="email-card p-4">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="text-[#ccff00]" size={20} />
            <span className="text-sm font-bold text-white uppercase tracking-wide">Total Budget</span>
          </div>
          <div className="text-3xl font-black text-white">{formatCurrency(schedule.total_budget, currency)}</div>
        </div>
        <div className="email-card p-4">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle className="text-[#ccff00]" size={20} />
            <span className="text-sm font-bold text-white uppercase tracking-wide">Received</span>
          </div>
          <div className="text-3xl font-black text-[#ccff00]">{formatCurrency(schedule.total_paid, currency)}</div>
        </div>
        <div className="email-card p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle className="text-[#ccff00]" size={20} />
            <span className="text-sm font-bold text-white uppercase tracking-wide">Pending</span>
          </div>
          <div className="text-3xl font-black text-white">{formatCurrency(schedule.total_pending, currency)}</div>
        </div>
      </div>

      {/* Milestones List */}
      <div className="rounded-2xl p-6 bg-white">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-medium text-black">Payment Milestones</h3>
          <button
            onClick={() => {
              setSetupMilestones(schedule.milestones.map(m => ({
                name: m.name,
                percentage: m.percentage,
                trigger_type: m.trigger_type,
                trigger_value: m.trigger_value || undefined,
                order: m.order
              })));
              setShowSetup(true);
            }}
            className="px-4 py-2 text-sm font-medium rounded-full hover:scale-105 transition-transform duration-200"
            style={{ backgroundColor: "#ccff00", color: "#000" }}
          >
            <span className="flex items-center gap-2">
              <Settings className="w-4 h-4" />
              Edit Schedule
            </span>
          </button>
        </div>

        {/* Table Header */}
        <div className="pb-4 border-b-2 border-gray-300">
          <div className="flex items-center space-x-4">
            <div
              className="text-xs font-semibold text-gray-700 uppercase tracking-wide"
              style={{ width: '100px' }}
            >
              Status
            </div>
            <div className="flex-1 grid grid-cols-3 gap-6">
              <div className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
                Milestone
              </div>
              <div className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
                Amount
              </div>
              <div className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
                Trigger
              </div>
            </div>
            <div
              className="text-xs font-semibold text-gray-700 uppercase tracking-wide"
              style={{ width: '120px' }}
            >
              Actions
            </div>
          </div>
        </div>

        {/* Milestone Rows */}
        {schedule.milestones.map((milestone, index) => (
          <div
            key={milestone.id}
            className={`py-4 ${index !== schedule.milestones.length - 1 ? 'border-b border-gray-200' : ''}`}
          >
            <div className="flex items-center space-x-4">
              <div style={{ width: '100px' }}>
                <StatusBadge status={milestone.status} />
              </div>
              <div className="flex-1 grid grid-cols-3 gap-6">
                <div>
                  <div className="text-sm font-semibold text-gray-900">{milestone.name}</div>
                  <div className="text-xs text-gray-500">({milestone.percentage}%)</div>
                </div>
                <div className="text-sm font-bold text-gray-900">
                  {formatCurrency(milestone.amount, currency)}
                </div>
                <div>
                  <TriggerLabel type={milestone.trigger_type} value={milestone.trigger_value} />
                  {milestone.paid_at && (
                    <p className="text-xs text-gray-500 mt-1">
                      Paid {new Date(milestone.paid_at).toLocaleDateString()}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2" style={{ width: '120px' }}>
                {milestone.status === 'pending' && (
                  <button
                    onClick={() => handleTrigger(milestone)}
                    disabled={actionLoading === milestone.id}
                    className="px-3 py-1 text-xs font-medium text-white rounded-full bg-yellow-500 hover:scale-105 transition-transform duration-200 disabled:opacity-50"
                  >
                    {actionLoading === milestone.id ? '...' : 'Trigger'}
                  </button>
                )}
                {milestone.status === 'triggered' && (
                  <>
                    {onSendInvoice && (
                      <button
                        onClick={() => onSendInvoice(milestone)}
                        className="px-3 py-1 text-xs font-medium text-white rounded-full bg-blue-500 hover:scale-105 transition-transform duration-200 flex items-center gap-1"
                      >
                        <Send className="w-3 h-3" />
                        Invoice
                      </button>
                    )}
                  </>
                )}
                {(milestone.status === 'invoiced' || milestone.status === 'awaiting_confirmation') && (
                  <button
                    onClick={() => handleMarkPaid(milestone)}
                    disabled={actionLoading === milestone.id}
                    className="px-3 py-1 text-xs font-medium text-black rounded-full hover:scale-105 transition-transform duration-200 disabled:opacity-50"
                    style={{ backgroundColor: '#ccff00' }}
                  >
                    {actionLoading === milestone.id ? '...' : 'Mark Paid'}
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}

        {/* Delete Option */}
        <div className="pt-4 mt-4 border-t border-gray-200">
          <button
            onClick={handleDeleteSchedule}
            className="text-xs font-medium text-red-600 hover:text-red-700 flex items-center gap-1 hover:underline"
          >
            <Trash2 className="w-3 h-3" />
            Delete Payment Schedule
          </button>
        </div>
      </div>
    </div>
  );
}

// Setup Form Component
interface SetupFormProps {
  milestones: PaymentMilestoneCreate[];
  projectBudget: number;
  currency: string;
  saving: boolean;
  onPresetSelect: (preset: keyof typeof PAYMENT_PRESETS) => void;
  onAddMilestone: () => void;
  onRemoveMilestone: (index: number) => void;
  onMilestoneChange: (index: number, field: string, value: string | number) => void;
  onSave: () => void;
  onCancel: () => void;
}

function SetupForm({
  milestones,
  projectBudget,
  currency,
  saving,
  onPresetSelect,
  onAddMilestone,
  onRemoveMilestone,
  onMilestoneChange,
  onSave,
  onCancel
}: SetupFormProps) {
  const total = milestones.reduce((sum, m) => sum + Number(m.percentage), 0);
  const isValid = Math.abs(total - 100) < 0.01;

  return (
    <div 
      className="bg-white rounded-lg p-6 border-2 border-black"
      style={{ boxShadow: "4px 4px 0px 0px #000" }}
    >
      <h3 className="text-xl font-black text-gray-900 mb-4 tracking-tight">Set Up Payment Schedule</h3>
      
      {/* Presets */}
      <div className="mb-6">
        <p className="text-xs font-bold text-gray-600 mb-2 uppercase tracking-wide">Quick Presets</p>
        <div className="flex flex-wrap gap-2">
          {Object.entries(PAYMENT_PRESETS).map(([key]) => (
            <button
              key={key}
              onClick={() => onPresetSelect(key as keyof typeof PAYMENT_PRESETS)}
              className="px-3 py-1.5 text-xs font-bold bg-gray-50 hover:bg-[#ccff00] text-gray-900 border-2 border-black rounded-lg transition-colors"
            >
              {key.replace(/-/g, '/')}
            </button>
          ))}
        </div>
      </div>

      {/* Milestones */}
      <div className="space-y-3 mb-4">
        {milestones.map((m, idx) => (
          <div key={idx} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border-2 border-gray-300">
            <input
              type="text"
              value={m.name}
              onChange={(e) => onMilestoneChange(idx, 'name', e.target.value)}
              placeholder="Payment name"
              className="flex-1 bg-transparent border-0 text-gray-900 placeholder-gray-500 focus:ring-0 text-sm font-medium"
            />
            <div className="flex items-center gap-1">
              <input
                type="number"
                value={m.percentage}
                onChange={(e) => onMilestoneChange(idx, 'percentage', Number(e.target.value))}
                className="w-16 bg-transparent border-0 text-gray-900 text-right focus:ring-0 text-sm font-black"
              />
              <span className="text-gray-600 font-bold">%</span>
            </div>
            <span className="text-xs font-bold text-gray-600 w-24 text-right">
              {formatCurrency((m.percentage / 100) * projectBudget, currency)}
            </span>
            <Select
              value={m.trigger_type}
              onValueChange={(value) => onMilestoneChange(idx, 'trigger_type', value)}
            >
              <SelectTrigger className="w-28 h-8 text-xs font-bold border-2 border-gray-300">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="contract_signed">On signing</SelectItem>
                <SelectItem value="percentage_complete">% complete</SelectItem>
                <SelectItem value="manual">Manual</SelectItem>
              </SelectContent>
            </Select>
            {m.trigger_type === 'percentage_complete' && (
              <input
                type="number"
                value={m.trigger_value || ''}
                onChange={(e) => onMilestoneChange(idx, 'trigger_value', e.target.value)}
                placeholder="%"
                className="w-12 bg-white border-2 border-gray-300 rounded text-gray-900 text-center focus:ring-2 focus:ring-[#ccff00] focus:border-black text-sm font-black px-1 py-1"
              />
            )}
            <button
              onClick={() => onRemoveMilestone(idx)}
              className="text-gray-500 hover:text-red-600 p-1 hover:bg-red-50 rounded transition-colors"
            >
              <Trash2 className="w-4 h-4" strokeWidth={3} />
            </button>
          </div>
        ))}
      </div>

      {/* Add Milestone */}
      <button
        onClick={onAddMilestone}
        className="flex items-center gap-1 text-xs font-bold text-gray-600 hover:text-gray-900 px-3 py-1.5 hover:bg-gray-100 rounded-lg transition-colors mb-6"
      >
        <Plus className="w-4 h-4" strokeWidth={3} />
        Add Payment Milestone
      </button>

      {/* Total */}
      <div className={`flex items-center justify-between p-3 rounded-lg border-2 mb-6 ${isValid ? 'bg-emerald-50 border-emerald-500' : 'bg-red-50 border-red-500'}`}>
        <span className="text-sm font-bold text-gray-900">Total</span>
        <span className={`font-black ${isValid ? 'text-emerald-700' : 'text-red-700'}`}>
          {total}% {isValid ? '✓' : '(must be 100%)'}
        </span>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-3">
        <button
          onClick={onCancel}
          className="px-6 py-2 text-sm font-medium border-2 border-black rounded-lg hover:bg-gray-50 transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={onSave}
          disabled={!isValid || saving}
          className="email-button px-6 py-2 text-sm font-medium disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save Schedule'}
        </button>
      </div>
    </div>
  );
}
