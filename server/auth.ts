import type { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { query } from './db.js'

export type AuthUser = {
  id: string
  registration: string
  role: 'admin' | 'compras' | 'field'
}

const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-secret-change-in-production'
const COOKIE_NAME = 'eficiencia_session'

export function getCookieName() {
  return COOKIE_NAME
}

export function extractAuthToken(req: Request): string | null {
  const authHeader = req.headers.authorization
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7)
  }
  return req.cookies?.[COOKIE_NAME] ?? null
}

export function verifyAuthToken(token: string): AuthUser | null {
  try {
    return jwt.verify(token, JWT_SECRET) as AuthUser
  } catch {
    return null
  }
}

export function signSsoToken(userId: string) {
  return jwt.sign({ sub: userId, purpose: 'sso' }, JWT_SECRET, { expiresIn: '2m' })
}

export function verifySsoToken(token: string): string | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { sub?: string; purpose?: string }
    if (payload.purpose !== 'sso' || !payload.sub) return null
    return payload.sub
  } catch {
    return null
  }
}

export function signToken(user: AuthUser) {
  return jwt.sign(user, JWT_SECRET, { expiresIn: '7d' })
}

export function setAuthCookie(res: Response, token: string) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  })
}

export function clearAuthCookie(res: Response) {
  res.clearCookie(COOKIE_NAME)
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = extractAuthToken(req)

  if (!token) {
    res.status(401).json({ error: 'Não autenticado.' })
    return
  }

  const user = verifyAuthToken(token)
  if (!user) {
    res.status(401).json({ error: 'Sessão inválida ou expirada.' })
    return
  }

  req.user = user
  next()
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.user?.role !== 'admin') {
    res.status(403).json({ error: 'Acesso restrito ao administrador.' })
    return
  }
  next()
}

/** Gestor aprovado (cargo Gestor) ou administrador. */
export async function requireGestorOrAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (!req.user) {
    res.status(401).json({ error: 'Não autenticado.' })
    return
  }
  if (req.user.role === 'admin') {
    next()
    return
  }

  try {
    const result = await query<{ job_title: string; approval_status: string }>(
      `SELECT job_title, approval_status FROM users WHERE id = $1`,
      [req.user.id],
    )
    const user = result.rows[0]
    if (user?.approval_status === 'approved' && user.job_title === 'Gestor') {
      next()
      return
    }
  } catch {
    res.status(500).json({ error: 'Falha ao validar permissão.' })
    return
  }

  res.status(403).json({ error: 'Acesso restrito ao gestor ou administrador.' })
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser
    }
  }
}
