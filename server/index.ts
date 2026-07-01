import express from 'express'
import cookieParser from 'cookie-parser'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { migrate } from './migrate.js'
import { seed } from './seed.js'
import { authRoutes } from './routes/users.js'
import { homologationRoutes } from './routes/homologation.js'
import { passwordRoutes } from './routes/passwords.js'
import { materialRoutes } from './routes/materials.js'
import { ratmLaudoRoutes } from './routes/ratm-laudos.js'
import {
  getSatisfactionSurvey,
  submitSatisfactionSurvey,
} from './routes/satisfaction-survey.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = Number(process.env.PORT ?? 3000)

function wrap(
  handler: express.RequestHandler | express.RequestHandler[],
): express.RequestHandler[] {
  return Array.isArray(handler) ? handler : [handler]
}

async function start() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL não configurada.')
    process.exit(1)
  }

  await migrate()
  await seed()

  const app = express()
  app.use(express.json({ limit: '25mb' }))
  app.use(cookieParser())

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true })
  })

  app.post('/api/auth/login', wrap(authRoutes.login))
  app.post('/api/auth/register', wrap(authRoutes.register))
  app.get('/api/auth/me', ...wrap(authRoutes.me))
  app.post('/api/auth/logout', ...wrap(authRoutes.logout))
  app.get('/api/users', ...wrap(authRoutes.listUsers))
  app.patch('/api/users/:id/approve', ...wrap(authRoutes.approveUser))

  app.get('/api/homologation-requests', ...wrap(homologationRoutes.list))
  app.post('/api/homologation-requests', ...wrap(homologationRoutes.create))

  app.get('/api/password-records', ...wrap(passwordRoutes.list))
  app.get('/api/manufacturers', ...wrap(passwordRoutes.manufacturers))
  app.post('/api/manufacturers', ...wrap(passwordRoutes.addManufacturer))
  app.post('/api/password-records/generate', ...wrap(passwordRoutes.generate))

  app.get('/api/materials', ...wrap(materialRoutes.list))
  app.post('/api/materials', ...wrap(materialRoutes.create))

  app.get('/api/ratm-laudos', ...wrap(ratmLaudoRoutes.list))
  app.post('/api/ratm-laudos', ...wrap(ratmLaudoRoutes.create))
  app.patch('/api/ratm-laudos/:id', ...wrap(ratmLaudoRoutes.update))
  app.patch('/api/ratm-laudos/:id/approve', ...wrap(ratmLaudoRoutes.approve))
  app.get('/api/ratm-laudos/:id/pdf', ...wrap(ratmLaudoRoutes.pdf))

  app.get('/api/public/pesquisa/:laudoId', getSatisfactionSurvey)
  app.post('/api/public/pesquisa/:laudoId', submitSatisfactionSurvey)

  const distPath = path.resolve(__dirname, '../../dist')
  app.use(express.static(distPath))
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'))
  })

  app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`)
  })
}

start().catch((error) => {
  console.error('Falha ao iniciar servidor:', error)
  process.exit(1)
})
