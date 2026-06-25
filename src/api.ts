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
    request<{ user: AppUser }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ registration, password }),
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
}

export { ApiError }
