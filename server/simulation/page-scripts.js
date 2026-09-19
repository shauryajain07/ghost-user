export function readPageSnapshot(selector) {
  const runtime = window.__ghostUser ||= {
    ids: new WeakMap(),
    next: 1,
  }

  function normalize(value) {
    return (value || '').replace(/\s+/g, ' ').trim()
  }
  function stableId(element) {
    const existing = runtime.ids.get(element)
    if (existing) {
      element.setAttribute('data-ghost-element', existing)
      return existing
    }
    const id = 'el_' + String(runtime.next++).padStart(4, '0')
    runtime.ids.set(element, id)
    element.setAttribute('data-ghost-element', id)
    return id
  }
  function accessibleName(element, seen = new Set()) {
    if (!element || seen.has(element)) return ''
    seen.add(element)

    const labelledBy = normalize(element.getAttribute('aria-labelledby'))
    if (labelledBy) {
      const referenced = labelledBy
        .split(/\s+/)
        .map((id) => accessibleName(document.getElementById(id), seen))
        .filter(Boolean)
        .join(' ')
      if (referenced) return referenced
    }

    const ariaLabel = normalize(element.getAttribute('aria-label'))
    if (ariaLabel) return ariaLabel

    const labels = element.labels
    if (labels?.length) {
      const labelledText = Array.from(labels).map((label) => accessibleName(label, seen)).filter(Boolean).join(' ')
      if (labelledText) return labelledText
    }

    if (['button', 'submit', 'reset', 'image'].includes(element.type) && normalize(element.value)) return normalize(element.value)
    if (normalize(element.getAttribute('alt'))) return normalize(element.getAttribute('alt'))

    const childText = Array.from(element.childNodes)
      .map((node) => {
        if (node.nodeType === Node.TEXT_NODE) return node.textContent || ''
        if (node.nodeType === Node.ELEMENT_NODE && node.getAttribute('aria-hidden') !== 'true') return accessibleName(node, seen)
        return ''
      })
      .join(' ')
    if (normalize(childText)) return normalize(childText)

    return normalize(element.getAttribute('title')) || normalize(element.getAttribute('placeholder'))
  }
  function roleFor(element) {
    const explicitRole = normalize(element.getAttribute('role'))
    const supportedRoles = new Set([
      'button', 'link', 'checkbox', 'radio', 'switch', 'tab', 'menuitem', 'menuitemradio',
      'option', 'gridcell', 'combobox', 'textbox', 'searchbox', 'spinbutton',
    ])
    if (supportedRoles.has(explicitRole)) return explicitRole
    const tag = element.tagName.toLowerCase()
    if (tag === 'button' || tag === 'summary') return 'button'
    if (tag === 'a') return 'link'
    if (tag === 'select') return 'combobox'
    if (tag === 'textarea' || element.isContentEditable) return 'textbox'
    if (tag === 'input') {
      if (['checkbox', 'radio'].includes(element.type)) return element.type
      if (element.type === 'search') return 'searchbox'
      if (element.type === 'number') return 'spinbutton'
      if (['text', 'email', 'url', 'tel'].includes(element.type)) return 'textbox'
      if (['button', 'submit', 'reset', 'image'].includes(element.type)) return 'button'
    }
    return 'other'
  }
  function typeFor(element, role) {
    const tag = element.tagName.toLowerCase()
    const inputType = tag === 'input' ? element.type : ''
    if (tag === 'a' || role === 'link') return 'link'
    if (tag === 'button' || tag === 'summary' || ['button', 'tab', 'menuitem', 'menuitemradio'].includes(role)) return 'button'
    if (role === 'checkbox' || role === 'switch' || inputType === 'checkbox') return 'checkbox'
    if (role === 'radio' || inputType === 'radio') return 'radio'
    if (tag === 'select') return 'select'
    if (tag === 'input' || tag === 'textarea' || element.isContentEditable || ['combobox', 'textbox', 'searchbox', 'spinbutton'].includes(role)) return 'input'
    return 'other'
  }
  function valueFor(element) {
    if (element instanceof HTMLInputElement && element.type === 'password') return ''
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) return element.value
    if (element.isContentEditable) return normalize(element.textContent)
    return normalize(element.getAttribute('aria-valuenow'))
  }
  function rendered(element) {
    if (element.closest('[aria-hidden="true"], [inert]')) return false
    const style = window.getComputedStyle(element)
    const rect = element.getBoundingClientRect()
    const browserVisible = typeof element.checkVisibility === 'function'
      ? element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })
      : true
    return browserVisible
      && style.display !== 'none'
      && style.visibility !== 'hidden'
      && style.opacity !== '0'
      && rect.width > 0
      && rect.height > 0
  }
  function layoutFor(element) {
    const rect = element.getBoundingClientRect()
    const centerX = rect.x + rect.width / 2
    const centerY = rect.y + rect.height / 2
    return {
      inViewport: centerX >= 0 && centerY >= 0 && centerX < window.innerWidth && centerY < window.innerHeight,
      pageX: Math.round(rect.left + window.scrollX),
      pageY: Math.round(rect.top + window.scrollY),
    }
  }
  function guardFor(element) {
    const select = element
    const scope = element.closest('form,dialog,[role="dialog"],article,li,tr,[role="row"]') || element.parentElement
    return JSON.stringify({
      tag: element.tagName,
      role: roleFor(element),
      name: normalize(element.getAttribute('aria-label') || element.getAttribute('aria-labelledby') || element.getAttribute('placeholder')),
      text: normalize(element.textContent).slice(0, 240),
      value: valueFor(element),
      checked: ['checkbox', 'radio'].includes(element.type) ? element.checked : undefined,
      selectedIndex: element instanceof HTMLSelectElement ? select.selectedIndex : undefined,
      disabled: element.matches(':disabled') || element.getAttribute('aria-disabled') === 'true',
      readOnly: 'readOnly' in element ? Boolean(element.readOnly) : element.getAttribute('aria-readonly') === 'true',
      expanded: element.getAttribute('aria-expanded'),
      pressed: element.getAttribute('aria-pressed'),
      selected: element.getAttribute('aria-selected'),
      href: element.getAttribute('href'),
      context: normalize(scope?.textContent).slice(0, 1200),
    })
  }

  const elements = Array.from(document.querySelectorAll(selector))
  const interactiveElements = elements.flatMap((element) => {
    const id = stableId(element)
    if (element instanceof HTMLInputElement && ['file', 'hidden'].includes(element.type)) return []
    if (!rendered(element)) return []
    if (element.matches(':disabled') || element.getAttribute('aria-disabled') === 'true') return []
    const role = roleFor(element)
    const type = typeFor(element, role)
    const layout = layoutFor(element)
    const options = element instanceof HTMLSelectElement
      ? Array.from(element.options).map((option) => ({
          label: normalize(option.label || option.textContent),
          value: option.value,
          disabled: option.disabled || Boolean(option.closest('optgroup[disabled]')),
        }))
      : undefined
    const checked = ['checkbox', 'radio'].includes(element.type) ? element.checked : undefined
    return [{
      id,
      type,
      role,
      text: normalize(element.textContent).slice(0, 160) || undefined,
      ariaLabel: normalize(element.getAttribute('aria-label')) || undefined,
      placeholder: normalize(element.getAttribute('placeholder')) || undefined,
      href: element.getAttribute('href') || undefined,
      value: valueFor(element) || undefined,
      checked,
      selectedIndex: element instanceof HTMLSelectElement ? element.selectedIndex : undefined,
      expanded: element.getAttribute('aria-expanded') || undefined,
      pressed: element.getAttribute('aria-pressed') || undefined,
      selected: element.getAttribute('aria-selected') || undefined,
      inViewport: layout.inViewport,
      pageX: layout.pageX,
      pageY: layout.pageY,
      options,
      guard: guardFor(element),
    }]
  })

  const title = document.title
  const visibleText = normalize(document.body?.innerText).slice(0, 24000)
  const pageHeight = Math.max(document.documentElement?.scrollHeight || 0, document.body?.scrollHeight || 0)
  const elementGuards = Object.fromEntries(interactiveElements.map((element) => [element.id, element.guard]))
  const publicElements = interactiveElements.map(({ guard: _guard, ...element }) => element)
  const snapshotKey = JSON.stringify({
    url: location.href,
    title,
    visibleText: visibleText.slice(0, 6000),
    scrollY: window.scrollY,
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    pageHeight,
    elements: publicElements.map((element) => [element.id, element.role, element.text, element.ariaLabel, element.value, element.href, element.pressed, element.selected, element.checked]),
  })

  return {
    title,
    visibleText,
    scrollY: window.scrollY,
    pageHeight,
    viewport: { width: window.innerWidth, height: window.innerHeight },
    interactiveElements: publicElements,
    elementGuards,
    snapshotKey,
  }
}

export function checkCurrentAction({ targetId, expectedGuard }) {
  const runtime = window.__ghostUser
  const element = Array.from(document.querySelectorAll('[data-ghost-element]')).find((candidate) => candidate.getAttribute('data-ghost-element') === targetId)
  if (!runtime || !element) return { ok: false, reason: 'The observed control is no longer connected to the page.' }

  function normalize(value) {
    return (value || '').replace(/\s+/g, ' ').trim()
  }
  function roleFor(candidate) {
    const explicitRole = normalize(candidate.getAttribute('role'))
    if (explicitRole) return explicitRole
    const tag = candidate.tagName.toLowerCase()
    if (tag === 'button' || tag === 'summary') return 'button'
    if (tag === 'a') return 'link'
    if (tag === 'select') return 'combobox'
    if (tag === 'textarea' || candidate.isContentEditable) return 'textbox'
    if (tag === 'input') {
      if (['checkbox', 'radio'].includes(candidate.type)) return candidate.type
      if (candidate.type === 'search') return 'searchbox'
      if (candidate.type === 'number') return 'spinbutton'
      if (['text', 'email', 'url', 'tel'].includes(candidate.type)) return 'textbox'
      if (['button', 'submit', 'reset', 'image'].includes(candidate.type)) return 'button'
    }
    return 'other'
  }
  function valueFor(candidate) {
    if (candidate instanceof HTMLInputElement && candidate.type === 'password') return ''
    if (candidate instanceof HTMLInputElement || candidate instanceof HTMLTextAreaElement || candidate instanceof HTMLSelectElement) return candidate.value
    if (candidate.isContentEditable) return normalize(candidate.textContent)
    return normalize(candidate.getAttribute('aria-valuenow'))
  }
  function rendered(candidate) {
    if (candidate.closest('[aria-hidden="true"], [inert]')) return false
    const style = window.getComputedStyle(candidate)
    const rect = candidate.getBoundingClientRect()
    const browserVisible = typeof candidate.checkVisibility === 'function'
      ? candidate.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })
      : true
    return browserVisible
      && style.display !== 'none'
      && style.visibility !== 'hidden'
      && style.opacity !== '0'
      && rect.width > 0
      && rect.height > 0
  }
  function guardFor(candidate) {
    const select = candidate
    const scope = candidate.closest('form,dialog,[role="dialog"],article,li,tr,[role="row"]') || candidate.parentElement
    return JSON.stringify({
      tag: candidate.tagName,
      role: roleFor(candidate),
      name: normalize(candidate.getAttribute('aria-label') || candidate.getAttribute('aria-labelledby') || candidate.getAttribute('placeholder')),
      text: normalize(candidate.textContent).slice(0, 240),
      value: valueFor(candidate),
      checked: ['checkbox', 'radio'].includes(candidate.type) ? candidate.checked : undefined,
      selectedIndex: candidate instanceof HTMLSelectElement ? select.selectedIndex : undefined,
      disabled: candidate.matches(':disabled') || candidate.getAttribute('aria-disabled') === 'true',
      readOnly: 'readOnly' in candidate ? Boolean(candidate.readOnly) : candidate.getAttribute('aria-readonly') === 'true',
      expanded: candidate.getAttribute('aria-expanded'),
      pressed: candidate.getAttribute('aria-pressed'),
      selected: candidate.getAttribute('aria-selected'),
      href: candidate.getAttribute('href'),
      context: normalize(scope?.textContent).slice(0, 1200),
    })
  }

  if (!rendered(element)) return { ok: false, reason: 'The observed control is no longer rendered or available.' }
  if (element.matches(':disabled') || element.getAttribute('aria-disabled') === 'true' || element.closest('[inert]')) {
    return { ok: false, reason: 'The observed control is disabled or inert.' }
  }
  if (expectedGuard && guardFor(element) !== expectedGuard) {
    return { ok: false, reason: 'The observed control changed since the decision was made.' }
  }

  const rect = element.getBoundingClientRect()
  const centerX = rect.x + rect.width / 2
  const centerY = rect.y + rect.height / 2
  const hit = document.elementFromPoint(centerX, centerY)
  if (!hit || !(hit === element || element.contains(hit))) {
    return { ok: false, reason: 'The observed control is covered by another element.' }
  }
  return { ok: true }
}
