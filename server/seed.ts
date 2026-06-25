import bcrypt from 'bcryptjs'
import { query } from './db.js'

const demoUsers = [
  {
    id: 'admin-demo-user',
    registration: 'E706032',
    password: 'Step@241',
    name: 'Usuário de Demonstração',
    email: 'e706032@edp.com',
    role: 'admin',
    approvalStatus: 'approved',
    jobTitle: 'Administrador do Portal',
  },
  {
    id: 'compras-demo-user',
    registration: 'C900001',
    password: 'Compras@241',
    name: 'Usuário de Compras (Demonstração)',
    email: 'compras.demo@edp.com',
    role: 'compras',
    approvalStatus: 'approved',
    jobTitle: 'Analista de Compras',
  },
]

const initialMaterials = [
  {
    material: '10002260',
    oldCode: '90002260',
    newCode: '17000001',
    description: 'MEDIDOR ENERG FRONT 280V-2,5A-4F-3E-0,2S',
    manufacturer: 'CENNATECH',
    prefix: '4077',
    equipmentType: 'Medidor',
  },
  {
    material: '10002260',
    oldCode: '90002261',
    newCode: '17000002',
    description: 'MEDIDOR ENERG FRONT 280V-2,5A-4F-3E-0,2S',
    manufacturer: 'CENNATECH',
    prefix: 'PREFIXO_4077',
    equipmentType: 'Medidor',
  },
  {
    material: '10010887',
    oldCode: '90010887',
    newCode: '17000003',
    description: 'MEDIDOR ELETR DE FAT E QLD DE ENERGIA',
    manufacturer: 'CENNATECH',
    prefix: '4177',
    equipmentType: 'Medidor',
  },
  {
    material: '10010887',
    oldCode: '90010888',
    newCode: '17000004',
    description: 'MEDIDOR ELETR DE FAT E QLD DE ENERGIA',
    manufacturer: 'CENNATECH',
    prefix: '4177',
    equipmentType: 'Medidor',
  },
  {
    material: '10010887',
    oldCode: '90010889',
    newCode: '17000005',
    description: 'MEDIDOR ELETR DE FAT E QLD DE ENERGIA',
    manufacturer: 'CENNATECH',
    prefix: '4177',
    equipmentType: 'Medidor',
  },
  {
    material: '10010887',
    oldCode: '90010890',
    newCode: '17000006',
    description: 'MEDIDOR ELETR DE FAT E QLD DE ENERGIA',
    manufacturer: 'CENNATECH',
    prefix: '4177',
    equipmentType: 'Medidor',
  },
]

const defaultManufacturers = ['Eletra', 'Nansen']

export async function seed() {
  for (const user of demoUsers) {
    const hash = await bcrypt.hash(user.password, 10)
    await query(
      `INSERT INTO users (
        id, name, registration, password_hash, email, role, approval_status,
        requested_at, approved_at, job_title
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      ON CONFLICT (id) DO UPDATE SET
        password_hash = EXCLUDED.password_hash,
        approval_status = EXCLUDED.approval_status,
        approved_at = EXCLUDED.approved_at`,
      [
        user.id,
        user.name,
        user.registration,
        hash,
        user.email,
        user.role,
        user.approvalStatus,
        '2026-04-08T00:00:00.000Z',
        '2026-04-08T00:00:00.000Z',
        user.jobTitle,
      ],
    )
  }

  const materialsCount = await query<{ count: string }>('SELECT COUNT(*)::text AS count FROM materials')
  if (Number(materialsCount.rows[0]?.count ?? 0) === 0) {
    for (const row of initialMaterials) {
      await query(
        `INSERT INTO materials (material, old_code, new_code, description, manufacturer, prefix, equipment_type)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [
          row.material,
          row.oldCode,
          row.newCode,
          row.description,
          row.manufacturer,
          row.prefix,
          row.equipmentType,
        ],
      )
    }
  }

  for (const name of defaultManufacturers) {
    await query(
      `INSERT INTO manufacturers (name) VALUES ($1) ON CONFLICT (name) DO NOTHING`,
      [name],
    )
  }
}
