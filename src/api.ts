export type UserRole = 'admin' | 'compras'
export type ApprovalStatus = 'approved' | 'pending'

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
  responsibleUserId: string
  responsibleName: string
  responsibleRegistration: string
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
  scheduledAt: string
  scheduledAtLabel: string
  trailStep: string
  source: string
  createdAt: string
  createdByUserId: string | null
  createdByRegistration: string | null
}

class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
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
  }

  if (!response.ok) {
    throw new ApiError(response.status, payload.error ?? 'Erro ao comunicar com o servidor.')
  }

  return payload as T
}

export const api = {
  me: () => request<{ user: AppUser }>('/api/auth/me'),
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
  approveUser: (id: string) =>
    request<{ user: AppUser }>(`/api/users/${id}/approve`, {
      method: 'PATCH',
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
    responsibleUserId: string
  }) =>
    request<{ csd: CsdRecord }>('/api/csds', {
      method: 'POST',
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
  listMeterSchedules: (trailStep?: string) => {
    const search = new URLSearchParams()
    if (trailStep) search.set('trailStep', trailStep)
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
  createMeterSchedule: (payload: {
    meter: string
    installation: string
    toi: string
    note: string
    csd: string
    clientPresent: 'sim' | 'nao'
    schedulingNotes?: string
  }) =>
    request<{ schedule: MeterScheduleRecord }>('/api/meter-schedules', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
}

export { ApiError }
