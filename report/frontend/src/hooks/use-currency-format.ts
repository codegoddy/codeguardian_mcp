import { useCallback } from 'react';

// Currency configuration with symbol, decimal places, and formatting rules
const CURRENCY_CONFIG: Record<string, {
  symbol: string;
  decimalPlaces: number;
  symbolPosition: 'before' | 'after';
}> = {
  'USD': { symbol: '$', decimalPlaces: 2, symbolPosition: 'before' },
  'EUR': { symbol: '€', decimalPlaces: 2, symbolPosition: 'before' },
  'GBP': { symbol: '£', decimalPlaces: 2, symbolPosition: 'before' },
  'KES': { symbol: 'KSh', decimalPlaces: 2, symbolPosition: 'before' },
  'NGN': { symbol: '₦', decimalPlaces: 2, symbolPosition: 'before' },
  'ZAR': { symbol: 'R', decimalPlaces: 2, symbolPosition: 'before' },
  'CAD': { symbol: 'C$', decimalPlaces: 2, symbolPosition: 'before' },
  'AUD': { symbol: 'A$', decimalPlaces: 2, symbolPosition: 'before' },
  'INR': { symbol: '₹', decimalPlaces: 2, symbolPosition: 'before' },
  'JPY': { symbol: '¥', decimalPlaces: 0, symbolPosition: 'before' },
  'CNY': { symbol: '¥', decimalPlaces: 2, symbolPosition: 'before' },
};

const formatNumber = (num: number, currency: string): string => {
  const config = CURRENCY_CONFIG[currency.toUpperCase()] || CURRENCY_CONFIG['USD'];

  // Round to appropriate decimal places
  const rounded = Math.round(num * Math.pow(10, config.decimalPlaces)) / Math.pow(10, config.decimalPlaces);

  // Format with thousands separator and decimal places
  const formatted = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: config.decimalPlaces,
    maximumFractionDigits: config.decimalPlaces,
  }).format(Math.abs(rounded));

  // Get currency symbol
  const symbol = config.symbol;

  // Format with currency symbol
  const result = config.symbolPosition === 'before'
    ? `${symbol}${formatted}`
    : `${formatted} ${symbol}`;

  // Add negative sign if needed
  return rounded < 0 ? `-${result}` : result;
};

export const useCurrencyFormat = () => {
  const formatWithCurrency = useCallback((amount: number, currency: string = 'USD'): string => {
    return formatNumber(amount, currency);
  }, []);

  return {
    formatWithCurrency,
  };
};
