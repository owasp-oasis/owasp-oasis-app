/** Shared defaults and validation for the signed-in Workspace experience. */
export const WORKSPACE_DEFAULTS = {
  repositories: [] as number[],
  cwes: [] as string[],
  minimumSeverity: 'low' as 'low' | 'medium' | 'high' | 'critical',
  hideClosed: true,
  hideVoted: true,
  keyboardShortcuts: true,
  layout: 'split' as 'split' | 'table' | 'focus',
  diffView: 'split' as 'split' | 'unified',
}
export type WorkspacePreferences = typeof WORKSPACE_DEFAULTS

export function validateWorkspacePreferences(input: unknown): Partial<WorkspacePreferences> | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null
  const output: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(input)) {
    if (!Object.prototype.hasOwnProperty.call(WORKSPACE_DEFAULTS,key)) return null
    if (key === 'repositories') {
      if (!Array.isArray(value) || value.length > 500 || !value.every(id => Number.isSafeInteger(id) && id > 0)) return null
      output[key] = [...new Set(value)]
    } else if (key === 'cwes') {
      if (!Array.isArray(value) || value.length > 500 || !value.every(cwe => typeof cwe === 'string' && /^CWE-\d{1,6}$/.test(cwe))) return null
      output[key] = [...new Set(value)]
    } else if (key === 'minimumSeverity') {
      if (typeof value !== 'string' || !['low', 'medium', 'high', 'critical'].includes(String(value))) return null
      output[key] = value
    } else if (key === 'layout') {
      if (typeof value !== 'string' || !['split', 'table', 'focus'].includes(String(value))) return null
      output[key] = value
    } else if (key === 'diffView') {
      if (typeof value !== 'string' || !['split', 'unified'].includes(String(value))) return null
      output[key] = value
    } else {
      if (typeof value !== 'boolean') return null
      output[key] = value
    }
  }
  return output as Partial<WorkspacePreferences>
}
