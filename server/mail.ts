import nodemailer from 'nodemailer'

export type SendMailInput = {
  to: string
  subject: string
  text: string
  html?: string
}

function getFromAddress() {
  return (
    process.env.EMAIL_FROM?.trim() ||
    process.env.SMTP_FROM?.trim() ||
    'Eficiência da Medição <noreply@edp.local>'
  )
}

async function sendWithResend(input: SendMailInput) {
  const apiKey = process.env.RESEND_API_KEY?.trim()
  if (!apiKey) return false

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: getFromAddress(),
      to: [input.to],
      subject: input.subject,
      text: input.text,
      html: input.html ?? undefined,
    }),
  })

  if (!response.ok) {
    const detail = await response.text()
    throw new Error(`Falha ao enviar e-mail (Resend): ${detail || response.status}`)
  }

  return true
}

async function sendWithSmtp(input: SendMailInput) {
  const host = process.env.SMTP_HOST?.trim()
  const user = process.env.SMTP_USER?.trim()
  const pass = process.env.SMTP_PASS?.trim()
  if (!host || !user || !pass) return false

  const port = Number(process.env.SMTP_PORT ?? 587)
  const secure =
    process.env.SMTP_SECURE === 'true' || port === 465

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    requireTLS: !secure,
    auth: { user, pass },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 20_000,
  })

  await transporter.sendMail({
    from: getFromAddress(),
    to: input.to,
    subject: input.subject,
    text: input.text,
    html: input.html,
  })

  return true
}

export function getMailProvider(): 'resend' | 'smtp' | null {
  if (process.env.RESEND_API_KEY?.trim()) return 'resend'
  if (
    process.env.SMTP_HOST?.trim() &&
    process.env.SMTP_USER?.trim() &&
    process.env.SMTP_PASS?.trim()
  ) {
    return 'smtp'
  }
  return null
}

export function getMailStatus() {
  const configured = isMailConfigured()
  return {
    configured,
    provider: getMailProvider(),
    from: configured ? getFromAddress() : null,
  }
}

/** Indica se há provedor de e-mail configurado. */
export function isMailConfigured() {
  return getMailProvider() !== null
}

/**
 * Envia e-mail via Resend (HTTPS) ou SMTP.
 * Retorna true se enviou; false se nenhum provedor estiver configurado.
 */
export async function sendMail(input: SendMailInput): Promise<boolean> {
  if (await sendWithResend(input)) return true
  if (await sendWithSmtp(input)) return true
  return false
}

export async function sendRegistrationRejectedEmail(params: {
  to: string
  name: string
  reason: string
}) {
  const subject = 'Cadastro reprovado — Eficiência da Medição'
  const text = [
    `Olá, ${params.name}.`,
    '',
    'Seu cadastro foi reprovado com a seguinte justificativa:',
    params.reason,
    '',
    'Você poderá realizar um novo cadastro corrigindo as informações indicadas.',
    '',
    'Atenciosamente,',
    'Portal Eficiência da Medição',
  ].join('\n')

  const html = `
    <p>Olá, ${escapeHtml(params.name)}.</p>
    <p><strong>Seu cadastro foi reprovado com a seguinte justificativa:</strong></p>
    <p>${escapeHtml(params.reason).replace(/\n/g, '<br />')}</p>
    <p>Você poderá realizar um novo cadastro corrigindo as informações indicadas.</p>
    <p>Atenciosamente,<br />Portal Eficiência da Medição</p>
  `

  return sendMail({ to: params.to, subject, text, html })
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
