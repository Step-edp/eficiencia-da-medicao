import bcrypt from 'bcryptjs'
import { query } from './db.js'
import { ensureMeterRegistryImported } from './import-meter-registry.js'
import { syncMeterRegistryTrailSteps } from './routes/meter-registry.js'
import { ensureCatalogOptionsSeeded } from './routes/catalog-options.js'

const adminUser = {
  id: 'admin-demo-user',
  registration: 'adm@edp',
  password: 'edpsp2026',
  name: 'Administrador',
  email: 'adm@edp.com',
  role: 'admin',
  approvalStatus: 'approved',
  jobTitle: 'Administrador do Portal',
  workArea: '',
  workSubtype: '',
}

/** Usuários e CSDs de demonstração a remover em ambientes já populados. */
const DEMO_USER_IDS = ['compras-demo-user', 'field-inspection-1', 'field-inspection-2'] as const
const DEMO_CSD_IDS = ['csd-001', 'csd-002', 'csd-003', 'csd-004', 'csd-005'] as const
const DEMO_MATERIAL_OLD_CODES = [
  '90002260',
  '90002261',
  '90010887',
  '90010888',
  '90010889',
  '90010890',
] as const

async function removeDemoData() {
  await query(`DELETE FROM csds WHERE id = ANY($1::text[])`, [DEMO_CSD_IDS])
  await query(`DELETE FROM materials WHERE old_code = ANY($1::text[])`, [DEMO_MATERIAL_OLD_CODES])
  await query(`DELETE FROM users WHERE id = ANY($1::text[])`, [DEMO_USER_IDS])
}

export async function seed() {
  await removeDemoData()

  const hash = await bcrypt.hash(adminUser.password, 10)
  await query(
    `INSERT INTO users (
      id, name, registration, password_hash, email, role, approval_status,
      requested_at, approved_at, job_title, work_area, work_subtype
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      registration = EXCLUDED.registration,
      password_hash = EXCLUDED.password_hash,
      email = EXCLUDED.email,
      role = EXCLUDED.role,
      approval_status = EXCLUDED.approval_status,
      approved_at = EXCLUDED.approved_at,
      job_title = EXCLUDED.job_title,
      work_area = EXCLUDED.work_area,
      work_subtype = EXCLUDED.work_subtype`,
    [
      adminUser.id,
      adminUser.name,
      adminUser.registration,
      hash,
      adminUser.email,
      adminUser.role,
      adminUser.approvalStatus,
      '2026-04-08T00:00:00.000Z',
      '2026-04-08T00:00:00.000Z',
      adminUser.jobTitle,
      adminUser.workArea,
      adminUser.workSubtype,
    ],
  )

  await ensureCatalogOptionsSeeded()

  try {
    const imported = await ensureMeterRegistryImported()
    if (imported > 0) {
      console.log(`Base de medidores importada: ${imported} registro(s).`)
    }
    const synced = await syncMeterRegistryTrailSteps()
    if (synced > 0) {
      console.log(`Trilha da base de medidores sincronizada: ${synced} registro(s).`)
    }
  } catch (error) {
    console.error('Falha ao importar base de medidores:', error)
  }
}
