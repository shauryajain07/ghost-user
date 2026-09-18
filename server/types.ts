export type RunStatus = 'queued' | 'running' | 'complete' | 'failed'
export type ExecutionMode = 'live' | 'preview' | 'fallback'

export type BrowserAction =
  | { type: 'click'; elementId: string }
  | { type: 'type'; elementId: string; value: string }
  | { type: 'select'; elementId: string; value: string }
  | { type: 'scroll'; direction: 'up' | 'down' }
  | { type: 'back' }
  | { type: 'forward' }
  | { type: 'reload' }
  | { type: 'press_enter' }
  | { type: 'open_tab' }
  | { type: 'close_tab' }
  | { type: 'wait'; milliseconds: number }
  | { type: 'finish'; success: boolean; reason: string }

export interface InteractiveElement {
  id: string
  type: 'button' | 'link' | 'input' | 'select' | 'checkbox' | 'radio' | 'other'
  text?: string
  ariaLabel?: string
  placeholder?: string
  href?: string
}

export interface PageState {
  url: string
  title: string
  visibleText: string
  interactiveElements: InteractiveElement[]
}

export interface Persona {
  id: string
  name: string
  description: string
  initials: string
  color: string
  patience: number
  technicalLiteracy: number
  riskTolerance: number
  attentionToDetail: number
  willingnessToExplore: number
  priceSensitivity: number
}

export interface AgentStep {
  step: number
  page: string
  pageLabel: string
  action: string
  actionDetail: string
  reasoningSummary: string
  confidence: number
  expectedOutcome: string
  actualOutcome: string
  timeMs: number
  tone: 'neutral' | 'success' | 'warning' | 'danger'
}

export interface PersonaResult extends Persona {
  outcome: 'completed' | 'failed' | 'protected'
  outcomeLabel: string
  steps: number
  confidence: number
  backtracks: number
  duration: string
  path: string[]
  primaryProblem: string
  confidenceDrop?: string
  timeline: AgentStep[]
}

export interface FrictionIssue {
  id: string
  page: string
  title: string
  description: string
  usersAffected: number
  severity: 'High' | 'Medium' | 'Low'
  severityTone: 'high' | 'medium' | 'low'
  evidence: string[]
  recommendation: string
}

export interface JourneyNode {
  id: string
  label: string
  meta: string
  x: number
  y: number
  tone: 'default' | 'lime' | 'orange' | 'red'
}

export interface JourneyEdge {
  from: string
  to: string
  label: string
  tone: 'default' | 'lime' | 'orange' | 'red'
}

export interface ScreenshotFrame {
  step: number
  page: string
  caption: string
  selected?: string
  tone: 'neutral' | 'warning' | 'success'
  src?: string
}

export type LiveEventKind = 'observation' | 'decision' | 'action' | 'finish' | 'protected' | 'error'

export interface LiveEvent {
  id: string
  at: string
  kind: LiveEventKind
  personaId: string
  personaName: string
  step: number
  page: string
  pageLabel: string
  action: string
  detail: string
  confidence: number
  latencyMs?: number
  screenshotSrc?: string
}

export interface RunMetrics {
  completed: number
  total: number
  completionRate: number
  avgSteps: number
  successfulAvgSteps: number
  failedAvgSteps: number
  avgConfidence: number
  avgBacktracks: number
  biggestDropOff: string
  biggestDropOffCount: number
  sessionDuration: string
}

export interface RunReport {
  id: string
  status: RunStatus
  executionMode: ExecutionMode
  progress: number
  phase: string
  website: string
  domain: string
  task: string
  createdAt: string
  completedAt?: string
  personasCount: number
  maxSteps: number
  metrics: RunMetrics
  summary: string
  summaryAccent: string
  issues: FrictionIssue[]
  personas: PersonaResult[]
  journeyNodes: JourneyNode[]
  journeyEdges: JourneyEdge[]
  screenshots: ScreenshotFrame[]
  liveEvents?: LiveEvent[]
  bestPath: string[]
  guardrailNote: string
  errorMessage?: string
}

export interface CreateRunInput {
  website: string
  task: string
  personas?: number
  maxSteps?: number
}
