'use client';

/**
 * Example usage of Form components with validation
 * This file demonstrates how to use the Form, FormField, and other form components
 * with React Hook Form and Zod validation
 */

import { Form, FormField, FormTextarea, FormSelect, FormSubmitButton } from './Form';
import { clientSchema } from '@/lib/validation';
import { z } from 'zod';

type ClientFormData = z.infer<typeof clientSchema>;

export default function FormExample() {
  const handleSubmit = (data: ClientFormData) => {
    console.log('Form submitted:', data);
    // Handle form submission
  };

  return (
    <Form<ClientFormData>
      schema={clientSchema}
      onSubmit={handleSubmit}
      defaultValues={{
        payment_method: 'paystack',
      }}
    >
      {(methods) => (
        <>
          <FormField
            name="name"
            label="Client Name"
            placeholder="Enter client name"
            required
            methods={methods}
          />

          <FormField
            name="email"
            label="Email Address"
            type="email"
            placeholder="client@example.com"
            required
            methods={methods}
          />

          <FormField
            name="company"
            label="Company"
            placeholder="Company name (optional)"
            methods={methods}
          />

          <FormField
            name="default_hourly_rate"
            label="Default Hourly Rate"
            type="number"
            placeholder="50.00"
            required
            methods={methods}
            helperText="The standard hourly rate for this client"
          />

          <FormField
            name="change_request_rate"
            label="Change Request Rate"
            type="number"
            placeholder="75.00"
            required
            methods={methods}
            helperText="Hourly rate for out-of-scope work"
          />

          <FormSelect
            name="payment_method"
            label="Payment Method"
            options={[
              { value: 'paystack', label: 'Paystack' },
              { value: 'manual', label: 'Manual Payment' },
            ]}
            required
            methods={methods}
          />

          {methods.watch('payment_method') === 'manual' && (
            <>
              <FormField
                name="payment_gateway_name"
                label="Payment Gateway Name"
                placeholder="e.g., Bank Transfer, PayPal"
                methods={methods}
              />

              <FormTextarea
                name="payment_instructions"
                label="Payment Instructions"
                placeholder="Enter payment instructions for the client"
                methods={methods}
                rows={4}
              />
            </>
          )}

          <div className="flex gap-3 justify-end mt-6">
            <button
              type="button"
              className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
            >
              Cancel
            </button>
            <FormSubmitButton
              isSubmitting={methods.formState.isSubmitting}
              disabled={!methods.formState.isValid}
            >
              Create Client
            </FormSubmitButton>
          </div>
        </>
      )}
    </Form>
  );
}
