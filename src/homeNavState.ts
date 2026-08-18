export type GestaoHomeTab = 'dash' | 'celulas' | 'pessoas'
export type UsersViewTab = 'usuarios' | 'pendentes' | 'reprovados' | 'dashboard'

export type HomeNavState = {
  userId: string
  selectedAreaTitle: string | null
  selectedOrgAreaId: string | null
  selectedOrgCell: string | null
  selectedOrgSubcell: string | null
  gestaoHomeTab: GestaoHomeTab
  selectedMeasurementSection: string | null
  selectedLabMeasurementSection: string | null
  selectedHomologationSection: string | null
  selectedPasswordAction: string | null
  selectedCodeMaterialsAction: 'create' | 'edit' | null
  usersView: UsersViewTab
}

const STORAGE_KEY = 'edm-home-nav-v1'

function isGestaoHomeTab(value: unknown): value is GestaoHomeTab {
  return value === 'dash' || value === 'celulas' || value === 'pessoas'
}

function isUsersViewTab(value: unknown): value is UsersViewTab {
  return value === 'usuarios' || value === 'pendentes' || value === 'reprovados' || value === 'dashboard'
}

export function loadHomeNavState(userId: string): HomeNavState | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<HomeNavState>
    if (!parsed || parsed.userId !== userId) return null
    return {
      userId,
      selectedAreaTitle:
        typeof parsed.selectedAreaTitle === 'string' ? parsed.selectedAreaTitle : null,
      selectedOrgAreaId:
        typeof parsed.selectedOrgAreaId === 'string' ? parsed.selectedOrgAreaId : null,
      selectedOrgCell: typeof parsed.selectedOrgCell === 'string' ? parsed.selectedOrgCell : null,
      selectedOrgSubcell:
        typeof parsed.selectedOrgSubcell === 'string' ? parsed.selectedOrgSubcell : null,
      gestaoHomeTab: isGestaoHomeTab(parsed.gestaoHomeTab) ? parsed.gestaoHomeTab : 'dash',
      selectedMeasurementSection:
        typeof parsed.selectedMeasurementSection === 'string'
          ? parsed.selectedMeasurementSection
          : null,
      selectedLabMeasurementSection:
        typeof parsed.selectedLabMeasurementSection === 'string'
          ? parsed.selectedLabMeasurementSection
          : null,
      selectedHomologationSection:
        typeof parsed.selectedHomologationSection === 'string'
          ? parsed.selectedHomologationSection
          : null,
      selectedPasswordAction:
        typeof parsed.selectedPasswordAction === 'string'
          ? parsed.selectedPasswordAction
          : null,
      selectedCodeMaterialsAction:
        parsed.selectedCodeMaterialsAction === 'create' ||
        parsed.selectedCodeMaterialsAction === 'edit'
          ? parsed.selectedCodeMaterialsAction
          : null,
      usersView: isUsersViewTab(parsed.usersView) ? parsed.usersView : 'usuarios',
    }
  } catch {
    return null
  }
}

export function saveHomeNavState(state: HomeNavState) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // ignore quota / private mode errors
  }
}

export function clearHomeNavState() {
  try {
    sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
}
