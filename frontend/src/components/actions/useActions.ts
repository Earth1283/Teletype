import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../../api/client'
import type {
  Snippet, SnippetCategory, ScheduledAction,
  CreateSnippetRequest, UpdateSnippetRequest,
  CreateCategoryRequest, CreateScheduleRequest,
} from './actionTypes'

const BASE = '/actions'

export function useCategories() {
  return useQuery<SnippetCategory[]>({
    queryKey: ['categories'],
    queryFn: () => api.get(`${BASE}/categories`).then(r => r.data),
  })
}

export function useSnippets() {
  return useQuery<Snippet[]>({
    queryKey: ['snippets'],
    queryFn: () => api.get(`${BASE}/snippets`).then(r => r.data),
  })
}

export function useSchedule() {
  return useQuery<ScheduledAction[]>({
    queryKey: ['schedule'],
    queryFn: () => api.get(`${BASE}/schedule`).then(r => r.data),
    refetchInterval: 15_000,
  })
}

export function useCreateCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (req: CreateCategoryRequest) =>
      api.post<SnippetCategory>(`${BASE}/categories`, req).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['categories'] }),
  })
}

export function useDeleteCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`${BASE}/categories/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['categories'] })
      qc.invalidateQueries({ queryKey: ['snippets'] })
    },
  })
}

export function useCreateSnippet() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (req: CreateSnippetRequest) =>
      api.post<Snippet>(`${BASE}/snippets`, req).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['snippets'] }),
  })
}

export function useUpdateSnippet() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...req }: UpdateSnippetRequest & { id: string }) =>
      api.put<Snippet>(`${BASE}/snippets/${id}`, req).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['snippets'] }),
  })
}

export function useDeleteSnippet() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`${BASE}/snippets/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['snippets'] }),
  })
}

export function useExecuteSnippet() {
  return useMutation({
    mutationFn: ({ id, vars }: { id: string; vars?: Record<string, string> }) =>
      api.post(`${BASE}/execute/${id}`, { vars: vars ?? {} }),
  })
}

export function useCreateSchedule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (req: CreateScheduleRequest) =>
      api.post<ScheduledAction>(`${BASE}/schedule`, req).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['schedule'] }),
  })
}

export function useDeleteSchedule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`${BASE}/schedule/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['schedule'] }),
  })
}

export function usePauseSchedule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.patch(`${BASE}/schedule/${id}/pause`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['schedule'] }),
  })
}

export function useResumeSchedule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.patch(`${BASE}/schedule/${id}/resume`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['schedule'] }),
  })
}
