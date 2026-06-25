import type { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'

export type AuthUser = {
  id: string
  registration: string
  role: 'admin' | 'compras'
}

const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-secret-change-in-production'
const COOKIE_NAME = 'eficiencia_session'

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
  const token = req.cookies?.[COOKIE_NAME]

  if (!token) {
    res.status(401).json({ error: 'Não autenticado.' })
    return
  }

  try {
    req.user = jwt.verify(token, JWT_SECRET) as AuthUser
    next()
  } catch {
    res.status(401).json({ error: 'Sessão inválida ou expirada.' })
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.user?.role !== 'admin') {
    res.status(403).json({ error: 'Acesso restrito ao administrador.' })
    return
  }
  next()
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser
    }
  }
}
