'use client';

import { ReactNode } from 'react';
import {
  useForm,
  UseFormReturn,
  FieldValues,
  SubmitHandler,
  Path,
} from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

interface FormProps<T extends FieldValues> {
  onSubmit: SubmitHandler<T>;
  schema?: z.ZodType<T>;
  defaultValues?: Partial<T>;
  children: (methods: UseFormReturn<T>) => ReactNode;
  className?: string;
}

export function Form<T extends FieldValues>({
  onSubmit,
  schema,
  defaultValues,
  children,
  className = '',
}: FormProps<T>) {
  const methods = useForm<T>({
    // @ts-expect-error - zodResolver type compatibility issue with generic types
    resolver: schema ? zodResolver(schema) : undefined,
    // @ts-expect-error - defaultValues type compatibility issue with generic types
    defaultValues,
    mode: 'onChange',
  });

  return (
    // @ts-expect-error - generic type compatibility issue
    <form onSubmit={methods.handleSubmit(onSubmit)} className={className}>
      {children(methods as unknown as UseFormReturn<T>)}
    </form>
  );
}

interface FormFieldProps<T extends FieldValues> {
  name: Path<T>;
  label?: string;
  type?: string;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  methods: UseFormReturn<T>;
  className?: string;
  helperText?: string;
}

export function FormField<T extends FieldValues>({
  name,
  label,
  type = 'text',
  placeholder,
  required = false,
  disabled = false,
  methods,
  className = '',
  helperText,
}: FormFieldProps<T>) {
  const {
    register,
    formState: { errors },
  } = methods;

  const error = errors[name];
  const errorMessage = error?.message as string | undefined;

  return (
    <div className={`mb-4 ${className}`}>
      {label && (
        <label htmlFor={name} className="block text-sm font-medium text-gray-700 mb-1">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}
      <input
        id={name}
        type={type}
        placeholder={placeholder}
        disabled={disabled}
        className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed ${
          error ? 'border-red-500' : 'border-gray-300'
        }`}
        {...register(name)}
      />
      {helperText && !error && (
        <p className="mt-1 text-sm text-gray-500">{helperText}</p>
      )}
      {errorMessage && (
        <p className="mt-1 text-sm text-red-600">{errorMessage}</p>
      )}
    </div>
  );
}

interface FormTextareaProps<T extends FieldValues> {
  name: Path<T>;
  label?: string;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  methods: UseFormReturn<T>;
  className?: string;
  rows?: number;
  helperText?: string;
}

export function FormTextarea<T extends FieldValues>({
  name,
  label,
  placeholder,
  required = false,
  disabled = false,
  methods,
  className = '',
  rows = 4,
  helperText,
}: FormTextareaProps<T>) {
  const {
    register,
    formState: { errors },
  } = methods;

  const error = errors[name];
  const errorMessage = error?.message as string | undefined;

  return (
    <div className={`mb-4 ${className}`}>
      {label && (
        <label htmlFor={name} className="block text-sm font-medium text-gray-700 mb-1">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}
      <textarea
        id={name}
        placeholder={placeholder}
        disabled={disabled}
        rows={rows}
        className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed resize-none ${
          error ? 'border-red-500' : 'border-gray-300'
        }`}
        {...register(name)}
      />
      {helperText && !error && (
        <p className="mt-1 text-sm text-gray-500">{helperText}</p>
      )}
      {errorMessage && (
        <p className="mt-1 text-sm text-red-600">{errorMessage}</p>
      )}
    </div>
  );
}

interface FormSelectProps<T extends FieldValues> {
  name: Path<T>;
  label?: string;
  options: { value: string | number; label: string }[];
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  methods: UseFormReturn<T>;
  className?: string;
  helperText?: string;
}

export function FormSelect<T extends FieldValues>({
  name,
  label,
  options,
  placeholder,
  required = false,
  disabled = false,
  methods,
  className = '',
  helperText,
}: FormSelectProps<T>) {
  const {
    register,
    formState: { errors },
  } = methods;

  const error = errors[name];
  const errorMessage = error?.message as string | undefined;

  return (
    <div className={`mb-4 ${className}`}>
      {label && (
        <label htmlFor={name} className="block text-sm font-medium text-gray-700 mb-1">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}
      <select
        id={name}
        disabled={disabled}
        className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed ${
          error ? 'border-red-500' : 'border-gray-300'
        }`}
        {...register(name)}
      >
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {helperText && !error && (
        <p className="mt-1 text-sm text-gray-500">{helperText}</p>
      )}
      {errorMessage && (
        <p className="mt-1 text-sm text-red-600">{errorMessage}</p>
      )}
    </div>
  );
}

interface FormCheckboxProps<T extends FieldValues> {
  name: Path<T>;
  label: string;
  disabled?: boolean;
  methods: UseFormReturn<T>;
  className?: string;
  helperText?: string;
}

export function FormCheckbox<T extends FieldValues>({
  name,
  label,
  disabled = false,
  methods,
  className = '',
  helperText,
}: FormCheckboxProps<T>) {
  const {
    register,
    formState: { errors },
  } = methods;

  const error = errors[name];
  const errorMessage = error?.message as string | undefined;

  return (
    <div className={`mb-4 ${className}`}>
      <div className="flex items-center">
        <input
          id={name}
          type="checkbox"
          disabled={disabled}
          className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 disabled:cursor-not-allowed"
          {...register(name)}
        />
        <label htmlFor={name} className="ml-2 text-sm text-gray-700">
          {label}
        </label>
      </div>
      {helperText && !error && (
        <p className="mt-1 text-sm text-gray-500 ml-6">{helperText}</p>
      )}
      {errorMessage && (
        <p className="mt-1 text-sm text-red-600 ml-6">{errorMessage}</p>
      )}
    </div>
  );
}

interface FormSubmitButtonProps {
  children: ReactNode;
  isSubmitting?: boolean;
  disabled?: boolean;
  className?: string;
  variant?: 'primary' | 'secondary' | 'danger';
}

export function FormSubmitButton({
  children,
  isSubmitting = false,
  disabled = false,
  className = '',
  variant = 'primary',
}: FormSubmitButtonProps) {
  const variantClasses = {
    primary: 'bg-blue-600 hover:bg-blue-700 text-white',
    secondary: 'bg-gray-600 hover:bg-gray-700 text-white',
    danger: 'bg-red-600 hover:bg-red-700 text-white',
  };

  return (
    <button
      type="submit"
      disabled={disabled || isSubmitting}
      className={`px-4 py-2 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${variantClasses[variant]} ${className}`}
    >
      {isSubmitting ? 'Submitting...' : children}
    </button>
  );
}
