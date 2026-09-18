import assert from 'node:assert/strict'
import test from 'node:test'
import { isTaskProvidedValue, validateActionPolicy } from './action-policy'
import { validateBrowserAction } from './browser'
import { personas } from './fixtures'
import { createPersonaRandom, createPersonaRuntimeSignals, deriveStepBudget, recoveryResponse, sampleWaitMilliseconds } from './persona-policy'
import { pageSnapshotForJev } from './jev-agent'
import type { PageState } from '../types'

test('all fixed personas have distinct behavior profiles', () => {
  const signatures = new Set(personas.map((persona) => JSON.stringify(persona.behavior)))
  assert.equal(personas.length, 15)
  assert.equal(signatures.size, personas.length)
  assert.ok(personas.every((persona) => persona.behavior.labels.length > 0))
  assert.ok(personas.every((persona) => persona.riskTolerance >= 0 && persona.riskTolerance <= 1))
})

test('persona profiles produce different step budgets', () => {
  const impatient = personas.find((persona) => persona.id === 'p1')
  const explorer = personas.find((persona) => persona.id === 'p7')
  assert.ok(impatient)
  assert.ok(explorer)
  assert.ok(deriveStepBudget(30, impatient) < deriveStepBudget(30, explorer))
  assert.ok(deriveStepBudget(30, impatient) >= 6)
  assert.ok(deriveStepBudget(10, explorer) <= 10)
})

test('persona profiles control device and recovery behavior', () => {
  const mobile = personas.find((persona) => persona.id === 'p10')!
  const impatient = personas.find((persona) => persona.id === 'p1')!
  const explorer = personas.find((persona) => persona.id === 'p7')!
  assert.equal(mobile.behavior.device, 'mobile')
  assert.deepEqual(mobile.behavior.viewport, { width: 390, height: 844 })
  assert.equal(recoveryResponse(impatient, { exploratoryActions: 0, comparisonActions: 0, noProgressEvents: 0, recoveryAttempts: 0 }, 1, 10, true), 'abandon')
  assert.equal(recoveryResponse(explorer, { exploratoryActions: 0, comparisonActions: 0, noProgressEvents: 1, recoveryAttempts: 0 }, 2, 10, true), 'backtrack')
})

test('variation is random per run but reproducible after recording the seed', () => {
  const first = createPersonaRandom(12345, 'p1')
  const second = createPersonaRandom(12345, 'p1')
  const differentPersona = createPersonaRandom(12345, 'p7')
  assert.equal(first.seed, second.seed)
  assert.deepEqual([first.next(), first.next(), first.next()], [second.next(), second.next(), second.next()])
  assert.notEqual(first.seed, differentPersona.seed)
  const firstSignals = createPersonaRuntimeSignals(personas[0], createPersonaRandom(12345, personas[0].id))
  const secondSignals = createPersonaRuntimeSignals(personas[0], createPersonaRandom(12345, personas[0].id))
  assert.deepEqual(firstSignals, secondSignals)
})

test('wait variation stays within the persona range', () => {
  const persona = personas.find((candidate) => candidate.id === 'p2')!
  const random = createPersonaRandom(42, persona.id)
  const waits = Array.from({ length: 20 }, () => sampleWaitMilliseconds(persona.behavior, random))
  assert.ok(waits.every((wait) => wait >= persona.behavior.waitRangeMs[0] && wait <= persona.behavior.waitRangeMs[1]))
})

test('recorded JEV snapshot includes risk tolerance and the full behavior profile', () => {
  const persona = personas.find((candidate) => candidate.id === 'p3')!
  const snapshot = pageSnapshotForJev({
    task: 'Read the documentation heading.',
    persona,
    state: { url: 'https://example.com/docs', title: 'Docs', visibleText: 'Documentation', interactiveElements: [] },
    history: [],
    step: 1,
    maxSteps: 8,
  }, []) as unknown as { persona: { risk_tolerance: number; behavior_profile: unknown } }
  assert.equal(snapshot.persona.risk_tolerance, persona.riskTolerance)
  assert.deepEqual(snapshot.persona.behavior_profile, persona.behavior)
})

test('shallow and distracted profiles receive fewer ranked controls', () => {
  const state: PageState = {
    url: 'https://example.com',
    title: 'Many controls',
    visibleText: 'Many controls',
    interactiveElements: Array.from({ length: 30 }, (_, index) => ({ id: 'el_' + index, type: 'button' as const, text: 'Option ' + index })),
  }
  const distracted = personas.find((persona) => persona.id === 'p8')!
  const careful = personas.find((persona) => persona.id === 'p2')!
  const distractedSnapshot = pageSnapshotForJev({ task: 'Find the right option.', persona: distracted, state, history: [], step: 1, maxSteps: 10 }, []) as unknown as { elements: string[] }
  const carefulSnapshot = pageSnapshotForJev({ task: 'Find the right option.', persona: careful, state, history: [], step: 1, maxSteps: 10 }, []) as unknown as { elements: string[] }
  assert.equal(distractedSnapshot.elements.length, 12)
  assert.equal(carefulSnapshot.elements.length, 30)
})

test('safe mode blocks protected actions while full mode can validate them', () => {
  const state: PageState = {
    url: 'https://staging.example.com/signup',
    title: 'Signup',
    visibleText: 'Create account Password Delete account',
    interactiveElements: [
      { id: 'delete', type: 'button', text: 'Delete account' },
      { id: 'password', type: 'input', placeholder: 'Password' },
    ],
  }
  const click = { type: 'click', elementId: 'delete' } as const
  const type = { type: 'type', elementId: 'password', value: 'task-provided-value' } as const
  assert.equal(validateBrowserAction(click, state, { actionPolicy: 'safe' }).ok, false)
  assert.equal(validateBrowserAction(type, state, { actionPolicy: 'safe' }).ok, false)
  assert.equal(validateBrowserAction(click, state, { actionPolicy: 'full' }).ok, true)
  assert.equal(validateBrowserAction(type, state, { actionPolicy: 'full' }).ok, true)
})

test('full mode requires confirmation, environment approval, and an allowlisted host', () => {
  const originalFlag = process.env.GHOST_USER_ALLOW_PROTECTED_ACTIONS
  const originalHosts = process.env.GHOST_USER_PROTECTED_HOSTS
  try {
    delete process.env.GHOST_USER_ALLOW_PROTECTED_ACTIONS
    delete process.env.GHOST_USER_PROTECTED_HOSTS
    assert.equal(validateActionPolicy('https://staging.example.com', 'full', false).ok, false)
    assert.equal(validateActionPolicy('https://staging.example.com', 'full', true).ok, false)
    process.env.GHOST_USER_ALLOW_PROTECTED_ACTIONS = '1'
    process.env.GHOST_USER_PROTECTED_HOSTS = 'staging.example.com'
    assert.equal(validateActionPolicy('https://staging.example.com', 'full', true).ok, true)
    assert.equal(validateActionPolicy('https://untrusted.example.net', 'full', true).ok, false)
  } finally {
    if (originalFlag === undefined) delete process.env.GHOST_USER_ALLOW_PROTECTED_ACTIONS
    else process.env.GHOST_USER_ALLOW_PROTECTED_ACTIONS = originalFlag
    if (originalHosts === undefined) delete process.env.GHOST_USER_PROTECTED_HOSTS
    else process.env.GHOST_USER_PROTECTED_HOSTS = originalHosts
  }
})

test('sensitive full-mode values must be supplied by the task', () => {
  assert.equal(isTaskProvidedValue('alice@example.com', 'Enter alice@example.com into the email field.'), true)
  assert.equal(isTaskProvidedValue('hunter2', 'Enter the password into the password field.'), false)
  assert.equal(isTaskProvidedValue('Pro', 'Select the Pro plan from the dropdown.'), true)
})
