import type { NextFunction, Request, Response } from 'express'
import { query } from './db.js'
import { isMedicaoCellOwner } from './engineer-access.js'

/** Bloqueia mutações do Lab de Medição para engenheiro responsável por célula. */
export async function rejectLabMedicaoViewOnlyMutations(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const userId = req.user?.id
  if (!userId || req.user?.role === 'admin') {
    next()
    return
  }

  try {
    const result = await query<{
      job_title: string
      work_area: string
      work_subtype: string
    }>(`SELECT job_title, work_area, work_subtype FROM users WHERE id = $1`, [userId])

    const row = result.rows[0]
    if (
      row &&
      isMedicaoCellOwner({
        jobTitle: row.job_title,
        workArea: row.work_area,
        workSubtype: row.work_subtype,
      })
    ) {
      res.status(403).json({
        error:
          'Perfil responsável por célula: acesso somente de visualização no Laboratório de Medição.',
      })
      return
    }

    next()
  } catch (error) {
    next(error)
  }
}
