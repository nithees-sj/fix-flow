'use client';

import { useQuery } from '@tanstack/react-query';
import type { CategoryDto, LocationDto, MemberDto, Paginated, SlaPolicyDto } from '@fixflow/shared';
import { api } from './api';
import { qk } from './query-client';

/** Shared reference-data queries (cached across pages). */
export const useCategories = () => useQuery({ queryKey: qk.categories, queryFn: () => api<CategoryDto[]>('/categories'), staleTime: 5 * 60_000 });

export const useLocations = () => useQuery({ queryKey: qk.locations, queryFn: () => api<LocationDto[]>('/locations'), staleTime: 5 * 60_000 });

export const useSlaPolicies = () => useQuery({ queryKey: qk.slaPolicies, queryFn: () => api<SlaPolicyDto[]>('/sla-policies'), staleTime: 5 * 60_000 });

export const useTechnicians = (enabled = true) =>
  useQuery({
    queryKey: qk.members({ role: 'TECHNICIAN', status: 'ACTIVE' }),
    queryFn: () => api<Paginated<MemberDto>>('/members', { query: { role: 'TECHNICIAN', status: 'ACTIVE', pageSize: 100 } }),
    enabled,
    staleTime: 60_000,
  });
