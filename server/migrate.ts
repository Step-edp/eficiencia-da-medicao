import { query } from './db.js'

export async function migrate() {
  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      registration TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      role TEXT NOT NULL CHECK (role IN ('admin', 'compras')),
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
  `)
}
