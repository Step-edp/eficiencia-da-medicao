import type { RatmFormData } from './types'

const DRAFT_STORAGE_KEY = 'eficiencia-ratm-draft'

export type RatmDraft = {
  count: number
  activeIndex: number
  forms: RatmFormData[]
  updatedAt: string
}

export function loadRatmDraft(): RatmDraft | null {
  try {
    const raw = sessionStorage.getItem(DRAFT_STORAGE_KEY)
    if (!raw) {
      return null
    }

    const parsed = JSON.parse(raw) as RatmDraft
    if (!parsed?.count || !Array.isArray(parsed.forms) || parsed.forms.length !== parsed.count) {
      return null
    }

    return parsed
  } catch {
    return null
  }
}

export function saveRatmDraft(draft: RatmDraft) {
  try {
    sessionStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft))
  } catch {
    const liteDraft: RatmDraft = {
      ...draft,
      forms: draft.forms.map((form) => ({
        ...form,
        photos: ['', '', '', ''],
      })),
    }

    sessionStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(liteDraft))
  }
}

export function clearRatmDraft() {
  sessionStorage.removeItem(DRAFT_STORAGE_KEY)
}
