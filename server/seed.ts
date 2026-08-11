import bcrypt from 'bcryptjs'
import { query } from './db.js'
import { syncMeterRegistryTrailSteps } from './routes/meter-registry.js'
import { ensureCatalogOptionsSeeded } from './routes/catalog-options.js'
import { ensureOrgCellsSeeded } from './routes/org-cells.js'
import { seedAnalisadoresTensaoBulkImport } from './seed-analisadores-bulk.js'

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
  // Remove CSDs ligados aos usuários demo (seed + quaisquer criados depois).
  await query(`DELETE FROM csds WHERE id = ANY($1::text[]) OR responsible_user_id = ANY($2::text[])`, [
    DEMO_CSD_IDS,
    DEMO_USER_IDS,
  ])
  await query(`DELETE FROM materials WHERE old_code = ANY($1::text[])`, [DEMO_MATERIAL_OLD_CODES])
  await query(`DELETE FROM homologation_requests WHERE requester_user_id = ANY($1::text[])`, [DEMO_USER_IDS])

  await query(`UPDATE ratm_laudos SET created_by_user_id = NULL WHERE created_by_user_id = ANY($1::text[])`, [
    DEMO_USER_IDS,
  ])
  await query(
    `UPDATE ensaios_manual_blocks SET created_by_user_id = NULL WHERE created_by_user_id = ANY($1::text[])`,
    [DEMO_USER_IDS],
  )
  await query(`UPDATE meter_schedules SET created_by_user_id = NULL WHERE created_by_user_id = ANY($1::text[])`, [
    DEMO_USER_IDS,
  ])
  await query(`UPDATE demm_documents SET created_by_user_id = NULL WHERE created_by_user_id = ANY($1::text[])`, [
    DEMO_USER_IDS,
  ])
  await query(`UPDATE audit_logs SET user_id = NULL WHERE user_id = ANY($1::text[])`, [DEMO_USER_IDS])

  await query(`DELETE FROM users WHERE id = ANY($1::text[])`, [DEMO_USER_IDS])
}

export async function seed() {
  await removeDemoData()

  const hash = await bcrypt.hash(adminUser.password, 10)
  await query(
    `INSERT INTO users (
      id, name, registration, password_hash, password_plain, email, role, approval_status,
      requested_at, approved_at, job_title, work_area, work_subtype
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      registration = EXCLUDED.registration,
      password_hash = EXCLUDED.password_hash,
      password_plain = EXCLUDED.password_plain,
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
      adminUser.password,
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
  await ensureOrgCellsSeeded()

  try {
    // Base Excel não é mais importada automaticamente no seed.
    // Para popular: npx tsx server/import-meter-registry.ts
    const synced = await syncMeterRegistryTrailSteps()
    if (synced > 0) {
      console.log(`Trilha da base de medidores sincronizada: ${synced} registro(s).`)
    }
  } catch (error) {
    console.error('Falha ao sincronizar trilha da base de medidores:', error)
  }

  try {
    await seedAnalisadoresTensaoBulkImport()
  } catch (error) {
    console.error('Falha na importação em massa de analisadores de tensão:', error)
  }
}
