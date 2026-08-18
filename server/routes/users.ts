import type { Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import { query } from '../db.js'
import { clearAuthCookie, requireAdmin, requireAuth, setAuthCookie, signSsoToken, signToken, verifySsoToken } from '../auth.js'
import { writeAuditLog } from '../audit.js'
import {
  isAllowedEngineerSubtype,
  isConsumoIrregularWorkArea,
  isCsdEngineerLavraturaScope,
  isEngineerAreaSubtype,
  isEngineerProcessSubtype,
  isEngineerSubcellSubtype,
  isValidHomeSubareaProcess,
  normalizeEngineerSubtype,
  portalAreasFromProcesses,
  portalsCoveredByCellResponsibility,
  consumoIrregularAccessProcesses,
} from '../engineer-access.js'
import { listCatalogValues } from './catalog-options.js'
import { isMailConfigured, sendRegistrationRejectedEmail } from '../mail.js'
import {
  attachVacationMeta,
  getVacationMetaForUser,
} from './vacation.js'
import { skipsVacationAgenda } from '../vacation-exempt.js'

/** Portais da home derivados do escopo do técnico (alinhado aos perfis de cadastro). */
function accessAreasForTechnician(workArea: string, subtype: string): string[] {
  if (workArea === 'Medição' && subtype === 'Laboratório de Medição') {
    return ['Laboratório de Medição']
  }
  if (workArea === 'Medição' && subtype === 'Atividades administrativas da Medição') {
    return ['Medição']
  }
  if (workArea === 'CSD' && subtype === 'Leituras de faturamento') {
    return ['Medição']
  }
  if (workArea === 'CSD' && subtype === 'Lavratura de TOI - Ponto Focal') {
    return ['Equipe de campo']
  }
  if (workArea === 'CSD') {
    return ['Equipe de campo']
  }
  if (workArea === 'Consumo Irregular') {
    return ['Laboratório de Medição']
  }
  return []
}

async function findSubcellResponsibilityConflicts(
  areas: string[],
  excludeUserId?: string,
): Promise<Array<{ area: string; responsibleName: string }>> {
  const requested = [...new Set(areas.map((area) => area.trim()).filter(Boolean))]
  if (requested.length === 0) return []

  const result = await query<{
    name: string
    access_areas: unknown
  }>(
    `SELECT name, access_areas
     FROM users
     WHERE approval_status = 'approved'
       AND job_title = 'Engenheiro'
       AND work_subtype IN ('Responsável por sub-célula', 'Sub-área')
       AND ($2::text IS NULL OR id <> $2)
       AND EXISTS (
         SELECT 1
         FROM jsonb_array_elements_text(access_areas) AS area(value)
         WHERE area.value = ANY($1::text[])
       )`,
    [requested, excludeUserId ?? null],
  )

  const conflicts: Array<{ area: string; responsibleName: string }> = []
  const claimed = new Set<string>()

  for (const row of result.rows) {
    const owned = parseAccessAreas(row.access_areas)
    for (const area of requested) {
      if (claimed.has(area) || !owned.includes(area)) continue
      claimed.add(area)
      conflicts.push({ area, responsibleName: row.name })
    }
  }

  return conflicts
}

function formatSubcellConflictError(
  conflicts: Array<{ area: string; responsibleName: string }>,
): string {
  if (conflicts.length === 1) {
    const [item] = conflicts
    return `A subárea "${item.area}" já possui responsável: ${item.responsibleName}.`
  }
  return conflicts
    .map((item) => `"${item.area}" (${item.responsibleName})`)
    .join('; ')
    .replace(/^/, 'Estas subáreas já possuem responsável: ')
}

async function findOrgCellOwnerSubareaConflict(
  userId: string,
  accessAreas: string[],
): Promise<string | null> {
  const requested = [...new Set(accessAreas.map((area) => area.trim()).filter(Boolean))]
  if (requested.length === 0) return null

  const result = await query<{ id: string; label: string }>(
    `SELECT id, label FROM org_cells WHERE responsible_user_id = $1`,
    [userId],
  )
  if (result.rows.length === 0) return null

  const blocked = new Set<string>()
  const cellLabels: string[] = []
  for (const cell of result.rows) {
    cellLabels.push(cell.label || cell.id)
    for (const portal of portalsCoveredByCellResponsibility(cell.id)) {
      blocked.add(portal)
    }
  }

  const hits = requested.filter((area) => blocked.has(area))
  if (hits.length === 0) return null

  return `Responsável pela célula (${cellLabels.join(', ')}) não pode ser responsável por subáreas dentro dela (${hits.join(', ')}).`
}

type UserRow = {
  id: string
  name: string
  registration: string
  email: string
  role: 'admin' | 'compras' | 'field'
  approval_status: 'approved' | 'pending' | 'rejected'
  requested_at: Date
  approved_at: Date | null
  rejected_at: Date | null
  rejection_reason: string
  approved_by_user_id?: string | null
  approved_by_name?: string | null
  approved_by_registration?: string | null
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
  profile_photo: string
  access_areas: unknown
  access_processes: unknown
  password_plain?: string
}

function parseAccessAreas(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
  }
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value) as unknown
      return parseAccessAreas(parsed)
    } catch {
      return []
    }
  }
  return []
}

function mapUser(row: UserRow, options?: { includePassword?: boolean }) {
  return {
    id: row.id,
    name: row.name,
    registration: row.registration,
    email: row.email,
    role: row.role,
    approvalStatus: row.approval_status,
    requestedAt: row.requested_at.toISOString(),
    approvedAt: row.approved_at?.toISOString(),
    rejectedAt: row.rejected_at?.toISOString() ?? null,
    rejectionReason: row.rejection_reason || '',
    approvedByUserId: row.approved_by_user_id ?? null,
    approvedByName: row.approved_by_name || '',
    approvedByRegistration: row.approved_by_registration || '',
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
    profilePhoto: row.profile_photo || '',
    accessAreas: parseAccessAreas(row.access_areas),
    accessProcesses: parseAccessAreas(row.access_processes),
    ...(options?.includePassword
      ? { password: row.password_plain?.trim() ? row.password_plain : '' }
      : {}),
  }
}

async function mapUserWithVacation(row: UserRow, options?: { includePassword?: boolean }) {
  const base = mapUser(row, options)
  const meta = await getVacationMetaForUser(row.id, row.role, row.work_subtype)
  return attachVacationMeta(base, meta)
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
  res.json({ user: await mapUserWithVacation(user), token })
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
    profilePhoto,
  } = req.body as Record<string, string | undefined>

  const normalizedEmploymentType = employmentType?.trim() ?? ''
  const normalizedEmployer = thirdPartyCompany?.trim() ?? ''
  const normalizedWorkArea = workArea?.trim() ?? ''
  const normalizedJobTitle = jobTitle?.trim() ?? ''
  const normalizedWorkSubtype = workSubtype?.trim() ?? ''
  const normalizedLocality = locality?.trim() ?? ''
  const normalizedWhatsapp = whatsapp?.trim() ?? ''
  const normalizedEdpUnit = edpUnit?.trim() ?? ''
  const normalizedProfilePhoto = profilePhoto?.trim() ?? ''

  if (
    !name?.trim() ||
    !registration?.trim() ||
    !birthDate ||
    !email?.trim() ||
    !normalizedJobTitle ||
    !cpf?.trim() ||
    !password ||
    !normalizedWhatsapp ||
    !personalDescription?.trim() ||
    !normalizedProfilePhoto
  ) {
    res.status(400).json({ error: 'Preencha os campos obrigatórios.' })
    return
  }

  if (
    !normalizedProfilePhoto.startsWith('data:image/') ||
    normalizedProfilePhoto.length > 3_500_000
  ) {
    res.status(400).json({
      error: 'Envie uma imagem de perfil válida com até cerca de 2 MB.',
    })
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
    : ['Técnico', 'Analista', 'Engenheiro', 'Gestor', 'Estagiário', 'Assistente Administrativo']
  const allowedTipos = valuesByKey.tipo?.length ? valuesByKey.tipo : ['Própria', 'Terceira']
  const allowedLocalities = valuesByKey.localidade ?? []

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

  if (!['EDP SP', 'EDP ES', 'Transversal'].includes(normalizedEdpUnit)) {
    res.status(400).json({ error: 'Selecione EDP SP, EDP ES ou Transversal.' })
    return
  }

  if (
    allowedLocalities.length > 0
      ? !allowedLocalities.includes(normalizedLocality)
      : !normalizedLocality
  ) {
    res.status(400).json({ error: 'Selecione a localidade.' })
    return
  }

  // Escopo, abrangência do engenheiro e empresa terceira são definidos na aprovação.

  const normalizedRegistration = registration.trim().toUpperCase()
  const normalizedEmail = email.trim().toLowerCase()
  const id = `${Date.now()}-${normalizedRegistration}`
  const passwordHash = await bcrypt.hash(password, 10)

  try {
    const insert = await query<UserRow>(
      `INSERT INTO users (
        id, name, registration, password_hash, password_plain, email, role, approval_status,
        requested_at,
        birth_date, job_title, cpf, personal_description, hobby, whatsapp,
        employment_type, third_party_company, work_area, work_subtype, locality, edp_unit,
        profile_photo
      ) VALUES (
        $1,$2,$3,$4,$5,$6,'compras','pending',
        NOW(),
        $7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19
      )
      RETURNING *`,
      [
        id,
        name.trim(),
        normalizedRegistration,
        passwordHash,
        password,
        normalizedEmail,
        birthDate,
        normalizedJobTitle,
        cpf.trim(),
        personalDescription?.trim() ?? '',
        hobby ?? '',
        normalizedWhatsapp,
        normalizedEmploymentType,
        '',
        normalizedWorkArea,
        '',
        normalizedLocality,
        normalizedEdpUnit,
        normalizedProfilePhoto,
      ],
    )

    const stampedUser = mapUser(insert.rows[0])

    await writeAuditLog(req, {
      action: 'register',
      entityType: 'user',
      entityId: stampedUser.id,
      summary: `Cadastro solicitado: ${stampedUser.registration}`,
      newData: {
        ...stampedUser,
        profilePhoto: stampedUser.profilePhoto ? '[imagem anexada]' : '',
      },
    })

    // Carimbo fica só no banco/admin; não devolve a data ao solicitante.
    const { requestedAt: _requestedAt, approvedAt: _approvedAt, ...publicUser } = stampedUser
    res.status(201).json({ user: publicUser })
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
  res.json({ user: await mapUserWithVacation(user) })
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
  res.json({ user: await mapUserWithVacation(user) })
}

export async function listUsers(_req: Request, res: Response) {
  const result = await query<UserRow>(
    `SELECT u.id, u.name, u.registration, u.email, u.role, u.approval_status,
            u.requested_at, u.approved_at, u.rejected_at, u.rejection_reason,
            u.approved_by_user_id, u.birth_date, u.job_title, u.cpf,
            u.personal_description, u.hobby, u.work_area, u.work_subtype, u.whatsapp,
            u.employment_type, u.third_party_company, u.locality, u.edp_unit,
            u.access_areas, u.access_processes, u.password_plain,
            u.profile_photo,
            a.name AS approved_by_name,
            a.registration AS approved_by_registration
     FROM users u
     LEFT JOIN users a ON a.id = u.approved_by_user_id
     ORDER BY u.requested_at DESC`,
  )
  const users = await Promise.all(
    result.rows.map((row) => mapUserWithVacation(row, { includePassword: true })),
  )
  res.json({ users })
}

export async function approveUser(req: Request, res: Response) {
  const id = String(req.params.id)
  const { thirdPartyCompany, workSubtype, accessAreas, accessProcesses } = req.body as {
    thirdPartyCompany?: string
    workSubtype?: string
    accessAreas?: string[]
    accessProcesses?: string[]
  }

  const previous = await query<UserRow>(
    `SELECT * FROM users WHERE id = $1 AND role = 'compras'`,
    [id],
  )

  if (!previous.rows[0]) {
    res.status(404).json({ error: 'Usuário não encontrado.' })
    return
  }

  const pending = previous.rows[0]
  const jobTitle = pending.job_title
  const workArea = pending.work_area
  const employmentType = pending.employment_type
  const normalizedCompany = thirdPartyCompany?.trim() ?? ''
  const normalizedSubtype = workSubtype?.trim() ?? ''
  const requestedAccessAreas = Array.isArray(accessAreas)
    ? accessAreas.map((area) => area.trim()).filter(Boolean)
    : []
  const requestedAccessProcesses = Array.isArray(accessProcesses)
    ? accessProcesses.map((item) => item.trim()).filter(Boolean)
    : []

  const technicianScopesByArea: Record<string, string[]> = {
    Medição: [
      'Atividades administrativas da Medição',
      'Laboratório de Medição',
    ],
  }
  const csdScopes = await listCatalogValues('escopo_csd')
  const legacyCsdScopes = ['Lavratura de TOI', 'Lavratura de TOI - Ponto Focal']
  const allowedEngineerHomeSubareas = [
    'Medição',
    'Laboratório de Medição',
    'Laboratório de Homologação',
    'Equipe de campo',
    'Usuários',
    'Cadastros',
    'Telemedição',
  ]

  let storedCompany = ''
  if (employmentType === 'Terceira') {
    const catalogValues = await query<{ value: string }>(
      `SELECT value FROM catalog_options WHERE catalog_key = 'terceira'`,
    )
    const allowedTerceiras = catalogValues.rows.map((row) => row.value)
    if (
      !normalizedCompany ||
      (allowedTerceiras.length > 0 && !allowedTerceiras.includes(normalizedCompany))
    ) {
      res.status(400).json({ error: 'Selecione a empresa terceira antes de aprovar.' })
      return
    }
    storedCompany = normalizedCompany
  }

  let storedSubtype = ''
  let storedAccessAreas: string[] = []
  let storedAccessProcesses: string[] = []
  if (isConsumoIrregularWorkArea(workArea)) {
    storedSubtype = ''
    storedAccessAreas = ['Laboratório de Medição']
    storedAccessProcesses = consumoIrregularAccessProcesses()
  } else if (jobTitle === 'Engenheiro' && isCsdEngineerLavraturaScope(normalizedSubtype)) {
    storedSubtype = normalizedSubtype
    storedAccessAreas = accessAreasForTechnician(workArea, normalizedSubtype)
  } else if (jobTitle === 'Engenheiro') {
    if (!isAllowedEngineerSubtype(normalizedSubtype)) {
      res.status(400).json({ error: 'Selecione a abrangência do engenheiro antes de aprovar.' })
      return
    }
    storedSubtype = normalizeEngineerSubtype(normalizedSubtype)

    if (isEngineerAreaSubtype(storedSubtype)) {
      // Responsável pela célula cobre a área inteira; não acumula subáreas.
      storedAccessAreas = []
      storedAccessProcesses = []
    }

    if (isEngineerSubcellSubtype(storedSubtype)) {
      const invalid = requestedAccessAreas.filter(
        (area) => !allowedEngineerHomeSubareas.includes(area),
      )
      if (requestedAccessAreas.length === 0 || invalid.length > 0) {
        res.status(400).json({
          error: 'Selecione ao menos uma subárea da home para o engenheiro.',
        })
        return
      }
      const conflicts = await findSubcellResponsibilityConflicts(requestedAccessAreas)
      if (conflicts.length > 0) {
        res.status(409).json({ error: formatSubcellConflictError(conflicts) })
        return
      }
      const cellOwnerConflict = await findOrgCellOwnerSubareaConflict(
        id,
        requestedAccessAreas,
      )
      if (cellOwnerConflict) {
        res.status(409).json({ error: cellOwnerConflict })
        return
      }
      storedAccessAreas = requestedAccessAreas
    }

    if (isEngineerProcessSubtype(storedSubtype)) {
      const invalid = requestedAccessProcesses.filter(
        (item) => !isValidHomeSubareaProcess(item),
      )
      if (requestedAccessProcesses.length === 0 || invalid.length > 0) {
        res.status(400).json({
          error:
            'Selecione ao menos um processo específico dentro das subáreas da home.',
        })
        return
      }
      storedAccessProcesses = requestedAccessProcesses
      storedAccessAreas = portalAreasFromProcesses(workArea, storedAccessProcesses)
    }
  } else if (
    workArea === 'CSD' ||
    jobTitle === 'Técnico' ||
    (jobTitle === 'Analista' && workArea === 'Medição')
  ) {
    const allowedScopes =
      workArea === 'CSD'
        ? [...csdScopes, ...legacyCsdScopes]
        : jobTitle === 'Analista' && workArea === 'Medição'
          ? ['Atividades administrativas da Medição']
          : (technicianScopesByArea[workArea] ?? [])
    if (!allowedScopes.includes(normalizedSubtype)) {
      res.status(400).json({
        error:
          allowedScopes.length === 0
            ? 'Este cadastro está em uma área sem escopo configurado.'
            : 'Selecione o escopo antes de aprovar.',
      })
      return
    }
    storedSubtype = normalizedSubtype
    storedAccessAreas = accessAreasForTechnician(workArea, normalizedSubtype)
  } else if (jobTitle === 'Estagiário' && workArea === 'Medição') {
    storedSubtype = ''
    storedAccessAreas = []
    const invalid = requestedAccessProcesses.filter(
      (item) => !isValidHomeSubareaProcess(item),
    )
    if (invalid.length > 0) {
      res.status(400).json({
        error: 'Há processo inválido na atribuição do estagiário.',
      })
      return
    }
    storedAccessProcesses = requestedAccessProcesses
  }

  const approverId = req.user?.id ?? null
  let approverName = ''
  let approverRegistration = req.user?.registration ?? ''
  if (approverId) {
    const approver = await query<{ name: string; registration: string }>(
      `SELECT name, registration FROM users WHERE id = $1`,
      [approverId],
    )
    if (approver.rows[0]) {
      approverName = approver.rows[0].name
      approverRegistration = approver.rows[0].registration
    }
  }

  const result = await query<UserRow>(
    `UPDATE users
     SET approval_status = 'approved',
         approved_at = NOW(),
         approved_by_user_id = $7,
         third_party_company = $2,
         work_subtype = $3,
         access_areas = $4::jsonb,
         access_processes = $5::jsonb,
         vacation_required_since = CASE
           WHEN $6::boolean THEN NULL
           ELSE COALESCE(vacation_required_since, NOW())
         END
     WHERE id = $1 AND role = 'compras'
     RETURNING *`,
    [
      id,
      storedCompany,
      storedSubtype,
      JSON.stringify(storedAccessAreas),
      JSON.stringify(storedAccessProcesses),
      skipsVacationAgenda(storedSubtype),
      approverId,
    ],
  )

  const user = {
    ...(await mapUserWithVacation(result.rows[0], { includePassword: true })),
    approvedByUserId: approverId,
    approvedByName: approverName,
    approvedByRegistration: approverRegistration,
  }

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

export async function updateUser(req: Request, res: Response) {
  const id = String(req.params.id)
  const {
    name,
    registration,
    email,
    whatsapp,
    birthDate,
    cpf,
    jobTitle,
    workArea,
    employmentType,
    edpUnit,
    locality,
    thirdPartyCompany,
    workSubtype,
    accessAreas,
    accessProcesses,
    personalDescription,
    hobby,
    profilePhoto,
    password,
  } = req.body as Record<string, string | string[] | undefined>

  const previous = await query<UserRow>(`SELECT * FROM users WHERE id = $1`, [id])
  if (!previous.rows[0]) {
    res.status(404).json({ error: 'Usuário não encontrado.' })
    return
  }

  const target = previous.rows[0]
  const isTargetAdmin = target.role === 'admin'

  const normalizedName = typeof name === 'string' ? name.trim() : ''
  const normalizedRegistration =
    typeof registration === 'string' ? registration.trim().toUpperCase() : ''
  const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : ''
  const normalizedWhatsapp = typeof whatsapp === 'string' ? whatsapp.trim() : ''
  const normalizedBirthDate = typeof birthDate === 'string' ? birthDate.trim() : ''
  const normalizedCpf = typeof cpf === 'string' ? cpf.trim() : ''
  const normalizedJobTitle = typeof jobTitle === 'string' ? jobTitle.trim() : ''
  const normalizedWorkArea = typeof workArea === 'string' ? workArea.trim() : ''
  const normalizedEmploymentType =
    typeof employmentType === 'string' ? employmentType.trim() : ''
  const normalizedEdpUnit = typeof edpUnit === 'string' ? edpUnit.trim() : ''
  const normalizedLocality = typeof locality === 'string' ? locality.trim() : ''
  const normalizedCompany =
    typeof thirdPartyCompany === 'string' ? thirdPartyCompany.trim() : ''
  const normalizedSubtype = typeof workSubtype === 'string' ? workSubtype.trim() : ''
  const normalizedDescription =
    typeof personalDescription === 'string' ? personalDescription.trim() : ''
  const normalizedHobby = typeof hobby === 'string' ? hobby.trim() : ''
  const normalizedProfilePhoto =
    typeof profilePhoto === 'string' ? profilePhoto.trim() : ''
  const normalizedPassword = typeof password === 'string' ? password.trim() : ''
  const requestedAccessAreas = Array.isArray(accessAreas)
    ? accessAreas.map((area) => String(area).trim()).filter(Boolean)
    : []
  const requestedAccessProcesses = Array.isArray(accessProcesses)
    ? accessProcesses.map((item) => String(item).trim()).filter(Boolean)
    : []

  if (normalizedPassword && normalizedPassword.length < 4) {
    res.status(400).json({ error: 'A senha precisa ter pelo menos 4 caracteres.' })
    return
  }

  const nextPasswordHash = normalizedPassword
    ? await bcrypt.hash(normalizedPassword, 10)
    : null
  const nextPasswordPlain = normalizedPassword || null

  if (
    normalizedProfilePhoto &&
    (!normalizedProfilePhoto.startsWith('data:image/') ||
      normalizedProfilePhoto.length > 3_500_000)
  ) {
    res.status(400).json({
      error: 'Envie uma imagem de perfil válida com até cerca de 2 MB.',
    })
    return
  }

  // Admin: pode editar dados pessoais/login, mas mantém perfil e papel administrativos.
  if (isTargetAdmin) {
    if (!normalizedName || !normalizedRegistration || !normalizedEmail) {
      res.status(400).json({ error: 'Nome, matrícula e e-mail são obrigatórios.' })
      return
    }

    try {
      const result = await query<UserRow>(
        `UPDATE users SET
          name = $2,
          registration = $3,
          email = $4,
          whatsapp = $5,
          birth_date = $6,
          cpf = $7,
          personal_description = $8,
          hobby = $9,
          profile_photo = CASE
            WHEN NULLIF($10, '') IS NULL THEN profile_photo
            ELSE $10
          END,
          password_hash = COALESCE($11, password_hash),
          password_plain = COALESCE($12, password_plain)
         WHERE id = $1 AND role = 'admin'
         RETURNING *`,
        [
          id,
          normalizedName,
          normalizedRegistration,
          normalizedEmail,
          normalizedWhatsapp,
          normalizedBirthDate,
          normalizedCpf,
          normalizedDescription,
          normalizedHobby,
          normalizedProfilePhoto,
          nextPasswordHash,
          nextPasswordPlain,
        ],
      )

      const user = await mapUserWithVacation(result.rows[0], { includePassword: true })
      await writeAuditLog(req, {
        action: 'update',
        entityType: 'user',
        entityId: user.id,
        summary: `Administrador atualizado: ${user.registration}`,
        oldData: {
          ...mapUser(target),
          profilePhoto: target.profile_photo ? '[imagem anexada]' : '',
        },
        newData: {
          ...user,
          profilePhoto: user.profilePhoto ? '[imagem anexada]' : '',
        },
      })
      res.json({ user })
    } catch (error) {
      const pgError = error as { code?: string }
      if (pgError.code === '23505') {
        res.status(409).json({ error: 'Já existe um cadastro com esta matrícula ou e-mail.' })
        return
      }
      throw error
    }
    return
  }

  if (
    !normalizedName ||
    !normalizedRegistration ||
    !normalizedEmail ||
    !normalizedJobTitle ||
    !normalizedWorkArea ||
    !normalizedEmploymentType ||
    !normalizedEdpUnit ||
    !normalizedLocality ||
    !normalizedCpf ||
    !normalizedWhatsapp ||
    !normalizedBirthDate
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
    : ['Técnico', 'Analista', 'Engenheiro', 'Gestor', 'Estagiário', 'Assistente Administrativo']
  const allowedTipos = valuesByKey.tipo?.length ? valuesByKey.tipo : ['Própria', 'Terceira']
  const allowedLocalities = valuesByKey.localidade ?? []
  const allowedTerceiras = valuesByKey.terceira?.length
    ? valuesByKey.terceira
    : ['BMB', 'Cosampa', 'Engeserv', 'ROTARY', 'TIVIT']

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
  if (!['EDP SP', 'EDP ES', 'Transversal'].includes(normalizedEdpUnit)) {
    res.status(400).json({ error: 'Selecione EDP SP, EDP ES ou Transversal.' })
    return
  }
  if (
    allowedLocalities.length > 0
      ? !allowedLocalities.includes(normalizedLocality) &&
        normalizedLocality !== (target.locality?.trim() ?? '')
      : !normalizedLocality
  ) {
    res.status(400).json({ error: 'Selecione a localidade.' })
    return
  }

  let storedCompany = ''
  if (normalizedEmploymentType === 'Terceira') {
    if (
      !normalizedCompany ||
      (!allowedTerceiras.includes(normalizedCompany) &&
        normalizedCompany !== (target.third_party_company?.trim() ?? ''))
    ) {
      res.status(400).json({ error: 'Selecione a empresa terceira.' })
      return
    }
    storedCompany = normalizedCompany
  }

  const technicianScopesByArea: Record<string, string[]> = {
    Medição: [
      'Atividades administrativas da Medição',
      'Laboratório de Medição',
    ],
  }
  const csdScopes = await listCatalogValues('escopo_csd')
  const legacyCsdScopes = ['Lavratura de TOI', 'Lavratura de TOI - Ponto Focal']
  const allowedEngineerHomeSubareas = [
    'Medição',
    'Laboratório de Medição',
    'Laboratório de Homologação',
    'Equipe de campo',
    'Usuários',
    'Cadastros',
    'Telemedição',
  ]

  let storedSubtype = ''
  let storedAccessAreas: string[] = []
  let storedAccessProcesses: string[] = []

  if (isConsumoIrregularWorkArea(normalizedWorkArea)) {
    storedSubtype = ''
    storedAccessAreas = ['Laboratório de Medição']
    storedAccessProcesses = consumoIrregularAccessProcesses()
  } else if (
    normalizedJobTitle === 'Engenheiro' &&
    isCsdEngineerLavraturaScope(normalizedSubtype)
  ) {
    storedSubtype = normalizedSubtype
    storedAccessAreas = accessAreasForTechnician(
      normalizedWorkArea,
      normalizedSubtype,
    )
  } else if (normalizedJobTitle === 'Engenheiro') {
    if (!isAllowedEngineerSubtype(normalizedSubtype)) {
      res.status(400).json({ error: 'Selecione a abrangência do engenheiro.' })
      return
    }
    storedSubtype = normalizeEngineerSubtype(normalizedSubtype)
    if (isEngineerAreaSubtype(storedSubtype)) {
      storedAccessAreas = []
      storedAccessProcesses = []
    }
    if (isEngineerSubcellSubtype(storedSubtype)) {
      const invalid = requestedAccessAreas.filter(
        (area) => !allowedEngineerHomeSubareas.includes(area),
      )
      if (requestedAccessAreas.length === 0 || invalid.length > 0) {
        res.status(400).json({
          error: 'Selecione ao menos uma subárea da home para o engenheiro.',
        })
        return
      }
      const conflicts = await findSubcellResponsibilityConflicts(
        requestedAccessAreas,
        id,
      )
      if (conflicts.length > 0) {
        res.status(409).json({ error: formatSubcellConflictError(conflicts) })
        return
      }
      const cellOwnerConflict = await findOrgCellOwnerSubareaConflict(
        id,
        requestedAccessAreas,
      )
      if (cellOwnerConflict) {
        res.status(409).json({ error: cellOwnerConflict })
        return
      }
      storedAccessAreas = requestedAccessAreas
    }
    if (isEngineerProcessSubtype(storedSubtype)) {
      const invalid = requestedAccessProcesses.filter(
        (item) => !isValidHomeSubareaProcess(item),
      )
      if (requestedAccessProcesses.length === 0 || invalid.length > 0) {
        res.status(400).json({
          error:
            'Selecione ao menos um processo específico dentro das subáreas da home.',
        })
        return
      }
      storedAccessProcesses = requestedAccessProcesses
      storedAccessAreas = portalAreasFromProcesses(normalizedWorkArea, storedAccessProcesses)
    }
  } else if (
    normalizedWorkArea === 'CSD' ||
    normalizedJobTitle === 'Técnico' ||
    (normalizedJobTitle === 'Analista' && normalizedWorkArea === 'Medição')
  ) {
    const allowedScopes =
      normalizedWorkArea === 'CSD'
        ? [...csdScopes, ...legacyCsdScopes]
        : normalizedJobTitle === 'Analista' && normalizedWorkArea === 'Medição'
          ? ['Atividades administrativas da Medição']
          : (technicianScopesByArea[normalizedWorkArea] ?? [])
    if (allowedScopes.length > 0) {
      if (!allowedScopes.includes(normalizedSubtype)) {
        res.status(400).json({ error: 'Selecione o escopo.' })
        return
      }
      storedSubtype = normalizedSubtype
      storedAccessAreas = accessAreasForTechnician(
        normalizedWorkArea,
        normalizedSubtype,
      )
    }
  } else if (
    normalizedJobTitle === 'Estagiário' &&
    normalizedWorkArea === 'Medição'
  ) {
    storedSubtype = ''
    storedAccessAreas = []
    const invalid = requestedAccessProcesses.filter(
      (item) => !isValidHomeSubareaProcess(item),
    )
    if (invalid.length > 0) {
      res.status(400).json({
        error: 'Há processo inválido na atribuição do estagiário.',
      })
      return
    }
    storedAccessProcesses = requestedAccessProcesses
  }

  try {
    const result = await query<UserRow>(
      `UPDATE users SET
        name = $2,
        registration = $3,
        email = $4,
        whatsapp = $5,
        birth_date = $6,
        cpf = $7,
        job_title = $8,
        work_area = $9,
        employment_type = $10,
        edp_unit = $11,
        locality = $12,
        third_party_company = $13,
        work_subtype = $14,
        access_areas = $15::jsonb,
        access_processes = $16::jsonb,
        personal_description = $17,
        hobby = $18,
        profile_photo = CASE
          WHEN NULLIF($19, '') IS NULL THEN profile_photo
          ELSE $19
        END,
        password_hash = COALESCE($20, password_hash),
        password_plain = COALESCE($21, password_plain)
       WHERE id = $1
       RETURNING *`,
      [
        id,
        normalizedName,
        normalizedRegistration,
        normalizedEmail,
        normalizedWhatsapp,
        normalizedBirthDate,
        normalizedCpf,
        normalizedJobTitle,
        normalizedWorkArea,
        normalizedEmploymentType,
        normalizedEdpUnit,
        normalizedLocality,
        storedCompany,
        storedSubtype,
        JSON.stringify(storedAccessAreas),
        JSON.stringify(storedAccessProcesses),
        normalizedDescription,
        normalizedHobby,
        normalizedProfilePhoto,
        nextPasswordHash,
        nextPasswordPlain,
      ],
    )

    const user = await mapUserWithVacation(result.rows[0], { includePassword: true })
    await writeAuditLog(req, {
      action: 'update',
      entityType: 'user',
      entityId: user.id,
      summary: `Usuário atualizado: ${user.registration}`,
      oldData: {
        ...mapUser(previous.rows[0]),
        profilePhoto: previous.rows[0].profile_photo ? '[imagem anexada]' : '',
      },
      newData: {
        ...user,
        profilePhoto: user.profilePhoto ? '[imagem anexada]' : '',
      },
    })

    res.json({ user })
  } catch (error) {
    const pgError = error as { code?: string }
    if (pgError.code === '23505') {
      res.status(409).json({ error: 'Já existe um cadastro com esta matrícula ou e-mail.' })
      return
    }
    throw error
  }
}

export async function rejectUser(req: Request, res: Response) {
  try {
    const { id } = req.params
    const reason =
      typeof req.body?.reason === 'string' ? req.body.reason.trim() : ''

    if (!reason || reason.length < 5) {
      res.status(400).json({
        error: 'Informe a justificativa da reprovação (mínimo de 5 caracteres).',
      })
      return
    }

    if (reason.length > 2000) {
      res.status(400).json({
        error: 'A justificativa deve ter no máximo 2000 caracteres.',
      })
      return
    }

    const previous = await query<UserRow>(
      `SELECT * FROM users
       WHERE id = $1
         AND role = 'compras'
         AND approval_status = 'pending'`,
      [id],
    )

    if (!previous.rows[0]) {
      res.status(404).json({ error: 'Cadastro pendente não encontrado.' })
      return
    }

    const pending = mapUser(previous.rows[0])

    const result = await query<UserRow>(
      `UPDATE users
       SET approval_status = 'rejected',
           rejected_at = NOW(),
           rejection_reason = $2
       WHERE id = $1
         AND role = 'compras'
         AND approval_status = 'pending'
       RETURNING *`,
      [id, reason],
    )

    if (!result.rows[0]) {
      res.status(404).json({ error: 'Cadastro pendente não encontrado.' })
      return
    }

    let emailSent = false
    let emailError: string | undefined
    if (pending.email?.trim()) {
      try {
        emailSent = await sendRegistrationRejectedEmail({
          to: pending.email,
          name: pending.name,
          reason,
        })
      } catch (error) {
        emailError =
          error instanceof Error ? error.message : 'Falha ao enviar e-mail de reprovação.'
        console.error('Falha ao enviar e-mail de reprovação:', error)
      }
    }

    await writeAuditLog(req, {
      action: 'reject',
      entityType: 'user',
      entityId: pending.id,
      summary: `Cadastro reprovado: ${pending.registration}`,
      oldData: {
        ...pending,
        profilePhoto: pending.profilePhoto ? '[imagem anexada]' : '',
      },
      newData: {
        reason,
        emailSent,
        emailError,
        emailedTo: pending.email,
        approvalStatus: 'rejected',
      },
    })

    await query(`UPDATE audit_logs SET user_id = NULL WHERE user_id = $1`, [id])

    let warning: string | undefined
    if (emailSent) {
      warning = undefined
    } else if (emailError) {
      warning = `Cadastro reprovado, mas o e-mail não foi enviado: ${emailError}`
    } else if (isMailConfigured()) {
      warning = 'Cadastro reprovado, mas não foi possível enviar o e-mail de notificação.'
    } else {
      warning = 'Cadastro reprovado, mas o envio de e-mail não está configurado no servidor.'
    }

    res.json({
      ok: true,
      id,
      emailSent,
      warning,
    })
  } catch (error) {
    const pgError = error as { code?: string; message?: string }
    console.error('Falha ao reprovar cadastro:', error)
    if (pgError.code === '23514') {
      res.status(500).json({
        error:
          'O banco ainda não aceita o status de reprovação. Aguarde a atualização do servidor ou contate o suporte.',
      })
      return
    }
    res.status(500).json({ error: 'Não foi possível reprovar o cadastro.' })
  }
}

export async function resetUserToPending(req: Request, res: Response) {
  const id = String(req.params.id)

  const previous = await query<UserRow>(`SELECT * FROM users WHERE id = $1`, [id])
  if (!previous.rows[0]) {
    res.status(404).json({ error: 'Usuário não encontrado.' })
    return
  }

  const current = previous.rows[0]
  if (current.role === 'admin') {
    res.status(403).json({ error: 'O administrador não pode voltar para pendente.' })
    return
  }

  if (current.approval_status !== 'approved') {
    res.status(400).json({ error: 'Somente usuários aprovados podem voltar para pendente.' })
    return
  }

  const result = await query<UserRow>(
    `UPDATE users
     SET approval_status = 'pending',
         approved_at = NULL,
         approved_by_user_id = NULL,
         work_subtype = '',
         access_areas = '[]'::jsonb,
         access_processes = '[]'::jsonb,
         third_party_company = '',
         vacation_required_since = NULL
     WHERE id = $1
       AND role <> 'admin'
     RETURNING *`,
    [id],
  )

  if (!result.rows[0]) {
    res.status(404).json({ error: 'Usuário não encontrado.' })
    return
  }

  const user = await mapUserWithVacation(result.rows[0], { includePassword: true })

  await writeAuditLog(req, {
    action: 'update',
    entityType: 'user',
    entityId: user.id,
    summary: `Usuário voltou para pendente: ${user.registration}`,
    oldData: mapUser(current),
    newData: user,
  })

  res.json({ user })
}

export async function deleteUser(req: Request, res: Response) {
  const { id } = req.params
  const rejectionReason = 'Excluído pelo administrador.'

  const previous = await query<UserRow>(`SELECT * FROM users WHERE id = $1`, [id])
  if (!previous.rows[0]) {
    res.status(404).json({ error: 'Usuário não encontrado.' })
    return
  }

  if (previous.rows[0].role === 'admin') {
    res.status(403).json({ error: 'O administrador não pode ser excluído.' })
    return
  }

  if (req.user?.id === id) {
    res.status(400).json({ error: 'Você não pode excluir o próprio usuário.' })
    return
  }

  const target = mapUser(previous.rows[0])

  const result = await query<UserRow>(
    `UPDATE users
     SET approval_status = 'rejected',
         rejected_at = NOW(),
         rejection_reason = $2,
         access_areas = '[]'::jsonb,
         access_processes = '[]'::jsonb
     WHERE id = $1 AND role <> 'admin'
     RETURNING *`,
    [id, rejectionReason],
  )

  if (!result.rows[0]) {
    res.status(403).json({ error: 'O administrador não pode ser excluído.' })
    return
  }

  await query(`UPDATE csds SET responsible_user_id = NULL WHERE responsible_user_id = $1`, [id])

  await writeAuditLog(req, {
    action: 'delete',
    entityType: 'user',
    entityId: target.id,
    summary: `Cadastro excluído (reprovado): ${target.registration}`,
    oldData: {
      ...target,
      profilePhoto: target.profilePhoto ? '[imagem anexada]' : '',
    },
    newData: {
      approvalStatus: 'rejected',
      rejectionReason,
    },
  })

  const user = await mapUserWithVacation(result.rows[0], { includePassword: true })
  res.json({ ok: true, id, user })
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
  updateUser: [requireAuth, requireAdmin, updateUser],
  rejectUser: [requireAuth, requireAdmin, rejectUser],
  resetUserToPending: [requireAuth, requireAdmin, resetUserToPending],
  deleteUser: [requireAuth, requireAdmin, deleteUser],
}
