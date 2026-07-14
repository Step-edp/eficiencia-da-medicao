import type { Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import { query } from '../db.js'
import { clearAuthCookie, requireAdmin, requireAuth, setAuthCookie, signSsoToken, signToken, verifySsoToken } from '../auth.js'
import { writeAuditLog } from '../audit.js'

type UserRow = {
  id: string
  name: string
  registration: string
  email: string
  role: 'admin' | 'compras' | 'field'
  approval_status: 'approved' | 'pending'
  requested_at: Date
  approved_at: Date | null
  birth_date: string
  job_title: string
  cpf: string
  personal_description: string
  hobby: string
  work_area: string
  work_subtype: string
  whatsapp: string
  employment_type: string
  third_party_company: string
  locality: string
  edp_unit: string
}

function mapUser(row: UserRow) {
  return {
    id: row.id,
    name: row.name,
    registration: row.registration,
    email: row.email,
    role: row.role,
    approvalStatus: row.approval_status,
    requestedAt: row.requested_at.toISOString(),
    approvedAt: row.approved_at?.toISOString(),
    birthDate: row.birth_date,
    jobTitle: row.job_title,
    cpf: row.cpf,
    personalDescription: row.personal_description,
    hobby: row.hobby,
    workArea: row.work_area,
    workSubtype: row.work_subtype,
    whatsapp: row.whatsapp,
    employmentType: row.employment_type,
    thirdPartyCompany: row.third_party_company,
    locality: row.locality,
    edpUnit: row.edp_unit,
  }
}

async function findUserById(id: string) {
  const result = await query<UserRow>('SELECT * FROM users WHERE id = $1', [id])
  return result.rows[0] ?? null
}

export async function login(req: Request, res: Response) {
  const { registration, password } = req.body as {
    registration?: string
    password?: string
  }

  if (!registration?.trim() || !password) {
    res.status(400).json({ error: 'Matrícula e senha são obrigatórias.' })
    return
  }

  const normalizedRegistration = registration.trim().toUpperCase()
  const result = await query<UserRow & { password_hash: string }>(
    'SELECT * FROM users WHERE UPPER(registration) = $1',
    [normalizedRegistration],
  )
  const user = result.rows[0]

  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    res.status(401).json({ error: 'Matrícula ou senha inválida.' })
    return
  }

  if (user.approval_status !== 'approved') {
    res.status(403).json({
      error: 'Seu cadastro ainda está pendente de aprovação do ADM.',
    })
    return
  }

  const token = signToken({ id: user.id, registration: user.registration, role: user.role })
  setAuthCookie(res, token)
  res.json({ user: mapUser(user), token })
}

export async function register(req: Request, res: Response) {
  const {
    name,
    registration,
    birthDate,
    email,
    jobTitle,
    cpf,
    password,
    personalDescription,
    hobby,
    whatsapp,
    employmentType,
    thirdPartyCompany,
    workArea,
    workSubtype,
    locality,
    edpUnit,
  } = req.body as Record<string, string | undefined>

  const normalizedEmploymentType = employmentType?.trim() ?? ''
  const normalizedEmployer = thirdPartyCompany?.trim() ?? ''
  const normalizedWorkArea = workArea?.trim() ?? ''
  const normalizedJobTitle = jobTitle?.trim() ?? ''
  const normalizedWorkSubtype = workSubtype?.trim() ?? ''
  const normalizedLocality = locality?.trim() ?? ''
  const normalizedWhatsapp = whatsapp?.trim() ?? ''
  const normalizedEdpUnit = edpUnit?.trim() ?? ''

  if (
    !name?.trim() ||
    !registration?.trim() ||
    !birthDate ||
    !email?.trim() ||
    !normalizedJobTitle ||
    !cpf?.trim() ||
    !password
  ) {
    res.status(400).json({ error: 'Preencha os campos obrigatórios.' })
    return
  }

  const catalogValues = await query<{ catalog_key: string; value: string }>(
    `SELECT catalog_key, value FROM catalog_options
     WHERE catalog_key = ANY($1::text[])`,
    [['cargo', 'area', 'tipo', 'terceira', 'localidade']],
  )
  const valuesByKey = catalogValues.rows.reduce<Record<string, string[]>>((acc, row) => {
    acc[row.catalog_key] = acc[row.catalog_key] ?? []
    acc[row.catalog_key].push(row.value)
    return acc
  }, {})

  const allowedAreas = valuesByKey.area?.length
    ? valuesByKey.area
    : [
        'Medição',
        'Telemedição',
        'CSD',
        'Consumo Irregular',
        'Grandes Clientes',
        'Qualidade',
      ]
  const allowedCargos = valuesByKey.cargo?.length
    ? valuesByKey.cargo
    : ['Técnico', 'Analista', 'Engenheiro']
  const allowedTipos = valuesByKey.tipo?.length ? valuesByKey.tipo : ['Própria', 'Terceira']
  const allowedTerceiras = valuesByKey.terceira ?? []
  const allowedLocalities = valuesByKey.localidade ?? []
  const allowedTechnicianSubtypes = [
    'Atividades administrativas da Medição',
    'Laboratório de Medição',
    'Lavratura de TOI',
    'Leituras de faturamento',
  ]
  const allowedEngineerSubtypes = ['Área', 'Sub-área', 'Processos específicos']

  if (!allowedCargos.includes(normalizedJobTitle)) {
    res.status(400).json({ error: 'Selecione um cargo válido.' })
    return
  }

  if (!allowedAreas.includes(normalizedWorkArea)) {
    res.status(400).json({ error: 'Selecione a área.' })
    return
  }

  if (!allowedTipos.includes(normalizedEmploymentType)) {
    res.status(400).json({ error: 'Selecione o tipo: Própria ou Terceira.' })
    return
  }

  let storedEmployer = ''
  let storedEdpUnit = ''

  if (!['EDP SP', 'EDP ES', 'Transversal'].includes(normalizedEdpUnit)) {
    res.status(400).json({ error: 'Selecione EDP SP, EDP ES ou Transversal.' })
    return
  }
  storedEdpUnit = normalizedEdpUnit

  if (normalizedEmploymentType === 'Própria') {
    storedEmployer = ''
  } else {
    if (
      !normalizedEmployer ||
      (allowedTerceiras.length > 0 && !allowedTerceiras.includes(normalizedEmployer))
    ) {
      res.status(400).json({ error: 'Selecione a empresa terceira.' })
      return
    }
    storedEmployer = normalizedEmployer
  }

  if (
    allowedLocalities.length > 0
      ? !allowedLocalities.includes(normalizedLocality)
      : !normalizedLocality
  ) {
    res.status(400).json({ error: 'Selecione a localidade.' })
    return
  }

  if (normalizedJobTitle === 'Técnico') {
    if (!allowedTechnicianSubtypes.includes(normalizedWorkSubtype)) {
      res.status(400).json({ error: 'Selecione o escopo.' })
      return
    }
  } else if (normalizedJobTitle === 'Engenheiro') {
    if (!allowedEngineerSubtypes.includes(normalizedWorkSubtype)) {
      res.status(400).json({ error: 'Selecione a abrangência do engenheiro.' })
      return
    }
  }

  const normalizedRegistration = registration.trim().toUpperCase()
  const normalizedEmail = email.trim().toLowerCase()
  const id = `${Date.now()}-${normalizedRegistration}`
  const passwordHash = await bcrypt.hash(password, 10)

  try {
    const insert = await query<UserRow>(
      `INSERT INTO users (
        id, name, registration, password_hash, email, role, approval_status,
        birth_date, job_title, cpf, personal_description, hobby, whatsapp,
        employment_type, third_party_company, work_area, work_subtype, locality, edp_unit
      ) VALUES ($1,$2,$3,$4,$5,'compras','pending',$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
      RETURNING *`,
      [
        id,
        name.trim(),
        normalizedRegistration,
        passwordHash,
        normalizedEmail,
        birthDate,
        normalizedJobTitle,
        cpf.trim(),
        personalDescription?.trim() ?? '',
        hobby ?? '',
        normalizedWhatsapp,
        normalizedEmploymentType,
        storedEmployer,
        normalizedWorkArea,
        normalizedJobTitle === 'Analista' ? '' : normalizedWorkSubtype,
        normalizedLocality,
        storedEdpUnit,
      ],
    )

    await writeAuditLog(req, {
      action: 'register',
      entityType: 'user',
      entityId: insert.rows[0].id,
      summary: `Cadastro solicitado: ${insert.rows[0].registration}`,
      newData: mapUser(insert.rows[0]),
    })

    res.status(201).json({ user: mapUser(insert.rows[0]) })
  } catch (error) {
    const pgError = error as { code?: string }
    if (pgError.code === '23505') {
      res.status(409).json({ error: 'Já existe um cadastro com esta matrícula ou e-mail.' })
      return
    }
    throw error
  }
}


export async function me(req: Request, res: Response) {
  const user = await findUserById(req.user!.id)
  if (!user) {
    clearAuthCookie(res)
    res.status(401).json({ error: 'Usuário não encontrado.' })
    return
  }
  res.json({ user: mapUser(user) })
}

export function logout(_req: Request, res: Response) {
  clearAuthCookie(res)
  res.json({ ok: true })
}

export async function createEmbedToken(req: Request, res: Response) {
  const ssoToken = signSsoToken(req.user!.id)
  res.json({ ssoToken })
}

export async function exchangeSsoToken(req: Request, res: Response) {
  const { ssoToken } = req.body as { ssoToken?: string }

  if (!ssoToken?.trim()) {
    res.status(400).json({ error: 'Token SSO ausente.' })
    return
  }

  const userId = verifySsoToken(ssoToken.trim())
  if (!userId) {
    res.status(401).json({ error: 'Token SSO inválido ou expirado.' })
    return
  }

  const user = await findUserById(userId)
  if (!user) {
    res.status(401).json({ error: 'Usuário não encontrado.' })
    return
  }

  if (user.approval_status !== 'approved') {
    res.status(403).json({ error: 'Seu cadastro ainda está pendente de aprovação do ADM.' })
    return
  }

  const token = signToken({ id: user.id, registration: user.registration, role: user.role })
  setAuthCookie(res, token)
  res.json({ user: mapUser(user) })
}

export async function listUsers(_req: Request, res: Response) {
  const result = await query<UserRow>('SELECT * FROM users ORDER BY requested_at DESC')
  res.json({ users: result.rows.map(mapUser) })
}

export async function approveUser(req: Request, res: Response) {
  const { id } = req.params

  const previous = await query<UserRow>(
    `SELECT * FROM users WHERE id = $1 AND role = 'compras'`,
    [id],
  )

  if (!previous.rows[0]) {
    res.status(404).json({ error: 'Usuário não encontrado.' })
    return
  }

  const result = await query<UserRow>(
    `UPDATE users SET approval_status = 'approved', approved_at = NOW()
     WHERE id = $1 AND role = 'compras'
     RETURNING *`,
    [id],
  )

  const user = mapUser(result.rows[0])

  await writeAuditLog(req, {
    action: 'approve',
    entityType: 'user',
    entityId: user.id,
    summary: `Usuário aprovado: ${user.registration}`,
    oldData: mapUser(previous.rows[0]),
    newData: user,
  })

  res.json({ user })
}

export const authRoutes = {
  login,
  register,
  me: [requireAuth, me],
  logout: [requireAuth, logout],
  createEmbedToken: [requireAuth, createEmbedToken],
  exchangeSsoToken,
  listUsers: [requireAuth, requireAdmin, listUsers],
  approveUser: [requireAuth, requireAdmin, approveUser],
}
