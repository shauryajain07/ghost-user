import type { PageState } from '../types'

export function readPageSnapshot(selector: string): Omit<PageState, 'url'>

export function checkCurrentAction(input: { targetId: string; expectedGuard: string }):
  | { ok: true }
  | { ok: false; reason: string }
