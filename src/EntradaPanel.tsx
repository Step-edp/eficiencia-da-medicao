import { FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  api,
  ApiError,
  type AppUser,
  type CsdDemmHistoricoRecord,
  type CsdDemmPendenciaRecord,
  type DemmDocumentRecord,
  type DemmMeterAnalysisRecord,
  type DemmUploadConflictRecord,
  type MeterInspectionDocumentadoRecord,
  type MeterInspectionPendenciaRecord,
  type WeekMeterRecord,
  type WeekMeterStatus,
} from './api'
import { useCsdsOptions } from './useCsdsOptions'
import { readFileAsBase64 } from './fileUtils'
import { UserDetailModal } from './UserDetailModal'
import { EntradaCsdDashboard } from './EntradaCsdDashboard'
import { MeterDetailModal } from './MeterDetailModal'
import { InspectionDocumentAnalysisModal } from './InspectionDocumentAnalysisModal'
import { LoginFeedback } from './LoginFeedback'
import { ScheduleDateAdjustmentsPanel } from './ScheduleDateAdjustmentsPanel'
import {
  ToiCollaboratorFields,
  resolveToiCollaborators,
  useToiCollaboratorOptions,
  type ToiCollaboratorErrors,
} from './ToiCollaboratorFields'

const TERCEIRA_OPTIONS = ['BMB', 'Cosampa', 'Engeserv', 'ROTARY', 'TIVIT']

function ResponsibleUserCell({
  userId,
  name,
  registration,
  onOpenProfile,
}: {
  userId: string | null
  name: string | null
  registration: string | null
  onOpenProfile: (userId: string) => void
}) {
  const label = name ?? registration
  if (!userId || !label) return <>—</>

  return (
    <button
      type="button"
      className="schedule-meter-link"
      onClick={() => onOpenProfile(userId)}
      aria-label={`Ver perfil de ${label}`}
      title="Ver perfil"
    >
      {label}
    </button>
  )
}

function formatWorkSubtypeLabel(workSubtype: string | null) {
  if (!workSubtype) return '—'
  if (workSubtype.includes('Ponto Focal')) return 'Ponto Focal'
  if (workSubtype.includes('Backoffice')) return 'Backoffice'
  return workSubtype
}

function DemmStatusIcon({
  status,
}: {
  status: 'entregue' | 'pendente' | 'nao_entregue' | 'retroativo'
}) {
  if (status === 'pendente') {
    return (
      <span className="demm-status-icon is-pending" aria-label="Pendente" title="Pendente">
        —
      </span>
    )
  }

  const isOk = status === 'entregue'
  const isRetroactive = status === 'retroativo'
  return (
    <span
      className={`demm-status-icon ${isOk ? 'is-ok' : isRetroactive ? 'is-retroactive' : 'is-late'}`}
      aria-label={
        isOk ? 'Entregue' : isRetroactive ? 'Importada pelo Lab' : 'Não entregue'
      }
      title={
        isOk ? 'Entregue' : isRetroactive ? 'Importada pelo Lab' : 'Não entregue'
      }
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        {isOk || isRetroactive ? (
          <path
            d="M5 12.5l4.5 4.5L19 7.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : (
          <path
            d="M6 6l12 12M18 6L6 18"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
        )}
      </svg>
    </span>
  )
}

function formatDateTime(isoDate: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(isoDate))
}

function formatWeekLabel(dateKey: string) {
  const [, month, day] = dateKey.split('-')
  return `${day}/${month}`
}

function hasWpaDocument(item: MeterInspectionDocumentadoRecord) {
  return Boolean(item.hasToi || item.hasComunicado)
}

function wpaDocumentationLabel(item: MeterInspectionDocumentadoRecord) {
  if (item.anyBlocked) return item.blockReasons || 'Bloqueado'
  if (item.hasToi && item.hasComunicado) return 'TOI + CSM'
  if (item.hasToi) return 'TOI'
  if (item.hasComunicado) return 'CSM'
  return '—'
}

function weekMeterInspectionLabel(item: WeekMeterRecord) {
  if (item.status === 'bloqueado') return 'Bloqueado'
  if (item.status === 'liberado') return 'Liberado'
  if (item.status === 'nao_agendado') return 'Não agendado'
  if (item.hasToi && !item.hasComunicado) return 'Falta CSM'
  if (!item.hasToi && item.hasComunicado) return 'Falta TOI'
  return 'Sem documento de inspeção'
}

function MeterLink({
  meter,
  onOpen,
}: {
  meter: string
  onOpen: (meter: string) => void
}) {
  return (
    <button
      type="button"
      className="schedule-meter-link"
      onClick={() => onOpen(meter)}
      aria-label={`Ver cadastro e histórico do medidor ${meter}`}
      title="Ver cadastro e histórico"
    >
      {meter}
    </button>
  )
}

type DemmMetersTableProps = {
  meters: DemmMeterAnalysisRecord[]
  loading?: boolean
  showSources?: boolean
  onOpenMeter?: (meter: string) => void
}

function DemmMetersTable({
  meters,
  loading = false,
  showSources = false,
  onOpenMeter,
}: DemmMetersTableProps) {
  if (loading) {
    return <p className="entrada-panel-empty">Carregando...</p>
  }

  if (meters.length === 0) {
    return <p className="entrada-panel-empty">Nenhum medidor encontrado.</p>
  }

  return (
    <div className="entrada-table-wrap">
      <table className="data-table demm-analysis-table">
        <thead>
          <tr>
            <th>Medidor</th>
            <th>Status no aplicativo</th>
            <th>Data agendada</th>
            {showSources ? <th>DEMM</th> : null}
          </tr>
        </thead>
        <tbody>
          {meters.map((item) => (
            <tr key={`${item.meter}-${item.sourceFiles?.join(',') ?? ''}`}>
              <td>
                {onOpenMeter ? (
                  <MeterLink meter={item.meter} onOpen={onOpenMeter} />
                ) : (
                  item.meter
                )}
              </td>
              <td>
                <span
                  className={`demm-status-badge ${item.scheduled ? 'is-scheduled' : 'is-not-scheduled'}`}
                >
                  {item.scheduled ? 'Agendado' : 'Não agendado'}
                </span>
              </td>
              <td>{item.scheduledAtLabel ?? '—'}</td>
              {showSources ? (
                <td>{item.sourceFiles?.length ? item.sourceFiles.join(', ') : '—'}</td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

type DemmDocumentDetails = {
  documentId: string
  documentNumber: string | null
  csdName: string | null
  emissionDate: string | null
  meterCount: number
  scheduledCount: number
  bulkEntryReady?: boolean
  createdByRegistration: string | null
  createdAt: string
}

type DemmAnalysisModalProps = {
  title: string
  fileName?: string
  details?: DemmDocumentDetails | null
  meters: DemmMeterAnalysisRecord[]
  loading?: boolean
  showSources?: boolean
  onOpenMeter?: (meter: string) => void
  onClose: () => void
}

function DemmAnalysisModal({
  title,
  fileName,
  details,
  meters,
  loading = false,
  showSources = false,
  onOpenMeter,
  onClose,
}: DemmAnalysisModalProps) {
  const scheduledCount = meters.length
    ? meters.filter((item) => item.scheduled).length
    : (details?.scheduledCount ?? 0)

  return createPortal(
    <div className="ensaios-block-modal-overlay" role="presentation" onClick={onClose}>
      <div
        className="ensaios-block-modal demm-analysis-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="demm-analysis-title"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="icon-button schedule-slot-modal-close"
          onClick={onClose}
          aria-label="Fechar"
          title="Fechar"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M6 6l12 12M18 6L6 18"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </button>

        <h3 id="demm-analysis-title">{title}</h3>
        {fileName ? <p className="demm-modal-intro">{fileName}</p> : null}

        {details ? (
          <dl className="user-detail-grid schedule-detail-grid demm-analysis-details">
            <div>
              <dt>Nº documento</dt>
              <dd>{details.documentNumber ?? '—'}</dd>
            </div>
            <div>
              <dt>CSD</dt>
              <dd>{details.csdName ?? '—'}</dd>
            </div>
            <div>
              <dt>Data emissão</dt>
              <dd>{details.emissionDate ?? '—'}</dd>
            </div>
            <div>
              <dt>Medidores</dt>
              <dd>{details.meterCount}</dd>
            </div>
            <div>
              <dt>Agendados</dt>
              <dd>{details.scheduledCount}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>
                {details.bulkEntryReady ? (
                  <span className="demm-bulk-ready-badge">
                    DEMM liberada para entrada em massa
                  </span>
                ) : (
                  '—'
                )}
              </dd>
            </div>
            <div>
              <dt>Cadastrado por</dt>
              <dd>{details.createdByRegistration ?? '—'}</dd>
            </div>
            <div>
              <dt>Cadastrado em</dt>
              <dd>{formatDateTime(details.createdAt)}</dd>
            </div>
            <div className="user-detail-full">
              <dt>PDF</dt>
              <dd>
                <a
                  className="entrada-demm-link"
                  href={api.getDemmDocumentFileUrl(details.documentId)}
                  target="_blank"
                  rel="noreferrer"
                >
                  Abrir PDF
                </a>
              </dd>
            </div>
          </dl>
        ) : null}

        <p className="demm-analysis-summary">
          {loading
            ? 'Carregando medidores...'
            : `${details?.meterCount ?? meters.length} medidor(es) · ${scheduledCount} agendado(s) no aplicativo`}
        </p>

        <DemmMetersTable
          meters={meters}
          loading={loading}
          showSources={showSources}
          onOpenMeter={onOpenMeter}
        />
      </div>
    </div>,
    document.body,
  )
}

type DemmModalFeedback = {
  message: string
  conflicts?: DemmUploadConflictRecord[]
}

export function DemmUploadConflicts({ conflicts }: { conflicts: DemmUploadConflictRecord[] }) {
  const inDemm = conflicts.filter((item) => item.reason === 'demm_registered')
  const withEntrada = conflicts.filter((item) => item.reason === 'entrada_given')

  return (
    <div className="demm-modal-conflicts">
      {inDemm.length ? (
        <section className="demm-modal-conflict-group">
          <h4>Já consta em outra DEMM ({inDemm.length})</h4>
          <div className="entrada-table-wrap demm-modal-conflicts-table-wrap">
            <table className="data-table demm-modal-conflicts-table">
              <thead>
                <tr>
                  <th>Medidor</th>
                  <th>DEMM / documento</th>
                </tr>
              </thead>
              <tbody>
                {inDemm.map((item) => (
                  <tr key={`demm-${item.meter}`}>
                    <td>{item.meter}</td>
                    <td>{item.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {withEntrada.length ? (
        <section className="demm-modal-conflict-group">
          <h4>Já teve entrada no laboratório ({withEntrada.length})</h4>
          <div className="entrada-table-wrap demm-modal-conflicts-table-wrap">
            <table className="data-table demm-modal-conflicts-table">
              <thead>
                <tr>
                  <th>Medidor</th>
                  <th>Referência</th>
                </tr>
              </thead>
              <tbody>
                {withEntrada.map((item) => (
                  <tr key={`entrada-${item.meter}`}>
                    <td>{item.meter}</td>
                    <td>{item.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  )
}

type QuickScheduleModalProps = {
  meter: WeekMeterRecord
  submitting: boolean
  feedback: string | null
  onClose: () => void
  onSubmit: (payload: {
    scheduledAt: string
    installation: string
    toi: string
    note: string
    schedulingNotes: string
    toiCollaborator1Name: string
    toiCollaborator1Registration: string
    toiCollaborator2Name: string
    toiCollaborator2Registration: string
  }) => void
}

function QuickScheduleModal({
  meter,
  submitting,
  feedback,
  onClose,
  onSubmit,
}: QuickScheduleModalProps) {
  const { users: toiCollaborators, loading: toiCollaboratorsLoading } = useToiCollaboratorOptions()
  const [csmDate, setCsmDate] = useState('')
  const [csmTime, setCsmTime] = useState('00:00')
  const [installation, setInstallation] = useState('')
  const [toi, setToi] = useState('')
  const [note, setNote] = useState('')
  const [schedulingNotes, setSchedulingNotes] = useState('')
  const [collaborator1UserId, setCollaborator1UserId] = useState('')
  const [collaborator1Query, setCollaborator1Query] = useState('')
  const [collaborator2UserId, setCollaborator2UserId] = useState('')
  const [collaborator2Query, setCollaborator2Query] = useState('')
  const [collaboratorErrors, setCollaboratorErrors] = useState<ToiCollaboratorErrors>({})

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!csmDate) return
    const resolvedTeam = resolveToiCollaborators(
      collaborator1Query,
      collaborator1UserId,
      collaborator2Query,
      collaborator2UserId,
      toiCollaborators,
    )
    if (!resolvedTeam.ok) {
      setCollaboratorErrors(resolvedTeam.errors)
      return
    }
    const scheduledAt = new Date(`${csmDate}T${csmTime}:00`).toISOString()
    onSubmit({
      scheduledAt,
      installation,
      toi,
      note,
      schedulingNotes,
      toiCollaborator1Name: resolvedTeam.collaborator1.name,
      toiCollaborator1Registration: resolvedTeam.collaborator1.registration,
      toiCollaborator2Name: resolvedTeam.collaborator2.name,
      toiCollaborator2Registration: resolvedTeam.collaborator2.registration,
    })
  }

  return createPortal(
    <div className="ensaios-block-modal-overlay" role="presentation" onClick={onClose}>
      <div
        className="ensaios-block-modal demm-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="quick-schedule-title"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="icon-button schedule-slot-modal-close"
          onClick={onClose}
          aria-label="Fechar"
          title="Fechar"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M6 6l12 12M18 6L6 18"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </button>

        <h3 id="quick-schedule-title">Agendar medidor {meter.meter}</h3>
        <p className="demm-modal-intro">CSD: {meter.csdName ?? '—'}</p>

        {feedback ? (
          <div className="demm-modal-feedback error" role="alert">
            <p>{feedback}</p>
          </div>
        ) : null}

        <form className="form-grid demm-form-grid" onSubmit={handleSubmit}>
          <label>
            Data escrita no CSM
            <input
              type="date"
              value={csmDate}
              onChange={(event) => setCsmDate(event.target.value)}
              disabled={submitting}
              required
            />
          </label>
          <label>
            Hora
            <input
              type="time"
              value={csmTime}
              onChange={(event) => setCsmTime(event.target.value)}
              disabled={submitting}
              required
            />
          </label>
          <label>
            Instalação
            <input
              value={installation}
              onChange={(event) => setInstallation(event.target.value)}
              disabled={submitting}
            />
          </label>
          <label>
            TOI
            <input value={toi} onChange={(event) => setToi(event.target.value)} disabled={submitting} />
          </label>
          <ToiCollaboratorFields
            users={toiCollaborators}
            loading={toiCollaboratorsLoading}
            disabled={submitting}
            errors={collaboratorErrors}
            onClearError={(field) =>
              setCollaboratorErrors((current) => {
                if (!current[field]) return current
                const next = { ...current }
                delete next[field]
                return next
              })
            }
            collaborator1UserId={collaborator1UserId}
            collaborator1Query={collaborator1Query}
            collaborator2UserId={collaborator2UserId}
            collaborator2Query={collaborator2Query}
            onCollaborator1Change={(userId, query) => {
              setCollaborator1UserId(userId)
              setCollaborator1Query(query)
            }}
            onCollaborator2Change={(userId, query) => {
              setCollaborator2UserId(userId)
              setCollaborator2Query(query)
            }}
          />
          <label className="full-width">
            Nota
            <input value={note} onChange={(event) => setNote(event.target.value)} disabled={submitting} />
          </label>
          <label className="full-width">
            Observações
            <textarea
              value={schedulingNotes}
              onChange={(event) => setSchedulingNotes(event.target.value)}
              disabled={submitting}
              rows={2}
            />
          </label>

          <div className="ensaios-block-modal-actions full-width">
            <button type="button" className="secondary-button" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="primary-button" disabled={submitting}>
              {submitting ? 'Agendando...' : 'Agendar'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  )
}

type PassiveReceiveModalProps = {
  meter: WeekMeterRecord
  submitting: boolean
  feedback: string | null
  onClose: () => void
  onSubmit: (payload: { receivedAt: string }) => void
}

function PassiveReceiveModal({
  meter,
  submitting,
  feedback,
  onClose,
  onSubmit,
}: PassiveReceiveModalProps) {
  const [receivedDate, setReceivedDate] = useState('')
  const [receivedTime, setReceivedTime] = useState('08:00')

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!receivedDate) return
    onSubmit({
      receivedAt: new Date(`${receivedDate}T${receivedTime}:00`).toISOString(),
    })
  }

  return createPortal(
    <div className="ensaios-block-modal-overlay" role="presentation" onClick={onClose}>
      <div
        className="ensaios-block-modal demm-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="passive-receive-title"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="icon-button schedule-slot-modal-close"
          onClick={onClose}
          aria-label="Fechar"
          title="Fechar"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M6 6l12 12M18 6L6 18"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </button>

        <h3 id="passive-receive-title">Receber passivo — medidor {meter.meter}</h3>
        <p className="demm-modal-intro">
          Informe a data real em que o medidor foi recebido no laboratório. Essa data será usada
          no dash do CSD.
        </p>

        {feedback ? (
          <div className="demm-modal-feedback error" role="alert">
            <p>{feedback}</p>
          </div>
        ) : null}

        <form className="form-grid demm-form-grid" onSubmit={handleSubmit}>
          <label>
            Data de recebimento
            <input
              type="date"
              value={receivedDate}
              onChange={(event) => setReceivedDate(event.target.value)}
              disabled={submitting}
              required
            />
          </label>
          <label>
            Hora
            <input
              type="time"
              value={receivedTime}
              onChange={(event) => setReceivedTime(event.target.value)}
              disabled={submitting}
              required
            />
          </label>

          <div className="ensaios-block-modal-actions full-width">
            <button type="button" className="secondary-button" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="primary-button" disabled={submitting}>
              {submitting ? 'Registrando...' : 'Receber passivo'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  )
}

type EntradaPanelProps = {
  onTrailCountsChange?: () => void
  readOnly?: boolean
  allowUserProfilePhotoEdit?: boolean
  isAdmin?: boolean
}

export function EntradaPanel({
  onTrailCountsChange,
  readOnly = false,
  allowUserProfilePhotoEdit = false,
  isAdmin = false,
}: EntradaPanelProps) {
  const [view, setView] = useState<
    | 'dash'
    | 'overview'
    | 'demmEntrada'
    | 'metersBase'
    | 'csdPendencias'
    | 'inspectionPendencias'
    | 'weekMeters'
    | 'demmHistorico'
    | 'dateAdjustments'
  >('dash')
  const [demmDocuments, setDemmDocuments] = useState<DemmDocumentRecord[]>([])
  const [csdPendencias, setCsdPendencias] = useState<CsdDemmPendenciaRecord[]>([])
  const [csdPendenciasLoading, setCsdPendenciasLoading] = useState(false)
  const [demmHistoricoWeeks, setDemmHistoricoWeeks] = useState<
    Awaited<ReturnType<typeof api.getCsdDemmHistorico>>['weeks']
  >([])
  const [demmHistoricoCsds, setDemmHistoricoCsds] = useState<CsdDemmHistoricoRecord[]>([])
  const [demmHistoricoLoading, setDemmHistoricoLoading] = useState(false)
  const [inspectionPendencias, setInspectionPendencias] = useState<
    MeterInspectionPendenciaRecord[]
  >([])
  const [wpaMeters, setWpaMeters] = useState<MeterInspectionDocumentadoRecord[]>([])
  const [wpaMetersLoading, setWpaMetersLoading] = useState(false)
  const [inspectionPendenciasLoading, setInspectionPendenciasLoading] = useState(false)
  const [inspectionPendenciasMeterFilter, setInspectionPendenciasMeterFilter] = useState('')
  const [inspectionPendenciasInstallationFilter, setInspectionPendenciasInstallationFilter] =
    useState('')
  const [inspectionPendenciasCsdFilter, setInspectionPendenciasCsdFilter] = useState('')
  const [inspectionPendenciasResponsibleFilter, setInspectionPendenciasResponsibleFilter] =
    useState('')
  const [inspectionPendenciasPendingFilter, setInspectionPendenciasPendingFilter] = useState<
    'todos' | 'toi' | 'csm' | 'toi_csm'
  >('todos')
  const [inspectionPendenciasEtapaFilter, setInspectionPendenciasEtapaFilter] = useState('todos')
  const [inspectionPendenciasEscopoFilter, setInspectionPendenciasEscopoFilter] = useState('todos')
  const [uploadingInspectionId, setUploadingInspectionId] = useState<string | null>(null)
  const [receivingMeter, setReceivingMeter] = useState<string | null>(null)
  const [weekMeters, setWeekMeters] = useState<WeekMeterRecord[]>([])
  const [weekMetersLoading, setWeekMetersLoading] = useState(false)
  const [weekMetersStatusFilter, setWeekMetersStatusFilter] = useState<'todos' | WeekMeterStatus>(
    'todos',
  )
  const [weekMetersMeterFilter, setWeekMetersMeterFilter] = useState('')
  const [weekMetersCsdFilter, setWeekMetersCsdFilter] = useState('')
  const [weekMetersDemmFilter, setWeekMetersDemmFilter] = useState('')
  const [dateAdjustmentsCount, setDateAdjustmentsCount] = useState(0)
  const [quickScheduleMeter, setQuickScheduleMeter] = useState<WeekMeterRecord | null>(null)
  const [submittingQuickSchedule, setSubmittingQuickSchedule] = useState(false)
  const [quickScheduleFeedback, setQuickScheduleFeedback] = useState<string | null>(null)
  const [passiveReceiveMeter, setPassiveReceiveMeter] = useState<WeekMeterRecord | null>(null)
  const [submittingPassiveReceive, setSubmittingPassiveReceive] = useState(false)
  const [passiveReceiveFeedback, setPassiveReceiveFeedback] = useState<string | null>(null)
  const [meterDetailTarget, setMeterDetailTarget] = useState<string | null>(null)
  const [inspectionDocumentTarget, setInspectionDocumentTarget] = useState<{
    meter: string
    scheduleId: string
  } | null>(null)
  const { options: csdOptions, loading: csdOptionsLoading, error: csdOptionsError } = useCsdsOptions()
  const [loading, setLoading] = useState(true)
  const [showDemmModal, setShowDemmModal] = useState(false)
  const [demmFile, setDemmFile] = useState<File | null>(null)
  const [demmCsdId, setDemmCsdId] = useState('')
  const [demmTargetWeekStart, setDemmTargetWeekStart] = useState<string | null>(null)
  const [demmModalFeedback, setDemmModalFeedback] = useState<DemmModalFeedback | null>(null)
  const [submittingDemm, setSubmittingDemm] = useState(false)
  const [deletingDemmId, setDeletingDemmId] = useState<string | null>(null)
  const [analysisModal, setAnalysisModal] = useState<{
    title: string
    fileName?: string
    details?: DemmDocumentDetails | null
    meters: DemmMeterAnalysisRecord[]
    loading?: boolean
    showSources?: boolean
  } | null>(null)
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error'
    message: string
  } | null>(null)
  const [profileUser, setProfileUser] = useState<AppUser | null>(null)
  const [profileUsers, setProfileUsers] = useState<AppUser[]>([])
  const [profileOrgCells, setProfileOrgCells] = useState<
    Array<{ id: string; responsibleUserId?: string | null; responsibleName?: string | null }>
  >([])
  const [profilePhotos, setProfilePhotos] = useState<Record<string, string>>({})

  const onTrailCountsChangeRef = useRef(onTrailCountsChange)
  useEffect(() => {
    onTrailCountsChangeRef.current = onTrailCountsChange
  }, [onTrailCountsChange])

  const refreshTrailCounts = useCallback(() => {
    onTrailCountsChangeRef.current?.()
  }, [])

  const loadData = useCallback(async () => {
    setLoading(true)

    try {
      const demmResponse = await api.listDemmDocuments()
      setDemmDocuments(demmResponse.documents)
    } catch (error) {
      setFeedback({
        type: 'error',
        message:
          error instanceof ApiError
            ? error.message
            : 'Não foi possível carregar os dados de entrada.',
      })
    } finally {
      setLoading(false)
    }
  }, [])

  const reloadEntradaData = useCallback(async () => {
    await loadData()
    refreshTrailCounts()
  }, [loadData, refreshTrailCounts])

  const closeDemmModal = () => {
    setShowDemmModal(false)
    setDemmFile(null)
    setDemmCsdId('')
    setDemmTargetWeekStart(null)
    setDemmModalFeedback(null)
  }

  const openUserProfile = useCallback(
    async (userId: string) => {
      try {
        let approved = profileUsers
        if (!approved.length) {
          const [usersResponse, orgResponse] = await Promise.all([
            api.listUsers(),
            api.listOrgCells(),
          ])
          approved = usersResponse.users.filter(
            (user) => user.role !== 'admin' && user.approvalStatus === 'approved',
          )
          setProfileUsers(approved)
          setProfileOrgCells(
            orgResponse.cells.map((cell) => ({
              id: cell.id,
              responsibleUserId: cell.responsibleUserId,
              responsibleName: cell.responsibleName,
            })),
          )
        }

        const user = approved.find((item) => item.id === userId)
        if (!user) return

        setProfileUser(user)

        if (
          (user.hasProfilePhoto ?? Boolean(user.profilePhoto)) &&
          !profilePhotos[userId] &&
          !user.profilePhoto
        ) {
          const photosResponse = await api.listUserProfilePhotos([userId])
          setProfilePhotos((current) => ({ ...current, ...photosResponse.photos }))
        }
      } catch (error) {
        setFeedback({
          type: 'error',
          message:
            error instanceof ApiError
              ? error.message
              : 'Não foi possível abrir o perfil do responsável.',
        })
      }
    },
    [profilePhotos, profileUsers],
  )

  const openDemmModal = (csdId?: string, targetWeekStart?: string) => {
    setDemmModalFeedback(null)
    setDemmCsdId(csdId ?? '')
    setDemmTargetWeekStart(targetWeekStart ?? null)
    setShowDemmModal(true)
  }

  const buildDemmDocumentDetails = (document: DemmDocumentRecord): DemmDocumentDetails => ({
    documentId: document.id,
    documentNumber: document.documentNumber,
    csdName: document.csdName,
    emissionDate: document.emissionDate,
    meterCount: document.meterCount,
    scheduledCount: document.scheduledCount,
    bulkEntryReady: document.bulkEntryReady,
    createdByRegistration: document.createdByRegistration,
    createdAt: document.createdAt,
  })

  const openDemmAnalysis = async (document: DemmDocumentRecord) => {
    const details = buildDemmDocumentDetails(document)
    setAnalysisModal({
      title: details.documentNumber ? `DEMM ${details.documentNumber}` : 'DEMM',
      fileName: document.fileName,
      details,
      meters: [],
      loading: true,
      showSources: false,
    })

    try {
      const response = await api.getDemmDocumentAnalysis(document.id)
      setAnalysisModal({
        title: details.documentNumber ? `DEMM ${details.documentNumber}` : 'DEMM',
        fileName: response.fileName,
        details: {
          ...details,
          meterCount: response.analysis.meters.length,
          scheduledCount: response.analysis.meters.filter((item) => item.scheduled).length,
        },
        meters: response.analysis.meters,
        loading: false,
        showSources: false,
      })
      await reloadEntradaData()
    } catch (error) {
      setAnalysisModal(null)
      setFeedback({
        type: 'error',
        message:
          error instanceof ApiError
            ? error.message
            : 'Não foi possível analisar os medidores da DEMM.',
      })
    }
  }

  const loadCsdPendencias = useCallback(async () => {
    setCsdPendenciasLoading(true)
    try {
      const response = await api.listCsdDemmPendencias()
      setCsdPendencias(response.csds)
    } catch (error) {
      setFeedback({
        type: 'error',
        message:
          error instanceof ApiError
            ? error.message
            : 'Não foi possível carregar as pendências de DEMM por CSD.',
      })
    } finally {
      setCsdPendenciasLoading(false)
    }
  }, [])

  const openCsdPendencias = () => {
    setView('csdPendencias')
    setFeedback(null)
    void loadCsdPendencias()
  }

  const loadDemmHistorico = useCallback(async () => {
    setDemmHistoricoLoading(true)
    try {
      const response = await api.getCsdDemmHistorico()
      setDemmHistoricoWeeks(response.weeks)
      setDemmHistoricoCsds(response.csds)
    } catch (error) {
      setFeedback({
        type: 'error',
        message:
          error instanceof ApiError
            ? error.message
            : 'Não foi possível carregar o histórico de DEMM.',
      })
    } finally {
      setDemmHistoricoLoading(false)
    }
  }, [])

  const openDemmHistorico = () => {
    setView('demmHistorico')
    setFeedback(null)
    void loadDemmHistorico()
  }

  const loadInspectionPendencias = useCallback(async () => {
    setInspectionPendenciasLoading(true)
    try {
      const response = await api.listInspectionPendencias()
      setInspectionPendencias(response.pendencias)
    } catch (error) {
      setFeedback({
        type: 'error',
        message:
          error instanceof ApiError
            ? error.message
            : 'Não foi possível carregar os medidores pendentes de documento de inspeção.',
      })
    } finally {
      setInspectionPendenciasLoading(false)
    }
  }, [])

  const loadWpaMeters = useCallback(async () => {
    setWpaMetersLoading(true)
    try {
      const response = await api.listWpaAnalysisMeters()
      setWpaMeters((response.meters ?? []).filter(hasWpaDocument))
    } catch (error) {
      setFeedback({
        type: 'error',
        message:
          error instanceof ApiError
            ? error.message
            : 'Não foi possível carregar os medidores com documento para análise WPA.',
      })
    } finally {
      setWpaMetersLoading(false)
    }
  }, [])

  const openMetersBase = () => {
    setView('metersBase')
    setFeedback(null)
    void loadWpaMeters()
  }

  const openInspectionPendencias = () => {
    setView('inspectionPendencias')
    setFeedback(null)
    void loadInspectionPendencias()
  }

  const loadDateAdjustmentsCount = useCallback(async () => {
    try {
      const response = await api.listScheduleDateAdjustments('all')
      setDateAdjustmentsCount(response.total)
    } catch {
      setDateAdjustmentsCount(0)
    }
  }, [])

  const openDateAdjustments = () => {
    setView('dateAdjustments')
    setFeedback(null)
    void loadDateAdjustmentsCount()
  }

  const handleUploadInspectionDocument = async (
    target: { id: string; meter: string },
    file: File,
  ) => {
    setUploadingInspectionId(target.id)
    setFeedback(null)

    try {
      const fileBase64 = await readFileAsBase64(file)
      const { document } = await api.uploadInspectionDocument(target.id, {
        fileName: file.name,
        fileBase64,
      })

      const docTypeLabel =
        document.docType === 'toi'
          ? 'TOI'
          : document.docType === 'comunicado'
            ? 'CSM'
            : 'TOI + CSM'

      if (!document.complete) {
        const missing = !document.hasToi ? 'TOI' : 'CSM'
        setFeedback({
          type: 'success',
          message: `${docTypeLabel} anexado ao medidor ${target.meter}. Ainda falta anexar o ${missing}.`,
        })
      } else if (document.blocked) {
        setFeedback({
          type: 'error',
          message: `Documento anexado, mas o medidor ${target.meter} ficou bloqueado: ${document.blockReason}`,
        })
      } else {
        setFeedback({
          type: 'success',
          message: `Documento de inspeção anexado ao medidor ${target.meter}.`,
        })
      }

      setWeekMeters((prev) =>
        prev.map((row) => {
          if (row.scheduleId !== target.id) return row
          const hasToi = document.hasToi
          const hasComunicado = document.hasComunicado
          const status: WeekMeterStatus = document.blocked
            ? 'bloqueado'
            : hasToi && hasComunicado
              ? 'liberado'
              : row.status === 'nao_agendado'
                ? 'nao_agendado'
                : 'sem_documento_inspecao'
          return {
            ...row,
            hasToi,
            hasComunicado,
            status,
            blockReason: document.blockReason ?? row.blockReason,
          }
        }),
      )

      void loadInspectionPendencias()
      void loadWpaMeters()
      void loadWeekMeters()
      void loadData()
      refreshTrailCounts()
    } catch (error) {
      setFeedback({
        type: 'error',
        message:
          error instanceof ApiError
            ? error.message
            : 'Não foi possível anexar o documento de inspeção.',
      })
    } finally {
      setUploadingInspectionId(null)
    }
  }

  const loadWeekMeters = useCallback(async () => {
    setWeekMetersLoading(true)
    try {
      const response = await api.listWeekMeters()
      setWeekMeters(response.meters)
    } catch (error) {
      setFeedback({
        type: 'error',
        message:
          error instanceof ApiError ? error.message : 'Não foi possível carregar os medidores da semana.',
      })
    } finally {
      setWeekMetersLoading(false)
    }
  }, [])

  const handleReceiveWeekMeter = async (item: WeekMeterRecord) => {
    setReceivingMeter(item.meter)
    setFeedback(null)

    try {
      await api.receiveWeekMeter({
        meter: item.meter,
        scheduleId: item.scheduleId,
      })
      setWeekMeters((prev) => prev.filter((row) => row.meter !== item.meter))
      setFeedback({
        type: 'success',
        message: `Medidor ${item.meter} recebido no laboratório.`,
      })
      refreshTrailCounts()
      void loadData()
    } catch (error) {
      setFeedback({
        type: 'error',
        message:
          error instanceof ApiError
            ? error.message
            : 'Não foi possível registrar a entrada do medidor.',
      })
    } finally {
      setReceivingMeter(null)
    }
  }

  const closePassiveReceive = () => {
    setPassiveReceiveMeter(null)
    setPassiveReceiveFeedback(null)
  }

  const handlePassiveReceiveSubmit = async (payload: { receivedAt: string }) => {
    if (!passiveReceiveMeter) return

    setSubmittingPassiveReceive(true)
    setPassiveReceiveFeedback(null)

    try {
      await api.receiveWeekMeterPassive({
        meter: passiveReceiveMeter.meter,
        scheduleId: passiveReceiveMeter.scheduleId,
        receivedAt: payload.receivedAt,
      })
      setWeekMeters((prev) => prev.filter((row) => row.meter !== passiveReceiveMeter.meter))
      setFeedback({
        type: 'success',
        message: `Medidor ${passiveReceiveMeter.meter} recebido (passivo) com a data informada.`,
      })
      refreshTrailCounts()
      void loadData()
      closePassiveReceive()
    } catch (error) {
      setPassiveReceiveFeedback(
        error instanceof ApiError
          ? error.message
          : 'Não foi possível registrar o recebimento passivo.',
      )
    } finally {
      setSubmittingPassiveReceive(false)
    }
  }

  const openWeekMeters = () => {
    setView('weekMeters')
    setFeedback(null)
    void loadWeekMeters()
  }

  const openOverview = () => {
    setView('overview')
    setFeedback(null)
    void loadData()
  }

  const openDemmEntrada = () => {
    setView('demmEntrada')
    setFeedback(null)
    void loadData()
  }

  const openDash = () => {
    setView('dash')
    setFeedback(null)
    void Promise.all([
      loadData(),
      loadCsdPendencias(),
      loadInspectionPendencias(),
      loadWpaMeters(),
      loadWeekMeters(),
    ])
  }

  useEffect(() => {
    void loadData()
    void loadCsdPendencias()
    void loadInspectionPendencias()
    void loadWpaMeters()
    void loadWeekMeters()
    void loadDateAdjustmentsCount()
  }, [loadData, loadCsdPendencias, loadInspectionPendencias, loadWpaMeters, loadWeekMeters, loadDateAdjustmentsCount])

  const renderFixedFeedback = () =>
    feedback ? (
      <LoginFeedback
        fixed
        type={feedback.type}
        message={feedback.message}
        onClose={() => setFeedback(null)}
      />
    ) : null

  const renderEntradaTabBar = () => (
    <div className="entrada-panel-header">
      <div
        className="panel-switch entrada-demm-switch"
        role="tablist"
        aria-label="Ações DEMM"
      >
        <button
          type="button"
          role="tab"
          aria-selected={view === 'overview'}
          className={view === 'overview' ? 'active' : ''}
          onClick={() => openOverview()}
        >
          DEMMs cadastradas
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === 'demmEntrada'}
          className={view === 'demmEntrada' ? 'active' : ''}
          onClick={() => openDemmEntrada()}
        >
          DEMMs com entrada
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === 'metersBase'}
          className={view === 'metersBase' ? 'active' : ''}
          onClick={() => openMetersBase()}
        >
          Análise WPA
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === 'csdPendencias'}
          className={view === 'csdPendencias' ? 'active' : ''}
          onClick={() => openCsdPendencias()}
        >
          CSDs pendentes
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === 'inspectionPendencias'}
          className={view === 'inspectionPendencias' ? 'active' : ''}
          onClick={() => openInspectionPendencias()}
        >
          Documentos de inspeção pendentes
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === 'weekMeters'}
          className={view === 'weekMeters' ? 'active' : ''}
          onClick={() => openWeekMeters()}
        >
          Medidores da semana
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === 'demmHistorico'}
          className={view === 'demmHistorico' ? 'active' : ''}
          onClick={() => openDemmHistorico()}
        >
          Histórico de DEMM
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === 'dateAdjustments'}
          className={view === 'dateAdjustments' ? 'active' : ''}
          onClick={() => openDateAdjustments()}
        >
          Alteração de data
          {dateAdjustmentsCount > 0 ? (
            <span className="lab-trail-step-badge" aria-label={`${dateAdjustmentsCount} alteração(ões)`}>
              {dateAdjustmentsCount}
            </span>
          ) : null}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === 'dash'}
          className={view === 'dash' ? 'active' : ''}
          onClick={() => openDash()}
        >
          Dash
        </button>
      </div>
    </div>
  )

  const closeQuickSchedule = () => {
    setQuickScheduleMeter(null)
  }

  const handleQuickScheduleSubmit = async (payload: {
    scheduledAt: string
    installation: string
    toi: string
    note: string
    schedulingNotes: string
    toiCollaborator1Name: string
    toiCollaborator1Registration: string
    toiCollaborator2Name: string
    toiCollaborator2Registration: string
  }) => {
    if (!quickScheduleMeter) return

    setSubmittingQuickSchedule(true)
    setQuickScheduleFeedback(null)

    try {
      const { schedule } = await api.createPassiveMeterSchedule({
        meter: quickScheduleMeter.meter,
        csd: quickScheduleMeter.csdName ?? '',
        installation: payload.installation,
        toi: payload.toi,
        note: payload.note,
        schedulingNotes: payload.schedulingNotes,
        scheduledAt: payload.scheduledAt,
        toiCollaborator1Name: payload.toiCollaborator1Name,
        toiCollaborator1Registration: payload.toiCollaborator1Registration,
        toiCollaborator2Name: payload.toiCollaborator2Name,
        toiCollaborator2Registration: payload.toiCollaborator2Registration,
      })

      setWeekMeters((prev) =>
        prev.map((item) =>
          item.meter === quickScheduleMeter.meter
            ? {
                ...item,
                status: 'sem_documento_inspecao',
                scheduleId: schedule.id,
                scheduledAtLabel: schedule.scheduledAtLabel,
                hasToi: false,
                hasComunicado: false,
              }
            : item,
        ),
      )
      setFeedback({
        type: 'success',
        message: `Medidor ${schedule.meter} agendado para ${schedule.scheduledAtLabel}.`,
      })
      refreshTrailCounts()
      closeQuickSchedule()
    } catch (error) {
      setQuickScheduleFeedback(
        error instanceof ApiError ? error.message : 'Não foi possível agendar o medidor.',
      )
    } finally {
      setSubmittingQuickSchedule(false)
    }
  }

  const handleDemmSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!demmCsdId) {
      setDemmModalFeedback({ message: 'Selecione o CSD dessa DEMM.' })
      return
    }

    if (!demmFile) {
      setDemmModalFeedback({ message: 'Envie o arquivo PDF da DEMM.' })
      return
    }

    if (demmFile.type !== 'application/pdf' && !demmFile.name.toLowerCase().endsWith('.pdf')) {
      setDemmModalFeedback({ message: 'A DEMM deve ser um arquivo PDF.' })
      return
    }

    setSubmittingDemm(true)
    setDemmModalFeedback(null)
    setFeedback(null)

    try {
      const fileBase64 = await readFileAsBase64(demmFile)
      const wasRetroactive = Boolean(demmTargetWeekStart)
      const response = await api.createDemmDocument({
        fileName: demmFile.name,
        fileBase64,
        csdId: demmCsdId,
        ...(demmTargetWeekStart ? { targetWeekStart: demmTargetWeekStart } : {}),
      })

      closeDemmModal()
      setFeedback({
        type: 'success',
        message: wasRetroactive
          ? `DEMM retroativa registrada. ${response.analysis.total} medidor(es) identificado(s).`
          : `DEMM registrada. ${response.analysis.total} medidor(es) identificado(s).`,
      })
      setAnalysisModal({
        title: 'Medidores identificados na DEMM',
        fileName: response.document.fileName,
        details: buildDemmDocumentDetails(response.document),
        meters: response.analysis.meters,
        loading: false,
        showSources: false,
      })
      await reloadEntradaData()
      if (view === 'csdPendencias') {
        void loadCsdPendencias()
      }
      if (view === 'demmHistorico') {
        void loadDemmHistorico()
      }
    } catch (error) {
      if (error instanceof ApiError) {
        setDemmModalFeedback({
          message:
            error.conflicts?.length
              ? `A DEMM não pode ser cadastrada. ${error.conflicts.length} medidor(es) com pendência.`
              : error.message,
          conflicts: error.conflicts,
        })
      } else {
        setDemmModalFeedback({ message: 'Não foi possível registrar a DEMM.' })
      }
    } finally {
      setSubmittingDemm(false)
    }
  }

  const handleDeleteDemm = async (document: DemmDocumentRecord) => {
    const confirmed = window.confirm(`Excluir a DEMM "${document.fileName}"?`)
    if (!confirmed) return

    setDeletingDemmId(document.id)
    setFeedback(null)

    try {
      await api.deleteDemmDocument(document.id)
      setDemmDocuments((prev) => prev.filter((item) => item.id !== document.id))
      setFeedback({ type: 'success', message: `DEMM "${document.fileName}" excluída.` })
    } catch (error) {
      setFeedback({
        type: 'error',
        message:
          error instanceof ApiError
            ? error.message
            : 'Não foi possível excluir a DEMM.',
      })
    } finally {
      setDeletingDemmId(null)
    }
  }

  const pendingDemmDocuments = demmDocuments.filter((document) => !document.allEntryGiven)
  const receivedDemmDocuments = demmDocuments.filter((document) => document.allEntryGiven)

  const renderDemmDocumentsSection = (
    documents: DemmDocumentRecord[],
    options: {
      title: string
      emptyMessage: string
      countHeader: string
      countSummary: string
      countValue: (document: DemmDocumentRecord) => number
    },
  ) => {
    const totalMeters = documents.reduce((sum, document) => sum + document.meterCount, 0)
    const totalCount = documents.reduce((sum, document) => sum + options.countValue(document), 0)

    return (
      <section className="entrada-section">
        <div className="entrada-section-heading">
          <h3 className="entrada-section-title">{options.title}</h3>
          {documents.length > 0 ? (
            <span className="entrada-section-total">
              Total: {totalMeters} medidor(es)
              {totalCount > 0 ? ` · ${totalCount} ${options.countSummary}` : ''}
            </span>
          ) : null}
        </div>
        {loading && documents.length === 0 && demmDocuments.length === 0 ? (
          <p className="entrada-panel-empty">Carregando DEMMs...</p>
        ) : documents.length === 0 ? (
          <p className="entrada-panel-empty">{options.emptyMessage}</p>
        ) : (
          <div className="entrada-table-wrap">
            <table className="data-table entrada-table">
              <thead>
                <tr>
                  <th>Nº documento</th>
                  <th>CSD</th>
                  <th>Data emissão</th>
                  <th>Medidores</th>
                  <th>{options.countHeader}</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {documents.map((document) => (
                  <tr
                    key={document.id}
                    className={`demm-row-clickable${document.bulkEntryReady ? ' demm-row-bulk-ready' : ''}`}
                    onClick={() => void openDemmAnalysis(document)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        void openDemmAnalysis(document)
                      }
                    }}
                    tabIndex={0}
                    role="button"
                    aria-label={`Ver detalhes da DEMM ${document.documentNumber ?? document.fileName}`}
                  >
                    <td>{document.documentNumber ?? '—'}</td>
                    <td>{document.csdName ?? '—'}</td>
                    <td>{document.emissionDate ?? '—'}</td>
                    <td>{document.meterCount}</td>
                    <td>{options.countValue(document)}</td>
                    <td>
                      <div className="entrada-demm-actions" onClick={(event) => event.stopPropagation()}>
                        <a
                          className="entrada-demm-link"
                          href={api.getDemmDocumentFileUrl(document.id)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          PDF
                        </a>
                        {readOnly ? null : (
                          <button
                            type="button"
                            className="entrada-demm-delete-button"
                            disabled={deletingDemmId === document.id}
                            onClick={() => void handleDeleteDemm(document)}
                            aria-label={
                              deletingDemmId === document.id ? 'Excluindo DEMM' : 'Excluir DEMM'
                            }
                            title={
                              deletingDemmId === document.id ? 'Excluindo...' : 'Excluir DEMM'
                            }
                          >
                            <svg viewBox="0 0 24 24" aria-hidden="true">
                              <path
                                d="M4 7h16M9 7V4h6v3m-8 0l1 13h8l1-13"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                              />
                            </svg>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="entrada-table-total-row">
                  <td colSpan={3}>Total</td>
                  <td>{totalMeters}</td>
                  <td>{totalCount}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>
    )
  }

  const demmModal = showDemmModal
    ? createPortal(
        <div className="ensaios-block-modal-overlay" role="presentation" onClick={closeDemmModal}>
          <div
            className={`ensaios-block-modal demm-modal ${demmModalFeedback?.conflicts?.length ? 'demm-modal-with-conflicts' : ''}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="demm-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="icon-button schedule-slot-modal-close"
              onClick={closeDemmModal}
              aria-label="Fechar"
              title="Fechar"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M6 6l12 12M18 6L6 18"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </button>

            <h3 id="demm-modal-title">
              {demmTargetWeekStart ? 'Importar DEMM retroativa' : 'Nova DEMM'}
            </h3>
            {demmTargetWeekStart ? (
              <p className="demm-modal-intro">
                Semana com prazo em {formatWeekLabel(demmTargetWeekStart)} (sexta-feira). O ícone
                ficará com check amarelo após o envio.
              </p>
            ) : null}

            {demmModalFeedback ? (
              <div className="demm-modal-feedback error" role="alert">
                <p>{demmModalFeedback.message}</p>
                {demmModalFeedback.conflicts?.length ? (
                  <DemmUploadConflicts conflicts={demmModalFeedback.conflicts} />
                ) : null}
              </div>
            ) : null}

            <form className="form-grid demm-form-grid" onSubmit={(event) => void handleDemmSubmit(event)}>
              <label className="full-width">
                CSD
                <select
                  value={demmCsdId}
                  onChange={(event) => setDemmCsdId(event.target.value)}
                  disabled={submittingDemm || Boolean(demmTargetWeekStart && demmCsdId)}
                  required
                >
                  <option value="">
                    {csdOptionsLoading ? 'Carregando CSDs...' : 'Selecione o CSD'}
                  </option>
                  {csdOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
                {csdOptionsError ? (
                  <span className="field-error" role="alert">
                    {csdOptionsError}
                  </span>
                ) : null}
              </label>

              <label className="full-width photo-upload-field">
                PDF da DEMM
                <div className="photo-upload-area demm-upload-area">
                  <input
                    type="file"
                    accept="application/pdf,.pdf"
                    onChange={(event) => {
                      setDemmFile(event.target.files?.[0] ?? null)
                      setDemmModalFeedback(null)
                    }}
                    required
                  />
                  <span className="photo-upload-hint">
                    {demmFile ? demmFile.name : 'Clique para selecionar o PDF da DEMM'}
                  </span>
                </div>
              </label>

              <div className="ensaios-block-modal-actions full-width">
                <button type="button" className="secondary-button" onClick={closeDemmModal}>
                  Cancelar
                </button>
                <button type="submit" className="primary-button" disabled={submittingDemm}>
                  {submittingDemm ? 'Lendo PDF...' : 'Enviar DEMM'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body,
      )
    : null

  const userProfileModal = profileUser
    ? createPortal(
        <UserDetailModal
          user={profileUser}
          profilePhotoSrc={profilePhotos[profileUser.id] ?? profileUser.profilePhoto}
          approvedUsers={profileUsers}
          orgCells={profileOrgCells}
          terceiraOptions={[...TERCEIRA_OPTIONS]}
          showPassword={false}
          allowProfilePhotoEdit={allowUserProfilePhotoEdit}
          onClose={() => setProfileUser(null)}
          onSaved={(user) => {
            setProfileUsers((current) =>
              current.map((item) => (item.id === user.id ? user : item)),
            )
            setProfileUser(user)
            if (user.profilePhoto?.trim()) {
              setProfilePhotos((current) => ({
                ...current,
                [user.id]: user.profilePhoto!.trim(),
              }))
            }
          }}
          onFeedback={setFeedback}
        />,
        document.body,
      )
    : null

  const meterDetailModal = meterDetailTarget ? (
    <MeterDetailModal meter={meterDetailTarget} onClose={() => setMeterDetailTarget(null)} />
  ) : null

  const openMeterDetail = (meter: string) => setMeterDetailTarget(meter)

  if (view === 'dateAdjustments') {
    return (
      <>
        <div className="entrada-panel">
          {renderEntradaTabBar()}
          {renderFixedFeedback()}
          <ScheduleDateAdjustmentsPanel
            scope="all"
            title="Alteração de data"
            intro="Medidores cuja data/horário de agendamento foi ajustada para conferir com o documento. Cada ajuste também gera apontamento de desvio para os colaboradores 1 e 2 do TOI."
          />
        </div>
        {userProfileModal}
        {meterDetailModal}
      </>
    )
  }

  if (view === 'dash') {
    return (
      <>
        <div className="entrada-panel">
          {renderEntradaTabBar()}

          {renderFixedFeedback()}

          <section className="entrada-section users-dashboard" aria-label="Dash de entrada">
            <div className="entrada-section-heading">
              <h3 className="entrada-section-title">Dash</h3>
            </div>

            <EntradaCsdDashboard />
          </section>
        </div>
        {userProfileModal}
        {meterDetailModal}
      </>
    )
  }

  if (view === 'metersBase') {
    const documentedMeters = wpaMeters.filter(hasWpaDocument)

    return (
      <>
        <div className="entrada-panel">
          {renderEntradaTabBar()}

          {renderFixedFeedback()}

          <section className="entrada-section" aria-label="Análise WPA">
            <div className="entrada-section-heading">
              <h3 className="entrada-section-title">Análise WPA</h3>
              <p className="demm-analysis-summary">
                {wpaMetersLoading && documentedMeters.length === 0
                  ? 'Carregando medidores...'
                  : `${documentedMeters.length} medidor(es) com documento anexado`}
              </p>
            </div>

            {wpaMetersLoading && documentedMeters.length === 0 ? (
              <p className="entrada-panel-empty">Carregando medidores...</p>
            ) : documentedMeters.length === 0 ? (
              <p className="entrada-panel-empty">
                Nenhum medidor com documento de inspeção anexado.
              </p>
            ) : (
              <div className="entrada-table-wrap">
                <table className="data-table entrada-table">
                  <thead>
                    <tr>
                      <th>Medidor</th>
                      <th>Instalação</th>
                      <th>TOI</th>
                      <th>Nota</th>
                      <th>CSD</th>
                      <th>Etapa</th>
                      <th>Data agendada</th>
                      <th>Documentação</th>
                      <th>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {documentedMeters.map((item) => (
                      <tr key={item.id}>
                        <td>
                          <MeterLink meter={item.meter} onOpen={openMeterDetail} />
                        </td>
                        <td>{item.installation}</td>
                        <td>{item.toi || '—'}</td>
                        <td>{item.note || '—'}</td>
                        <td>{item.csd}</td>
                        <td>{item.trailStep}</td>
                        <td>{formatDateTime(item.scheduledAt)}</td>
                        <td>
                          <span
                            className={
                              item.anyBlocked
                                ? 'schedule-late-badge'
                                : 'schedule-ok-badge'
                            }
                            title={item.blockReasons ?? undefined}
                          >
                            {wpaDocumentationLabel(item)}
                          </span>
                        </td>
                        <td>
                          <button
                            type="button"
                            className="secondary-button"
                            onClick={() =>
                              setInspectionDocumentTarget({
                                meter: item.meter,
                                scheduleId: item.id,
                              })
                            }
                          >
                            Analisar
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
        {inspectionDocumentTarget ? (
          <InspectionDocumentAnalysisModal
            meter={inspectionDocumentTarget.meter}
            scheduleId={inspectionDocumentTarget.scheduleId}
            onClose={() => setInspectionDocumentTarget(null)}
            onDocumentsChanged={() => {
              void loadInspectionPendencias()
              void loadWpaMeters()
              void loadWeekMeters()
              void loadData()
              void loadDateAdjustmentsCount()
              refreshTrailCounts()
            }}
          />
        ) : null}
        {userProfileModal}
        {meterDetailModal}
      </>
    )
  }

  if (view === 'csdPendencias') {
    const pendingCsds = csdPendencias.filter((csd) => csd.status !== 'entregue')

    return (
      <>
        <div className="entrada-panel">
          {renderEntradaTabBar()}

          {renderFixedFeedback()}

          <section className="entrada-section" aria-label="CSDs pendentes de DEMM">
            <div className="entrada-section-heading">
              <h3 className="entrada-section-title">CSDs pendentes de DEMM (semana atual)</h3>
              <p className="demm-analysis-summary">
                {csdPendenciasLoading
                  ? 'Carregando pendências...'
                  : `${pendingCsds.length} de ${csdPendencias.length} CSD(s) sem DEMM entregue nesta semana`}
              </p>
            </div>

            {csdPendenciasLoading ? (
              <p className="entrada-panel-empty">Carregando pendências...</p>
            ) : csdPendencias.length === 0 ? (
              <p className="entrada-panel-empty">Nenhum CSD cadastrado.</p>
            ) : (
              <div className="entrada-table-wrap">
                <table className="data-table entrada-table">
                  <thead>
                    <tr>
                      <th>CSD</th>
                      <th>Responsável</th>
                      <th>Escopo</th>
                      <th>Situação</th>
                      <th>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {csdPendencias.map((csd) => (
                      <tr key={csd.id}>
                        <td>{csd.name}</td>
                        <td>
                          <ResponsibleUserCell
                            userId={csd.responsibleUserId}
                            name={csd.responsibleName}
                            registration={csd.responsibleRegistration}
                            onOpenProfile={(userId) => void openUserProfile(userId)}
                          />
                        </td>
                        <td>{formatWorkSubtypeLabel(csd.responsibleWorkSubtype)}</td>
                        <td>
                          {csd.status === 'nao_entregue' ? (
                            <span className="schedule-late-badge">Não entregue</span>
                          ) : csd.status === 'entregue' ? (
                            <span className="schedule-ok-badge">Entregue</span>
                          ) : (
                            <span className="schedule-pending-badge">Pendente</span>
                          )}
                        </td>
                        <td>
                          {readOnly ? null : (
                            <button
                              type="button"
                              className="secondary-button"
                              onClick={() => openDemmModal(csd.id)}
                            >
                              Nova DEMM
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        {demmModal}

        {userProfileModal}
        {meterDetailModal}

        {analysisModal ? (
          <DemmAnalysisModal
            title={analysisModal.title}
            fileName={analysisModal.fileName}
            details={analysisModal.details}
            meters={analysisModal.meters}
            loading={analysisModal.loading}
            showSources={analysisModal.showSources}
            onOpenMeter={openMeterDetail}
            onClose={() => setAnalysisModal(null)}
          />
        ) : null}
      </>
    )
  }

  if (view === 'inspectionPendencias') {
    const meterQuery = inspectionPendenciasMeterFilter.replace(/\D/g, '')
    const installationQuery = inspectionPendenciasInstallationFilter.replace(/\D/g, '')
    const csdQuery = inspectionPendenciasCsdFilter.trim().toLowerCase()
    const responsibleQuery = inspectionPendenciasResponsibleFilter.trim().toLowerCase()

    const inspectionEtapaOptions = Array.from(
      new Set(inspectionPendencias.map((item) => item.trailStep).filter(Boolean)),
    ).sort((a, b) => a.localeCompare(b, 'pt-BR'))
    const inspectionEscopoOptions = Array.from(
      new Set(
        inspectionPendencias.map((item) => formatWorkSubtypeLabel(item.responsibleWorkSubtype)),
      ),
    ).sort((a, b) => a.localeCompare(b, 'pt-BR'))

    const filteredInspectionPendencias = inspectionPendencias.filter((pendencia) => {
      if (meterQuery && !pendencia.meter.replace(/\D/g, '').includes(meterQuery)) {
        return false
      }
      if (
        installationQuery &&
        !pendencia.installation.replace(/\D/g, '').includes(installationQuery)
      ) {
        return false
      }
      if (csdQuery && !pendencia.csd.toLowerCase().includes(csdQuery)) {
        return false
      }
      if (
        responsibleQuery &&
        !(pendencia.responsibleName ?? '').toLowerCase().includes(responsibleQuery) &&
        !(pendencia.responsibleRegistration ?? '').toLowerCase().includes(responsibleQuery)
      ) {
        return false
      }
      if (
        inspectionPendenciasEtapaFilter !== 'todos' &&
        pendencia.trailStep !== inspectionPendenciasEtapaFilter
      ) {
        return false
      }
      if (
        inspectionPendenciasEscopoFilter !== 'todos' &&
        formatWorkSubtypeLabel(pendencia.responsibleWorkSubtype) !==
          inspectionPendenciasEscopoFilter
      ) {
        return false
      }
      if (inspectionPendenciasPendingFilter === 'toi' && !pendencia.missingToi) {
        return false
      }
      if (inspectionPendenciasPendingFilter === 'csm' && !pendencia.missingComunicado) {
        return false
      }
      if (
        inspectionPendenciasPendingFilter === 'toi_csm' &&
        !(pendencia.missingToi && pendencia.missingComunicado)
      ) {
        return false
      }
      return true
    })

    const hasActiveInspectionPendenciaFilters = Boolean(
      inspectionPendenciasMeterFilter.trim() ||
        inspectionPendenciasInstallationFilter.trim() ||
        inspectionPendenciasCsdFilter.trim() ||
        inspectionPendenciasResponsibleFilter.trim() ||
        inspectionPendenciasPendingFilter !== 'todos' ||
        inspectionPendenciasEtapaFilter !== 'todos' ||
        inspectionPendenciasEscopoFilter !== 'todos',
    )

    const clearInspectionPendenciaFilters = () => {
      setInspectionPendenciasMeterFilter('')
      setInspectionPendenciasInstallationFilter('')
      setInspectionPendenciasCsdFilter('')
      setInspectionPendenciasResponsibleFilter('')
      setInspectionPendenciasPendingFilter('todos')
      setInspectionPendenciasEtapaFilter('todos')
      setInspectionPendenciasEscopoFilter('todos')
    }

    return (
      <>
        <div className="entrada-panel">
          {renderEntradaTabBar()}

          {renderFixedFeedback()}

          <section
            className="entrada-section"
            aria-label="Medidores pendentes de documento de inspeção"
          >
            <div className="entrada-section-heading">
              <h3 className="entrada-section-title">
                Medidores pendentes de documento de inspeção
              </h3>
              <p className="demm-analysis-summary">
                {inspectionPendenciasLoading
                  ? 'Carregando pendências...'
                  : hasActiveInspectionPendenciaFilters
                    ? `${filteredInspectionPendencias.length} de ${inspectionPendencias.length} medidor(es) sem documento anexado`
                    : `${inspectionPendencias.length} medidor(es) sem documento anexado`}
              </p>
            </div>

            {inspectionPendencias.length > 0 ? (
              <div
                className="week-meters-filters"
                aria-label="Filtros de medidores pendentes de documento"
              >
                <label className="week-meters-filter">
                  Medidor
                  <input
                    type="search"
                    inputMode="numeric"
                    value={inspectionPendenciasMeterFilter}
                    placeholder="Ex.: 13009094"
                    onChange={(event) => setInspectionPendenciasMeterFilter(event.target.value)}
                  />
                </label>
                <label className="week-meters-filter">
                  Instalação
                  <input
                    type="search"
                    inputMode="numeric"
                    value={inspectionPendenciasInstallationFilter}
                    placeholder="Ex.: 150013201"
                    onChange={(event) =>
                      setInspectionPendenciasInstallationFilter(event.target.value)
                    }
                  />
                </label>
                <label className="week-meters-filter">
                  CSD
                  <input
                    type="search"
                    value={inspectionPendenciasCsdFilter}
                    placeholder="Ex.: Mogi das Cruzes"
                    onChange={(event) => setInspectionPendenciasCsdFilter(event.target.value)}
                  />
                </label>
                <label className="week-meters-filter">
                  Responsável
                  <input
                    type="search"
                    value={inspectionPendenciasResponsibleFilter}
                    placeholder="Ex.: Felipe"
                    onChange={(event) =>
                      setInspectionPendenciasResponsibleFilter(event.target.value)
                    }
                  />
                </label>
                <label className="week-meters-filter">
                  Etapa
                  <select
                    value={inspectionPendenciasEtapaFilter}
                    onChange={(event) => setInspectionPendenciasEtapaFilter(event.target.value)}
                  >
                    <option value="todos">Todas</option>
                    {inspectionEtapaOptions.map((etapa) => (
                      <option key={etapa} value={etapa}>
                        {etapa}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="week-meters-filter">
                  Escopo
                  <select
                    value={inspectionPendenciasEscopoFilter}
                    onChange={(event) => setInspectionPendenciasEscopoFilter(event.target.value)}
                  >
                    <option value="todos">Todos</option>
                    {inspectionEscopoOptions.map((escopo) => (
                      <option key={escopo} value={escopo}>
                        {escopo}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="week-meters-filter">
                  Pendente
                  <select
                    value={inspectionPendenciasPendingFilter}
                    onChange={(event) =>
                      setInspectionPendenciasPendingFilter(
                        event.target.value as 'todos' | 'toi' | 'csm' | 'toi_csm',
                      )
                    }
                  >
                    <option value="todos">Todos</option>
                    <option value="toi">TOI</option>
                    <option value="csm">CSM</option>
                    <option value="toi_csm">TOI + CSM</option>
                  </select>
                </label>
                {hasActiveInspectionPendenciaFilters ? (
                  <button
                    type="button"
                    className="secondary-button week-meters-clear-filters"
                    onClick={clearInspectionPendenciaFilters}
                  >
                    Limpar filtros
                  </button>
                ) : null}
              </div>
            ) : null}

            {inspectionPendenciasLoading && inspectionPendencias.length === 0 ? (
              <p className="entrada-panel-empty">Carregando pendências...</p>
            ) : inspectionPendencias.length === 0 ? (
              <p className="entrada-panel-empty">
                Todos os medidores agendados têm documento de inspeção anexado.
              </p>
            ) : filteredInspectionPendencias.length === 0 ? (
              <p className="entrada-panel-empty">
                Nenhum medidor encontrado para os filtros informados.
              </p>
            ) : (
              <div className="entrada-table-wrap">
                <table className="data-table entrada-table">
                  <thead>
                    <tr>
                      <th>Medidor</th>
                      <th>Instalação</th>
                      <th>CSD</th>
                      <th>Etapa</th>
                      <th>Data agendada</th>
                      <th>Responsável</th>
                      <th>Escopo</th>
                      <th>Pendente</th>
                      <th>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredInspectionPendencias.map((pendencia) => (
                      <tr key={pendencia.id}>
                        <td>{pendencia.meter}</td>
                        <td>{pendencia.installation}</td>
                        <td>{pendencia.csd}</td>
                        <td>{pendencia.trailStep}</td>
                        <td>{formatDateTime(pendencia.scheduledAt)}</td>
                        <td>
                          <ResponsibleUserCell
                            userId={pendencia.responsibleUserId}
                            name={pendencia.responsibleName}
                            registration={pendencia.responsibleRegistration}
                            onOpenProfile={(userId) => void openUserProfile(userId)}
                          />
                        </td>
                        <td>{formatWorkSubtypeLabel(pendencia.responsibleWorkSubtype)}</td>
                        <td>
                          {[
                            pendencia.missingToi ? 'TOI' : null,
                            pendencia.missingComunicado ? 'CSM' : null,
                          ]
                            .filter(Boolean)
                            .join(' + ')}
                        </td>
                        <td>
                          <input
                            id={`inspection-upload-${pendencia.id}`}
                            type="file"
                            className="file-picker-input"
                            disabled={uploadingInspectionId === pendencia.id}
                            onChange={(event) => {
                              const file = event.target.files?.[0]
                              event.target.value = ''
                              if (file) void handleUploadInspectionDocument(pendencia, file)
                            }}
                          />
                          <label
                            htmlFor={`inspection-upload-${pendencia.id}`}
                            className="file-picker-button"
                          >
                            {uploadingInspectionId === pendencia.id
                              ? 'Enviando...'
                              : 'Anexar documento'}
                          </label>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
        {userProfileModal}
        {meterDetailModal}
      </>
    )
  }

  if (view === 'weekMeters') {
    const meterQuery = weekMetersMeterFilter.replace(/\D/g, '')
    const csdQuery = weekMetersCsdFilter.trim().toLowerCase()
    const demmQuery = weekMetersDemmFilter.replace(/\D/g, '')

    const filteredWeekMeters = weekMeters.filter((item) => {
      if (weekMetersStatusFilter !== 'todos' && item.status !== weekMetersStatusFilter) {
        return false
      }
      if (meterQuery && !item.meter.replace(/\D/g, '').includes(meterQuery)) {
        return false
      }
      if (csdQuery && !(item.csdName ?? '').toLowerCase().includes(csdQuery)) {
        return false
      }
      if (
        demmQuery &&
        !(item.demmDocumentNumber ?? '').replace(/\D/g, '').includes(demmQuery)
      ) {
        return false
      }
      return true
    })

    const hasActiveWeekMeterFilters = Boolean(
      weekMetersStatusFilter !== 'todos' ||
        weekMetersMeterFilter.trim() ||
        weekMetersCsdFilter.trim() ||
        weekMetersDemmFilter.trim(),
    )

    return (
      <>
        <div className="entrada-panel">
          {renderEntradaTabBar()}

          {renderFixedFeedback()}

          <section className="entrada-section" aria-label="Medidores da semana">
            <div className="entrada-section-heading">
              <h3 className="entrada-section-title">Medidores da semana</h3>
              <p className="demm-analysis-summary">
                {weekMetersLoading
                  ? 'Carregando medidores...'
                  : `${filteredWeekMeters.length} de ${weekMeters.length} medidor(es) aguardando entrada`}
              </p>
            </div>

            <div className="week-meters-filters" aria-label="Filtros de medidores da semana">
              <label className="week-meters-filter">
                Medidor
                <input
                  type="search"
                  inputMode="numeric"
                  value={weekMetersMeterFilter}
                  placeholder="Ex.: 12543386"
                  onChange={(event) => setWeekMetersMeterFilter(event.target.value)}
                />
              </label>
              <label className="week-meters-filter">
                CSD
                <input
                  type="search"
                  value={weekMetersCsdFilter}
                  placeholder="Ex.: Taubaté"
                  onChange={(event) => setWeekMetersCsdFilter(event.target.value)}
                />
              </label>
              <label className="week-meters-filter">
                Nº DEMM
                <input
                  type="search"
                  inputMode="numeric"
                  value={weekMetersDemmFilter}
                  placeholder="Ex.: 00051024"
                  onChange={(event) => setWeekMetersDemmFilter(event.target.value)}
                />
              </label>
              <label className="week-meters-filter">
                Status
                <select
                  value={weekMetersStatusFilter}
                  onChange={(event) =>
                    setWeekMetersStatusFilter(event.target.value as 'todos' | WeekMeterStatus)
                  }
                >
                  <option value="todos">Todos</option>
                  <option value="nao_agendado">Não agendado</option>
                  <option value="sem_documento_inspecao">Sem documento de inspeção</option>
                  <option value="bloqueado">Bloqueado</option>
                  <option value="liberado">Liberado</option>
                </select>
              </label>
              {hasActiveWeekMeterFilters ? (
                <button
                  type="button"
                  className="secondary-button week-meters-clear-filters"
                  onClick={() => {
                    setWeekMetersStatusFilter('todos')
                    setWeekMetersMeterFilter('')
                    setWeekMetersCsdFilter('')
                    setWeekMetersDemmFilter('')
                  }}
                >
                  Limpar filtros
                </button>
              ) : null}
            </div>

            {weekMetersLoading && weekMeters.length === 0 ? (
              <p className="entrada-panel-empty">Carregando medidores...</p>
            ) : filteredWeekMeters.length === 0 ? (
              <p className="entrada-panel-empty">
                {weekMeters.length === 0
                  ? 'Nenhum medidor aguardando entrada.'
                  : hasActiveWeekMeterFilters
                    ? 'Nenhum medidor encontrado para os filtros informados.'
                    : 'Nenhum medidor encontrado para esse filtro.'}
              </p>
            ) : (
              <div className="entrada-table-wrap">
                <table className="data-table entrada-table">
                  <thead>
                    <tr>
                      <th>Medidor</th>
                      <th>CSD</th>
                      <th>Nº DEMM</th>
                      <th>Status</th>
                      <th>Data de ensaio</th>
                      <th>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredWeekMeters.map((item) => (
                      <tr key={item.meter}>
                        <td>
                          <MeterLink meter={item.meter} onOpen={openMeterDetail} />
                        </td>
                        <td>{item.csdName ?? '—'}</td>
                        <td>{item.demmDocumentNumber ?? '—'}</td>
                        <td>
                          <span
                            className={`week-meter-status-badge is-${item.status}`}
                            title={item.status === 'bloqueado' ? item.blockReason ?? undefined : undefined}
                          >
                            {weekMeterInspectionLabel(item)}
                          </span>
                        </td>
                        <td>{item.scheduledAtLabel ?? '—'}</td>
                        <td>
                          <div className="week-meter-actions">
                            {item.status === 'nao_agendado' && !readOnly ? (
                              <button
                                type="button"
                                className="secondary-button"
                                onClick={() => setQuickScheduleMeter(item)}
                              >
                                Agendar
                              </button>
                            ) : null}
                            {(item.status === 'sem_documento_inspecao' ||
                              item.status === 'bloqueado') &&
                            item.scheduleId ? (
                              <>
                                <input
                                  id={`week-meter-inspection-${item.scheduleId}`}
                                  type="file"
                                  accept="application/pdf,.pdf"
                                  className="file-picker-input"
                                  disabled={uploadingInspectionId === item.scheduleId}
                                  onChange={(event) => {
                                    const file = event.target.files?.[0]
                                    event.target.value = ''
                                    if (file && item.scheduleId) {
                                      void handleUploadInspectionDocument(
                                        { id: item.scheduleId, meter: item.meter },
                                        file,
                                      )
                                    }
                                  }}
                                />
                                <label
                                  htmlFor={`week-meter-inspection-${item.scheduleId}`}
                                  className="file-picker-button"
                                >
                                  {uploadingInspectionId === item.scheduleId
                                    ? 'Enviando...'
                                    : item.status === 'bloqueado'
                                      ? 'Reenviar documento'
                                      : 'Importar documento'}
                                </label>
                              </>
                            ) : null}
                            {item.status === 'liberado' ? (
                              <>
                                <button
                                  type="button"
                                  className="primary-button"
                                  disabled={readOnly || receivingMeter === item.meter}
                                  onClick={() => void handleReceiveWeekMeter(item)}
                                >
                                  {receivingMeter === item.meter ? 'Recebendo...' : 'Receber'}
                                </button>
                                {isAdmin && !readOnly ? (
                                  <button
                                    type="button"
                                    className="secondary-button"
                                    disabled={submittingPassiveReceive}
                                    onClick={() => setPassiveReceiveMeter(item)}
                                  >
                                    Receber passivo
                                  </button>
                                ) : null}
                              </>
                            ) : null}
                            {item.scheduleId && item.status !== 'nao_agendado' ? (
                              <button
                                type="button"
                                className="secondary-button"
                                onClick={() =>
                                  setInspectionDocumentTarget({
                                    meter: item.meter,
                                    scheduleId: item.scheduleId!,
                                  })
                                }
                              >
                                Ver documento
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        {quickScheduleMeter ? (
          <QuickScheduleModal
            meter={quickScheduleMeter}
            submitting={submittingQuickSchedule}
            feedback={quickScheduleFeedback}
            onClose={closeQuickSchedule}
            onSubmit={(payload) => void handleQuickScheduleSubmit(payload)}
          />
        ) : null}
        {passiveReceiveMeter ? (
          <PassiveReceiveModal
            meter={passiveReceiveMeter}
            submitting={submittingPassiveReceive}
            feedback={passiveReceiveFeedback}
            onClose={closePassiveReceive}
            onSubmit={(payload) => void handlePassiveReceiveSubmit(payload)}
          />
        ) : null}
        {inspectionDocumentTarget ? (
          <InspectionDocumentAnalysisModal
            meter={inspectionDocumentTarget.meter}
            scheduleId={inspectionDocumentTarget.scheduleId}
            onClose={() => setInspectionDocumentTarget(null)}
            onDocumentsChanged={() => {
              void loadInspectionPendencias()
              void loadWpaMeters()
              void loadWeekMeters()
              void loadData()
              void loadDateAdjustmentsCount()
              refreshTrailCounts()
            }}
          />
        ) : null}
        {userProfileModal}
        {meterDetailModal}
      </>
    )
  }

  if (view === 'demmHistorico') {
    return (
      <>
        <div className="entrada-panel">
          {renderEntradaTabBar()}

          {renderFixedFeedback()}

          <section className="entrada-section" aria-label="Histórico de DEMM por CSD">
            <div className="entrada-section-heading">
              <h3 className="entrada-section-title">Histórico de DEMM por CSD</h3>
              <p className="demm-analysis-summary">
                {demmHistoricoLoading
                  ? 'Carregando histórico...'
                  : `Últimas ${demmHistoricoWeeks.length} semanas · segunda a sexta`}
              </p>
            </div>

            {demmHistoricoLoading ? (
              <p className="entrada-panel-empty">Carregando histórico...</p>
            ) : demmHistoricoCsds.length === 0 ? (
              <p className="entrada-panel-empty">Nenhum CSD cadastrado.</p>
            ) : (
              <div className="entrada-table-wrap">
                <table className="data-table entrada-table">
                  <thead>
                    <tr>
                      <th>CSD</th>
                      <th>Responsável</th>
                      {demmHistoricoWeeks.map((week) => (
                        <th key={week.weekStart} title={`Semana de ${formatWeekLabel(week.weekStart)} a ${formatWeekLabel(week.weekDeadline)}`}>
                          {formatWeekLabel(week.weekDeadline)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {demmHistoricoCsds.map((csd) => (
                      <tr key={csd.id}>
                        <td>{csd.name}</td>
                        <td>
                          <ResponsibleUserCell
                            userId={csd.responsibleUserId}
                            name={csd.responsibleName}
                            registration={csd.responsibleRegistration}
                            onOpenProfile={(userId) => void openUserProfile(userId)}
                          />
                        </td>
                        {csd.weeks.map((week) => (
                          <td key={week.weekStart} className="demm-status-cell">
                            {!readOnly && week.status === 'nao_entregue' ? (
                              <button
                                type="button"
                                className="demm-status-clickable"
                                onClick={() => openDemmModal(csd.id, week.weekStart)}
                                aria-label={`Importar DEMM retroativa de ${csd.name} na semana de ${formatWeekLabel(week.weekStart)}`}
                                title="Importar DEMM retroativa"
                              >
                                <DemmStatusIcon status={week.status} />
                              </button>
                            ) : (
                              <DemmStatusIcon status={week.status} />
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        {demmModal}

        {userProfileModal}
        {meterDetailModal}

        {analysisModal ? (
          <DemmAnalysisModal
            title={analysisModal.title}
            fileName={analysisModal.fileName}
            details={analysisModal.details}
            meters={analysisModal.meters}
            loading={analysisModal.loading}
            showSources={analysisModal.showSources}
            onOpenMeter={openMeterDetail}
            onClose={() => setAnalysisModal(null)}
          />
        ) : null}
      </>
    )
  }

  return (
    <>
      <div className="entrada-panel">
        {renderEntradaTabBar()}

        {renderFixedFeedback()}

        {view === 'demmEntrada'
          ? renderDemmDocumentsSection(receivedDemmDocuments, {
              title: 'DEMMs com entrada',
              emptyMessage: 'Nenhuma DEMM com todos os medidores já dados entrada.',
              countHeader: 'Com entrada',
              countSummary: 'com entrada',
              countValue: (document) => document.entryGivenCount ?? 0,
            })
          : renderDemmDocumentsSection(pendingDemmDocuments, {
              title: 'DEMMs cadastradas',
              emptyMessage:
                demmDocuments.length > 0
                  ? 'Todas as DEMMs cadastradas já tiveram entrada. Veja a aba DEMMs com entrada.'
                  : 'Nenhuma DEMM cadastrada.',
              countHeader: 'Agendados',
              countSummary: 'agendado(s)',
              countValue: (document) => document.scheduledCount,
            })}
      </div>

      {demmModal}

      {userProfileModal}
      {meterDetailModal}

      {analysisModal ? (
        <DemmAnalysisModal
          title={analysisModal.title}
          fileName={analysisModal.fileName}
          details={analysisModal.details}
          meters={analysisModal.meters}
          loading={analysisModal.loading}
          showSources={analysisModal.showSources}
          onOpenMeter={openMeterDetail}
          onClose={() => setAnalysisModal(null)}
        />
      ) : null}
    </>
  )
}
