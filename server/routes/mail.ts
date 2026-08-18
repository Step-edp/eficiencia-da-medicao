import type { Request, Response } from 'express'
import { requireAdmin, requireAuth } from '../auth.js'
import { getMailStatus, isMailConfigured, sendMail } from '../mail.js'

export async function mailStatus(_req: Request, res: Response) {
  res.json(getMailStatus())
}

export async function sendTestMail(req: Request, res: Response) {
  const to = typeof req.body?.to === 'string' ? req.body.to.trim() : ''

  if (!to) {
    res.status(400).json({ error: 'Informe o destinatário do teste (campo to).' })
    return
  }

  if (!isMailConfigured()) {
    res.status(503).json({ error: 'E-mail não configurado no servidor.' })
    return
  }

  try {
    const sent = await sendMail({
      to,
      subject: 'Teste — Eficiência da Medição',
      text: [
        'Este é um e-mail de teste do portal Eficiência da Medição.',
        '',
        'Se você recebeu esta mensagem, o envio por SMTP/Resend está funcionando.',
      ].join('\n'),
      html: `
        <p>Este é um e-mail de teste do portal <strong>Eficiência da Medição</strong>.</p>
        <p>Se você recebeu esta mensagem, o envio por SMTP/Resend está funcionando.</p>
      `,
    })

    if (!sent) {
      res.status(502).json({ error: 'Provedor configurado, mas o envio não foi concluído.' })
      return
    }

    res.json({ ok: true, to })
  } catch (error) {
    res.status(502).json({
      error: error instanceof Error ? error.message : 'Falha ao enviar e-mail de teste.',
    })
  }
}

export const mailRoutes = {
  status: [requireAuth, requireAdmin, mailStatus],
  test: [requireAuth, requireAdmin, sendTestMail],
}
