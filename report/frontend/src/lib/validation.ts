import { z } from 'zod';

// Common validation schemas
export const emailSchema = z.string().email('Invalid email address');

export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number');

export const urlSchema = z.string().url('Invalid URL');

export const phoneSchema = z
  .string()
  .regex(/^\+?[1-9]\d{1,14}$/, 'Invalid phone number');

export const currencySchema = z
  .number()
  .positive('Amount must be positive')
  .multipleOf(0.01, 'Amount must have at most 2 decimal places');

export const percentageSchema = z
  .number()
  .min(0, 'Percentage must be at least 0')
  .max(100, 'Percentage must be at most 100');

// Client validation schema
export const clientSchema = z.object({
  name: z.string().min(1, 'Client name is required'),
  email: emailSchema,
  company: z.string().optional(),
  default_hourly_rate: z.number().positive('Hourly rate must be positive'),
  change_request_rate: z.number().positive('Change request rate must be positive'),
  payment_method: z.enum(['paystack', 'manual']),
  payment_gateway_name: z.string().optional(),
  payment_instructions: z.string().optional(),
});

// Project validation schema
export const projectSchema = z.object({
  name: z.string().min(1, 'Project name is required'),
  description: z.string().optional(),
  client_id: z.number().positive('Client is required'),
  project_budget: z.number().positive('Project budget must be positive'),
  auto_replenish: z.boolean().optional(),
  auto_pause_threshold: percentageSchema.optional(),
  max_revisions: z.number().int().positive().optional(),
});

// Deliverable validation schema
export const deliverableSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional(),
  task_reference: z.string().optional(),
  acceptance_criteria: z.string().optional(),
  estimated_hours: z.number().positive().optional(),
});

// Change request validation schema
export const changeRequestSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().min(1, 'Description is required'),
  estimated_hours: z.number().positive('Estimated hours must be positive'),
});

// Time entry validation schema
export const timeEntrySchema = z.object({
  description: z.string().min(1, 'Description is required'),
  start_time: z.string().datetime(),
  end_time: z.string().datetime().optional(),
  duration_minutes: z.number().int().positive().optional(),
});

// Invoice validation schema
export const invoiceSchema = z.object({
  due_date: z.string().datetime(),
  notes: z.string().optional(),
});

// User settings validation schema
export const userSettingsSchema = z.object({
  bio: z.string().optional(),
  default_currency: z.string().length(3, 'Currency code must be 3 characters'),
  timezone: z.string().min(1, 'Timezone is required'),
  date_format: z.string().min(1, 'Date format is required'),
  time_format: z.enum(['12h', '24h']),
  email_notifications: z.boolean(),
  auto_pause_notifications: z.boolean(),
  contract_signed_notifications: z.boolean(),
  payment_received_notifications: z.boolean(),
});

// Paystack subaccount validation schema
export const paystackSubaccountSchema = z.object({
  business_name: z.string().min(1, 'Business name is required'),
  settlement_bank: z.string().min(1, 'Bank is required'),
  account_number: z.string().regex(/^\d{10}$/, 'Account number must be 10 digits'),
});

// Contract template validation schema
export const contractTemplateSchema = z.object({
  name: z.string().min(1, 'Template name is required'),
  description: z.string().optional(),
  template_content: z.string().min(1, 'Template content is required'),
});

// Project template validation schema
export const projectTemplateSchema = z.object({
  name: z.string().min(1, 'Template name is required'),
  description: z.string().optional(),
  category: z.string().optional(),
});

// Helper function to get error message from Zod error
export function getZodErrorMessage(error: z.ZodError): string {
  return error.issues[0]?.message || 'Validation error';
}

// Helper function to validate data against schema
export function validateData<T>(schema: z.ZodSchema<T>, data: unknown): {
  success: boolean;
  data?: T;
  error?: string;
} {
  try {
    const validatedData = schema.parse(data);
    return { success: true, data: validatedData };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: getZodErrorMessage(error) };
    }
    return { success: false, error: 'Validation error' };
  }
}
