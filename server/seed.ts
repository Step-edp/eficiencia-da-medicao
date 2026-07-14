import bcrypt from 'bcryptjs'
import { query } from './db.js'
import { ensureMeterRegistryImported } from './import-meter-registry.js'
import { syncMeterRegistryTrailSteps } from './routes/meter-registry.js'
import { ensureCatalogOptionsSeeded } from './routes/catalog-options.js'

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
    workArea: '',
    workSubtype: '',
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
    workArea: '',
    workSubtype: '',
  },
  {
    id: 'field-inspection-1',
    registration: 'F700001',
    password: 'Campo@241',
    name: 'Ana Paula Inspeção',
    email: 'ana.inspecao@edp.com',
    role: 'field',
    approvalStatus: 'approved',
    jobTitle: 'Inspetora de Campo',
    workArea: 'Equipe de Campo',
    workSubtype: 'Inspeção',
  },
  {
    id: 'field-inspection-2',
    registration: 'F700002',
    password: 'Campo@241',
    name: 'Carlos Mendes Inspeção',
    email: 'carlos.inspecao@edp.com',
    role: 'field',
    approvalStatus: 'approved',
    jobTitle: 'Inspetor de Campo',
    workArea: 'Equipe de Campo',
    workSubtype: 'Inspeção',
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

const initialCsds = [
  {
    id: 'csd-001',
    name: 'CSD-001 - Região Norte',
    address: 'Av. Norte, 1200',
    cities: ['São José dos Campos', 'Jacareí', 'Caçapava', 'Monteiro Lobato'],
    responsibleUserId: 'field-inspection-1',
  },
  {
    id: 'csd-002',
    name: 'CSD-002 - Região Sul',
    address: 'Rua Sul, 450',
    cities: ['Taubaté', 'Tremembé', 'Pindamonhangaba', 'Potim'],
    responsibleUserId: 'field-inspection-2',
  },
  {
    id: 'csd-003',
    name: 'CSD-003 - Região Leste',
    address: 'Av. Leste, 890',
    cities: ['Guarulhos', 'Suzano', 'Poá', 'Ferraz de Vasconcelos', 'Itaquaquecetuba'],
    responsibleUserId: 'field-inspection-1',
  },
  {
    id: 'csd-004',
    name: 'CSD-004 - Região Oeste',
    address: 'Rua Oeste, 320',
    cities: ['Caraguatatuba', 'São Sebastião', 'Canas', 'Cruzeiro'],
    responsibleUserId: 'field-inspection-2',
  },
  {
    id: 'csd-005',
    name: 'CSD-005 - Região Centro',
    address: 'Av. Central, 1500',
    cities: ['Guaratinguetá', 'Lorena', 'Aparecida', 'Cachoeira Paulista', 'Roseira'],
    responsibleUserId: 'field-inspection-1',
  },
]

export async function seed() {
  for (const user of demoUsers) {
    const hash = await bcrypt.hash(user.password, 10)
    await query(
      `INSERT INTO users (
        id, name, registration, password_hash, email, role, approval_status,
        requested_at, approved_at, job_title, work_area, work_subtype
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      ON CONFLICT (id) DO UPDATE SET
        password_hash = EXCLUDED.password_hash,
        role = EXCLUDED.role,
        approval_status = EXCLUDED.approval_status,
        approved_at = EXCLUDED.approved_at,
        job_title = EXCLUDED.job_title,
        work_area = EXCLUDED.work_area,
        work_subtype = EXCLUDED.work_subtype`,
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
        user.workArea,
        user.workSubtype,
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

  const csdsCount = await query<{ count: string }>('SELECT COUNT(*)::text AS count FROM csds')
  if (Number(csdsCount.rows[0]?.count ?? 0) === 0) {
    for (const csd of initialCsds) {
      await query(
        `INSERT INTO csds (id, name, address, cities, responsible_user_id)
         VALUES ($1, $2, $3, $4::jsonb, $5)
         ON CONFLICT (id) DO NOTHING`,
        [csd.id, csd.name, csd.address, JSON.stringify(csd.cities), csd.responsibleUserId],
      )
    }
  }

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
