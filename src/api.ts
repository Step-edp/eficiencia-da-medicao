export type UserRole = 'admin' | 'compras' | 'field'
export type ApprovalStatus = 'approved' | 'pending'
export type VacationStatus = 'ok' | 'pendente' | 'bloqueado' | 'em_ausencia' | 'em_ferias'
export type AbsenceType =
  | 'ferias'
  | 'licenca'
  | 'afastamento'
  | 'atestado'
  | 'treinamento'
  | 'outro'

export type VacationCoverFor = {
  userId: string
  name: string
  registration: string
  vacationStart: string
  vacationEnd: string
  absenceType?: AbsenceType
  absenceTypeLabel?: string
  sources: string[]
}

export type AppUser = {
  id: string
  name: string
  registration: string
  email: string
  role: UserRole
  approvalStatus: ApprovalStatus
  requestedAt: string
  approvedAt?: string
  birthDate: string
  jobTitle: string
  cpf: string
  personalDescription: string
  hobby: string
  workArea?: string
  workSubtype?: string
  whatsapp?: string
  employmentType?: string
  thirdPartyCompany?: string
  locality?: string
  edpUnit?: string
  profilePhoto?: string
  accessAreas?: string[]
  accessProcesses?: string[]
  /** Visível apenas para o administrador (não vem no login do próprio usuário). */
  password?: string
  vacationStatus?: VacationStatus
  vacationDeadlineAt?: string | null
  vacationRequiredSince?: string | null
  nextVacationStart?: string | null
  nextVacationEnd?: string | null
  activeAbsenceType?: AbsenceType | null
  activeAbsenceTypeLabel?: string | null
  activeAbsenceStart?: string | null
  activeAbsenceEnd?: string | null
  vacationSubstituteUserId?: string | null
  vacationSubstituteName?: string | null
  coveringFor?: VacationCoverFor[]
}

export type VacationPeriod = {
  id: number
  startDate: string
  endDate: string
  absenceType?: AbsenceType
  absenceTypeLabel?: string
  createdAt: string
  updatedAt: string
}

export type VacationAgendaResponse = {
  periods: VacationPeriod[]
  vacationStatus: VacationStatus
  vacationDeadlineAt: string | null
  vacationRequiredSince: string | null
  nextVacation: VacationPeriod | null
  activeAbsence?: VacationPeriod | null
  vacationSubstituteUserId?: string | null
  vacationSubstituteName?: string | null
  coveringFor?: VacationCoverFor[]
  period?: VacationPeriod | null
}

export type ProcessRole = 'responsavel' | 'executor'

export type OrgCellStatus = 'pendente' | 'ativa'

export type OrgCellDto = {
  id: string
  areaId: string
  label: string
  description: string
  responsibleUserId: string | null
  responsibleName: string | null
  responsibleRegistration: string | null
  substituteUserId: string | null
  substituteName: string | null
  substituteRegistration: string | null
  status: OrgCellStatus
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export type OrgAreaDto = {
  id: string
  label: string
  description: string
  responsibleUserId: string | null
  responsibleName: string | null
  responsibleRegistration: string | null
  substituteUserId: string | null
  substituteName: string | null
  substituteRegistration: string | null
  status: OrgCellStatus
  updatedAt: string
}

export type OrgStructureResponse = {
  areas: OrgAreaDto[]
  area: OrgAreaDto | null
  cells: OrgCellDto[]
}

export type ProcessAssignment = {
  processKey: string
  area: string
  process: string
  responsavelUserId: string | null
  responsavelName: string | null
  responsavelRegistration: string | null
  responsavelActingUserId?: string | null
  responsavelActingName?: string | null
  responsavelCoveredBySubstitute?: boolean
  executorUserId: string | null
  executorName: string | null
  executorRegistration: string | null
  executorActingUserId?: string | null
  executorActingName?: string | null
  executorCoveredBySubstitute?: boolean
}

export type CatalogKey =
  | 'cargo'
  | 'area'
  | 'tipo'
  | 'terceira'
  | 'localidade'
  | 'escopo_csd'

export type CatalogOption = {
  id: number
  catalogKey: CatalogKey
  value: string
  sortOrder: number
  label: string
}

export type CatalogGroup = {
  key: CatalogKey
  label: string
  options: CatalogOption[]
}

export type HomologationRequestItem = {
  equipmentType: string
  materialCode: string
  quantity: number
  description: string
}

export type HomologationRequest = {
  id: string
  requesterUserId: string
  requesterName: string
  requesterRegistration: string
  requesterEmail: string
  requesterArea: 'Compras'
  orderNumber: string
  manufacturer: string
  items: HomologationRequestItem[]
  justification: string
  requestedAt: string
  status: 'Recebido'
}

export type PasswordType = 'alphanumeric' | 'letters' | 'numbers'

export type PasswordRecord = {
  id: string
  meter: string
  password: string
  manufacturer: string
  materialType: string
  orderNumber: string
  passwordType: PasswordType
  digits: number
  createdAt: string
}

export type MaterialRecord = {
  id?: number
  material: string
  oldCode: string
  newCode: string
  description: string
  manufacturer: string
  prefix: string
  equipmentType: string
}

export type RatmLaudoRecord = {
  id: string
  ratmNumber: number
  meter: string
  client: string
  createdAt: string
  status: 'Pendente' | 'Aprovado' | 'Reprovado'
  formData: Record<string, unknown>
}

export type CsdRecord = {
  id: string
  name: string
  address: string
  cities: string[]
  responsibleUserId: string | null
  responsibleName: string | null
  responsibleRegistration: string | null
  status: 'ativa' | 'pendente'
  createdAt: string
}

export type FieldTeamUserOption = {
  id: string
  name: string
  registration: string
}

export type AuditLogRecord = {
  id: string
  occurredAt: string
  userId: string | null
  userRegistration: string | null
  userRole: string | null
  action: string
  entityType: string
  entityId: string | null
  summary: string | null
  ipAddress: string | null
  userAgent: string | null
  oldData: Record<string, unknown> | null
  newData: Record<string, unknown> | null
  metadata: Record<string, unknown>
}

export type EnsaiosManualBlock = {
  date: string
  reason: string
}

export type MeterScheduleRecord = {
  id: string
  meter: string
  installation: string
  toi: string
  note: string
  csd: string
  clientPresent: 'sim' | 'nao'
  schedulingNotes: string
  toiCollaborator1Name?: string
  toiCollaborator1Registration?: string
  toiCollaborator2Name?: string
  toiCollaborator2Registration?: string
  toiTeamReason?: string
  partnerUserId?: string | null
  partnerName?: string
  partnerRegistration?: string
  envelopePhoto?: string
  scheduledAt: string
  scheduledAtLabel: string
  trailStep: string
  source: string
  createdAt: string
  createdByUserId: string | null
  createdByRegistration: string | null
  demmDocumentId: string | null
  demmFileName: string | null
  demmMeterCount: number
}

export type FieldPartnerOption = {
  id: string
  name: string
  registration: string
  label: string
}

export type DemmDocumentRecord = {
  id: string
  meterScheduleId: string | null
  meter: string
  fileName: string
  documentNumber: string | null
  emissionDate: string | null
  extractedMeters: DemmMeterAnalysisRecord[]
  meterCount: number
  scheduledCount: number
  createdAt: string
  createdByUserId: string | null
  createdByRegistration: string | null
}

export type DemmMeterAnalysisRecord = {
  meter: string
  scheduled: boolean
  scheduleId: string | null
  scheduledAtLabel: string | null
  sourceFiles?: string[]
}

export type DemmUploadConflictRecord = {
  meter: string
  reason: 'demm_registered' | 'entrada_given'
  detail: string
}

export type DemmAnalysisResponse = {
  id: string
  fileName: string
  analysis: {
    meters: DemmMeterAnalysisRecord[]
    total: number
    scheduledCount: number
  }
}

class ApiError extends Error {
  status: number
  conflicts?: DemmUploadConflictRecord[]

  constructor(status: number, message: string, conflicts?: DemmUploadConflictRecord[]) {
    super(message)
    this.status = status
    this.conflicts = conflicts
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
    ...options,
  })

  const payload = (await response.json().catch(() => ({}))) as {
    error?: string
    conflicts?: DemmUploadConflictRecord[]
  }

  if (!response.ok) {
    throw new ApiError(
      response.status,
      payload.error ?? 'Erro ao comunicar com o servidor.',
      payload.conflicts,
    )
  }

  return payload as T
}

export const api = {
  me: () => request<{ user: AppUser }>('/api/auth/me'),
  getVacationAgenda: () => request<VacationAgendaResponse>('/api/agenda/vacations'),
  saveVacationPeriod: (payload: { startDate: string; endDate: string }) =>
    request<VacationAgendaResponse>('/api/agenda/vacations', {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  createAbsencePeriod: (payload: {
    startDate: string
    endDate: string
    absenceType: AbsenceType
  }) =>
    request<VacationAgendaResponse>('/api/agenda/absences', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  deleteAbsencePeriod: (id: number) =>
    request<VacationAgendaResponse>(`/api/agenda/absences/${id}`, {
      method: 'DELETE',
    }),
  login: (registration: string, password: string) =>
    request<{ user: AppUser; token?: string }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ registration, password }),
    }),
  exchangeSsoToken: (ssoToken: string) =>
    request<{ user: AppUser }>('/api/auth/sso-exchange', {
      method: 'POST',
      body: JSON.stringify({ ssoToken }),
    }),
  createEmbedToken: () =>
    request<{ ssoToken: string }>('/api/auth/embed-token', {
      method: 'POST',
    }),
  register: (payload: {
    name: string
    registration: string
    birthDate: string
    email: string
    jobTitle: string
    cpf: string
    password: string
    personalDescription?: string
    hobby?: string
    whatsapp?: string
    employmentType?: string
    thirdPartyCompany?: string
    workArea?: string
    workSubtype?: string
    locality?: string
    edpUnit?: string
    profilePhoto?: string
  }) =>
    request<{ user: AppUser }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  logout: () =>
    request<{ ok: boolean }>('/api/auth/logout', {
      method: 'POST',
    }),
  listUsers: () => request<{ users: AppUser[] }>('/api/users'),
  approveUser: (
    id: string,
    payload?: {
      thirdPartyCompany?: string
      workSubtype?: string
      accessAreas?: string[]
      accessProcesses?: string[]
    },
  ) =>
    request<{ user: AppUser }>(`/api/users/${id}/approve`, {
      method: 'PATCH',
      body: JSON.stringify(payload ?? {}),
    }),
  rejectUser: (id: string, payload: { reason: string }) =>
    request<{ ok: boolean; id: string; emailSent?: boolean; warning?: string }>(
      `/api/users/${id}/reject`,
      {
        method: 'PATCH',
        body: JSON.stringify(payload),
      },
    ),
  resetUserToPending: (id: string) =>
    request<{ user: AppUser }>(`/api/users/${id}/pending`, {
      method: 'PATCH',
      body: JSON.stringify({}),
    }),
  updateUser: (
    id: string,
    payload: {
      name: string
      registration: string
      email: string
      whatsapp: string
      birthDate: string
      cpf: string
      jobTitle: string
      workArea: string
      employmentType: string
      edpUnit: string
      locality: string
      thirdPartyCompany: string
      workSubtype: string
      accessAreas: string[]
      accessProcesses: string[]
      personalDescription: string
      hobby: string
      profilePhoto: string
      password?: string
    },
  ) =>
    request<{ user: AppUser }>(`/api/users/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  deleteUser: (id: string) =>
    request<{ ok: boolean; id: string }>(`/api/users/${id}`, {
      method: 'DELETE',
    }),
  listProcessAssignments: () =>
    request<{ assignments: ProcessAssignment[] }>('/api/process-assignments'),
  upsertProcessAssignment: (payload: {
    processKey: string
    role: ProcessRole
    userId: string | null
  }) =>
    request<{ assignments: ProcessAssignment[] }>('/api/process-assignments', {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  listOrgCells: () => request<OrgStructureResponse>('/api/org-cells'),
  createOrgArea: (payload: {
    label: string
    description?: string
    responsibleUserId?: string | null
    substituteUserId?: string | null
  }) =>
    request<OrgStructureResponse & { createdArea: OrgAreaDto | null }>('/api/org-area', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateOrgArea: (
    areaId: string,
    payload: {
      label?: string
      responsibleUserId?: string | null
      substituteUserId?: string | null
    },
  ) =>
    request<OrgStructureResponse>(`/api/org-area/${encodeURIComponent(areaId)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  createOrgCell: (payload: {
    areaId?: string
    label: string
    description?: string
    responsibleUserId?: string | null
    substituteUserId?: string | null
  }) =>
    request<OrgStructureResponse & { cell: OrgCellDto | null }>('/api/org-cells', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateOrgCell: (
    id: string,
    payload: {
      description?: string
      responsibleUserId?: string | null
      substituteUserId?: string | null
    },
  ) =>
    request<OrgStructureResponse & { cell: OrgCellDto | null }>(
      `/api/org-cells/${encodeURIComponent(id)}`,
      {
        method: 'PATCH',
        body: JSON.stringify(payload),
      },
    ),
  deleteOrgCell: (id: string) =>
    request<OrgStructureResponse>(`/api/org-cells/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),
  listCatalogOptions: () => request<{ catalogs: CatalogGroup[] }>('/api/catalog-options'),
  createCatalogOption: (payload: { catalogKey: CatalogKey; value: string }) =>
    request<{ option: CatalogOption }>('/api/catalog-options', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  deleteCatalogOption: (id: number) =>
    request<{ ok: boolean; id: number }>(`/api/catalog-options/${id}`, {
      method: 'DELETE',
    }),
  listHomologationRequests: () =>
    request<{ requests: HomologationRequest[] }>('/api/homologation-requests'),
  createHomologationRequest: (payload: {
    orderNumber: string
    manufacturer: string
    items: HomologationRequestItem[]
    justification: string
  }) =>
    request<{ request: HomologationRequest }>('/api/homologation-requests', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  listPasswordRecords: () => request<{ records: PasswordRecord[] }>('/api/password-records'),
  listManufacturers: () => request<{ manufacturers: string[] }>('/api/manufacturers'),
  addManufacturer: (name: string) =>
    request<{ name: string }>('/api/manufacturers', {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),
  generatePasswords: (payload: {
    meters: string[]
    passwordDigits: number
    passwordType: PasswordType
    manufacturer: string
    materialType: string
    orderNumber: string
  }) =>
    request<{
      results: Array<{
        meter: string
        password: string
        status: 'generated' | 'duplicate'
        createdAt: string
      }>
      records: PasswordRecord[]
    }>('/api/password-records/generate', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  listMaterials: () => request<{ materials: MaterialRecord[] }>('/api/materials'),
  createMaterial: (payload: Omit<MaterialRecord, 'id'>) =>
    request<{ material: MaterialRecord }>('/api/materials', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  listRatmLaudos: () => request<{ laudos: RatmLaudoRecord[] }>('/api/ratm-laudos'),
  createRatmLaudos: (forms: Record<string, unknown>[]) =>
    request<{ laudos: RatmLaudoRecord[] }>('/api/ratm-laudos', {
      method: 'POST',
      body: JSON.stringify({ forms }),
    }),
  updateRatmLaudo: (id: string, formData: Record<string, unknown>) =>
    request<{ laudo: RatmLaudoRecord }>(`/api/ratm-laudos/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ formData }),
    }),
  approveRatmLaudo: (id: string, clientPresent: 'Sim' | 'Não', satisfactionWhatsapp?: string) =>
    request<{ laudo: RatmLaudoRecord }>(`/api/ratm-laudos/${id}/approve`, {
      method: 'PATCH',
      body: JSON.stringify({ clientPresent, satisfactionWhatsapp }),
    }),
  listEnsaiosManualBlocks: () =>
    request<{ blocks: EnsaiosManualBlock[] }>('/api/ensaios-calendar/manual-blocks'),
  toggleEnsaiosManualBlock: (date: string, reason?: string) =>
    request<{ blocks: EnsaiosManualBlock[]; blocked: boolean }>(
      '/api/ensaios-calendar/manual-blocks',
      {
        method: 'POST',
        body: JSON.stringify({ date, reason }),
      },
    ),
  listCsds: () => request<{ csds: CsdRecord[] }>('/api/csds'),
  createCsd: (payload: {
    name: string
    address: string
    cities: string[]
    responsibleUserId?: string | null
  }) =>
    request<{ csd: CsdRecord }>('/api/csds', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateCsd: (
    id: string,
    payload: {
      responsibleUserId?: string | null
      cities?: string[]
    },
  ) =>
    request<{ csd: CsdRecord }>(`/api/csds/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  deleteCsd: (id: string) =>
    request<{ ok: boolean; id: string; name: string }>(`/api/csds/${id}`, {
      method: 'DELETE',
    }),
  listFieldTeamInspectionUsers: () =>
    request<{ users: FieldTeamUserOption[] }>('/api/field-team/inspection-users'),
  listAuditLogs: (params?: { limit?: number; offset?: number; entityType?: string; action?: string }) => {
    const search = new URLSearchParams()
    if (params?.limit) search.set('limit', String(params.limit))
    if (params?.offset) search.set('offset', String(params.offset))
    if (params?.entityType) search.set('entityType', params.entityType)
    if (params?.action) search.set('action', params.action)
    const queryString = search.toString()
    return request<{ logs: AuditLogRecord[]; total: number; limit: number; offset: number }>(
      `/api/audit-logs${queryString ? `?${queryString}` : ''}`,
    )
  },
  listMeterSchedules: (trailStep?: string, options?: { mine?: boolean }) => {
    const search = new URLSearchParams()
    if (trailStep) search.set('trailStep', trailStep)
    if (options?.mine) search.set('mine', '1')
    const queryString = search.toString()
    return request<{ schedules: MeterScheduleRecord[]; total: number }>(
      `/api/meter-schedules${queryString ? `?${queryString}` : ''}`,
    )
  },
  countMeterSchedules: (trailStep?: string) => {
    const search = new URLSearchParams()
    if (trailStep) search.set('trailStep', trailStep)
    const queryString = search.toString()
    return request<{ total: number; trailStep: string }>(
      `/api/meter-schedules/count${queryString ? `?${queryString}` : ''}`,
    )
  },
  getMeterRegistryTrailCounts: () =>
    request<{ counts: Record<string, number> }>('/api/meter-registry/trail-counts'),
  createMeterSchedule: (payload: {
    meter: string
    installation: string
    toi: string
    note: string
    csd: string
    clientPresent: 'sim' | 'nao'
    schedulingNotes?: string
    partnerUserId: string
    envelopePhoto: string
    toiCollaborator1Name?: string
    toiCollaborator1Registration?: string
    toiCollaborator2Name?: string
    toiCollaborator2Registration?: string
    toiTeamReason?: string
  }) =>
    request<{ schedule: MeterScheduleRecord }>('/api/meter-schedules', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  listFieldPartners: () =>
    request<{ partners: FieldPartnerOption[] }>('/api/meter-schedules/partners'),
  createDemmDocument: (payload: {
    meterScheduleId?: string
    fileName: string
    fileBase64: string
  }) =>
    request<{
      document: DemmDocumentRecord
      analysis: DemmAnalysisResponse['analysis']
    }>('/api/demm-documents', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  listDemmDocuments: () => request<{ documents: DemmDocumentRecord[] }>('/api/demm-documents'),
  getDemmMetersBase: () =>
    request<{ meters: DemmMeterAnalysisRecord[]; total: number; scheduledCount: number }>(
      '/api/demm-documents/meters-base',
    ),
  getDemmDocumentAnalysis: (id: string) =>
    request<DemmAnalysisResponse>(`/api/demm-documents/${id}/analysis`),
  deleteDemmDocument: (id: string) =>
    request<{ ok: true; id: string; fileName: string }>(`/api/demm-documents/${id}`, {
      method: 'DELETE',
    }),
  getDemmDocumentFileUrl: (id: string) => `/api/demm-documents/${id}/file`,
}

export { ApiError }
