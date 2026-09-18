import { chromium, type Page } from 'playwright'
import type { ActionPolicy, BrowserAction, InteractiveElement, PageState } from '../types'
import { checkCurrentAction as pageCheckCurrentAction, readPageSnapshot as pageReadPageSnapshot } from './page-scripts.js'

const interactiveSelector = [
  'a[href]',
  'button',
  'input',
  'select',
  'textarea',
  'summary',
  '[contenteditable="true"]',
  '[role="button"]',
  '[role="link"]',
  '[role="checkbox"]',
  '[role="radio"]',
  '[role="switch"]',
  '[role="tab"]',
  '[role="menuitem"]',
  '[role="menuitemradio"]',
  '[role="option"]',
  '[role="gridcell"]',
  '[role="combobox"]',
  '[role="textbox"]',
  '[role="searchbox"]',
  '[role="spinbutton"]',
].join(',')

export const sensitivePattern = /password|passcode|credit|card number|cvv|cvc|security code|ssn|social security/i
export const protectedControlPattern = /sign\s*up|signup|register|create account|free trial|checkout|place order|buy now|purchase|pay|submit|send message|delete|book (?:a )?(?:demo|appointment)/i

function elementSelector(elementId: string) {
  return '[data-ghost-element="' + elementId + '"]'
}

function elementLabel(element: InteractiveElement) {
  const selectContext = element.type === 'select'
    ? [
        element.value ? 'selected=' + element.value : '',
        element.options?.length ? 'options=' + element.options.filter((option) => !option.disabled).map((option) => option.label).slice(0, 12).join('|') : '',
      ]
    : []
  return [element.type, element.role, element.text, element.ariaLabel, element.placeholder, element.href, ...selectContext].filter(Boolean).join(' ')
}

export function isSensitiveElement(element: InteractiveElement | undefined) {
  return Boolean(element && sensitivePattern.test(elementLabel(element)))
}

export function isProtectedControl(element: InteractiveElement | undefined) {
  return Boolean(element && protectedControlPattern.test(elementLabel(element)))
}

export function isProtectedBrowserAction(action: BrowserAction, state: PageState) {
  if (action.type !== 'click' && action.type !== 'type' && action.type !== 'select') return false
  const element = state.interactiveElements.find((candidate) => candidate.id === action.elementId)
  return action.type === 'click' ? isProtectedControl(element) : isSensitiveElement(element)
}

/**
 * Converts a live page into the compact state a persona policy is allowed to see.
 * The policy never receives a Playwright Page instance. The page-context script
 * assigns stable ids to DOM nodes, captures accessible controls, and records
 * per-target guards for the execution preflight below.
 */
async function observePageOnce(page: Page): Promise<PageState> {
  await page.waitForLoadState('domcontentloaded', { timeout: 4000 }).catch(() => undefined)
  const snapshot = await page.evaluate(pageReadPageSnapshot, interactiveSelector) as Omit<PageState, 'url'>
  return { url: page.url(), ...snapshot }
}

/**
 * Navigation can replace the document between the action and the next
 * observation. Retry the whole snapshot so a transient execution-context
 * error does not turn a valid live session into a failed persona.
 */
export async function observePage(page: Page): Promise<PageState> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      return await observePageOnce(page)
    } catch {
      if (attempt < 3) await page.waitForTimeout(180 * (attempt + 1)).catch(() => undefined)
    }
  }

  let url = ''
  try {
    url = page.url()
  } catch {
    // The page may have closed while a tab action was settling.
  }
  return { url, title: '', visibleText: '', interactiveElements: [] }
}

export function validateBrowserAction(action: BrowserAction, state: PageState, options: { actionPolicy?: ActionPolicy } = {}): { ok: true } | { ok: false; reason: string } {
  const actionPolicy = options.actionPolicy || 'safe'
  if (action.type === 'click' || action.type === 'type' || action.type === 'select') {
    const element = state.interactiveElements.find((candidate) => candidate.id === action.elementId)
    if (!element) return { ok: false, reason: 'The selected element is no longer present on the page.' }
    if (action.type === 'type' && element.type !== 'input') return { ok: false, reason: 'Typing is only allowed in a rendered input.' }
    if (action.type === 'select' && element.type !== 'select') return { ok: false, reason: 'Selecting an option requires a rendered select.' }
    if (action.type === 'select' && element.options?.length && !element.options.some((option) => !option.disabled && (option.label === action.value || option.value === action.value))) {
      return { ok: false, reason: 'The requested option is not available in the observed select.' }
    }
    if (actionPolicy === 'safe' && action.type === 'click' && isProtectedControl(element)) {
      return { ok: false, reason: 'Reached protected action boundary: protected controls are never activated in safe mode.' }
    }
    if (actionPolicy === 'safe' && (action.type === 'type' || action.type === 'select') && isSensitiveElement(element)) {
      return { ok: false, reason: 'Reached protected action boundary: sensitive input is never populated.' }
    }
  }
  if (action.type === 'scroll' && !['up', 'down'].includes(action.direction)) {
    return { ok: false, reason: 'Unsupported scroll direction.' }
  }
  if (action.type === 'wait' && (action.milliseconds < 0 || action.milliseconds > 3000)) {
    return { ok: false, reason: 'Waits are limited to three seconds per step.' }
  }
  if (action.type === 'finish' && action.reason.trim().length < 3) {
    return { ok: false, reason: 'A finish action needs a short reason.' }
  }
  return { ok: true }
}

function targetIdFor(action: BrowserAction) {
  return action.type === 'click' || action.type === 'type' || action.type === 'select' ? action.elementId : undefined
}

/**
 * Re-checks the observed node immediately before execution. Model output never
 * becomes a selector, and a stale or covered node is rejected instead of being
 * clicked through with a JavaScript fallback.
 */
async function assertCurrentActionFresh(page: Page, state: PageState, action: BrowserAction) {
  const targetId = targetIdFor(action)
  if (!targetId) {
    if (['scroll', 'back', 'forward', 'reload', 'press_enter'].includes(action.type) && state.url && page.url() !== state.url) {
      throw new Error('The page changed since the decision was made. The persona must observe it again.')
    }
    return
  }

  const result = await page.evaluate(pageCheckCurrentAction, {
    targetId,
    expectedGuard: state.elementGuards?.[targetId] || '',
  })

  if (!result.ok) throw new Error(result.reason)
}

async function bringTargetIntoView(page: Page, action: BrowserAction) {
  const targetId = targetIdFor(action)
  if (!targetId) return
  await page.locator(elementSelector(targetId)).first().scrollIntoViewIfNeeded({ timeout: 5000 })
}

/**
 * Executes only a previously validated BrowserAction. This is the single
 * module allowed to translate an action into Playwright calls.
 */
export async function executeBrowserAction(page: Page, state: PageState, action: BrowserAction, options: { actionPolicy?: ActionPolicy } = {}): Promise<string> {
  const validation = validateBrowserAction(action, state, options)
  if (!validation.ok) throw new Error(validation.reason)
  await bringTargetIntoView(page, action)
  await assertCurrentActionFresh(page, state, action)

  if (action.type === 'click') {
    await page.locator(elementSelector(action.elementId)).first().click({ timeout: 5000, noWaitAfter: true })
    return 'Clicked the selected element.'
  }
  if (action.type === 'type') {
    await page.locator(elementSelector(action.elementId)).first().fill(action.value.slice(0, 500))
    return 'Entered the requested value.'
  }
  if (action.type === 'select') {
    const locator = page.locator(elementSelector(action.elementId)).first()
    const optionValue = await locator.evaluate((element, requested) => {
      if (!(element instanceof HTMLSelectElement)) return null
      const option = Array.from(element.options).find((candidate) => !candidate.disabled && (candidate.label === requested || candidate.value === requested))
      return option?.value ?? null
    }, action.value)
    if (optionValue === null) throw new Error('The requested option is no longer available in the observed select.')
    await locator.selectOption(optionValue)
    return 'Selected the requested option.'
  }
  if (action.type === 'scroll') {
    await page.mouse.wheel(0, action.direction === 'down' ? 620 : -620)
    return 'Scrolled ' + action.direction + '.'
  }
  if (action.type === 'back') {
    await page.goBack({ waitUntil: 'domcontentloaded', timeout: 5000 }).catch(() => undefined)
    return 'Went back one page.'
  }
  if (action.type === 'forward') {
    await page.goForward({ waitUntil: 'domcontentloaded', timeout: 5000 }).catch(() => undefined)
    return 'Went forward one page.'
  }
  if (action.type === 'reload') {
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 8000 }).catch(() => undefined)
    return 'Reloaded the page.'
  }
  if (action.type === 'press_enter') {
    await page.keyboard.press('Enter')
    return 'Pressed Enter.'
  }
  if (action.type === 'open_tab') {
    await page.context().newPage()
    return 'Opened a new tab.'
  }
  if (action.type === 'close_tab') {
    const pages = page.context().pages()
    if (pages.length <= 1) return 'Kept the only open tab.'
    await page.close()
    return 'Closed the current tab.'
  }
  if (action.type === 'wait') {
    await page.waitForTimeout(action.milliseconds)
    return 'Waited for the page to settle.'
  }
  return action.success ? 'Marked the task as complete.' : 'Stopped the task: ' + action.reason
}

export async function openSafeBrowserSession(website: string) {
  const parsed = new URL(website)
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Only http and https pages can be tested.')
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ serviceWorkers: 'block' })
  const page = await context.newPage()
  await page.goto(parsed.toString(), { waitUntil: 'domcontentloaded', timeout: 15000 })
  return { browser, context, page }
}
