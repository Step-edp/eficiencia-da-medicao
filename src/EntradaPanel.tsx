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
  type MeterInspectionPendenciaRecord,
  type WeekMeterRecord,
  type WeekMeterStatus,
} from './api'
import { ENTRADA_TRAIL_STEP } from './labTrailSteps'
import { useCsdsOptions } from './useCsdsOptions'
import { readFileAsBase64 } from './fileUtils'
import { UserDetailModal } from './UserDetailModal'
import { EntradaCsdDashboard } from './EntradaCsdDashboard'
import { MeterDetailModal } from './MeterDetailModal'
import { InspectionDocumentAnalysisModal } from './InspectionDocumentAnalysisModal'

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

function weekMeterStatusLabel(status: WeekMeterStatus) {
  switch (status) {
    case 'nao_agendado':
      return 'Não agendado'
    case 'sem_documento_inspecao':
      return 'Sem documento de inspeção'
    case 'bloqueado':
      return 'Bloqueado'
    case 'liberado':
      return 'Liberado'
    default:
      return status
  }
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

type DemmAnalysisModalProps = {
  title: string
  fileName?: string
  meters: DemmMeterAnalysisRecord[]
  loading?: boolean
  showSources?: boolean
  onOpenMeter?: (meter: string) => void
  onClose: () => void
}

function DemmAnalysisModal({
  title,
  fileName,
  meters,
  loading = false,
  showSources = false,
  onOpenMeter,
  onClose,
}: DemmAnalysisModalProps) {
  const scheduledCount = meters.filter((item) => item.scheduled).length

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
        <p className="demm-analysis-summary">
          {loading
            ? 'Carregando medidores...'
            : `${meters.length} medidor(es) · ${scheduledCount} agendado(s) no aplicativo`}
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
  }) => void
}

function QuickScheduleModal({
  meter,
  submitting,
  feedback,
  onClose,
  onSubmit,
}: QuickScheduleModalProps) {
  const [csmDate, setCsmDate] = useState('')
  const [csmTime, setCsmTime] = useState('00:00')
  const [installation, setInstallation] = useState('')
  const [toi, setToi] = useState('')
  const [note, setNote] = useState('')
  const [schedulingNotes, setSchedulingNotes] = useState('')

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!csmDate) return
    const scheduledAt = new Date(`${csmDate}T${csmTime}:00`).toISOString()
    onSubmit({
      scheduledAt,
      installation,
      toi,
      note,
      schedulingNotes,
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
    | 'metersBase'
    | 'csdPendencias'
    | 'inspectionPendencias'
    | 'weekMeters'
    | 'demmHistorico'
  >('dash')
  const [demmDocuments, setDemmDocuments] = useState<DemmDocumentRecord[]>([])
  const [schedules, setSchedules] = useState<Awaited<ReturnType<typeof api.listMeterSchedules>>['schedules']>([])
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
  const [inspectionPendenciasLoading, setInspectionPendenciasLoading] = useState(false)
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
      const [demmResponse, scheduleResponse] = await Promise.all([
        api.listDemmDocuments(),
        api.listMeterSchedules(ENTRADA_TRAIL_STEP),
      ])
      setDemmDocuments(demmResponse.documents)
      setSchedules(scheduleResponse.schedules)
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

  const openDemmAnalysis = async (demmId: string, fileName?: string) => {
    setAnalysisModal({
      title: 'Medidores da DEMM',
      fileName,
      meters: [],
      loading: true,
      showSources: false,
    })

    try {
      const response = await api.getDemmDocumentAnalysis(demmId)
      setAnalysisModal({
        title: 'Medidores da DEMM',
        fileName: response.fileName,
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

  const openMetersBase = () => {
    setView('metersBase')
    setFeedback(null)
    void loadData()
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

  const openInspectionPendencias = () => {
    setView('inspectionPendencias')
    setFeedback(null)
    void loadInspectionPendencias()
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

      void loadInspectionPendencias()
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

  const openDash = () => {
    setView('dash')
    setFeedback(null)
    void Promise.all([
      loadData(),
      loadCsdPendencias(),
      loadInspectionPendencias(),
      loadWeekMeters(),
    ])
  }

  useEffect(() => {
    void loadData()
    void loadCsdPendencias()
    void loadInspectionPendencias()
    void loadWeekMeters()
  }, [loadData, loadCsdPendencias, loadInspectionPendencias, loadWeekMeters])

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
          aria-selected={view === 'metersBase'}
          className={view === 'metersBase' ? 'active' : ''}
          onClick={() => openMetersBase()}
        >
          Ver base de medidores
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
      })

      setWeekMeters((prev) =>
        prev.map((item) =>
          item.meter === quickScheduleMeter.meter
            ? {
                ...item,
                status: 'sem_documento_inspecao',
                scheduleId: schedule.id,
                scheduledAtLabel: schedule.scheduledAtLabel,
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

  const totalDemmMeters = demmDocuments.reduce((sum, document) => sum + document.meterCount, 0)
  const totalDemmScheduled = demmDocuments.reduce(
    (sum, document) => sum + document.scheduledCount,
    0,
  )

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

  if (view === 'dash') {
    return (
      <>
        <div className="entrada-panel">
          {renderEntradaTabBar()}

          {feedback ? (
            <div className={`login-feedback ${feedback.type}`} role="status">
              {feedback.message}
            </div>
          ) : null}

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
    return (
      <>
        <div className="entrada-panel">
          {renderEntradaTabBar()}

          {feedback ? (
            <div className={`login-feedback ${feedback.type}`} role="status">
              {feedback.message}
            </div>
          ) : null}

          <section className="entrada-section" aria-label="Medidores agendados">
            <div className="entrada-section-heading">
              <h3 className="entrada-section-title">Medidores agendados</h3>
              <p className="demm-analysis-summary">
                {loading && schedules.length === 0
                  ? 'Carregando medidores...'
                  : `${schedules.length} medidor(es) aguardando entrada`}
              </p>
            </div>

            {loading && schedules.length === 0 ? (
              <p className="entrada-panel-empty">Carregando medidores...</p>
            ) : schedules.length === 0 ? (
              <p className="entrada-panel-empty">
                Nenhum medidor agendado aguardando entrada.
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
                      <th>Cliente presente</th>
                      <th>Data agendada</th>
                      <th>Prazo entrega</th>
                      <th>Status entrega</th>
                      <th>Agendado por</th>
                      <th>Registrado em</th>
                    </tr>
                  </thead>
                  <tbody>
                    {schedules.map((schedule) => (
                      <tr
                        key={schedule.id}
                        className={schedule.isLate ? 'schedule-row-late' : undefined}
                      >
                        <td>
                          <MeterLink meter={schedule.meter} onOpen={openMeterDetail} />
                        </td>
                        <td>{schedule.installation}</td>
                        <td>{schedule.toi}</td>
                        <td>{schedule.note}</td>
                        <td>{schedule.csd}</td>
                        <td>{schedule.clientPresent === 'sim' ? 'Sim' : 'Não'}</td>
                        <td>{schedule.scheduledAtLabel}</td>
                        <td>{schedule.deliveryDeadlineLabel || '—'}</td>
                        <td>
                          {schedule.isLate ? (
                            <span className="schedule-late-badge">Atrasado</span>
                          ) : (
                            <span className="schedule-ok-badge">No prazo</span>
                          )}
                        </td>
                        <td>{schedule.createdByRegistration ?? '—'}</td>
                        <td>{formatDateTime(schedule.createdAt)}</td>
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

  if (view === 'csdPendencias') {
    const pendingCsds = csdPendencias.filter((csd) => csd.status !== 'entregue')

    return (
      <>
        <div className="entrada-panel">
          {renderEntradaTabBar()}

          {feedback ? (
            <div className={`login-feedback ${feedback.type}`} role="status">
              {feedback.message}
            </div>
          ) : null}

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
    return (
      <>
        <div className="entrada-panel">
          {renderEntradaTabBar()}

          {feedback ? (
            <div className={`login-feedback ${feedback.type}`} role="status">
              {feedback.message}
            </div>
          ) : null}

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
                  : `${inspectionPendencias.length} medidor(es) sem documento anexado`}
              </p>
            </div>

            {inspectionPendenciasLoading && inspectionPendencias.length === 0 ? (
              <p className="entrada-panel-empty">Carregando pendências...</p>
            ) : inspectionPendencias.length === 0 ? (
              <p className="entrada-panel-empty">
                Todos os medidores agendados têm documento de inspeção anexado.
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
                    {inspectionPendencias.map((pendencia) => (
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

          {feedback ? (
            <div className={`login-feedback ${feedback.type}`} role="status">
              {feedback.message}
            </div>
          ) : null}

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
                            {weekMeterStatusLabel(item.status)}
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

          {feedback ? (
            <div className={`login-feedback ${feedback.type}`} role="status">
              {feedback.message}
            </div>
          ) : null}

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

        {feedback ? (
          <div className={`login-feedback ${feedback.type}`} role="status">
            {feedback.message}
          </div>
        ) : null}

        <section className="entrada-section">
          <div className="entrada-section-heading">
            <h3 className="entrada-section-title">DEMMs cadastradas</h3>
            {demmDocuments.length > 0 ? (
              <span className="entrada-section-total">
                Total: {totalDemmMeters} medidor(es)
                {totalDemmScheduled > 0 ? ` · ${totalDemmScheduled} agendado(s)` : ''}
              </span>
            ) : null}
          </div>
          {loading && demmDocuments.length === 0 ? (
            <p className="entrada-panel-empty">Carregando DEMMs...</p>
          ) : demmDocuments.length === 0 ? (
            <p className="entrada-panel-empty">Nenhuma DEMM cadastrada.</p>
          ) : (
            <div className="entrada-table-wrap">
              <table className="data-table entrada-table">
                <thead>
                  <tr>
                    <th>Nº documento</th>
                    <th>CSD</th>
                    <th>Data emissão</th>
                    <th>Arquivo</th>
                    <th>Medidores</th>
                    <th>Agendados</th>
                    <th>Status</th>
                    <th>Cadastrado por</th>
                    <th>Cadastrado em</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {demmDocuments.map((document) => (
                    <tr
                      key={document.id}
                      className={document.bulkEntryReady ? 'demm-row-bulk-ready' : undefined}
                    >
                      <td>{document.documentNumber ?? '—'}</td>
                      <td>{document.csdName ?? '—'}</td>
                      <td>{document.emissionDate ?? '—'}</td>
                      <td>{document.fileName}</td>
                      <td>{document.meterCount}</td>
                      <td>{document.scheduledCount}</td>
                      <td>
                        {document.bulkEntryReady ? (
                          <span className="demm-bulk-ready-badge">
                            DEMM liberada para entrada em massa
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td>{document.createdByRegistration ?? '—'}</td>
                      <td>{formatDateTime(document.createdAt)}</td>
                      <td>
                        <div className="entrada-demm-actions">
                          <a
                            className="entrada-demm-link"
                            href={api.getDemmDocumentFileUrl(document.id)}
                            target="_blank"
                            rel="noreferrer"
                          >
                            PDF
                          </a>
                          <button
                            type="button"
                            className="secondary-button entrada-demm-meters-button"
                            onClick={() => void openDemmAnalysis(document.id, document.fileName)}
                          >
                            Medidores
                            {document.meterCount > 0 ? ` (${document.meterCount})` : ''}
                          </button>
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
                    <td colSpan={4}>Total</td>
                    <td>{totalDemmMeters}</td>
                    <td>{totalDemmScheduled}</td>
                    <td colSpan={4} />
                  </tr>
                </tfoot>
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
