import { chromium, type Page } from 'playwright'
import type { BrowserAction, InteractiveElement, PageState } from '../types'

const interactiveSelector = 'a,button,input,select,textarea,[role="button"],[role="link"]'
const sensitivePattern = /password|passcode|credit|card number|cvv|cvc|security code|ssn|social security/i

const elementIdFor = (index: number) => 'el_' + String(index + 1).padStart(3, '0')

/**
 * Converts a live page into the compact state a persona policy is allowed to see.
 * The policy never receives a Playwright Page instance.
 */
async function observePageOnce(page: Page): Promise<PageState> {
  await page.waitForLoadState('domcontentloaded', { timeout: 4000 }).catch(() => undefined)
  const snapshot = await page.evaluate((selector) => {
    const elements = Array.from(document.querySelectorAll(selector))
    elements.forEach((element, index) => {
      element.setAttribute('data-ghost-element', 'el_' + String(index + 1).padStart(3, '0'))
    })

    const interactiveElements = elements.flatMap((element, index) => {
      const style = window.getComputedStyle(element)
      const rect = element.getBoundingClientRect()
      if (style.display === 'none' || style.visibility === 'hidden' || rect.width === 0 || rect.height === 0) return []
      if (element.hasAttribute('disabled') || element.getAttribute('aria-disabled') === 'true') return []
      const tag = element.tagName.toLowerCase()
      const role = element.getAttribute('role')
      const type = tag === 'a' || role === 'link'
        ? 'link'
        : tag === 'button' || role === 'button'
          ? 'button'
          : tag === 'input'
            ? (element.getAttribute('type') === 'checkbox' ? 'checkbox' : element.getAttribute('type') === 'radio' ? 'radio' : 'input')
            : tag === 'select'
              ? 'select'
              : 'other'
      return [{
        id: 'el_' + String(index + 1).padStart(3, '0'),
        type,
        text: (element.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 160) || undefined,
        ariaLabel: element.getAttribute('aria-label') || undefined,
        placeholder: element.getAttribute('placeholder') || undefined,
        href: element.getAttribute('href') || undefined,
      }]
    })

    return {
      title: document.title,
      visibleText: (document.body?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 8000),
      interactiveElements,
    }
  }, interactiveSelector) as Omit<PageState, 'url'>

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

export function validateBrowserAction(action: BrowserAction, state: PageState): { ok: true } | { ok: false; reason: string } {
  if (action.type === 'click' || action.type === 'type' || action.type === 'select') {
    const element = state.interactiveElements.find((candidate) => candidate.id === action.elementId)
    if (!element) return { ok: false, reason: 'The selected element is no longer present on the page.' }
    if (action.type === 'type' && element.type !== 'input') return { ok: false, reason: 'Typing is only allowed in a visible input.' }
    if (action.type === 'select' && element.type !== 'select') return { ok: false, reason: 'Selecting an option requires a visible select.' }
    if (action.type === 'type' && sensitivePattern.test([element.ariaLabel, element.placeholder, element.text].filter(Boolean).join(' '))) {
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

/**
 * Executes only a previously validated BrowserAction. This is the single
 * module allowed to translate an action into Playwright calls.
 */
export async function executeBrowserAction(page: Page, state: PageState, action: BrowserAction): Promise<string> {
  const validation = validateBrowserAction(action, state)
  if (!validation.ok) throw new Error(validation.reason)
  if (action.type === 'click') {
    await page.locator('[data-ghost-element="' + action.elementId + '"]').first().click({ timeout: 5000, noWaitAfter: true })
      .catch(async () => page.locator('[data-ghost-element="' + action.elementId + '"]').first().evaluate((element) => (element as HTMLElement).click()))
    return 'Clicked the selected element.'
  }
  if (action.type === 'type') {
    await page.locator('[data-ghost-element="' + action.elementId + '"]').first().fill(action.value.slice(0, 500))
    return 'Entered the requested non-sensitive value.'
  }
  if (action.type === 'select') {
    const locator = page.locator('[data-ghost-element="' + action.elementId + '"]').first()
    await locator.selectOption({ label: action.value }).catch(async () => locator.selectOption(action.value))
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
