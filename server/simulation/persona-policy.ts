import { randomInt } from 'node:crypto'
import type { BrowserAction, Persona, PersonaBehaviorProfile, ScanDepth } from '../types'

export interface PersonaRuntimeSignals {
  exploratoryActions: number
  comparisonActions: number
  noProgressEvents: number
  recoveryAttempts: number
  explorationLimit?: number
  comparisonLimit?: number
  noProgressLimit?: number
}

export interface PersonaRandom {
  seed: number
  next: () => number
  integer: (min: number, maxExclusive: number) => number
  range: (min: number, max: number) => number
}

export type RecoveryResponse = 'retry' | 'backtrack' | 'abandon'

export function createRunSeed() {
  return randomInt(1, 0x7fffffff)
}

function hashPersonaId(value: string) {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

export function createPersonaRandom(runSeed: number, personaId: string): PersonaRandom {
  let state = (hashPersonaId(personaId) ^ (runSeed >>> 0)) >>> 0
  if (!state) state = 1
  const personaSeed = state
  const next = () => {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    return (state >>> 0) / 4294967296
  }
  const integer = (min: number, maxExclusive: number) => {
    if (maxExclusive <= min) return min
    return min + Math.floor(next() * (maxExclusive - min))
  }
  return {
    seed: personaSeed,
    next,
    integer,
    range: (min, max) => integer(min, max + 1),
  }
}

export function deriveStepBudget(maxSteps: number, persona: Persona, random?: PersonaRandom) {
  const profileBudget = 7 + Math.round(persona.patience * 7) + persona.behavior.explorationBudget * 2
  const variation = random ? random.integer(-1, 2) : 0
  return Math.max(6, Math.min(maxSteps, profileBudget + variation))
}

export function createPersonaRuntimeSignals(persona: Persona, random: PersonaRandom): PersonaRuntimeSignals {
  return {
    exploratoryActions: 0,
    comparisonActions: 0,
    noProgressEvents: 0,
    recoveryAttempts: 0,
    explorationLimit: Math.max(0, persona.behavior.explorationBudget + random.integer(-1, 2)),
    comparisonLimit: Math.max(0, persona.behavior.comparisonBudget + random.integer(-1, 2)),
    noProgressLimit: Math.max(1, persona.behavior.noProgressLimit + random.integer(-1, 2)),
  }
}

export function visibleTextLimit(scanDepth: ScanDepth) {
  if (scanDepth === 'shallow') return 2200
  if (scanDepth === 'deep') return 6000
  return 4200
}

export function sampleWaitMilliseconds(profile: PersonaBehaviorProfile, random: PersonaRandom) {
  return random.range(profile.waitRangeMs[0], profile.waitRangeMs[1])
}

export function deviceLabel(profile: PersonaBehaviorProfile) {
  return profile.device === 'mobile'
    ? `${profile.viewport.width}×${profile.viewport.height} mobile`
    : `${profile.viewport.width}×${profile.viewport.height} desktop`
}

export function behaviorSummary(persona: Persona) {
  const profile = persona.behavior
  return [
    `scan=${profile.scanDepth}`,
    `exploration_budget=${profile.explorationBudget}`,
    `comparison_budget=${profile.comparisonBudget}`,
    `no_progress_limit=${profile.noProgressLimit}`,
    `recovery=${profile.recoveryStyle}`,
    `cta_bias=${profile.ctaBias.toFixed(2)}`,
    `device=${profile.device}`,
  ].join(', ')
}

export function recoveryInstruction(persona: Persona, signals: PersonaRuntimeSignals) {
  const profile = persona.behavior
  const explorationLimit = signals.explorationLimit ?? profile.explorationBudget
  const comparisonLimit = signals.comparisonLimit ?? profile.comparisonBudget
  const noProgressLimit = signals.noProgressLimit ?? profile.noProgressLimit
  const remainingExploration = Math.max(0, explorationLimit - signals.exploratoryActions)
  const remainingComparison = Math.max(0, comparisonLimit - signals.comparisonActions)
  return [
    `The persona has ${remainingExploration} exploratory actions remaining and ${remainingComparison} comparison actions remaining.`,
    `No-progress events: ${signals.noProgressEvents}/${noProgressLimit}. Recovery attempts: ${signals.recoveryAttempts}.`,
    profile.recoveryStyle === 'retry'
      ? 'If a control is ambiguous or unchanged, retry once before moving on.'
      : profile.recoveryStyle === 'backtrack'
        ? 'If a route stalls, prefer going back and trying a nearby alternative.'
        : 'If the route stalls or the interface is ambiguous, abandon rather than repeatedly exploring.',
  ].join(' ')
}

export function recoveryResponse(persona: Persona, signals: PersonaRuntimeSignals, step: number, stepBudget: number, hasHistory: boolean): RecoveryResponse {
  const noProgressLimit = signals.noProgressLimit ?? persona.behavior.noProgressLimit
  if (persona.behavior.recoveryStyle === 'abandon' || signals.noProgressEvents >= noProgressLimit || step >= stepBudget) return 'abandon'
  if (persona.behavior.recoveryStyle === 'backtrack' && hasHistory) return 'backtrack'
  return 'retry'
}

export function isComparisonSignal(value: string | undefined) {
  return /compare|comparison|plan|pricing|price|feature|included|versus|\bvs\b|proof|security|docs|documentation/i.test(value || '')
}

export function isExploratoryAction(action: BrowserAction, selectedLabel?: string, task?: string) {
  if (action.type === 'scroll' || action.type === 'open_tab' || action.type === 'forward') return true
  if (action.type !== 'click') return false
  const words = (task || '').toLowerCase().match(/[a-z0-9]+/g) || []
  const label = (selectedLabel || '').toLowerCase()
  return !words.some((word) => word.length > 2 && label.includes(word))
}
