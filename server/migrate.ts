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
      responsible_user_id TEXT NOT NULL REFERENCES users(id),
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
  `)

  await query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS work_area TEXT NOT NULL DEFAULT '';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS work_subtype TEXT NOT NULL DEFAULT '';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS whatsapp TEXT NOT NULL DEFAULT '';
    ALTER TABLE ensaios_manual_blocks ADD COLUMN IF NOT EXISTS reason TEXT NOT NULL DEFAULT '';
    ALTER TABLE csds ADD COLUMN IF NOT EXISTS cities JSONB NOT NULL DEFAULT '[]'::jsonb;
    ALTER TABLE demm_documents ADD COLUMN IF NOT EXISTS extracted_meters JSONB NOT NULL DEFAULT '[]'::jsonb;
    ALTER TABLE demm_documents ADD COLUMN IF NOT EXISTS document_number TEXT;
    ALTER TABLE demm_documents ADD COLUMN IF NOT EXISTS emission_date TEXT;
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
}
