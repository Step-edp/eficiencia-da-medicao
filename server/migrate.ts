import { query } from './db.js'

export async function migrate() {
  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      registration TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      role TEXT NOT NULL CHECK (role IN ('admin', 'compras', 'field')),
      approval_status TEXT NOT NULL CHECK (approval_status IN ('approved', 'pending')),
      requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      approved_at TIMESTAMPTZ,
      birth_date TEXT NOT NULL DEFAULT '',
      job_title TEXT NOT NULL DEFAULT '',
      cpf TEXT NOT NULL DEFAULT '',
      personal_description TEXT NOT NULL DEFAULT '',
      hobby TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS homologation_requests (
      id TEXT PRIMARY KEY,
      requester_user_id TEXT NOT NULL REFERENCES users(id),
      requester_name TEXT NOT NULL,
      requester_registration TEXT NOT NULL,
      requester_email TEXT NOT NULL,
      requester_area TEXT NOT NULL DEFAULT 'Compras',
      order_number TEXT NOT NULL,
      manufacturer TEXT NOT NULL,
      justification TEXT NOT NULL DEFAULT '',
      requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      status TEXT NOT NULL DEFAULT 'Recebido'
    );

    CREATE TABLE IF NOT EXISTS homologation_request_items (
      id SERIAL PRIMARY KEY,
      request_id TEXT NOT NULL REFERENCES homologation_requests(id) ON DELETE CASCADE,
      equipment_type TEXT NOT NULL,
      material_code TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      description TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS manufacturers (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE
    );

    CREATE TABLE IF NOT EXISTS password_records (
      id TEXT PRIMARY KEY,
      meter TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      manufacturer TEXT NOT NULL,
      material_type TEXT NOT NULL,
      order_number TEXT NOT NULL DEFAULT '',
      password_type TEXT NOT NULL,
      digits INTEGER NOT NULL,
      source TEXT NOT NULL DEFAULT 'generated',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS materials (
      id SERIAL PRIMARY KEY,
      material TEXT NOT NULL,
      old_code TEXT NOT NULL,
      new_code TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL,
      manufacturer TEXT NOT NULL DEFAULT '',
      prefix TEXT NOT NULL DEFAULT '',
      equipment_type TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ratm_laudos (
      id TEXT PRIMARY KEY,
      ratm_number INTEGER NOT NULL,
      meter TEXT NOT NULL,
      client TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      status TEXT NOT NULL DEFAULT 'Pendente'
        CHECK (status IN ('Pendente', 'Aprovado', 'Reprovado')),
      form_data JSONB NOT NULL,
      created_by_user_id TEXT REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS ensaios_manual_blocks (
      blocked_date DATE PRIMARY KEY,
      reason TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_by_user_id TEXT REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS csds (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      address TEXT NOT NULL,
      cities JSONB NOT NULL DEFAULT '[]'::jsonb,
      responsible_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id BIGSERIAL PRIMARY KEY,
      occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      user_id TEXT REFERENCES users(id),
      user_registration TEXT,
      user_role TEXT,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT,
      summary TEXT,
      ip_address TEXT,
      user_agent TEXT,
      old_data JSONB,
      new_data JSONB,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb
    );

    CREATE INDEX IF NOT EXISTS idx_audit_logs_occurred_at ON audit_logs (occurred_at DESC);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs (entity_type, entity_id);

    CREATE TABLE IF NOT EXISTS meter_schedules (
      id TEXT PRIMARY KEY,
      meter TEXT NOT NULL,
      installation TEXT NOT NULL,
      toi TEXT NOT NULL,
      note TEXT NOT NULL,
      csd TEXT NOT NULL,
      client_present TEXT NOT NULL CHECK (client_present IN ('sim', 'nao')),
      scheduling_notes TEXT NOT NULL DEFAULT '',
      scheduled_at TIMESTAMPTZ NOT NULL,
      trail_step TEXT NOT NULL DEFAULT 'Entrada de medidores',
      source TEXT NOT NULL DEFAULT 'field_team',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_by_user_id TEXT REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_meter_schedules_trail_step ON meter_schedules (trail_step);
    CREATE INDEX IF NOT EXISTS idx_meter_schedules_meter ON meter_schedules (meter);

    CREATE TABLE IF NOT EXISTS demm_documents (
      id TEXT PRIMARY KEY,
      meter_schedule_id TEXT REFERENCES meter_schedules(id) ON DELETE SET NULL,
      meter TEXT NOT NULL,
      file_name TEXT NOT NULL,
      file_data BYTEA NOT NULL,
      extracted_meters JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_by_user_id TEXT REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_demm_documents_meter ON demm_documents (meter);
    CREATE INDEX IF NOT EXISTS idx_demm_documents_schedule ON demm_documents (meter_schedule_id);

    CREATE TABLE IF NOT EXISTS meter_registry (
      id TEXT PRIMARY KEY,
      legacy_id INTEGER NOT NULL,
      meter TEXT NOT NULL UNIQUE,
      installation TEXT NOT NULL DEFAULT '',
      toi TEXT NOT NULL DEFAULT '',
      note TEXT NOT NULL DEFAULT '',
      csd TEXT NOT NULL DEFAULT '',
      client TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT '',
      trail_step TEXT NOT NULL DEFAULT 'Entrada de medidores',
      manufacturer TEXT NOT NULL DEFAULT '',
      model TEXT NOT NULL DEFAULT '',
      ratm_number TEXT,
      delivered_by TEXT,
      scheduling_notes TEXT NOT NULL DEFAULT '',
      available_at TIMESTAMPTZ,
      scheduled_at TIMESTAMPTZ,
      received_at TIMESTAMPTZ,
      imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_meter_registry_meter ON meter_registry (meter);
    CREATE INDEX IF NOT EXISTS idx_meter_registry_status ON meter_registry (status);
    CREATE INDEX IF NOT EXISTS idx_meter_registry_trail_step ON meter_registry (trail_step);

    CREATE TABLE IF NOT EXISTS catalog_options (
      id SERIAL PRIMARY KEY,
      catalog_key TEXT NOT NULL,
      value TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      UNIQUE (catalog_key, value)
    );

    CREATE INDEX IF NOT EXISTS idx_catalog_options_key ON catalog_options (catalog_key);

    CREATE TABLE IF NOT EXISTS process_assignments (
      process_key TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('executor1', 'executor2', 'executor3')),
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (process_key, role)
    );

    CREATE INDEX IF NOT EXISTS idx_process_assignments_user
      ON process_assignments (user_id);

    CREATE TABLE IF NOT EXISTS org_cells (
      id TEXT PRIMARY KEY,
      area_id TEXT NOT NULL DEFAULT 'Gestão Operacional',
      label TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      responsible_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_org_cells_area
      ON org_cells (area_id, sort_order, label);

    CREATE TABLE IF NOT EXISTS org_areas (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      responsible_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      substitute_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `)

  await query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS work_area TEXT NOT NULL DEFAULT '';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS work_subtype TEXT NOT NULL DEFAULT '';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS whatsapp TEXT NOT NULL DEFAULT '';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS employment_type TEXT NOT NULL DEFAULT '';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS third_party_company TEXT NOT NULL DEFAULT '';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS locality TEXT NOT NULL DEFAULT '';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS edp_unit TEXT NOT NULL DEFAULT '';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_photo TEXT NOT NULL DEFAULT '';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS access_areas JSONB NOT NULL DEFAULT '[]'::jsonb;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS access_processes JSONB NOT NULL DEFAULT '[]'::jsonb;
    ALTER TABLE password_records ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'generated';
    ALTER TABLE ensaios_manual_blocks ADD COLUMN IF NOT EXISTS reason TEXT NOT NULL DEFAULT '';
    ALTER TABLE csds ADD COLUMN IF NOT EXISTS cities JSONB NOT NULL DEFAULT '[]'::jsonb;
    ALTER TABLE csds ALTER COLUMN responsible_user_id DROP NOT NULL;
    ALTER TABLE demm_documents ADD COLUMN IF NOT EXISTS extracted_meters JSONB NOT NULL DEFAULT '[]'::jsonb;
    ALTER TABLE demm_documents ADD COLUMN IF NOT EXISTS document_number TEXT;
    ALTER TABLE demm_documents ADD COLUMN IF NOT EXISTS emission_date TEXT;
    ALTER TABLE org_cells ADD COLUMN IF NOT EXISTS substitute_user_id TEXT REFERENCES users(id) ON DELETE SET NULL;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS vacation_required_since TIMESTAMPTZ;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS approved_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL;

    CREATE TABLE IF NOT EXISTS user_vacation_periods (
      id SERIAL PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      start_date DATE NOT NULL,
      end_date DATE NOT NULL,
      absence_type TEXT NOT NULL DEFAULT 'ferias',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CHECK (end_date >= start_date)
    );

    CREATE INDEX IF NOT EXISTS idx_user_vacation_periods_user
      ON user_vacation_periods (user_id, start_date);
  `)

  await query(`
    ALTER TABLE user_vacation_periods
      ADD COLUMN IF NOT EXISTS absence_type TEXT NOT NULL DEFAULT 'ferias';
  `)
  await query(`
    ALTER TABLE user_vacation_periods
      ADD COLUMN IF NOT EXISTS absence_label TEXT NOT NULL DEFAULT '';
  `)
  await query(`
    ALTER TABLE user_vacation_periods
      ADD COLUMN IF NOT EXISTS absence_attachment TEXT NOT NULL DEFAULT '';
  `)
  await query(`
    ALTER TABLE user_vacation_periods
      ADD COLUMN IF NOT EXISTS absence_attachment_name TEXT NOT NULL DEFAULT '';
  `)
  await query(`
    ALTER TABLE user_vacation_periods
      ADD COLUMN IF NOT EXISTS substitute_user_id TEXT REFERENCES users(id) ON DELETE SET NULL;
  `)

  // Renomeia área Gestão → Gestão Operacional (dados já existentes).
  await query(`
    UPDATE org_cells
    SET area_id = 'Gestão Operacional'
    WHERE area_id = 'Gestão';

    INSERT INTO org_areas (id, label, description, responsible_user_id, substitute_user_id, created_at, updated_at)
    SELECT
      'Gestão Operacional',
      'Gestão Operacional',
      description,
      responsible_user_id,
      substitute_user_id,
      created_at,
      updated_at
    FROM org_areas
    WHERE id = 'Gestão'
    ON CONFLICT (id) DO UPDATE SET
      label = EXCLUDED.label,
      responsible_user_id = COALESCE(org_areas.responsible_user_id, EXCLUDED.responsible_user_id),
      substitute_user_id = COALESCE(org_areas.substitute_user_id, EXCLUDED.substitute_user_id);

    DELETE FROM org_areas WHERE id = 'Gestão';

    UPDATE users
    SET access_areas = (
      SELECT COALESCE(
        jsonb_agg(
          CASE
            WHEN value = 'Gestão' THEN to_jsonb('Gestão Operacional'::text)
            ELSE to_jsonb(value)
          END
        ),
        '[]'::jsonb
      )
      FROM jsonb_array_elements_text(access_areas) AS value
    )
    WHERE access_areas @> '["Gestão"]'::jsonb;
  `)

  // Integração com Agendamento Lab Med: perfil field + compartilhamento do mesmo Postgres
  await query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'users_role_check' AND conrelid = 'users'::regclass
      ) THEN
        ALTER TABLE users DROP CONSTRAINT users_role_check;
      END IF;
      ALTER TABLE users
        ADD CONSTRAINT users_role_check
        CHECK (role IN ('admin', 'compras', 'field'));
    END $$;
  `)

  // Abrangência do engenheiro: novos rótulos no cadastro.
  await query(`
    UPDATE users SET work_subtype = 'Responsável por célula'
    WHERE work_subtype IN ('Área', 'Responsável de área', 'Responsável de célula');
    UPDATE users SET work_subtype = 'Responsável por sub-célula'
    WHERE work_subtype = 'Sub-área';
  `)

  // Senha em texto somente para visualização do administrador.
  await query(`
    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS password_plain TEXT NOT NULL DEFAULT '';
  `)

  // Equipe que lavrou o TOI (agendamento Backoffice).
  await query(`
    ALTER TABLE meter_schedules
      ADD COLUMN IF NOT EXISTS toi_collaborator1_name TEXT NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS toi_collaborator1_registration TEXT NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS toi_collaborator2_name TEXT NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS toi_collaborator2_registration TEXT NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS toi_team_reason TEXT NOT NULL DEFAULT '';
  `)

  // Renomeia escopo CSD: Lavratura de TOI → Lavratura de TOI - Equipe de Campo.
  await query(`
    UPDATE users
    SET work_subtype = 'Lavratura de TOI - Equipe de Campo'
    WHERE work_subtype = 'Lavratura de TOI';

    UPDATE catalog_options
    SET value = 'Lavratura de TOI - Equipe de Campo'
    WHERE catalog_key = 'escopo_csd'
      AND value = 'Lavratura de TOI';
  `)

  // Equipe de Campo e Backoffice não usam Agenda de férias.
  await query(`
    UPDATE users
    SET vacation_required_since = NULL
    WHERE work_subtype IN (
      'Lavratura de TOI - Equipe de Campo',
      'Lavratura de TOI - Backoffice',
      'Lavratura de TOI'
    );
  `)

  // Parceiro do agendamento da equipe de campo.
  await query(`
    ALTER TABLE meter_schedules
      ADD COLUMN IF NOT EXISTS partner_user_id TEXT,
      ADD COLUMN IF NOT EXISTS partner_name TEXT NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS partner_registration TEXT NOT NULL DEFAULT '';
  `)

  // Foto do número do invólucro no agendamento de campo.
  await query(`
    ALTER TABLE meter_schedules
      ADD COLUMN IF NOT EXISTS envelope_photo TEXT NOT NULL DEFAULT '';
  `)

  // Rafael Nunes: Engenheiro Responsável por célula Medição.
  await query(`
    UPDATE users
    SET access_areas = COALESCE((
      SELECT jsonb_agg(to_jsonb(value))
      FROM jsonb_array_elements_text(access_areas) AS value
      WHERE value <> 'Medição'
    ), '[]'::jsonb)
    WHERE role <> 'admin'
      AND job_title = 'Engenheiro'
      AND work_subtype IN ('Responsável por sub-célula', 'Sub-área')
      AND access_areas @> '["Medição"]'::jsonb
      AND name NOT ILIKE '%Rafael%'
      AND registration <> '11111'
  `)

  // CSD Ponto Focal: remove Laboratório de Medição da home (fica só Equipe de campo).
  await query(`
    UPDATE users
    SET access_areas = COALESCE((
      SELECT jsonb_agg(to_jsonb(value))
      FROM jsonb_array_elements_text(access_areas) AS value
      WHERE value <> 'Laboratório de Medição'
    ), '[]'::jsonb)
    WHERE work_area = 'CSD'
      AND work_subtype = 'Lavratura de TOI - Ponto Focal'
      AND access_areas @> '["Laboratório de Medição"]'::jsonb
  `)

  await query(`
    UPDATE users
    SET approval_status = 'approved',
        approved_at = COALESCE(approved_at, NOW()),
        role = CASE WHEN role = 'admin' THEN role ELSE 'compras' END,
        job_title = 'Engenheiro',
        work_area = 'Medição',
        work_subtype = 'Responsável por célula',
        access_areas = '[]'::jsonb,
        access_processes = '[]'::jsonb
    WHERE role <> 'admin'
      AND (name ILIKE '%Rafael Nunes%' OR registration = '11111')
  `)

  await query(`
    UPDATE org_cells
    SET responsible_user_id = u.id,
        updated_at = NOW()
    FROM users u
    WHERE org_cells.id = 'Medição'
      AND u.role <> 'admin'
      AND (u.name ILIKE '%Rafael Nunes%' OR u.registration = '11111')
  `)

  // Analista Medição: escopo padrão Atividades administrativas da Medição.
  await query(`
    UPDATE users
    SET work_subtype = 'Atividades administrativas da Medição',
        access_areas = '["Medição"]'::jsonb
    WHERE role <> 'admin'
      AND work_area = 'Medição'
      AND job_title = 'Analista'
      AND (work_subtype IS NULL OR TRIM(work_subtype) = '')
  `)

  // Estagiário Medição: só Agenda + Suporte (sem card Medição); processos ficam em access_processes.
  await query(`
    UPDATE users
    SET access_areas = '[]'::jsonb,
        work_subtype = ''
    WHERE role <> 'admin'
      AND work_area = 'Medição'
      AND job_title = 'Estagiário'
  `)

  // Processos: só Executor 1/2/3 (migra legado responsável/executor).
  await query(`
    ALTER TABLE process_assignments
      DROP CONSTRAINT IF EXISTS process_assignments_role_check
  `)
  await query(`
    UPDATE process_assignments
    SET role = 'executor1'
    WHERE role = 'executor'
  `)
  await query(`
    DELETE FROM process_assignments
    WHERE role NOT IN ('executor1', 'executor2', 'executor3')
  `)
  await query(`
    DO $$
    BEGIN
      ALTER TABLE process_assignments
        ADD CONSTRAINT process_assignments_role_check
        CHECK (role IN ('executor1', 'executor2', 'executor3'));
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;
  `)

  // Chamados de suporte do portal.
  await query(`CREATE SEQUENCE IF NOT EXISTS support_ticket_seq START 1`)
  await query(`
    CREATE TABLE IF NOT EXISTS support_tickets (
      id TEXT PRIMARY KEY,
      ticket_number TEXT NOT NULL UNIQUE,
      requester_user_id TEXT NOT NULL REFERENCES users(id),
      requester_name TEXT NOT NULL,
      requester_registration TEXT NOT NULL,
      subject TEXT NOT NULL DEFAULT '',
      message TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'aberto'
        CHECK (status IN ('aberto', 'respondido', 'fechado')),
      response TEXT NOT NULL DEFAULT '',
      responded_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      responded_by_name TEXT NOT NULL DEFAULT '',
      responded_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
  await query(`
    CREATE INDEX IF NOT EXISTS idx_support_tickets_created_at
      ON support_tickets (created_at DESC)
  `)
  await query(`
    CREATE TABLE IF NOT EXISTS meter_models (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      manufacturer TEXT NOT NULL DEFAULT '',
      meter_type TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
  await query(`
    CREATE INDEX IF NOT EXISTS idx_meter_models_created_at
      ON meter_models (created_at DESC)
  `)
  await query(`
    ALTER TABLE meter_models
      ADD COLUMN IF NOT EXISTS voltage TEXT NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS current_rating TEXT NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS wires_elements TEXT NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS accuracy_class TEXT NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS meter_constant TEXT NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'cadastrado'
  `)
  await query(`
    CREATE TABLE IF NOT EXISTS presentations (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      link TEXT NOT NULL DEFAULT '',
      attachment TEXT NOT NULL DEFAULT '',
      attachment_name TEXT NOT NULL DEFAULT '',
      created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
  await query(`
    CREATE INDEX IF NOT EXISTS idx_presentations_created_at
      ON presentations (created_at DESC)
  `)
  await query(`
    CREATE TABLE IF NOT EXISTS softwares (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      attachment TEXT NOT NULL DEFAULT '',
      attachment_name TEXT NOT NULL DEFAULT '',
      created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
  await query(`
    CREATE INDEX IF NOT EXISTS idx_softwares_created_at
      ON softwares (created_at DESC)
  `)
  await query(`
    CREATE TABLE IF NOT EXISTS consolidacao_carga_clientes (
      id SERIAL PRIMARY KEY,
      nome_cliente TEXT NOT NULL,
      instalacao TEXT NOT NULL,
      data_denuncia DATE NOT NULL,
      data_prevista_migracao DATE NOT NULL,
      nota TEXT NOT NULL,
      created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
  await query(`
    CREATE INDEX IF NOT EXISTS idx_consolidacao_carga_clientes_created_at
      ON consolidacao_carga_clientes (created_at DESC)
  `)
  await query(`
    CREATE TABLE IF NOT EXISTS iq09_exports (
      month_key TEXT PRIMARY KEY,
      columns_json JSONB NOT NULL DEFAULT '[]'::jsonb,
      rows_json JSONB NOT NULL DEFAULT '[]'::jsonb,
      source_file TEXT NOT NULL DEFAULT '',
      created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)

  await query(`
    CREATE TABLE IF NOT EXISTS memoria_massa_notas (
      id SERIAL PRIMARY KEY,
      nota TEXT NOT NULL,
      instalacao TEXT NOT NULL DEFAULT '',
      cliente TEXT NOT NULL DEFAULT '',
      observacao TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pendente'
        CHECK (status IN ('pendente', 'executada', 'conferida', 'baixada')),
      created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
  await query(`
    CREATE INDEX IF NOT EXISTS idx_memoria_massa_notas_status
      ON memoria_massa_notas (status)
  `)
  await query(`
    CREATE INDEX IF NOT EXISTS idx_memoria_massa_notas_nota
      ON memoria_massa_notas (nota)
  `)
  await query(`
    CREATE INDEX IF NOT EXISTS idx_memoria_massa_notas_created_at
      ON memoria_massa_notas (created_at DESC)
  `)

  // Consumo Irregular: Laboratório de Medição + Reagendar / Consultar Medidor / Consultar RATM.
  await query(`
    UPDATE users
    SET access_areas = '["Laboratório de Medição"]'::jsonb,
        access_processes = '["Laboratório de Medição::Reagendar","Laboratório de Medição::Consultar Medidor","Laboratório de Medição::Consultar RATM"]'::jsonb
    WHERE role <> 'admin'
      AND work_area = 'Consumo Irregular'
      AND approval_status = 'approved'
  `)

  // Senhas cadastradas via Adicionar passivo (id legado ou source).
  await query(`
    UPDATE password_records
    SET source = 'passivo'
    WHERE source <> 'passivo'
      AND id LIKE 'passivo-%'
  `)

  // CSD Leituras de faturamento: Medição (consulta de senha), sem Equipe de campo.
  await query(`
    UPDATE users
    SET access_areas = '["Medição"]'::jsonb
    WHERE role <> 'admin'
      AND work_area = 'CSD'
      AND REPLACE(TRIM(COALESCE(work_subtype, '')), '–', '-') = 'Leituras de faturamento'
  `)

  // Remove a base de medidores importada do Excel (contadores da trilha do lab).
  await query(`
    CREATE TABLE IF NOT EXISTS app_runtime_flags (
      key TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
  const clearRegistryFlag = await query<{ key: string }>(
    `SELECT key FROM app_runtime_flags WHERE key = 'clear_meter_registry_import_v1'`,
  )
  if (!clearRegistryFlag.rows.length) {
    await query(`DELETE FROM meter_registry`)
    await query(
      `INSERT INTO app_runtime_flags (key) VALUES ('clear_meter_registry_import_v1')`,
    )
  }
}
