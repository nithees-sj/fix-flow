'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, type FieldValues, type Path, type UseFormProps, type UseFormReturn } from 'react-hook-form';
import type { z } from 'zod';
import { isApiError } from './api';

/** react-hook-form wired to a shared Zod schema from @fixflow/shared (same rules as the API). */
export function useZodForm<S extends z.ZodType<FieldValues, FieldValues>>(
  schema: S,
  props?: Omit<UseFormProps<z.input<S>, unknown, z.output<S>>, 'resolver'>,
) {
  return useForm<z.input<S>, unknown, z.output<S>>({
    resolver: zodResolver(schema as never) as never,
    mode: 'onTouched',
    ...props,
  });
}

/**
 * Maps server field errors (problem+json `errors[]`) onto the form; returns the remaining
 * top-level message, if any, for a form-level alert.
 */
export function applyServerErrors<T extends FieldValues>(form: UseFormReturn<T, unknown, never> | UseFormReturn<T>, error: unknown): string | null {
  if (!isApiError(error)) return 'Something went wrong. Please try again.';
  const fields = error.fieldErrors;
  let mapped = 0;
  for (const [path, message] of Object.entries(fields)) {
    if (path && path !== '(root)') {
      (form as UseFormReturn<T>).setError(path as Path<T>, { type: 'server', message });
      mapped++;
    }
  }
  return mapped && error.code === 'VALIDATION_FAILED' ? null : (error.problem.detail ?? error.message);
}
