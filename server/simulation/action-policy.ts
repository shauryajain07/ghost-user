import type { ActionPolicy } from '../types'

function envFlagEnabled(value: string | undefined) {
  return value === '1' || value?.toLowerCase() === 'true'
}

function allowedHosts() {
  return (process.env.GHOST_USER_PROTECTED_HOSTS || '')
    .split(',')
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean)
}

function normalizeTaskValue(value: string) {
  return value.replace(/[\u201c\u201d]/g, '"').replace(/\s+/g, ' ').trim().replace(/[.,!?]+$/, '')
}

function taskValueCandidates(task: string) {
  const candidates: string[] = []
  const add = (value: string | undefined) => {
    const normalized = normalizeTaskValue(value || '')
    if (!normalized || normalized.length < 2 || candidates.some((candidate) => candidate.toLowerCase() === normalized.toLowerCase())) return
    candidates.push(normalized)
  }

  for (const match of task.matchAll(/["“”']([^"“”']{2,160})["“”']/g)) add(match[1])
  for (const match of task.matchAll(/\b(?:search|look\s+up|find|type|enter|write|fill(?:\s+in)?|select|choose|pick|use|provide|submit)\s+(.+?)(?:\s+(?:into|in|on|from|as|for)\s+(?:the\s+)?(?:search\s+)?(?:box|field|input|form|dropdown|select|menu|page|site|verification\s+code|account|email|password))?[.!?]?$/gi)) {
    add(match[1])
  }
  return candidates
}

/**
 * Full action mode may execute a sensitive input only when JEV selected a
 * value that the task supplied verbatim (or as a directly containing phrase).
 * This deliberately rejects vague instructions such as "enter my password".
 */
export function isTaskProvidedValue(value: string, task: string) {
  const normalizedValue = normalizeTaskValue(value)
  if (!normalizedValue || normalizedValue.length < 2) return false
  if (/^(?:the\s+)?(?:password|passcode|credit\s+card|card\s+number|cvv|cvc|security\s+code|ssn|social\s+security)$/i.test(normalizedValue)) return false
  const valueLower = normalizedValue.toLowerCase()
  return taskValueCandidates(task).some((candidate) => {
    const candidateLower = candidate.toLowerCase()
    return candidateLower === valueLower || candidateLower.includes(valueLower) || valueLower.includes(candidateLower)
  })
}

export function isProtectedActionsAvailable(website: string) {
  if (!envFlagEnabled(process.env.GHOST_USER_ALLOW_PROTECTED_ACTIONS)) return false
  let hostname = ''
  try {
    hostname = new URL(website).hostname.toLowerCase()
  } catch {
    return false
  }
  return allowedHosts().some((allowed) => hostname === allowed || hostname.endsWith('.' + allowed))
}

export function validateActionPolicy(website: string, actionPolicy: ActionPolicy, confirmed: boolean) {
  if (actionPolicy === 'safe') return { ok: true as const }
  if (!confirmed) return { ok: false as const, reason: 'Full action mode requires explicit confirmation.' }
  if (!isProtectedActionsAvailable(website)) {
    return {
      ok: false as const,
      reason: 'Full action mode is disabled. Set GHOST_USER_ALLOW_PROTECTED_ACTIONS=1 and allow the website host in GHOST_USER_PROTECTED_HOSTS.',
    }
  }
  return { ok: true as const }
}
