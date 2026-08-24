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
import { meterModelRoutes, createMeterModel, updateMeterModel } from './routes/meter-models.js'
import { presentationRoutes, createPresentation } from './routes/presentations.js'
import { softwareRoutes, createSoftware } from './routes/softwares.js'
import {
  consolidacaoCargaRoutes,
  createConsolidacaoCargaCliente,
  createConsolidacaoCargaClientesBulk,
} from './routes/consolidacao-carga.js'
import { memoriaMassaNotasRoutes } from './routes/memoria-massa-notas.js'
import { getIq09Export, runIq09Script } from './routes/inventario-iq09.js'
import {
  ratmLaudoRoutes,
  createRatmLaudos,
  updateRatmLaudo,
  approveRatmLaudo,
} from './routes/ratm-laudos.js'
import {
  getSatisfactionSurvey,
  submitSatisfactionSurvey,
} from './routes/satisfaction-survey.js'
import {
  listManualBlocks,
  toggleManualBlock,
  listCalendarMeters,
} from './routes/ensaios-calendar.js'
import {
  createCsd,
  deleteCsd,
  listCsds,
  listInspectionUsers,
  updateCsd,
} from './routes/csds.js'
import { catalogOptionRoutes } from './routes/catalog-options.js'
import { processAssignmentRoutes } from './routes/process-assignments.js'
import { orgCellRoutes } from './routes/org-cells.js'
import { vacationRoutes } from './routes/vacation.js'
import { listAuditLogs } from './routes/audit-logs.js'
import { rejectLabMedicaoViewOnlyMutations } from './lab-view-only.js'
import { warmupInspectionOcr } from './inspection-pdf-ocr.js'
import {
  countMeterSchedules,
  createMeterSchedule,
  createPassiveMeterSchedule,
  createBulkMeterSchedulesImport,
  fixBulkMeterSchedulesCsd,
  fixBulkMeterSchedulesNote,
  fixBulkMeterSchedulesCollaborators,
  fixBulkMeterSchedulesDigits,
  fixBulkMeterSchedulesUsers,
  getPontoFocalDashboard,
  listFieldPartners,
  listToiCollaborators,
  listMeterScheduleHistory,
  listMeterSchedules,
  rescheduleMeterSchedule,
  saveDelayJustification,
  dismissDelayMeter,
} from './routes/meter-schedules.js'
import {
  createDemmDocument,
  deleteDemmDocument,
  downloadDemmDocument,
  getDemmDocumentAnalysis,
  getDemmMetersBase,
  listDemmDocuments,
  listCsdDemmPendencias,
  getCsdDemmHistorico,
  getEntradaCsdDashboard,
  listWeekMeters,
  receiveWeekMeter,
  receiveWeekMeterPassive,
} from './routes/demm-documents.js'
import {
  getMeterRegistryTrailCounts,
  getMeterRegistry,
} from './routes/meter-registry.js'
import {
  uploadInspectionDocument,
  downloadInspectionDocument,
  deleteInspectionDocument,
  listInspectionDocuments,
  uploadInspectionPhotos,
  deleteInspectionPhoto,
  getScheduleEntryComparisons,
  listInspectionPendencias,
  listWpaAnalysisMeters,
  updateInspectionWpa,
  updateInspectionObservations,
  adjustScheduleDateFromDocument,
  listScheduleDateAdjustments,
} from './routes/meter-inspection-documents.js'
import {
  createSupportTicket,
  listSupportTickets,
  replySupportTicket,
} from './routes/support.js'
import {
  createAnalisadorTensao,
  listAnalisadoresTensao,
  listAnalisadorModelos,
  registrarEnsaioAnalisadores,
  getAnalisadorEnsaioMedicoes,
  listEnsaiosRealizados,
  getEnsaioSessaoMedicoes,
} from './routes/analisadores-tensao.js'
import { requireAuth, optionalAuth, requireAdmin } from './auth.js'
import { mailRoutes } from './routes/mail.js'

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

  void warmupInspectionOcr()
    .then(() => console.info('OCR de documentos de inspeção pronto.'))
    .catch((error) => console.warn('OCR de inspeção indisponível na inicialização:', error))

  const app = express()

  const allowedOrigins = (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean)

  app.use((req, res, next) => {
    const origin = req.headers.origin
    if (origin && (allowedOrigins.length === 0 || allowedOrigins.includes(origin))) {
      res.setHeader('Access-Control-Allow-Origin', origin)
      res.setHeader('Access-Control-Allow-Credentials', 'true')
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,PUT,DELETE,OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    if (req.method === 'OPTIONS') {
      res.sendStatus(204)
      return
    }
    next()
  })

  app.use(express.json({ limit: '25mb' }))
  app.use(cookieParser())

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true })
  })

  app.get('/api/mail/status', ...wrap(mailRoutes.status))
  app.post('/api/mail/test', ...wrap(mailRoutes.test))

  app.post('/api/auth/login', wrap(authRoutes.login))
  app.post('/api/auth/register', wrap(authRoutes.register))
  app.get('/api/auth/me', ...wrap(authRoutes.me))
  app.post('/api/auth/logout', ...wrap(authRoutes.logout))
  app.post('/api/auth/embed-token', ...wrap(authRoutes.createEmbedToken))
  app.post('/api/auth/sso-exchange', wrap(authRoutes.exchangeSsoToken))
  app.get('/api/users', ...wrap(authRoutes.listUsers))
  app.post('/api/users/profile-photos', ...wrap(authRoutes.listUserProfilePhotos))
  app.patch('/api/users/:id/approve', ...wrap(authRoutes.approveUser))
  app.patch('/api/users/:id/reject', ...wrap(authRoutes.rejectUser))
  app.patch('/api/users/:id/pending', ...wrap(authRoutes.resetUserToPending))
  app.patch('/api/users/:id', ...wrap(authRoutes.updateUser))
  app.delete('/api/users/:id', ...wrap(authRoutes.deleteUser))

  app.get('/api/homologation-requests', ...wrap(homologationRoutes.list))
  app.post('/api/homologation-requests', ...wrap(homologationRoutes.create))

  app.get('/api/password-records', ...wrap(passwordRoutes.list))
  app.get('/api/manufacturers', ...wrap(passwordRoutes.manufacturers))
  app.post('/api/manufacturers', ...wrap(passwordRoutes.addManufacturer))
  app.post('/api/password-records/generate', ...wrap(passwordRoutes.generate))
  app.post('/api/password-records/passive', ...wrap(passwordRoutes.createPassive))

  app.get('/api/materials', ...wrap(materialRoutes.list))
  app.post('/api/materials', ...wrap(materialRoutes.create))
  app.patch('/api/materials/:id', ...wrap(materialRoutes.update))

  app.get('/api/meter-models', ...wrap(meterModelRoutes.list))
  app.get(
    '/api/meter-models/unregistered',
    ...wrap(meterModelRoutes.listUnregistered),
  )
  app.post(
    '/api/meter-models',
    requireAuth,
    rejectLabMedicaoViewOnlyMutations,
    createMeterModel,
  )
  app.patch(
    '/api/meter-models/:id',
    requireAuth,
    rejectLabMedicaoViewOnlyMutations,
    updateMeterModel,
  )
  app.post('/api/meter-models/passive', ...wrap(meterModelRoutes.createPassive))

  app.get('/api/presentations', ...wrap(presentationRoutes.list))
  app.post(
    '/api/presentations',
    requireAuth,
    rejectLabMedicaoViewOnlyMutations,
    createPresentation,
  )
  app.get('/api/presentations/:id/attachment', ...wrap(presentationRoutes.attachment))

  app.get('/api/softwares', ...wrap(softwareRoutes.list))
  app.post(
    '/api/softwares',
    requireAuth,
    rejectLabMedicaoViewOnlyMutations,
    createSoftware,
  )
  app.get('/api/softwares/:id/attachment', ...wrap(softwareRoutes.attachment))

  app.get('/api/consolidacao-carga/clientes', ...wrap(consolidacaoCargaRoutes.list))
  app.post(
    '/api/consolidacao-carga/clientes',
    requireAuth,
    rejectLabMedicaoViewOnlyMutations,
    createConsolidacaoCargaCliente,
  )
  app.post(
    '/api/consolidacao-carga/clientes/bulk',
    requireAuth,
    rejectLabMedicaoViewOnlyMutations,
    createConsolidacaoCargaClientesBulk,
  )

  app.get('/api/memoria-massa/notas', requireAuth, memoriaMassaNotasRoutes.list)
  app.post('/api/memoria-massa/notas/bulk', requireAuth, memoriaMassaNotasRoutes.createBulk)
  app.patch(
    '/api/memoria-massa/notas/:id/status',
    requireAuth,
    memoriaMassaNotasRoutes.updateStatus,
  )
  app.delete('/api/memoria-massa/notas/:id', requireAuth, memoriaMassaNotasRoutes.remove)

  app.get('/api/inventario/iq09/:monthKey', requireAuth, getIq09Export)
  app.post(
    '/api/inventario/iq09/run',
    requireAuth,
    rejectLabMedicaoViewOnlyMutations,
    runIq09Script,
  )

  app.get('/api/ratm-laudos', ...wrap(ratmLaudoRoutes.list))
  app.post(
    '/api/ratm-laudos',
    requireAuth,
    rejectLabMedicaoViewOnlyMutations,
    createRatmLaudos,
  )
  app.patch(
    '/api/ratm-laudos/:id',
    requireAuth,
    rejectLabMedicaoViewOnlyMutations,
    updateRatmLaudo,
  )
  app.patch(
    '/api/ratm-laudos/:id/approve',
    requireAuth,
    rejectLabMedicaoViewOnlyMutations,
    approveRatmLaudo,
  )
  app.get('/api/ratm-laudos/:id/pdf', ...wrap(ratmLaudoRoutes.pdf))

  app.get('/api/public/pesquisa/:laudoId', getSatisfactionSurvey)
  app.post('/api/public/pesquisa/:laudoId', submitSatisfactionSurvey)

  app.get('/api/ensaios-calendar/manual-blocks', requireAuth, listManualBlocks)
  app.get('/api/ensaios-calendar/meters', requireAuth, listCalendarMeters)
  app.post(
    '/api/ensaios-calendar/manual-blocks',
    requireAuth,
    rejectLabMedicaoViewOnlyMutations,
    toggleManualBlock,
  )

  app.get('/api/csds', requireAuth, listCsds)
  app.post('/api/csds', requireAuth, rejectLabMedicaoViewOnlyMutations, createCsd)
  app.patch('/api/csds/:id', requireAuth, rejectLabMedicaoViewOnlyMutations, updateCsd)
  app.delete('/api/csds/:id', requireAuth, rejectLabMedicaoViewOnlyMutations, deleteCsd)
  app.get('/api/field-team/inspection-users', requireAuth, listInspectionUsers)

  app.get('/api/catalog-options', ...catalogOptionRoutes.list)
  app.post('/api/catalog-options', ...catalogOptionRoutes.create)
  app.delete('/api/catalog-options/:id', ...catalogOptionRoutes.remove)

  app.get('/api/process-assignments', ...wrap(processAssignmentRoutes.list))
  app.get('/api/process-assignments/for-user', ...wrap(processAssignmentRoutes.listForUser))
  app.put('/api/process-assignments', ...wrap(processAssignmentRoutes.upsert))

  app.get('/api/org-cells', ...wrap(orgCellRoutes.list))
  app.post('/api/org-area', ...wrap(orgCellRoutes.createArea))
  app.patch('/api/org-area', ...wrap(orgCellRoutes.updateArea))
  app.patch('/api/org-area/:id', ...wrap(orgCellRoutes.updateArea))
  app.post('/api/org-cells', ...wrap(orgCellRoutes.create))
  app.patch('/api/org-cells/:id', ...wrap(orgCellRoutes.update))
  app.delete('/api/org-cells/:id', ...wrap(orgCellRoutes.remove))

  app.get('/api/agenda/vacations', ...wrap(vacationRoutes.getMine))
  app.get(
    '/api/agenda/substitute-candidates',
    ...wrap(vacationRoutes.listSubstituteCandidates),
  )
  app.put('/api/agenda/vacations', ...wrap(vacationRoutes.upsertMine))
  app.post('/api/agenda/absences', ...wrap(vacationRoutes.createAbsence))
  app.delete('/api/agenda/absences/:id', ...wrap(vacationRoutes.deleteAbsence))

  app.get('/api/audit-logs', requireAuth, listAuditLogs)

  app.get('/api/meter-schedules', requireAuth, listMeterSchedules)
  app.get('/api/meter-schedules/count', requireAuth, countMeterSchedules)
  app.get('/api/meter-schedules/partners', requireAuth, listFieldPartners)
  app.get('/api/meter-schedules/toi-collaborators', requireAuth, listToiCollaborators)
  app.get('/api/meter-schedules/history', requireAuth, listMeterScheduleHistory)
  app.get('/api/meter-schedules/ponto-focal-dashboard', requireAuth, getPontoFocalDashboard)
  app.post('/api/meter-schedules', requireAuth, createMeterSchedule)
  app.post(
    '/api/meter-schedules/bulk-import',
    requireAuth,
    requireAdmin,
    createBulkMeterSchedulesImport,
  )
  app.post(
    '/api/meter-schedules/bulk-fix-csd',
    requireAuth,
    requireAdmin,
    fixBulkMeterSchedulesCsd,
  )
  app.post(
    '/api/meter-schedules/bulk-fix-note',
    requireAuth,
    requireAdmin,
    fixBulkMeterSchedulesNote,
  )
  app.post(
    '/api/meter-schedules/bulk-fix-collaborators',
    requireAuth,
    requireAdmin,
    fixBulkMeterSchedulesCollaborators,
  )
  app.post(
    '/api/meter-schedules/bulk-fix-digits',
    requireAuth,
    requireAdmin,
    fixBulkMeterSchedulesDigits,
  )
  app.post(
    '/api/meter-schedules/bulk-fix-users',
    requireAuth,
    requireAdmin,
    fixBulkMeterSchedulesUsers,
  )
  app.post(
    '/api/meter-schedules/passivo',
    requireAuth,
    rejectLabMedicaoViewOnlyMutations,
    createPassiveMeterSchedule,
  )
  app.post(
    '/api/meter-schedules/:id/reschedule',
    requireAuth,
    rejectLabMedicaoViewOnlyMutations,
    rescheduleMeterSchedule,
  )
  app.put(
    '/api/meter-schedules/:id/delay-justification',
    requireAuth,
    rejectLabMedicaoViewOnlyMutations,
    saveDelayJustification,
  )
  app.put(
    '/api/meter-schedules/:id/delay-dismissal',
    requireAuth,
    rejectLabMedicaoViewOnlyMutations,
    dismissDelayMeter,
  )
  app.get('/api/meter-registry/trail-counts', requireAuth, getMeterRegistryTrailCounts)
  app.get('/api/meter-registry', requireAuth, getMeterRegistry)

  app.get('/api/meter-schedules/inspection-pendencias', requireAuth, listInspectionPendencias)
  app.get('/api/meter-schedules/wpa-analysis', requireAuth, listWpaAnalysisMeters)
  app.get('/api/meter-schedules/date-adjustments', requireAuth, listScheduleDateAdjustments)
  app.get(
    '/api/meter-schedules/:id/entry-comparisons',
    requireAuth,
    getScheduleEntryComparisons,
  )
  app.get(
    '/api/meter-schedules/:id/inspection-documents',
    requireAuth,
    listInspectionDocuments,
  )
  app.post(
    '/api/meter-schedules/:id/inspection-document',
    requireAuth,
    rejectLabMedicaoViewOnlyMutations,
    (req, res, next) => {
      req.setTimeout(300_000)
      res.setTimeout(300_000)
      next()
    },
    uploadInspectionDocument,
  )
  app.get(
    '/api/meter-schedules/:id/inspection-document/:docType',
    requireAuth,
    downloadInspectionDocument,
  )
  app.delete(
    '/api/meter-schedules/:id/inspection-document/:docType',
    requireAuth,
    rejectLabMedicaoViewOnlyMutations,
    deleteInspectionDocument,
  )
  app.post(
    '/api/meter-schedules/:id/inspection-photos',
    requireAuth,
    rejectLabMedicaoViewOnlyMutations,
    uploadInspectionPhotos,
  )
  app.delete(
    '/api/meter-schedules/:id/inspection-photos/:photoId',
    requireAuth,
    rejectLabMedicaoViewOnlyMutations,
    deleteInspectionPhoto,
  )
  app.patch(
    '/api/meter-schedules/:id/inspection-wpa',
    requireAuth,
    rejectLabMedicaoViewOnlyMutations,
    updateInspectionWpa,
  )
  app.patch(
    '/api/meter-schedules/:id/inspection-observations',
    requireAuth,
    rejectLabMedicaoViewOnlyMutations,
    updateInspectionObservations,
  )
  app.post(
    '/api/meter-schedules/:id/adjust-schedule-date',
    requireAuth,
    rejectLabMedicaoViewOnlyMutations,
    adjustScheduleDateFromDocument,
  )

  app.post('/api/demm-documents', requireAuth, rejectLabMedicaoViewOnlyMutations, createDemmDocument)
  app.get('/api/demm-documents', requireAuth, listDemmDocuments)
  app.get('/api/demm-documents/meters-base', requireAuth, getDemmMetersBase)
  app.delete(
    '/api/demm-documents/:id',
    requireAuth,
    rejectLabMedicaoViewOnlyMutations,
    deleteDemmDocument,
  )
  app.get('/api/demm-documents/:id/analysis', requireAuth, getDemmDocumentAnalysis)
  app.get('/api/demm-documents/:id/file', requireAuth, downloadDemmDocument)
  app.get('/api/csds/demm-pendencias', requireAuth, listCsdDemmPendencias)
  app.get('/api/csds/demm-historico', requireAuth, getCsdDemmHistorico)
  app.get('/api/csds/entrada-dashboard', requireAuth, getEntradaCsdDashboard)
  app.get('/api/demm-week-meters', requireAuth, listWeekMeters)
  app.post(
    '/api/demm-week-meters/receive',
    requireAuth,
    rejectLabMedicaoViewOnlyMutations,
    receiveWeekMeter,
  )
  app.post(
    '/api/demm-week-meters/receive-passive',
    requireAuth,
    rejectLabMedicaoViewOnlyMutations,
    receiveWeekMeterPassive,
  )

  app.get('/api/support-tickets', requireAuth, listSupportTickets)
  app.post('/api/support-tickets', optionalAuth, createSupportTicket)
  app.patch(
    '/api/support-tickets/:id/reply',
    requireAuth,
    rejectLabMedicaoViewOnlyMutations,
    replySupportTicket,
  )

  app.get('/api/analisadores-tensao/modelos', requireAuth, listAnalisadorModelos)
  app.get('/api/analisadores-tensao', requireAuth, listAnalisadoresTensao)
  app.post(
    '/api/analisadores-tensao',
    requireAuth,
    rejectLabMedicaoViewOnlyMutations,
    createAnalisadorTensao,
  )
  app.post(
    '/api/analisadores-tensao/ensaio',
    requireAuth,
    rejectLabMedicaoViewOnlyMutations,
    registrarEnsaioAnalisadores,
  )
  app.get('/api/analisadores-tensao/:id/medicoes', requireAuth, getAnalisadorEnsaioMedicoes)
  app.get('/api/analisadores-tensao/ensaios', requireAuth, listEnsaiosRealizados)
  app.get('/api/analisadores-tensao/ensaios/:ensaioId', requireAuth, getEnsaioSessaoMedicoes)

  const distPath = path.resolve(__dirname, '../../dist')
  app.use(
    express.static(distPath, {
      setHeaders(res, filePath) {
        if (filePath.endsWith('.html')) {
          res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
        }
      },
    }),
  )
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
    res.sendFile(path.join(distPath, 'index.html'))
  })

  app.use(
    (
      error: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      console.error('Erro não tratado na API:', error)
      if (res.headersSent) {
        return
      }
      res.status(500).json({ error: 'Erro interno do servidor.' })
    },
  )

  app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`)
  })
}

start().catch((error) => {
  console.error('Falha ao iniciar servidor:', error)
  process.exit(1)
})
