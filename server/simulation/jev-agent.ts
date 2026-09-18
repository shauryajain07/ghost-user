import { APIUserAbortError, TypeSafeClient, choice, noul, score, type EntryType, type Question } from '@typesafe-ai/sdk'
import type { BrowserAction, InteractiveElement, PageState, Persona } from '../types'

export const JEV_MODEL = 'jev-1.13.0'

const JEV_PRICE_PER_M_INPUT_TOKENS_USD = 0.042
const targetConfidenceThreshold = 0.45
const targetProbabilityThreshold = 0.35
const maxTargetChoices = 240
const sensitivePattern = /password|passcode|credit|card number|cvv|cvc|security code|ssn|social security/i
const protectedControlPattern = /sign\s*up|signup|register|create account|free trial|checkout|place order|buy now|purchase|pay|submit|send message|delete|book (?:a )?(?:demo|appointment)/i

const ACTION_CRITERIA = {
  click: {
    what: 'Click a visible link, button, tab, result, topic, card, or other page control that advances the task.',
    not_for: 'Typing text, selecting a native dropdown option, scrolling, or opening a named website.',
  },
  type: {
    what: 'Type one of the verbatim value candidates from the task into a visible text field.',
    not_for: 'Inventing account details, passwords, payment information, or text that is not in the task.',
  },
  select: {
    what: 'Choose one of the verbatim value candidates from a visible select control.',
    not_for: 'Clicking a card or button that only looks like a selector.',
  },
  scroll_down: { what: 'Scroll down to reveal more content or controls.', not_for: 'Going to another page.' },
  scroll_up: { what: 'Scroll up to revisit content or controls.', not_for: 'Going back in browser history.' },
  back: { what: 'Go back one page when the current route is a dead end or the user would backtrack.', not_for: 'Scrolling up.' },
  forward: { what: 'Go forward one page in browser history.', not_for: 'Opening a link.' },
  reload: { what: 'Reload the current page when it appears stale or incomplete.', not_for: 'Starting a new task.' },
  press_enter: { what: 'Press Enter to submit or continue an already prepared, non-sensitive field.', not_for: 'Clicking a named button.' },
  open_tab: { what: 'Open a new empty browser tab when the task explicitly requires another tab.', not_for: 'Opening a link in the current page.' },
  close_tab: { what: 'Close the current tab when the task explicitly requires it.', not_for: 'Going back.' },
  wait: { what: 'Wait briefly for content or a transition to settle.', not_for: 'Waiting instead of taking an obvious safe action.' },
  finish: { what: 'Stop because the requested task is visibly complete or the next action is a protected boundary.', not_for: 'Stopping just because the page is unfamiliar.' },
  none: { what: 'No safe action is justified from the current page and task.', not_for: 'A reasonable visible action.' },
} as const

type JevActionName = keyof typeof ACTION_CRITERIA

interface AgentHistoryEntry {
  page: string
  action: string
  outcome: string
}

export interface JevAgentInput {
  task: string
  persona: Persona
  state: PageState
  history: AgentHistoryEntry[]
  avoidTargetIds?: string[]
  step: number
  maxSteps: number
  signal?: AbortSignal
}

export interface JevAgentDecision {
  kind: 'action' | 'finish' | 'wait' | 'protected'
  action?: BrowserAction
  actionName: string
  targetId?: string
  value?: string
  confidence: number
  goalComplete: number
  destructive: number
  summary: string
  expectedOutcome: string
  actualOutcome?: string
  model: string
  latencyMs: number
  inputTokens: number
  costUsd: number
  requestId?: string
}

let client: TypeSafeClient | null = null

export function hasJevApiKey() {
  return Boolean(process.env.TYPESAFE_API_KEY || process.env.JEV_API_KEY)
}

function getClient() {
  if (client) return client
  const apiKey = process.env.TYPESAFE_API_KEY || process.env.JEV_API_KEY
  if (!apiKey) throw new Error('JEV is not configured. Set TYPESAFE_API_KEY (or JEV_API_KEY) before starting a live test.')
  client = new TypeSafeClient({
    apiKey,
    defaultModel: JEV_MODEL,
    timeout: 12000,
    retry: { maxRetries: 1, backoffInitialMs: 150, backoffMaxMs: 600 },
    logLevel: 'off',
  })
  return client
}

function clean(value: string | undefined) {
  return (value || '').replace(/\s+/g, ' ').trim()
}

function elementLabel(element: InteractiveElement) {
  return [element.type, element.text || element.ariaLabel || element.placeholder || 'unnamed control', element.href ? `→ ${element.href}` : '']
    .filter(Boolean)
    .join(' ')
    .slice(0, 180)
}

function taskKeywords(task: string) {
  const ignored = new Set(['the', 'and', 'for', 'with', 'from', 'into', 'that', 'this', 'find', 'page', 'site', 'current', 'read', 'open'])
  return [...new Set((task.toLowerCase().match(/[a-z0-9]+/g) || []).filter((word) => word.length > 2 && !ignored.has(word)))]
}

function targetCandidates(state: PageState, task: string, avoided: Set<string>) {
  const eligible = state.interactiveElements.filter((element) => !avoided.has(element.id))
  if (eligible.length <= maxTargetChoices) return eligible
  const keywords = taskKeywords(task)
  return eligible
    .map((element, index) => {
      const label = elementLabel(element).toLowerCase()
      const keywordScore = keywords.reduce((score, keyword) => score + (label.includes(keyword) ? 5 : 0), 0)
      const typeScore = element.type === 'button' ? 2 : element.type === 'link' ? 1 : element.type === 'input' || element.type === 'select' ? 1 : 0
      return { element, index, score: keywordScore + typeScore }
    })
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, maxTargetChoices)
    .map(({ element }) => element)
}

function extractValueCandidates(task: string) {
  const values: string[] = []
  const push = (value: string | undefined) => {
    const normalized = clean(value).replace(/[.,!?]+$/, '')
    if (!normalized || normalized.length > 140) return
    if (!values.some((candidate) => candidate.toLowerCase() === normalized.toLowerCase())) values.push(normalized)
  }

  for (const match of task.matchAll(/["“”']([^"“”']{1,140})["“”']/g)) push(match[1])
  const patterns = [
    /\b(?:search|look\s+up|find)\s+(?:for\s+)?(.+?)(?:\s+(?:in|on|inside|using)\s+(?:the\s+)?(?:search|box|field|input|site|page))?$/i,
    /\b(?:type|enter|write|fill(?:\s+in)?)\s+(.+?)(?:\s+(?:into|in|on)\s+(?:the\s+)?(?:search\s+)?(?:box|field|input|form))?$/i,
    /\b(?:select|choose|pick)\s+(.+?)(?:\s+(?:from|in|on)\s+(?:the\s+)?(?:dropdown|select|menu|field))?$/i,
  ]
  patterns.forEach((pattern) => push(task.match(pattern)?.[1]))
  return values.slice(0, 8)
}

function pageSnapshotForJev(input: JevAgentInput, values: string[]) {
  const avoided = new Set(input.avoidTargetIds || [])
  const elements = targetCandidates(input.state, input.task, avoided)
    .map((element) => `${element.id} ${elementLabel(element)}${avoided.has(element.id) ? ' [avoid: last action produced no state change]' : ''}`)
  return {
    goal: input.task,
    persona: {
      name: input.persona.name,
      description: input.persona.description,
      patience: input.persona.patience,
      technical_literacy: input.persona.technicalLiteracy,
      attention_to_detail: input.persona.attentionToDetail,
      willingness_to_explore: input.persona.willingnessToExplore,
      price_sensitivity: input.persona.priceSensitivity,
    },
    page: {
      url: input.state.url.slice(0, 240),
      title: input.state.title.slice(0, 160),
      visible_text: input.state.visibleText.slice(0, 6000),
    },
    elements,
    value_candidates: values,
    recent_actions: input.history.slice(-8),
    avoid_targets: input.avoidTargetIds || [],
    progress: `Step ${input.step} of ${input.maxSteps}`,
  } as unknown as EntryType
}

function buildQuestions(state: JevAgentInput['state'], task: string, values: string[], avoidTargetIds: Set<string>) {
  const targetCriteria: Record<string, EntryType> = {}
  targetCandidates(state, task, avoidTargetIds).forEach((element) => {
    targetCriteria[element.id] = elementLabel(element)
  })
  targetCriteria.none = 'No visible control is the correct target.'

  const questions: Record<string, Question> = {
    action: choice(
      {
        question: 'Which single safe browser action should the persona take next to make progress on `goal`?',
        focus: 'Use the current page, visible text, element labels, persona traits, recent_actions, and progress. Choose finish only when the goal is visibly complete or the next step would cross a protected boundary. Never invent a target or value.',
      },
      ACTION_CRITERIA,
    ),
    target: choice(
      {
        question: 'Which visible element id is the target for the chosen click, type, or select action?',
        focus: 'Choose only an id from `elements`; choose none when the selected action does not need a target or when no visible target is reliable.',
      },
      targetCriteria,
    ),
    goal_complete: noul(
      {
        question: 'Is the persona already at a visible state that satisfies the full `goal`?',
        focus: 'Judge the current page and requested outcome, not whether one intermediate click succeeded. If the requested destination is visibly open, that can satisfy the goal even when the page offers further optional controls. For example, a goal to start a practice session is complete when a Practice / Question page is visible; do not answer questions unless the goal asks for answers. Do not count a protected boundary as task completion; that is answered separately.',
      },
      {
        true: 'The requested outcome is visible on the current page.',
        false: 'More safe exploration is needed to reach the requested outcome.',
      },
    ),
    protected_boundary: noul(
      {
        question: 'Has the persona reached a protected account, payment, message, destructive, or sensitive-input boundary where Ghost User must stop before acting?',
        focus: 'This is a safety classification for the current page, not a task-success classification.',
      },
      {
        true: 'Stop safely and report a protected boundary.',
        false: 'No protected boundary is currently blocking safe exploration.',
      },
    ),
    destructive: noul(
      {
        question: 'Would the selected action submit, buy, pay, send, post, delete, create an account, or otherwise cause a hard-to-undo side effect?',
      },
      {
        true: 'The action has a material external side effect or crosses a protected boundary.',
        false: 'The action is read-only, navigational, or reversible.',
      },
    ),
  }

  if (values.length) {
    const valueCriteria: Record<string, EntryType> = Object.fromEntries(values.map((value) => [value, `Copy this exact value from the user's goal; do not alter it.`]))
    valueCriteria.none = 'No value should be typed or selected.'
    questions.value = choice(
      {
        question: 'If the chosen action needs text or an option, which exact value from `value_candidates` should be used?',
        focus: 'Choose verbatim. Never generate passwords, personal data, payment data, or any value not listed.',
      },
      valueCriteria,
    )
  }
  questions.scroll_amount = score(
    'How far should the persona scroll for the chosen scroll action?',
    ['A little', 'About one viewport', 'To the end or beginning'],
  )
  return questions
}

function typedAction(value: string, targetId: string | undefined, selectedValue: string | undefined, scrollAmount: number | undefined): BrowserAction | null {
  if (value === 'click' && targetId) return { type: 'click', elementId: targetId }
  if (value === 'type' && targetId && selectedValue) return { type: 'type', elementId: targetId, value: selectedValue }
  if (value === 'select' && targetId && selectedValue) return { type: 'select', elementId: targetId, value: selectedValue }
  if (value === 'scroll_down') return { type: 'scroll', direction: 'down' }
  if (value === 'scroll_up') return { type: 'scroll', direction: 'up' }
  if (value === 'back') return { type: 'back' }
  if (value === 'forward') return { type: 'forward' }
  if (value === 'reload') return { type: 'reload' }
  if (value === 'press_enter') return { type: 'press_enter' }
  if (value === 'open_tab') return { type: 'open_tab' }
  if (value === 'close_tab') return { type: 'close_tab' }
  if (value === 'wait') return { type: 'wait', milliseconds: scrollAmount && scrollAmount > 1.5 ? 700 : 350 }
  return null
}

function baseDecision(input: JevAgentInput, partial: Partial<JevAgentDecision>): JevAgentDecision {
  return {
    kind: 'wait',
    actionName: 'none',
    confidence: 0,
    goalComplete: 0,
    destructive: 0,
    summary: 'Jev did not select a safe next action.',
    expectedOutcome: 'The agent should reassess the current page.',
    model: JEV_MODEL,
    latencyMs: 0,
    inputTokens: 0,
    costUsd: 0,
    ...partial,
  }
}

export async function decideWithJev(input: JevAgentInput): Promise<JevAgentDecision> {
  const values = extractValueCandidates(input.task)
  const avoided = new Set(input.avoidTargetIds || [])
  const questions = buildQuestions(input.state, input.task, values, avoided)
  const startedAt = performance.now()
  const response = await getClient().systemOne({
    state: pageSnapshotForJev(input, values),
    questions,
    model: JEV_MODEL,
  }, { signal: input.signal }).withResponse()
  const latencyMs = Math.round(performance.now() - startedAt)
  const answers = response.data.answers as Record<string, any>
  const actionAnswer = answers.action || {}
  const targetAnswer = answers.target || {}
  const actionName = String(actionAnswer.choice || 'none') as JevActionName | 'none'
  const goalComplete = Number(answers.goal_complete?.noul || 0)
  const protectedBoundary = Number(answers.protected_boundary?.noul || 0)
  const destructive = Number(answers.destructive?.noul || 0)
  const actionConfidence = Number(actionAnswer.confidence || 0)
  const targetId = targetAnswer.choice && targetAnswer.choice !== 'none' ? String(targetAnswer.choice) : undefined
  const targetProbability = targetId ? Number(targetAnswer.probabilities?.[targetId] || 0) : 0
  const targetConfidence = Number(targetAnswer.confidence || 0)
  const selectedValue = answers.value?.choice && answers.value.choice !== 'none' ? String(answers.value.choice) : undefined
  const scrollAmount = Number(answers.scroll_amount?.score || 1)
  const usage = response.data.usage
  const metadata = {
    model: response.data.model || JEV_MODEL,
    latencyMs,
    inputTokens: usage?.input_tokens || 0,
    costUsd: ((usage?.input_tokens || 0) / 1_000_000) * JEV_PRICE_PER_M_INPUT_TOKENS_USD,
    requestId: response.requestId,
  }

  if (protectedBoundary >= 0.72) {
    return baseDecision(input, {
      kind: 'protected',
      actionName,
      confidence: Math.max(actionConfidence, protectedBoundary),
      goalComplete,
      destructive,
      summary: 'Jev identified a protected boundary on the current page.',
      expectedOutcome: 'Stop before account, payment, message, destructive, or sensitive-input activity.',
      actualOutcome: 'The session stopped safely at the protected boundary.',
      ...metadata,
    })
  }

  if (goalComplete >= 0.68 || actionName === 'finish') {
    return baseDecision(input, {
      kind: 'finish',
      actionName,
      confidence: Math.max(actionConfidence, goalComplete),
      goalComplete,
      destructive,
      summary: goalComplete >= 0.72 ? 'Jev judged the requested outcome visible on the current page.' : 'Jev selected the finish boundary for this task.',
      expectedOutcome: 'Stop with the requested outcome or protected boundary recorded.',
      ...metadata,
    })
  }

  if (destructive >= 0.5 && ['click', 'type', 'select', 'press_enter'].includes(actionName)) {
    return baseDecision(input, {
      kind: 'protected',
      actionName,
      targetId,
      confidence: actionConfidence,
      goalComplete,
      destructive,
      summary: 'Jev classified the next action as a protected or destructive boundary.',
      expectedOutcome: 'Stop before an external side effect.',
      actualOutcome: 'The safety boundary prevented the action from executing.',
      ...metadata,
    })
  }

  const selectedElement = targetId ? input.state.interactiveElements.find((element) => element.id === targetId) : undefined

  if (selectedElement && (actionName === 'type' || actionName === 'select') && sensitivePattern.test(elementLabel(selectedElement))) {
    return baseDecision(input, {
      kind: 'protected',
      actionName,
      targetId,
      confidence: actionConfidence,
      goalComplete,
      destructive,
      summary: 'Jev selected a sensitive field, so the agent stopped before entering data.',
      expectedOutcome: 'Stop without populating a sensitive input.',
      actualOutcome: 'Sensitive input was not populated.',
      ...metadata,
    })
  }

  const targetAction = actionName === 'click' || actionName === 'type' || actionName === 'select'
  if (targetAction && !selectedElement) {
    return baseDecision(input, {
      actionName,
      targetId,
      confidence: Math.min(actionConfidence, targetConfidence),
      goalComplete,
      destructive,
      summary: 'Jev chose a target action but did not identify a reliable visible target.',
      expectedOutcome: 'Reassess the page and choose a visible target or a different safe action.',
      ...metadata,
    })
  }

  // A low-confidence click is still useful UX evidence when JEV selected an
  // actual, non-protected control. Real users explore; only typing/selecting
  // needs the stricter confidence gate because it can change submitted data.
  if (targetAction && actionName !== 'click' && (targetConfidence < targetConfidenceThreshold || targetProbability < targetProbabilityThreshold)) {
    return baseDecision(input, {
      actionName,
      targetId,
      confidence: Math.min(actionConfidence, targetConfidence),
      goalComplete,
      destructive,
      summary: 'Jev did not have enough confidence in a visible input target to act autonomously.',
      expectedOutcome: 'Expose a clearer field or provide a more specific task.',
      ...metadata,
    })
  }

  if (selectedElement && actionName === 'click' && protectedControlPattern.test(elementLabel(selectedElement))) {
    return baseDecision(input, {
      kind: 'protected',
      actionName,
      targetId,
      confidence: actionConfidence,
      goalComplete,
      destructive,
      summary: 'Jev reached a protected account, payment, messaging, or destructive control.',
      expectedOutcome: 'Stop at the protected action boundary.',
      actualOutcome: 'Protected control was not clicked.',
      ...metadata,
    })
  }

  const action = typedAction(actionName, targetId, selectedValue, scrollAmount)
  if (!action) {
    return baseDecision(input, {
      actionName,
      targetId,
      value: selectedValue,
      confidence: actionConfidence,
      goalComplete,
      destructive,
      summary: actionName === 'none' ? 'Jev found no safe next action.' : 'Jev selected an action that could not be completed from the current state.',
      expectedOutcome: 'The session should stop or be reassessed.',
      ...metadata,
    })
  }

  return baseDecision(input, {
    kind: 'action',
    action,
    actionName,
    targetId,
    value: selectedValue,
    confidence: Math.min(0.98, Math.max(0.05, actionConfidence * (targetId ? targetConfidence : 1))),
    goalComplete,
    destructive,
    summary: `Jev selected ${actionName}${selectedElement ? ` on ${elementLabel(selectedElement)}` : ''}.`,
    expectedOutcome: 'The next page state should reveal progress toward the task.',
    ...metadata,
  })
}

export function isJevAbortError(error: unknown) {
  return error instanceof APIUserAbortError || (error as { name?: string } | null)?.name === 'AbortError'
}
