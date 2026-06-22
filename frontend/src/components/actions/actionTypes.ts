export interface SnippetCategory {
  id: string
  name: string
  color: string
  special?: boolean
}

export interface Snippet {
  id: string
  name: string
  categoryId: string
  cmds: string[]
  vars: string[]
}

export type ScheduleMode = 'once' | 'ntimes' | 'forever'

export interface ScheduledAction {
  id: string
  snippetId: string
  label: string
  mode: ScheduleMode
  trigger: string
  intervalMs?: number
  cronExpr?: string
  repeatCount?: number
  runAt?: number
  vars: Record<string, string>
  status: 'active' | 'paused'
  runsRemaining?: number
  lastRunMs?: number
  lastRunOk?: boolean
}

export interface CreateSnippetRequest {
  name: string
  categoryId: string
  cmds: string[]
}

export interface UpdateSnippetRequest {
  name?: string
  categoryId?: string
  cmds?: string[]
}

export interface CreateCategoryRequest {
  name: string
  color: string
}

export interface CreateScheduleRequest {
  snippetId: string
  label: string
  mode: string
  trigger: string
  intervalMs?: number
  cronExpr?: string
  repeatCount?: number
  runAt?: number
  vars?: Record<string, string>
}

export interface ExecuteSnippetRequest {
  vars?: Record<string, string>
}
