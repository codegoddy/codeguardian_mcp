import { render, screen } from '@testing-library/react';
import React from 'react';
import '@testing-library/jest-dom';

// Mock lucide-react
jest.mock('lucide-react', () => ({
  Loader2: ({ className, size }) => React.createElement('svg', { 
    className, 
    width: size || 24, 
    height: size || 24, 
    viewBox: '0 0 24 24',
    'data-testid': 'loader-icon' 
  }),
}));

import Spinner from '@/components/ui/Spinner';
import { ButtonSpinner, FullPageSpinner } from '@/components/ui/Spinner';

describe('Spinner Components', () => {
  describe('Spinner', () => {
    it('renders with default size', () => {
      render(React.createElement(Spinner));

      expect(screen.getByTestId('loader-icon')).toBeInTheDocument();
    });

    it('renders with different sizes', () => {
      const { rerender } = render(React.createElement(Spinner, { size: 'sm' }));
      expect(screen.getByTestId('loader-icon')).toBeInTheDocument();

      rerender(React.createElement(Spinner, { size: 'md' }));
      expect(screen.getByTestId('loader-icon')).toBeInTheDocument();

      rerender(React.createElement(Spinner, { size: 'lg' }));
      expect(screen.getByTestId('loader-icon')).toBeInTheDocument();

      rerender(React.createElement(Spinner, { size: 'xl' }));
      expect(screen.getByTestId('loader-icon')).toBeInTheDocument();
    });

    it('renders with custom label', () => {
      render(React.createElement(Spinner, { label: 'Loading data...' }));

      expect(screen.getByText('Loading data...')).toBeInTheDocument();
    });

    it('renders without label when not provided', () => {
      render(React.createElement(Spinner));

      const paragraphs = screen.queryAllByRole('paragraph');
      expect(paragraphs).toHaveLength(0);
    });

    it('applies custom className', () => {
      render(React.createElement(Spinner, { className: 'custom-spinner' }));

      const spinner = screen.getByTestId('loader-icon');
      expect(spinner).toHaveClass('custom-spinner');
    });

    it('renders correct container structure', () => {
      render(React.createElement(Spinner));

      const container = screen.getByTestId('loader-icon').parentElement;
      expect(container).toHaveClass('flex flex-col items-center justify-center gap-2');
    });
  });

  describe('ButtonSpinner', () => {
    it('renders with default size', () => {
      render(React.createElement(ButtonSpinner));

      expect(screen.getByTestId('loader-icon')).toBeInTheDocument();
    });

    it('renders with different sizes', () => {
      const { rerender } = render(React.createElement(ButtonSpinner, { size: 'sm' }));
      expect(screen.getByTestId('loader-icon')).toBeInTheDocument();

      rerender(React.createElement(ButtonSpinner, { size: 'md' }));
      expect(screen.getByTestId('loader-icon')).toBeInTheDocument();
    });
  });

  describe('FullPageSpinner', () => {
    it('renders full page spinner with default label', () => {
      render(React.createElement(FullPageSpinner));

      expect(screen.getByText('Loading...')).toBeInTheDocument();
      expect(screen.getByTestId('loader-icon')).toBeInTheDocument();
    });

    it('renders full page spinner with custom label', () => {
      render(React.createElement(FullPageSpinner, { label: 'Processing...' }));

      expect(screen.getByText('Processing...')).toBeInTheDocument();
    });

    it('has fixed positioning', () => {
      render(React.createElement(FullPageSpinner));

      const container = screen.getByTestId('loader-icon').parentElement?.parentElement;
      expect(container).toHaveClass('fixed inset-0');
    });

    it('has backdrop blur', () => {
      render(React.createElement(FullPageSpinner));

      const container = screen.getByTestId('loader-icon').parentElement?.parentElement;
      expect(container).toHaveClass('backdrop-blur-sm');
    });

    it('has z-50 for high z-index', () => {
      render(React.createElement(FullPageSpinner));

      const container = screen.getByTestId('loader-icon').parentElement?.parentElement;
      expect(container).toHaveClass('z-50');
    });

    it('has white background with opacity', () => {
      render(React.createElement(FullPageSpinner));

      const container = screen.getByTestId('loader-icon').parentElement?.parentElement;
      expect(container).toHaveClass('bg-white/80');
    });
  });
});
