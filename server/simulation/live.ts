import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright'
import { executeBrowserAction, isProtectedBrowserAction, isSensitiveElement, observePage, validateBrowserAction } from './browser'
import { isTaskProvidedValue } from './action-policy'
import { personas as defaultPersonas } from './fixtures'
import { decideWithJev, isJevAbortError, type JevAgentDecision } from './jev-agent'
import {
  createPersonaRandom,
  createPersonaRuntimeSignals,
  createRunSeed,
  deriveStepBudget,
  deviceLabel,
  isComparisonSignal,
  isExploratoryAction,
  recoveryResponse,
  sampleWaitMilliseconds,
  type PersonaRuntimeSignals,
} from './persona-policy'
import type {
  AgentStep,
  BrowserAction,
  FrictionIssue,
  LiveEvent,
  JourneyEdge,
  JourneyNode,
  Persona,
  PersonaResult,
  ProtectedActionAudit,
  RunReport,
  ScreenshotFrame,
  LiveAgentState,
  ActionPolicy,
} from '../types'

export interface LiveSimulationInput {
  id: string
  website: string
  task: string
  personas: number
  maxSteps: number
  assetDir: string
  actionPolicy: ActionPolicy
  variationSeed?: number
  signal?: AbortSignal
  onProgress?: (progress: number, phase: string) => void
  onEvent?: (event: LiveEvent) => void
}

interface PersonaRun {
  result: PersonaResult
  screenshots: ScreenshotFrame[]
}

const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'page'

const cleanLabel = (value: string) => value.replace(/\s+/g, ' ').trim()

const pageLabel = (state: { url: string; title: string }) => {
  try {
    const parsed = new URL(state.url)
    if (parsed.pathname === '/' || parsed.pathname === '') return 'Homepage'
    const segment = parsed.pathname.split('/').filter(Boolean).pop() || parsed.hostname
    return cleanLabel(segment.replace(/[-_]/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()))
  } catch {
    return state.title || 'Page'
  }
}

function stateFingerprint(state: Awaited<ReturnType<typeof observePage>>) {
  return state.url + '|' + state.title + '|' + state.visibleText.slice(0, 2400) + '|' + state.interactiveElements
    .map((element) => [element.id, element.type, element.text, element.ariaLabel, element.placeholder, element.href].filter(Boolean).join(':'))
    .join('|')
}

function actionLabel(action: BrowserAction) {
  if (action.type === 'click') return 'Clicked element ' + action.elementId
  if (action.type === 'type') return 'Typed into element ' + action.elementId
  if (action.type === 'select') return 'Selected an option in element ' + action.elementId
  if (action.type === 'scroll') return 'Scrolled ' + action.direction
  if (action.type === 'press_enter') return 'Pressed Enter'
  if (action.type === 'reload') return 'Reloaded the page'
  if (action.type === 'back') return 'Went back'
  if (action.type === 'forward') return 'Went forward'
  if (action.type === 'open_tab') return 'Opened a new tab'
  if (action.type === 'close_tab') return 'Closed the tab'
  if (action.type === 'wait') return 'Waited for the page'
  return action.success ? 'Reached protected boundary' : 'Stopped'
}

function toneFor(action: BrowserAction, confidence: number): AgentStep['tone'] {
  if (confidence < 0.45) return 'danger'
  if (confidence < 0.62) return 'warning'
  return 'neutral'
}

function decisionLabel(decision: JevAgentDecision) {
  if (decision.action) return actionLabel(decision.action)
  if (decision.kind === 'protected') return 'Reached protected boundary'
  if (decision.kind === 'abandon') return 'Abandoned route'
  return 'Jev selected ' + decision.actionName
}

function decisionTone(decision: JevAgentDecision): AgentStep['tone'] {
  if (decision.kind === 'finish' || decision.kind === 'protected') return 'success'
  if (decision.kind === 'abandon') return 'danger'
  return toneFor(decision.action || { type: 'wait', milliseconds: 0 }, decision.confidence)
}

function actionNameFor(action: BrowserAction) {
  if (action.type === 'scroll') return action.direction === 'down' ? 'scroll_down' : 'scroll_up'
  return action.type
}

function forcedRecoveryDecision(action: BrowserAction, persona: Persona): JevAgentDecision {
  return {
    kind: 'action',
    action,
    actionName: actionNameFor(action),
    confidence: 0.72,
    goalComplete: 0,
    destructive: 0,
    summary: `${persona.name} ${action.type === 'back' ? 'backtracked' : 'recovered'} after a stalled interaction.`,
    expectedOutcome: 'Revisit the previous route and reassess the task path.',
    model: 'persona-policy',
    latencyMs: 0,
    inputTokens: 0,
    costUsd: 0,
  }
}

function abandonDecision(persona: Persona, reason: string): JevAgentDecision {
  return {
    kind: 'abandon',
    actionName: 'none',
    confidence: 0.2,
    goalComplete: 0,
    destructive: 0,
    summary: `${persona.name} abandoned the route.`,
    expectedOutcome: reason,
    actualOutcome: reason,
    model: 'persona-policy',
    latencyMs: 0,
    inputTokens: 0,
    costUsd: 0,
  }
}

function emitLiveEvent(input: LiveSimulationInput, event: Omit<LiveEvent, 'id' | 'at'>) {
  input.onEvent?.({
    id: 'evt_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7),
    at: new Date().toISOString(),
    ...event,
  })
}

async function launchSimulationBrowser(headless: boolean) {
  const args = headless ? [] : ['--window-size=1440,960', '--window-position=80,60']
  if (!headless) {
    try {
      return await chromium.launch({ channel: 'chrome', headless: false, args })
    } catch {
      // Fall back to Playwright's bundled Chromium when Google Chrome is unavailable.
    }
  }
  return chromium.launch({ headless, args })
}

async function capture(page: Page, directory: string, runId: string, personaId: string, step: number, label: string, selected: string | undefined, tone: ScreenshotFrame['tone'], variant: 'initial' | 'action' | 'boundary') {
  const fileName = personaId + '-' + String(step).padStart(2, '0') + '-' + variant + '.png'
  const filePath = path.join(directory, fileName)
  try {
    await page.screenshot({ path: filePath, fullPage: false })
    return {
      step,
      page: label,
      caption: selected ? 'Selected ' + selected : 'Observed ' + label,
      selected,
      tone,
      src: '/api/run-assets/' + runId + '/' + fileName,
    } satisfies ScreenshotFrame
  } catch {
    return null
  }
}

async function simulatePersona(browser: Browser, input: LiveSimulationInput, persona: Persona, index: number, directory: string): Promise<PersonaRun> {
  const random = createPersonaRandom(input.variationSeed || 1, persona.id)
  const runtimeSignals: PersonaRuntimeSignals = createPersonaRuntimeSignals(persona, random)
  const stepBudget = deriveStepBudget(input.maxSteps, persona, random)
  const context: BrowserContext = await browser.newContext({
    viewport: persona.behavior.viewport,
    isMobile: persona.behavior.device === 'mobile',
    hasTouch: persona.behavior.device === 'mobile',
    serviceWorkers: 'block',
    colorScheme: index % 3 === 0 ? 'light' : 'dark',
  })
  let activePage = await context.newPage()
  activePage.setDefaultTimeout(6500)
  const timeline: AgentStep[] = []
  const screenshots: ScreenshotFrame[] = []
  const pathHistory: string[] = []
  const visitedPages = new Set<string>()
  const history: { page: string; action: string; outcome: string }[] = []
  const avoidTargetIds = new Set<string>()
  const protectedActionAudit: ProtectedActionAudit[] = []
  let protectedActionsAttempted = 0
  let pendingRecoveryAction: BrowserAction | undefined
  let currentState: Awaited<ReturnType<typeof observePage>>
  let outcome: PersonaResult['outcome'] = 'failed'
  let primaryProblem = 'The user reached the step limit without finding a confident path.'
  let backtracks = 0
  const startedAt = Date.now()

  try {
    await activePage.goto(input.website, { waitUntil: 'domcontentloaded', timeout: 15000 })
    currentState = await observePage(activePage)
    pathHistory.push(pageLabel(currentState))
    visitedPages.add(currentState.url || pageLabel(currentState))
    const firstShot = await capture(activePage, directory, input.id, persona.id, 1, pageLabel(currentState), undefined, 'neutral', 'initial')
    if (firstShot) screenshots.push(firstShot)
    emitLiveEvent(input, {
      kind: 'observation',
      personaId: persona.id,
      personaName: persona.name,
      step: 0,
      page: currentState.url,
      pageLabel: pageLabel(currentState),
      action: 'Observed page',
      detail: currentState.title || 'Loaded the starting page.',
      confidence: 1,
      screenshotSrc: firstShot?.src,
    })

    for (let step = 1; step <= stepBudget; step += 1) {
      if (input.signal?.aborted) throw new Error('Run cancelled.')
      let decision: JevAgentDecision
      if (pendingRecoveryAction) {
        decision = forcedRecoveryDecision(pendingRecoveryAction, persona)
        pendingRecoveryAction = undefined
      } else {
        try {
          decision = await decideWithJev({
            task: input.task,
            persona,
            state: currentState,
            history,
            avoidTargetIds: [...avoidTargetIds],
            step,
            maxSteps: stepBudget,
            actionPolicy: input.actionPolicy,
            runtimeSignals,
            signal: input.signal,
          })
        } catch (error) {
          if (input.signal?.aborted || isJevAbortError(error)) throw error
          const message = error instanceof Error ? error.message : 'Jev could not decide the next action.'
          primaryProblem = message
          timeline.push({
            step,
            page: currentState.url,
            pageLabel: pageLabel(currentState),
            action: 'Jev decision failed',
            actionDetail: 'The JEV request did not return a decision',
            reasoningSummary: message,
            confidence: 0,
            expectedOutcome: 'Receive a typed JEV action for the current page.',
            actualOutcome: message,
            timeMs: 0,
            tone: 'danger',
          })
          emitLiveEvent(input, {
            kind: 'error',
            personaId: persona.id,
            personaName: persona.name,
            step,
            page: currentState.url,
            pageLabel: pageLabel(currentState),
            action: 'JEV decision failed',
            detail: message,
            confidence: 0,
            deviceLabel: deviceLabel(persona.behavior),
            profileLabels: persona.behavior.labels,
          })
          break
        }
      }

      if (decision.action?.type === 'wait') {
        decision.action = { ...decision.action, milliseconds: sampleWaitMilliseconds(persona.behavior, random) }
      }

      const actionTone = decisionTone(decision)
      const decisionReason = decision.summary + ' · ' + decision.model + ' · ' + decision.latencyMs + 'ms'
      emitLiveEvent(input, {
        kind: 'decision',
        personaId: persona.id,
        personaName: persona.name,
        step,
        page: currentState.url,
        pageLabel: pageLabel(currentState),
        action: decisionLabel(decision),
        detail: decisionReason,
        confidence: decision.confidence,
        latencyMs: decision.latencyMs,
      })
      let actualOutcome = 'No action was executed.'
      let timeMs = 0

      if (decision.kind === 'abandon') {
        outcome = 'failed'
        primaryProblem = decision.actualOutcome || decision.expectedOutcome
        timeline.push({
          step,
          page: currentState.url,
          pageLabel: pageLabel(currentState),
          action: 'Abandoned route',
          actionDetail: decision.summary,
          reasoningSummary: decision.summary,
          confidence: decision.confidence,
          expectedOutcome: decision.expectedOutcome,
          actualOutcome: primaryProblem,
          timeMs,
          tone: 'danger',
        })
        emitLiveEvent(input, {
          kind: 'error',
          personaId: persona.id,
          personaName: persona.name,
          step,
          page: currentState.url,
          pageLabel: pageLabel(currentState),
          action: 'Abandoned route',
          detail: primaryProblem,
          confidence: decision.confidence,
          deviceLabel: deviceLabel(persona.behavior),
          profileLabels: persona.behavior.labels,
        })
        break
      }

      if (decision.kind === 'protected') {
        outcome = 'protected'
        protectedActionsAttempted += 1
        primaryProblem = decision.actualOutcome || decision.summary
        timeline.push({
          step,
          page: currentState.url,
          pageLabel: pageLabel(currentState),
          action: decisionLabel(decision),
          actionDetail: 'Stopped before a protected or destructive action',
          reasoningSummary: decisionReason,
          confidence: decision.confidence,
          expectedOutcome: decision.expectedOutcome,
          actualOutcome: primaryProblem,
          timeMs,
          tone: actionTone,
        })
        const shot = await capture(activePage, directory, input.id, persona.id, step, pageLabel(currentState), undefined, 'success', 'boundary')
        if (shot) screenshots.push(shot)
        emitLiveEvent(input, {
          kind: 'protected',
          personaId: persona.id,
          personaName: persona.name,
          step,
          page: currentState.url,
          pageLabel: pageLabel(currentState),
          action: decisionLabel(decision),
          detail: primaryProblem,
          confidence: decision.confidence,
          latencyMs: decision.latencyMs,
          screenshotSrc: shot?.src,
        })
        break
      }

      if (decision.kind === 'finish') {
        outcome = 'completed'
        primaryProblem = 'Jev judged the requested outcome complete from the current page.'
        actualOutcome = primaryProblem
        timeline.push({
          step,
          page: currentState.url,
          pageLabel: pageLabel(currentState),
          action: decisionLabel(decision),
          actionDetail: 'Jev marked the requested outcome as visible',
          reasoningSummary: decisionReason,
          confidence: decision.confidence,
          expectedOutcome: decision.expectedOutcome,
          actualOutcome,
          timeMs,
          tone: 'success',
        })
        const shot = await capture(activePage, directory, input.id, persona.id, step, pageLabel(currentState), undefined, 'success', 'boundary')
        if (shot) screenshots.push(shot)
        emitLiveEvent(input, {
          kind: 'finish',
          personaId: persona.id,
          personaName: persona.name,
          step,
          page: currentState.url,
          pageLabel: pageLabel(currentState),
          action: decisionLabel(decision),
          detail: actualOutcome,
          confidence: decision.confidence,
          latencyMs: decision.latencyMs,
          screenshotSrc: shot?.src,
        })
        break
      }

      if (!decision.action) {
        const targetAction = decision.actionName === 'click' || decision.actionName === 'type' || decision.actionName === 'select'
        runtimeSignals.recoveryAttempts += 1
        const recovery = recoveryResponse(persona, runtimeSignals, step, stepBudget, pathHistory.length > 1)
        const shouldAbandon = recovery === 'abandon'
        if (targetAction && !shouldAbandon) {
          if (decision.targetId && recovery !== 'retry') avoidTargetIds.add(decision.targetId)
          if (recovery === 'backtrack') pendingRecoveryAction = { type: 'back' }
          const retryOutcome = decision.targetId
            ? recovery === 'backtrack'
              ? 'Jev was unsure about this target, so the persona backtracked before reassessing the route.'
              : recovery === 'retry'
                ? 'Jev was unsure about this target, so the persona will retry once before moving on.'
                : 'Jev was unsure about this target, so the persona reassessed the other visible controls.'
            : 'Jev chose a target action without a reliable target, so the persona asked JEV to reassess the page.'
          history.push({ page: pageLabel(currentState), action: decisionLabel(decision), outcome: retryOutcome })
          timeline.push({
            step,
            page: currentState.url,
            pageLabel: pageLabel(currentState),
            action: decisionLabel(decision),
            actionDetail: 'Skipped an ambiguous target and reassessed the page',
            reasoningSummary: decisionReason,
            confidence: decision.confidence,
            expectedOutcome: decision.expectedOutcome,
            actualOutcome: retryOutcome,
            timeMs,
            tone: 'warning',
          })
          continue
        }
        primaryProblem = recovery === 'abandon'
          ? `${persona.name} abandoned the route after an ambiguous next action.`
          : decision.summary
        outcome = 'failed'
        timeline.push({
          step,
          page: currentState.url,
          pageLabel: pageLabel(currentState),
          action: decisionLabel(decision),
          actionDetail: 'No executable action was selected',
          reasoningSummary: decisionReason,
          confidence: decision.confidence,
          expectedOutcome: decision.expectedOutcome,
          actualOutcome: primaryProblem,
          timeMs,
          tone: actionTone,
        })
        break
      }

      const validation = validateBrowserAction(decision.action, currentState, { actionPolicy: input.actionPolicy })
      if (!validation.ok) {
        actualOutcome = validation.reason
        primaryProblem = validation.reason
        timeline.push({
          step,
          page: currentState.url,
          pageLabel: pageLabel(currentState),
          action: decisionLabel(decision),
          actionDetail: 'Action blocked by the safety validator',
          reasoningSummary: decisionReason,
          confidence: decision.confidence,
          expectedOutcome: decision.expectedOutcome,
          actualOutcome,
          timeMs,
          tone: 'danger',
        })
        emitLiveEvent(input, {
          kind: 'error',
          personaId: persona.id,
          personaName: persona.name,
          step,
          page: currentState.url,
          pageLabel: pageLabel(currentState),
          action: decisionLabel(decision),
          detail: primaryProblem,
          confidence: decision.confidence,
          latencyMs: decision.latencyMs,
        })
        break
      }

      const beforeUrl = currentState.url
      const beforeLabel = pageLabel(currentState)
      const beforeFingerprint = stateFingerprint(currentState)
      const selectedElementId = decision.action.type === 'click' || decision.action.type === 'type' || decision.action.type === 'select'
        ? decision.action.elementId
        : undefined
      const selectedElement = selectedElementId
        ? currentState.interactiveElements.find((element) => element.id === selectedElementId)
        : undefined
      const selectedText = selectedElement?.text || selectedElement?.ariaLabel || selectedElement?.placeholder
      const auditTarget = isSensitiveElement(selectedElement) ? 'Sensitive input' : selectedText
      const protectedAction = input.actionPolicy === 'full'
        && (decision.destructive >= 0.5 || isProtectedBrowserAction(decision.action, currentState))
      if (isExploratoryAction(decision.action, selectedText, input.task)) {
        if (runtimeSignals.exploratoryActions >= (runtimeSignals.explorationLimit ?? persona.behavior.explorationBudget)) {
          decision = abandonDecision(persona, 'The persona exhausted its exploration budget before finding a task-relevant route.')
          outcome = 'failed'
          primaryProblem = decision.expectedOutcome
          timeline.push({
            step,
            page: currentState.url,
            pageLabel: pageLabel(currentState),
            action: 'Exploration budget reached',
            actionDetail: decision.summary,
            reasoningSummary: decision.summary,
            confidence: decision.confidence,
            expectedOutcome: decision.expectedOutcome,
            actualOutcome: primaryProblem,
            timeMs,
            tone: 'danger',
          })
          emitLiveEvent(input, {
            kind: 'error',
            personaId: persona.id,
            personaName: persona.name,
            step,
            page: currentState.url,
            pageLabel: pageLabel(currentState),
            action: 'Exploration budget reached',
            detail: primaryProblem,
            confidence: decision.confidence,
            deviceLabel: deviceLabel(persona.behavior),
            profileLabels: persona.behavior.labels,
          })
          break
        }
        runtimeSignals.exploratoryActions += 1
      }
      if (isComparisonSignal(selectedText)) runtimeSignals.comparisonActions += 1
      const sensitiveValue = decision.action.type === 'type' || decision.action.type === 'select' ? decision.action.value : undefined
      if (input.actionPolicy === 'full' && sensitiveValue && isSensitiveElement(selectedElement) && !isTaskProvidedValue(sensitiveValue, input.task)) {
        const reason = 'Sensitive values must be supplied verbatim by the task; the protected action was blocked.'
        protectedActionsAttempted += 1
        outcome = 'protected'
        primaryProblem = reason
        protectedActionAudit.push({
          at: new Date().toISOString(),
          personaId: persona.id,
          personaName: persona.name,
          page: beforeUrl,
          pageLabel: beforeLabel,
          action: decision.action.type,
          target: auditTarget,
          valueRedacted: true,
          policy: input.actionPolicy,
        })
        timeline.push({
          step,
          page: beforeUrl,
          pageLabel: beforeLabel,
          action: 'Blocked protected value',
          actionDetail: 'The task did not supply a verbatim sensitive value',
          reasoningSummary: decisionReason,
          confidence: decision.confidence,
          expectedOutcome: 'Only task-provided sensitive values may be executed in full action mode.',
          actualOutcome: reason,
          timeMs,
          tone: 'danger',
        })
        emitLiveEvent(input, {
          kind: 'protected',
          personaId: persona.id,
          personaName: persona.name,
          step,
          page: beforeUrl,
          pageLabel: beforeLabel,
          action: 'Blocked protected value',
          detail: reason,
          confidence: decision.confidence,
          latencyMs: decision.latencyMs,
          deviceLabel: deviceLabel(persona.behavior),
          profileLabels: persona.behavior.labels,
          protectedAction: true,
        })
        break
      }
      if (protectedAction) {
        protectedActionsAttempted += 1
        protectedActionAudit.push({
          at: new Date().toISOString(),
          personaId: persona.id,
          personaName: persona.name,
          page: beforeUrl,
          pageLabel: beforeLabel,
          action: decision.action.type,
          target: auditTarget,
          valueRedacted: decision.action.type === 'type' || decision.action.type === 'select',
          policy: input.actionPolicy,
        })
      }
      const actionStarted = Date.now()
      try {
        actualOutcome = await executeBrowserAction(activePage, currentState, decision.action, { actionPolicy: input.actionPolicy })
        timeMs = Date.now() - actionStarted
      } catch (error) {
        actualOutcome = error instanceof Error ? error.message : 'The browser action failed.'
        timeMs = Date.now() - actionStarted
        primaryProblem = actualOutcome
        timeline.push({
          step,
          page: currentState.url,
          pageLabel: pageLabel(currentState),
          action: decisionLabel(decision),
          actionDetail: 'The browser could not complete the action',
          reasoningSummary: decisionReason,
          confidence: decision.confidence,
          expectedOutcome: decision.expectedOutcome,
          actualOutcome,
          timeMs,
          tone: 'danger',
        })
        emitLiveEvent(input, {
          kind: 'error',
          personaId: persona.id,
          personaName: persona.name,
          step,
          page: currentState.url,
          pageLabel: pageLabel(currentState),
          action: decisionLabel(decision),
          detail: actualOutcome,
          confidence: decision.confidence,
          latencyMs: decision.latencyMs,
        })
        break
      }

      if (protectedAction) {
        actualOutcome += ' Protected action executed under full action policy; sensitive values were redacted from the audit log.'
      }

      if (decision.action.type === 'back') backtracks += 1
      await activePage.waitForTimeout(220).catch(() => undefined)
      const openPages = context.pages().filter((candidate) => !candidate.isClosed())
      if (activePage.isClosed() || decision.action.type === 'open_tab' || decision.action.type === 'close_tab') {
        activePage = openPages[openPages.length - 1] || await context.newPage()
        activePage.setDefaultTimeout(6500)
      }
      currentState = await observePage(activePage)
      const currentLabel = pageLabel(currentState)
      visitedPages.add(currentState.url || currentLabel)
      const pageChanged = currentState.url !== beforeUrl || stateFingerprint(currentState) !== beforeFingerprint
      let shouldAbandonAfterAction = false
      if (pageChanged && currentState.url !== beforeUrl) avoidTargetIds.clear()
      if (!pageChanged && decision.action.type !== 'wait') {
        runtimeSignals.noProgressEvents += 1
        runtimeSignals.recoveryAttempts += 1
        const recovery = recoveryResponse(persona, runtimeSignals, step, stepBudget, pathHistory.length > 1)
        if (selectedElementId && (decision.action.type === 'click' || decision.action.type === 'type' || decision.action.type === 'select')) {
          if (persona.behavior.recoveryStyle !== 'retry' || runtimeSignals.recoveryAttempts > 1) avoidTargetIds.add(selectedElementId)
          actualOutcome += persona.behavior.recoveryStyle === 'retry' && runtimeSignals.recoveryAttempts <= 1
            ? ' The page state did not change, so this persona will retry once.'
            : ' The page state did not change, so JEV will avoid repeating this control.'
        }
        if (recovery === 'backtrack' && decision.action.type !== 'back') {
          pendingRecoveryAction = { type: 'back' }
          actualOutcome += ' The persona will backtrack before reassessing the route.'
        }
        shouldAbandonAfterAction = recovery === 'abandon'
      }
      history.push({ page: beforeLabel, action: decisionLabel(decision), outcome: actualOutcome })
      if (currentLabel !== pathHistory[pathHistory.length - 1] || currentState.url !== beforeUrl || decision.action.type === 'back') pathHistory.push(currentLabel)
      timeline.push({
        step,
        page: beforeUrl,
        pageLabel: beforeLabel,
        action: decisionLabel(decision),
        actionDetail: selectedText || actualOutcome,
        reasoningSummary: decisionReason,
        confidence: decision.confidence,
        expectedOutcome: decision.expectedOutcome,
        actualOutcome,
        timeMs,
        tone: actionTone,
      })
      const actionShot = await capture(activePage, directory, input.id, persona.id, step, currentLabel, selectedText, actionTone === 'danger' ? 'warning' : actionTone === 'success' ? 'success' : 'warning', 'action')
      if (actionShot) screenshots.push(actionShot)
      emitLiveEvent(input, {
        kind: 'action',
        personaId: persona.id,
        personaName: persona.name,
        step,
        page: currentState.url,
        pageLabel: currentLabel,
        action: decisionLabel(decision),
        detail: actualOutcome,
        confidence: decision.confidence,
        latencyMs: decision.latencyMs,
        screenshotSrc: actionShot?.src,
        deviceLabel: deviceLabel(persona.behavior),
        profileLabels: persona.behavior.labels,
        protectedAction,
      })
      if (shouldAbandonAfterAction) {
        outcome = 'failed'
        primaryProblem = `${persona.name} abandoned the route after the page stopped making progress.`
        break
      }
    }
  } catch (error) {
    primaryProblem = error instanceof Error ? error.message : 'The browser session failed to load.'
  } finally {
    await context.close().catch(() => undefined)
  }

  if (outcome === 'failed' && timeline.some((step) => step.action.includes('Reached protected boundary'))) outcome = 'protected'
  const confidence = timeline.length
    ? timeline.reduce((sum, step) => sum + step.confidence, 0) / timeline.length
    : 0
  const duration = Math.max(1, Math.round((Date.now() - startedAt) / 1000))
  return {
    result: {
      ...persona,
      outcome,
      outcomeLabel: outcome === 'completed' ? 'Completed' : outcome === 'protected' ? 'Protected boundary' : 'Failed',
      steps: timeline.length,
      confidence,
      backtracks,
      duration: '0m ' + duration + 's',
      path: pathHistory,
      primaryProblem,
      variationSeed: random.seed,
      behaviorStats: {
        exploratoryActions: runtimeSignals.exploratoryActions,
        recoveryAttempts: runtimeSignals.recoveryAttempts,
        noProgressEvents: runtimeSignals.noProgressEvents,
        uniquePages: visitedPages.size,
        comparisonActions: runtimeSignals.comparisonActions,
        protectedActionsAttempted,
      },
      protectedActionAudit,
      confidenceDrop: timeline.length > 1 && timeline[timeline.length - 1].confidence < timeline[0].confidence - 0.2
        ? 'Step ' + timeline.length + ' · ' + Math.round(timeline[0].confidence * 100) + '% → ' + Math.round(timeline[timeline.length - 1].confidence * 100) + '%'
        : undefined,
      timeline,
    },
    screenshots,
  }
}

function buildJourneyData(results: PersonaResult[]): { nodes: JourneyNode[]; edges: JourneyEdge[]; bestPath: string[] } {
  const nodeCounts = new Map<string, number>()
  const edgeCounts = new Map<string, { from: string; to: string; count: number }>()
  results.forEach((result) => {
    result.path.forEach((label, index) => {
      nodeCounts.set(label, (nodeCounts.get(label) || 0) + 1)
      if (index > 0) {
        const from = result.path[index - 1]
        const key = from + '::' + label
        const edge = edgeCounts.get(key) || { from, to: label, count: 0 }
        edge.count += 1
        edgeCounts.set(key, edge)
      }
    })
  })
  const labels = [...nodeCounts.keys()].slice(0, 9)
  const maxCount = results.length || 1
  const nodes = labels.map((label, index) => ({
    id: slug(label),
    label,
    meta: Math.round((nodeCounts.get(label) || 0) / maxCount * 100) + '% · ' + (nodeCounts.get(label) || 0) + ' users',
    x: [10, 37, 64, 88][Math.min(3, index % 4)],
    y: index % 4 === 0 ? 50 : index % 2 ? 28 : 74,
    tone: /abandon|fail|back|error/i.test(label) ? 'red' : index === 0 ? 'default' : 'lime',
  })) as JourneyNode[]
  const edges = [...edgeCounts.values()].slice(0, 14).map((edge) => ({
    from: slug(edge.from),
    to: slug(edge.to),
    label: Math.round(edge.count / maxCount * 100) + '%',
    tone: /back|fail|abandon/i.test(edge.to) ? 'red' : 'lime',
  })) as JourneyEdge[]
  const bestPath = results
    .filter((result) => result.outcome !== 'failed')
    .sort((a, b) => a.steps - b.steps)[0]?.path || results[0]?.path || []
  return { nodes, edges, bestPath }
}

function buildLiveIssues(results: PersonaResult[]): FrictionIssue[] {
  const failed = results.filter((result) => result.outcome === 'failed')
  const backtracked = results.filter((result) => result.backtracks > 0)
  const hesitant = results.filter((result) => result.confidence < 0.58)
  const issues: FrictionIssue[] = []
  if (failed.length) {
    issues.push({
      id: 'live-failure',
      page: failed[0].path[failed[0].path.length - 1] || 'Unknown',
      title: 'Some users did not reach a confident task boundary',
      description: 'These sessions ended after the agent could not find a reliable next action within the configured step limit.',
      usersAffected: failed.length,
      severity: failed.length >= Math.ceil(results.length / 3) ? 'High' : 'Medium',
      severityTone: failed.length >= Math.ceil(results.length / 3) ? 'high' : 'medium',
      evidence: [
        failed.length + ' users failed before the task boundary',
        Math.round(failed.reduce((sum, result) => sum + result.confidence, 0) / failed.length * 100) + '% average confidence on failed sessions',
        failed[0].primaryProblem,
      ],
      recommendation: 'Make the next task-relevant action more visible and use labels that match the user’s goal.',
    })
  }
  if (backtracked.length) {
    issues.push({
      id: 'live-backtrack',
      page: backtracked[0].path[0] || 'Homepage',
      title: 'Users changed direction during navigation',
      description: 'The path included a return action or an unsuccessful click, which is a signal that the information architecture was not self-evident.',
      usersAffected: backtracked.length,
      severity: 'Medium',
      severityTone: 'medium',
      evidence: [
        backtracked.length + ' users backtracked or retried a control',
        'Most common path: ' + backtracked[0].path.join(' → '),
        'Average backtracks: ' + (backtracked.reduce((sum, result) => sum + result.backtracks, 0) / backtracked.length).toFixed(1),
      ],
      recommendation: 'Reduce competing routes and clarify the label of the primary task path.',
    })
  }
  if (hesitant.length) {
    issues.push({
      id: 'live-ambiguity',
      page: hesitant[0].timeline.find((step) => step.confidence < 0.58)?.pageLabel || 'Unknown',
      title: 'The next action was ambiguous',
      description: 'Several persona decisions fell below the confidence threshold used for an unambiguous interaction.',
      usersAffected: hesitant.length,
      severity: 'Low',
      severityTone: 'low',
      evidence: [
        hesitant.length + ' users had an average confidence below 58%',
        'Lowest observed decision: ' + Math.round(Math.min(...hesitant.map((result) => result.confidence)) * 100) + '%',
        'The ambiguity appeared before the final task boundary.',
      ],
      recommendation: 'Strengthen visual hierarchy around the action that best matches the task language.',
    })
  }
  if (!issues.length) {
    issues.push({
      id: 'live-clear',
      page: 'All pages',
      title: 'No systemic friction detected',
      description: 'Every simulated user found a reasonable route without repeated backtracking or protected-action confusion.',
      usersAffected: 0,
      severity: 'Low',
      severityTone: 'low',
      evidence: ['All sessions reached a task boundary', 'No repeated action loops detected', 'Confidence stayed above the ambiguity threshold'],
      recommendation: 'Keep the current information hierarchy and continue testing with more task types.',
    })
  }
  return issues
}

function buildLiveAgentStates(results: PersonaResult[], liveEvents: LiveEvent[]): LiveAgentState[] {
  return results.map((result) => {
    const personaEvents = liveEvents.filter((event) => event.personaId === result.id)
    const lastEvent = personaEvents[personaEvents.length - 1]
    const screenshotEvent = [...personaEvents].reverse().find((event) => event.screenshotSrc)
    const status: LiveAgentState['status'] = result.outcome === 'completed'
      ? 'completed'
      : result.outcome === 'protected'
        ? 'blocked'
        : 'failed'
    return {
      id: result.id,
      name: result.name,
      initials: result.initials,
      color: result.color,
      status,
      step: lastEvent?.step ?? result.steps,
      pageLabel: lastEvent?.pageLabel || result.path[result.path.length - 1] || 'Session ended',
      action: lastEvent?.action || result.outcomeLabel,
      confidence: lastEvent?.confidence ?? result.confidence,
      screenshotSrc: screenshotEvent?.screenshotSrc,
      lastEventAt: lastEvent?.at,
      deviceLabel: deviceLabel(result.behavior),
      profileLabels: result.behavior.labels,
    }
  })
}

function buildLiveReport(input: LiveSimulationInput, runs: PersonaRun[], liveEvents: LiveEvent[]): RunReport {
  const results = runs.map((run) => run.result)
  const total = results.length
  const completed = results.filter((result) => result.outcome !== 'failed').length
  const avg = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0
  const journey = buildJourneyData(results)
  const screenshots = runs.flatMap((run) => run.screenshots).slice(0, 8)
  const domain = new URL(input.website).hostname.replace(/^www\./, '')
  const successful = results.filter((result) => result.outcome !== 'failed')
  return {
    id: input.id,
    status: 'complete',
    executionMode: 'live',
    progress: 100,
    phase: 'Live report ready',
    website: input.website,
    domain,
    task: input.task,
    actionPolicy: input.actionPolicy,
    variationSeed: input.variationSeed,
    createdAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    personasCount: total,
    maxSteps: input.maxSteps,
    metrics: {
      completed,
      total,
      completionRate: total ? Math.round(completed / total * 100) : 0,
      avgSteps: Number(avg(results.map((result) => result.steps)).toFixed(1)),
      successfulAvgSteps: Number(avg(successful.map((result) => result.steps)).toFixed(1)),
      failedAvgSteps: Number(avg(results.filter((result) => result.outcome === 'failed').map((result) => result.steps)).toFixed(1)),
      avgConfidence: Math.round(avg(results.map((result) => result.confidence)) * 100),
      avgBacktracks: Number(avg(results.map((result) => result.backtracks)).toFixed(1)),
      biggestDropOff: results.find((result) => result.outcome === 'failed')?.path.slice(-2).join(' → ') || 'No major drop-off',
      biggestDropOffCount: results.filter((result) => result.outcome === 'failed').length,
      sessionDuration: Math.round(avg(results.map((result) => Number(result.duration.replace(/\D/g, '') || 0)))) + 's',
    },
    summary: completed + ' of ' + total + ' simulated users reached a task boundary on the live site.',
    summaryAccent: results.some((result) => result.outcome === 'failed')
      ? 'The report highlights the exact routes where users lost confidence.'
      : 'The current task path was clear across the tested personas.',
    issues: buildLiveIssues(results),
    personas: results,
    journeyNodes: journey.nodes,
    journeyEdges: journey.edges,
    screenshots,
    liveEvents,
    liveAgents: buildLiveAgentStates(results, liveEvents),
    protectedActionAudit: runs.flatMap((run) => run.result.protectedActionAudit),
    bestPath: journey.bestPath,
    guardrailNote: input.actionPolicy === 'full'
      ? 'Full action mode was explicitly confirmed for this allowlisted test host. Protected actions were audit-logged and sensitive values were redacted from logs.'
      : 'Live sessions stop before sensitive inputs, account creation, payment, messages, destructive actions, and protected submissions.',
  }
}

export async function runLiveSimulation(input: LiveSimulationInput): Promise<RunReport> {
  await mkdir(path.join(input.assetDir, input.id), { recursive: true })
  const variationSeed = input.variationSeed || createRunSeed()
  const headless = process.env.GHOST_USER_HEADLESS !== '0'
  input.onProgress?.(8, headless ? 'Starting hidden browser sessions' : 'Opening visible Chrome session')
  const browser = await launchSimulationBrowser(headless)
  const selected = defaultPersonas.slice(0, Math.max(5, Math.min(input.personas, defaultPersonas.length)))
  const runs: PersonaRun[] = []
  const liveEvents: LiveEvent[] = []
  const sessionInput: LiveSimulationInput = {
    ...input,
    variationSeed,
    onEvent: (event) => {
      liveEvents.push(event)
      input.onEvent?.(event)
    },
  }
  try {
    const concurrency = headless ? 3 : 1
    for (let start = 0; start < selected.length; start += concurrency) {
      if (input.signal?.aborted) throw new Error('Run cancelled.')
      const batch = selected.slice(start, start + concurrency)
      const batchResults = await Promise.all(batch.map((persona, offset) =>
        simulatePersona(browser, sessionInput, persona, start + offset, path.join(input.assetDir, input.id)),
      ))
      runs.push(...batchResults)
      input.onProgress?.(15 + Math.round(runs.length / selected.length * 72), 'Running live browser sessions · ' + runs.length + '/' + selected.length)
    }
    input.onProgress?.(93, 'Clustering live friction')
    const report = buildLiveReport(sessionInput, runs, liveEvents)
    if (!headless) {
      const closeDelayMs = Number(process.env.GHOST_USER_VISIBLE_CLOSE_DELAY_MS || 6000)
      await new Promise((resolve) => setTimeout(resolve, Math.max(1000, Math.min(closeDelayMs, 30000))))
    }
    return report
  } finally {
    await browser.close().catch(() => undefined)
  }
}
