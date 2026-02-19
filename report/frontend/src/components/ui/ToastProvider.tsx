'use client';

import { Toaster } from 'sonner';

export default function ToastProvider() {
  return (
    <Toaster
      position="top-right"
      expand={false}
      closeButton
      duration={4000}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast: 'flex items-start gap-3 p-4 rounded-lg bg-white border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] font-sans w-full',
          title: 'font-bold text-sm text-black uppercase tracking-wide',
          description: 'font-medium text-xs text-gray-700 mt-1',
          closeButton: 'border-2 border-black rounded bg-white hover:bg-gray-100 transition-colors',
          success: 'bg-[#ccff00] border-2 border-black',
          error: 'bg-red-100 border-2 border-black',
          warning: 'bg-yellow-100 border-2 border-black',
          info: 'bg-blue-100 border-2 border-black',
        },
      }}
    />
  );
}
