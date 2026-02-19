'use client';

import { useMemo } from 'react';

interface BudgetTransaction {
  id: string;
  type: 'deduction' | 'addition';
  amount: number;
  description: string;
  timestamp: string;
  balance_after: number;
}

interface BudgetHistoryProps {
  transactions: BudgetTransaction[];
  currency?: string;
}

export default function BudgetHistory({
  transactions,
  currency = 'USD'
}: BudgetHistoryProps) {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  };

  const sortedTransactions = useMemo(() => {
    return [...transactions].sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }, [transactions]);

  if (transactions.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Budget History</h3>
        <p className="text-sm text-gray-500 text-center py-8">
          No budget transactions yet
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Budget History</h3>
      
      <div className="space-y-3">
        {sortedTransactions.map((transaction) => (
          <div
            key={transaction.id}
            className="flex items-start justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <div className="flex-1">
              <div className="flex items-center gap-2">
                {transaction.type === 'deduction' ? (
                  <svg
                    className="h-5 w-5 text-red-500"
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v3.586L7.707 9.293a1 1 0 00-1.414 1.414l3 3a1 1 0 001.414 0l3-3a1 1 0 00-1.414-1.414L11 10.586V7z"
                      clipRule="evenodd"
                    />
                  </svg>
                ) : (
                  <svg
                    className="h-5 w-5 text-green-500"
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v3.586L7.707 9.293a1 1 0 00-1.414 1.414l3 3a1 1 0 001.414 0l3-3a1 1 0 00-1.414-1.414L11 10.586V7z"
                      clipRule="evenodd"
                      transform="rotate(180 10 10)"
                    />
                  </svg>
                )}
                <p className="text-sm font-medium text-gray-900">
                  {transaction.description}
                </p>
              </div>
              <p className="text-xs text-gray-500 mt-1 ml-7">
                {formatDate(transaction.timestamp)}
              </p>
              <p className="text-xs text-gray-600 mt-1 ml-7">
                Balance after: {formatCurrency(transaction.balance_after)}
              </p>
            </div>
            
            <div className="text-right ml-4">
              <p
                className={`text-sm font-semibold ${
                  transaction.type === 'deduction' ? 'text-red-600' : 'text-green-600'
                }`}
              >
                {transaction.type === 'deduction' ? '-' : '+'}
                {formatCurrency(transaction.amount)}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
