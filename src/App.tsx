import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { EdpLogo } from './EdpLogo'
import { ScheduleAgendarForm } from './ScheduleAgendarForm'
import { FieldTeamCadastrarForm } from './FieldTeamCadastrarForm'
import { FieldTeamConsultarPanel } from './FieldTeamConsultarPanel'
import { EnsaiarForm } from './EnsaiarForm'
import { CadastrosPanel } from './CadastrosPanel'
import { UserDetailModal } from './UserDetailModal'
import { UsersDashboard } from './UsersDashboard'
import { GestaoDashboard, CellResponsibleEditor, CreateOrgAreaForm, AreaLeadershipEditor, GestaoPessoasPanel } from './GestaoDashboard'
import { AgendaPanel } from './AgendaPanel'
import {
  ADMIN_PREVIEW_PROFILE_ID,
  CADASTRO_PROFILES,
  getCadastroProfile,
  getHomeAreasForProfilePreview,
  getHomeAreasForUser,
  getAccessiblePortals,
  isFieldTeamCsdScope,
  isLavraturaBackofficeScope,
  isLavraturaEquipeCampoScope,
  isLavraturaPontoFocalScope,
  isMedicaoEstagiario,
  skipsVacationAgenda,
  listUsersForCadastroProfile,
  PORTAL_AREAS,
} from './profilesAccess'
import { ConsultarRatmPanel } from './ratm/ConsultarRatmPanel'
import { RatmAprovacaoPanel } from './ratm/RatmAprovacaoPanel'
import { SatisfactionSurveyPage } from './ratm/SatisfactionSurveyPage'
import { mapRatmLaudoFromApi, type RatmLaudo } from './ratm/laudos'
import type { RatmFormData } from './ratm/types'
import { LabMeasurementTrail } from './LabMeasurementTrail'
import { EnsaiosCalendar } from './EnsaiosCalendar'
import { CsdsPanel } from './CsdsPanel'
import { CriarModeloPanel } from './CriarModeloPanel'
import { ApresentacaoPanel } from './ApresentacaoPanel'
import { GalleryPanel } from './GalleryPanel'
import { SupportRequestModal } from './SupportRequestModal'
import { SupportPanel } from './SupportPanel'
import { LoginFeedback } from './LoginFeedback'
import { AuditPanel } from './AuditPanel'
import { EntradaPanel } from './EntradaPanel'
import { ENTRADA_TRAIL_STEP, getLabTrailLabel, HOMOLOGATION_TRAIL_STEPS, LAB_TRAIL_KEYS } from './labTrailSteps'
import {
  api,
  ApiError,
  type AppUser,
  type HomologationRequest,
  type MaterialRecord,
  type PasswordRecord,
  type PasswordType,
} from './api'
import {
  buildRequestedProfile,
  DEFAULT_AREA_OPTIONS,
  DEFAULT_LOCALITIES,
  EDP_SCOPE_OPTIONS,
  encodeAccessProcess,
  ENGINEER_HOME_SUBAREAS,
  getHomeSubareaProcessGroups,
  isEngineerProcessSubtype,
  isEngineerSubcellSubtype,
  isEngineerAreaSubtype,
  mapTakenSubcellAreas,
  subtypesForCargo,
  TECHNICIAN_SCOPES_BY_AREA,
} from './registrationOptions'
import {
  buildOrgCellsFromRecords,
  DEFAULT_ORG_AREA_LEADERSHIP,
  getOrgCell,
  leadershipPendingReason,
  ORG_STRUCTURE,
  type OrgAreaLeadership,
} from './orgStructure'
import {
  clearHomeNavState,
  loadHomeNavState,
  saveHomeNavState,
  type GestaoHomeTab,
  type UsersViewTab,
} from './homeNavState'

const FIXED_PURCHASE_REQUEST_HASH = '#/compras/pedidos-homologacao'

const THIRD_PARTY_COMPANIES = ['BMB', 'ROTARY', 'TIVIT'] as const

const AREA_OPTIONS = [...DEFAULT_AREA_OPTIONS] as const

type Panel = 'login' | 'cadastro'
type AppRoute = 'default' | 'compras-homologacao' | 'pesquisa-satisfacao'

function parseAppRoute(hash: string): { route: AppRoute; surveyLaudoId?: string } {
  if (hash === FIXED_PURCHASE_REQUEST_HASH) {
    return { route: 'compras-homologacao' }
  }

  const surveyMatch = hash.match(/^#\/pesquisa\/([^/?#]+)/)
  if (surveyMatch?.[1]) {
    return { route: 'pesquisa-satisfacao', surveyLaudoId: surveyMatch[1] }
  }

  return { route: 'default' }
}

function getRouteFromHash(hash: string): AppRoute {
  return parseAppRoute(hash).route
}

function extractSsoTokenFromHash(hash: string): string | null {
  const match = hash.match(/(?:^#|[#&])sso=([^&]+)/)
  return match?.[1] ? decodeURIComponent(match[1]) : null
}

export default function App() {
  const [activePanel, setActivePanel] = useState<Panel>('login')
  const [activeRoute, setActiveRoute] = useState<AppRoute>(() =>
    getRouteFromHash(window.location.hash),
  )
  const [surveyLaudoId, setSurveyLaudoId] = useState<string | undefined>(() =>
    parseAppRoute(window.location.hash).surveyLaudoId,
  )
  const [bootstrapping, setBootstrapping] = useState(true)
  const [registeredUsers, setRegisteredUsers] = useState<AppUser[]>([])
  const [authenticatedUser, setAuthenticatedUser] = useState<AppUser | null>(null)
  const [homologationRequests, setHomologationRequests] = useState<HomologationRequest[]>([])
  const [authBannerFeedback, setAuthBannerFeedback] = useState<{
    type: 'success' | 'error'
    message: string
  } | null>(null)

  const loadAdminData = useCallback(async () => {
    const [usersResponse, requestsResponse] = await Promise.all([
      api.listUsers(),
      api.listHomologationRequests(),
    ])
    setRegisteredUsers(usersResponse.users)
    setHomologationRequests(requestsResponse.requests)
  }, [])

  useEffect(() => {
    const handleHashChange = () => {
      const parsedRoute = parseAppRoute(window.location.hash)
      setActiveRoute(parsedRoute.route)
      setSurveyLaudoId(parsedRoute.surveyLaudoId)
    }

    handleHashChange()
    window.addEventListener('hashchange', handleHashChange)

    return () => {
      window.removeEventListener('hashchange', handleHashChange)
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    async function bootstrap() {
      try {
        const ssoToken = extractSsoTokenFromHash(window.location.hash)
        if (ssoToken) {
          await api.exchangeSsoToken(ssoToken)
          window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`)
        }

        const { user } = await api.me()
        if (cancelled) {
          return
        }
        setAuthenticatedUser(user)
        if (user.role === 'admin') {
          await loadAdminData()
        }
      } catch {
        if (!cancelled) {
          setAuthenticatedUser(null)
        }
      } finally {
        if (!cancelled) {
          setBootstrapping(false)
        }
      }
    }

    bootstrap()

    return () => {
      cancelled = true
    }
  }, [loadAdminData])

  const fixedRequestLink = `${window.location.origin}${window.location.pathname}${FIXED_PURCHASE_REQUEST_HASH}`

  const handleRegisterUser = async (payload: {
    name: string
    registration: string
    birthDate: string
    email: string
    jobTitle: string
    cpf: string
    password: string
    personalDescription: string
    hobby: string
    whatsapp: string
    employmentType: string
    thirdPartyCompany: string
    workArea: string
    workSubtype: string
    locality: string
    edpUnit: string
    profilePhoto: string
  }) => {
    await api.register(payload)
  }

  const handleApproveUser = async (userId: string, payload?: ApproveUserPayload) => {
    const { user } = await api.approveUser(userId, payload)
    setRegisteredUsers((prev) => prev.map((item) => (item.id === user.id ? user : item)))
  }

  const handleRejectUser = async (userId: string, reason: string) => {
    const result = await api.rejectUser(userId, { reason })
    setRegisteredUsers((prev) => prev.filter((item) => item.id !== userId))
    return result
  }

  const handleCreateHomologationRequest = async (
    payload: Omit<
      HomologationRequest,
      | 'id'
      | 'requesterUserId'
      | 'requesterName'
      | 'requesterRegistration'
      | 'requesterEmail'
      | 'requesterArea'
      | 'requestedAt'
      | 'status'
    >,
  ) => {
    const { request } = await api.createHomologationRequest(payload)
    setHomologationRequests((prev) => [request, ...prev])
  }

  const handleLogout = async () => {
    try {
      await api.logout()
    } finally {
      clearHomeNavState()
      setAuthenticatedUser(null)
      setRegisteredUsers([])
      setHomologationRequests([])
    }
  }

  if (bootstrapping && activeRoute !== 'pesquisa-satisfacao') {
    return (
      <main className="shell">
        <section className="home-card">
          <p>Carregando portal...</p>
        </section>
      </main>
    )
  }

  if (activeRoute === 'pesquisa-satisfacao' && surveyLaudoId) {
    return <SatisfactionSurveyPage laudoId={surveyLaudoId} />
  }

  if (bootstrapping) {
    return (
      <main className="shell">
        <section className="home-card">
          <p>Carregando portal...</p>
        </section>
      </main>
    )
  }

  if (authenticatedUser) {
    return (
      <HomePanel
        currentUser={authenticatedUser}
        activeRoute={activeRoute}
        fixedRequestLink={fixedRequestLink}
        users={registeredUsers}
        homologationRequests={homologationRequests}
        onApproveUser={handleApproveUser}
        onRejectUser={handleRejectUser}
        onUpdateUser={(user) => {
          setRegisteredUsers((prev) => prev.map((item) => (item.id === user.id ? user : item)))
        }}
        onDeleteUser={(userId) => {
          setRegisteredUsers((prev) => prev.filter((item) => item.id !== userId))
        }}
        onCurrentUserChange={setAuthenticatedUser}
        onCreateHomologationRequest={handleCreateHomologationRequest}
        onLogout={handleLogout}
      />
    )
  }

  return (
    <main className="shell">
      <section className="hero-card">
        <div className="brand-column">
          <EdpLogo />
          <div>
            <p className="eyebrow">Eficiência da Medição</p>
            <h1>Changing tomorrow now</h1>
          </div>

          <div className="panel-switch" role="tablist" aria-label="Autenticação">
            <button
              className={activePanel === 'login' ? 'active' : ''}
              onClick={() => setActivePanel('login')}
              type="button"
            >
              Login
            </button>
            <button
              className={activePanel === 'cadastro' ? 'active' : ''}
              onClick={() => setActivePanel('cadastro')}
              type="button"
            >
              Cadastrar
            </button>
          </div>
        </div>

        <div className="panel-column">
          {activePanel === 'login' ? (
            <LoginPanel
              bannerFeedback={authBannerFeedback}
              onLoginSuccess={(user) => {
                setAuthBannerFeedback(null)
                setAuthenticatedUser(user)
                if (user.role === 'admin') {
                  void loadAdminData()
                }
              }}
            />
          ) : (
            <RegisterPanel
              activeRoute={activeRoute}
              onRegister={handleRegisterUser}
              onRegistered={(message) => {
                setAuthBannerFeedback({
                  type: 'success',
                  message:
                    message ||
                    'Cadastro enviado para aprovação. Aguarde a liberação do ADM para entrar.',
                })
                setActivePanel('login')
              }}
            />
          )}
        </div>
      </section>
    </main>
  )
}

type LoginPanelProps = {
  onLoginSuccess: (user: AppUser) => void
  bannerFeedback?: { type: 'success' | 'error'; message: string } | null
}

type PasswordInputProps = {
  id?: string
  label: string
  value: string
  placeholder?: string
  autoComplete?: string
  required?: boolean
  onChange: (value: string) => void
}

function PasswordInput({
  id,
  label,
  value,
  placeholder,
  autoComplete,
  required = false,
  onChange,
}: PasswordInputProps) {
  const [visible, setVisible] = useState(false)

  return (
    <label className="password-field" htmlFor={id}>
      {required ? (
        <span className="required-label">
          <span className="required-mark" aria-hidden="true">
            *
          </span>
          {label}
        </span>
      ) : (
        label
      )}
      <div className="password-input-wrap">
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          placeholder={placeholder}
          value={value}
          autoComplete={autoComplete}
          required={required}
          onChange={(event) => onChange(event.target.value)}
        />
        <button
          type="button"
          className="password-visibility-toggle"
          onClick={() => setVisible((current) => !current)}
          aria-label={visible ? 'Ocultar senha' : 'Mostrar senha'}
          title={visible ? 'Ocultar senha' : 'Mostrar senha'}
        >
          {visible ? (
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M3 3l18 18M10.6 10.6A3 3 0 0012 15a3 3 0 002.4-4.8M9.9 5.1A10.5 10.5 0 0121 12c-1 1.7-2.3 3.1-3.8 4.1M6.1 6.1C4.5 7.3 3.2 8.9 2.1 12c2.2 3.8 5.7 6 9.9 6 1.2 0 2.3-.2 3.4-.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              />
              <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="2" />
            </svg>
          )}
        </button>
      </div>
    </label>
  )
}

function LoginPanel({ onLoginSuccess, bannerFeedback = null }: LoginPanelProps) {
  const [registration, setRegistration] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error'
    message: string
  } | null>(bannerFeedback)

  useEffect(() => {
    if (bannerFeedback) {
      setFeedback(bannerFeedback)
    }
  }, [bannerFeedback])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmitting(true)
    setFeedback(null)

    try {
      const { user } = await api.login(registration, password)
      onLoginSuccess(user)
    } catch (error) {
      setFeedback({
        type: 'error',
        message:
          error instanceof ApiError
            ? error.message
            : 'Não foi possível entrar. Tente novamente.',
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="auth-panel">
      {feedback ? (
        <LoginFeedback
          type={feedback.type}
          message={feedback.message}
          onClose={() => setFeedback(null)}
        />
      ) : null}

      <form className="form-grid" onSubmit={handleSubmit}>
        <label>
          Matrícula
          <input
            type="text"
            placeholder="Digite sua matrícula"
            value={registration}
            onChange={(event) => setRegistration(event.target.value)}
          />
        </label>

        <PasswordInput
          id="login-password"
          label="Senha"
          placeholder="Digite sua senha"
          autoComplete="current-password"
          value={password}
          onChange={setPassword}
        />

        <button className="primary-button login-enter-button" type="submit" disabled={submitting}>
          {submitting ? 'Entrando...' : 'Entrar'}
        </button>
      </form>
    </section>
  )
}

type HomePanelProps = {
  currentUser: AppUser
  activeRoute: AppRoute
  fixedRequestLink: string
  users: AppUser[]
  homologationRequests: HomologationRequest[]
  onApproveUser: (userId: string, payload?: ApproveUserPayload) => Promise<void>
  onRejectUser: (userId: string, reason: string) => Promise<{ emailSent?: boolean; warning?: string }>
  onUpdateUser: (user: AppUser) => void
  onDeleteUser: (userId: string) => void
  onCurrentUserChange: (user: AppUser) => void
  onCreateHomologationRequest: (
    payload: Omit<
      HomologationRequest,
      | 'id'
      | 'requesterUserId'
      | 'requesterName'
      | 'requesterRegistration'
      | 'requesterEmail'
      | 'requesterArea'
      | 'requestedAt'
      | 'status'
    >,
  ) => Promise<void>
  onLogout: () => Promise<void>
}

type Area = {
  title: string
  description: string
  details: string
}

type PasswordTypeSelection = PasswordType | ''

type MaterialCatalogItem = {
  equipmentType: string
  code: string
  description: string
}

const defaultMaterialTypes = ['17000001', '17000002']

type GeneratedPasswordResult = {
  meter: string
  password: string
  status: 'generated' | 'duplicate'
  createdAt: string
}

type TopActionBarProps = {
  onBack?: () => void
  onHome?: () => void
  onLogout: () => void
}

function TopActionBar({ onBack, onHome, onLogout }: TopActionBarProps) {
  return (
    <div className="top-action-bar" aria-label="Acoes da tela">
      <EdpLogo className="top-brand-logo" compact />
      <div className="top-action-group left">
        {onBack ? (
          <button
            className="icon-button"
            type="button"
            onClick={onBack}
            aria-label="Voltar"
            title="Voltar"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M15 5l-7 7 7 7"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        ) : null}
      </div>
      <div className="top-action-group right">
        {onHome ? (
          <button
            className="icon-button"
            type="button"
            onClick={onHome}
            aria-label="Voltar para Home"
            title="Voltar para Home"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M3 10.5L12 3l9 7.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M6 9.5V21h12V9.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        ) : null}
        <button
          className="icon-button"
          type="button"
          onClick={onLogout}
          aria-label="Sair"
          title="Sair"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M10 17l5-5-5-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M15 12H3"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M21 21V3h-6"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
    </div>
  )
}

function ItemIcon({ title }: { title: string }) {
  const iconByTitle: Record<string, 'chart' | 'flask' | 'calendar' | 'search' | 'inbox' | 'cube' | 'check' | 'image' | 'bolt' | 'ruler' | 'smile' | 'shield' | 'archive' | 'trash' | 'presentation' | 'truck' | 'book' | 'code' | 'lock' | 'key' | 'database' | 'repeat' | 'building' | 'layer' | 'monitor' | 'star' | 'users' | 'headset'> = {
    Dashboard: 'chart',
    Ensaiar: 'flask',
    Agendar: 'calendar',
    'Consultar RATM': 'search',
    'Calendário de ensaios': 'calendar',
    'Entrada de medidores': 'inbox',
    'Criar Modelo': 'cube',
    'Aprovação de RATM': 'check',
    Galeria: 'image',
    'Analisadores de Tensão': 'bolt',
    'Aferição de Padrões BT': 'ruler',
    'Grandes Clientes': 'building',
    'Padrões': 'ruler',
    'Pesquisa de satisfação': 'smile',
    Auditoria: 'shield',
    Inventário: 'archive',
    Sucata: 'trash',
    Apresentação: 'presentation',
    Fornecedores: 'truck',
    CSDs: 'building',
    Suporte: 'headset',
    Treinamentos: 'book',
    Softwares: 'code',
    'Faturamento de clientes livres': 'chart',
    'Faturamento de clientes cativos': 'chart',
    'Faturamento de consumo próprio': 'chart',
    'Memória de massa': 'database',
    'Medidas inconsistentes': 'search',
    Migração: 'repeat',
    Arcesp: 'building',
    Pirâmide: 'layer',
    Capex: 'chart',
    'Geração de senha': 'lock',
    'Geração de número de série': 'key',
    'Sap Hana': 'monitor',
    Ensaio: 'flask',
    'Pedidos de Homologação': 'archive',
    'Código de materiais': 'code',
    Homologações: 'check',
    'Equipe de campo': 'truck',
    Usuários: 'users',
    Cadastros: 'archive',
    Agenda: 'calendar',
    Consultar: 'search',
    'Meus TOIs': 'inbox',
  }

  const icon = iconByTitle[title] ?? 'star'

  return (
    <span className="item-icon" aria-hidden="true">
      <svg viewBox="0 0 24 24">
        {icon === 'chart' ? (
          <>
            <path d="M5 19V5" fill="none" stroke="currentColor" strokeWidth="2" />
            <path d="M5 19h14" fill="none" stroke="currentColor" strokeWidth="2" />
            <path d="M9 16v-4" fill="none" stroke="currentColor" strokeWidth="2" />
            <path d="M13 16v-7" fill="none" stroke="currentColor" strokeWidth="2" />
            <path d="M17 16v-2" fill="none" stroke="currentColor" strokeWidth="2" />
          </>
        ) : null}
        {icon === 'flask' ? (
          <>
            <path d="M10 3h4" fill="none" stroke="currentColor" strokeWidth="2" />
            <path d="M11 3v5l-5 8a3 3 0 002 5h8a3 3 0 002-5l-5-8V3" fill="none" stroke="currentColor" strokeWidth="2" />
          </>
        ) : null}
        {icon === 'calendar' ? (
          <>
            <rect x="4" y="6" width="16" height="14" fill="none" stroke="currentColor" strokeWidth="2" />
            <path d="M8 3v6M16 3v6M4 10h16" fill="none" stroke="currentColor" strokeWidth="2" />
          </>
        ) : null}
        {icon === 'search' ? <path d="M11 4a7 7 0 105.2 11.7L20 19.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /> : null}
        {icon === 'inbox' ? <path d="M4 6h16l-2 10H6L4 6zm2 10h12M9 12h6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /> : null}
        {icon === 'cube' ? <path d="M12 3l8 4.5-8 4.5-8-4.5L12 3zm-8 4.5V16.5L12 21l8-4.5V7.5" fill="none" stroke="currentColor" strokeWidth="2" /> : null}
        {icon === 'check' ? <path d="M5 12l4 4L19 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /> : null}
        {icon === 'image' ? <path d="M4 5h16v14H4zM8 10h.01M6 17l4-4 3 3 3-2 2 3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /> : null}
        {icon === 'bolt' ? <path d="M13 2L6 13h5l-1 9 7-11h-5l1-9z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /> : null}
        {icon === 'ruler' ? <path d="M4 16L16 4l4 4L8 20H4v-4zM12 8l4 4" fill="none" stroke="currentColor" strokeWidth="2" /> : null}
        {icon === 'smile' ? <path d="M12 21a9 9 0 100-18 9 9 0 000 18zm-4-7a6 6 0 008 0M9 10h.01M15 10h.01" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /> : null}
        {icon === 'shield' ? <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" fill="none" stroke="currentColor" strokeWidth="2" /> : null}
        {icon === 'archive' ? <path d="M3 7h18v4H3V7zm2 4h14v10H5V11zm5 4h4" fill="none" stroke="currentColor" strokeWidth="2" /> : null}
        {icon === 'trash' ? <path d="M4 7h16M9 7V4h6v3m-8 0l1 13h8l1-13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /> : null}
        {icon === 'presentation' ? <path d="M4 5h16v11H4V5zm8 11v4m-3 0h6" fill="none" stroke="currentColor" strokeWidth="2" /> : null}
        {icon === 'truck' ? <path d="M3 7h11v8H3V7zm11 3h4l3 3v2h-7v-5zM7 18a2 2 0 100-4 2 2 0 000 4zm10 0a2 2 0 100-4 2 2 0 000 4z" fill="none" stroke="currentColor" strokeWidth="2" /> : null}
        {icon === 'book' ? <path d="M5 4h12a2 2 0 012 2v14H7a2 2 0 01-2-2V4zm2 0v14" fill="none" stroke="currentColor" strokeWidth="2" /> : null}
        {icon === 'code' ? <path d="M8 8l-4 4 4 4m8-8l4 4-4 4M14 4l-4 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /> : null}
        {icon === 'lock' ? <path d="M7 11V8a5 5 0 0110 0v3M6 11h12v9H6v-9z" fill="none" stroke="currentColor" strokeWidth="2" /> : null}
        {icon === 'key' ? <path d="M14 10a4 4 0 11-2-3.5L20 6v3h-2v2h-2v2h-2.3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /> : null}
        {icon === 'database' ? <path d="M12 4c4.4 0 8 1.3 8 3s-3.6 3-8 3-8-1.3-8-3 3.6-3 8-3zm8 8c0 1.7-3.6 3-8 3s-8-1.3-8-3m16 5c0 1.7-3.6 3-8 3s-8-1.3-8-3" fill="none" stroke="currentColor" strokeWidth="2" /> : null}
        {icon === 'repeat' ? <path d="M17 1l4 4-4 4M3 11V9a4 4 0 014-4h14M7 23l-4-4 4-4M21 13v2a4 4 0 01-4 4H3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /> : null}
        {icon === 'building' ? <path d="M4 21h16M6 21V7h12v14M9 10h2m2 0h2m-6 4h2m2 0h2" fill="none" stroke="currentColor" strokeWidth="2" /> : null}
        {icon === 'layer' ? <path d="M12 4l8 4-8 4-8-4 8-4zm8 8l-8 4-8-4m16 4l-8 4-8-4" fill="none" stroke="currentColor" strokeWidth="2" /> : null}
        {icon === 'monitor' ? <path d="M3 5h18v12H3V5zm6 16h6m-4-4h2" fill="none" stroke="currentColor" strokeWidth="2" /> : null}
        {icon === 'users' ? (
          <>
            <path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <circle cx="9" cy="7" r="3" fill="none" stroke="currentColor" strokeWidth="2" />
            <path d="M22 21v-2a4 4 0 00-3-3.87M16 3.13a3 3 0 010 5.74" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </>
        ) : null}
        {icon === 'headset' ? (
          <>
            <path
              d="M4 14v-3a8 8 0 0116 0v3"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
            <path
              d="M4 14v2a2 2 0 002 2h1v-6H6a2 2 0 00-2 2zM20 14v2a2 2 0 01-2 2h-1v-6h1a2 2 0 012 2z"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M12 19a3 3 0 003-3"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </>
        ) : null}
        {icon === 'star' ? <path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9L12 3z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /> : null}
      </svg>
    </span>
  )
}

type ApproveUserPayload = {
  thirdPartyCompany?: string
  workSubtype?: string
  accessAreas?: string[]
  accessProcesses?: string[]
}

type PendingApprovalItemProps = {
  user: AppUser
  approvedUsers: AppUser[]
  orgCells: Array<{
    id: string
    responsibleUserId?: string | null
    responsibleName?: string | null
  }>
  terceiraOptions: string[]
  csdScopeOptions: string[]
  showPassword?: boolean
  onApprove: (userId: string, payload: ApproveUserPayload) => Promise<void>
  onReject: (
    userId: string,
    reason: string,
  ) => Promise<{ emailSent?: boolean; warning?: string }>
  onEdit: (user: AppUser) => void
  onFeedback: (feedback: { type: 'success' | 'error'; message: string }) => void
}

function PendingApprovalItem({
  user,
  approvedUsers,
  orgCells,
  terceiraOptions,
  csdScopeOptions,
  showPassword = false,
  onApprove,
  onReject,
  onEdit,
  onFeedback,
}: PendingApprovalItemProps) {
  const [expanded, setExpanded] = useState(false)
  const [showRejectForm, setShowRejectForm] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [thirdPartyCompany, setThirdPartyCompany] = useState('')
  const [workSubtype, setWorkSubtype] = useState('')
  const [selectedSubareas, setSelectedSubareas] = useState<string[]>([])
  const [selectedProcesses, setSelectedProcesses] = useState<string[]>([])
  const [selectedProcessAreas, setSelectedProcessAreas] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [rejecting, setRejecting] = useState(false)
  const jobTitle = user.jobTitle?.trim() ?? ''
  const subtypeOptions = [...subtypesForCargo(jobTitle, user.workArea ?? '', {
    csdScopes: csdScopeOptions,
  })]
  const needsCompany = user.employmentType === 'Terceira'
  const needsSubtype = subtypeOptions.length > 0
  const needsHomeSubareas =
    jobTitle === 'Engenheiro' && isEngineerSubcellSubtype(workSubtype)
  const isCellOwnerSubtype =
    jobTitle === 'Engenheiro' && isEngineerAreaSubtype(workSubtype)
  const needsSpecificProcesses =
    jobTitle === 'Engenheiro' && isEngineerProcessSubtype(workSubtype)
  const needsInternProcesses =
    jobTitle === 'Estagiário' && (user.workArea?.trim() ?? '') === 'Medição'
  const needsProcessAssignment = needsSpecificProcesses || needsInternProcesses
  const takenSubcellAreas = mapTakenSubcellAreas(approvedUsers, undefined, {
    candidateId: user.id,
    candidateSubtype: workSubtype,
    orgCells: orgCells.map((cell) => ({
      id: cell.id,
      responsibleUserId: cell.responsibleUserId ?? null,
      responsibleName: cell.responsibleName ?? null,
    })),
  })
  const homeSubareaProcesses = getHomeSubareaProcessGroups()
  const builtProfile = buildRequestedProfile(
    user.jobTitle,
    workSubtype,
    user.workArea ?? '',
  )

  const toggleSubarea = (area: string) => {
    setSelectedSubareas((current) =>
      current.includes(area)
        ? current.filter((item) => item !== area)
        : [...current, area],
    )
  }

  const toggleProcessArea = (area: string) => {
    setSelectedProcessAreas((current) => {
      if (current.includes(area)) {
        setSelectedProcesses((processes) =>
          processes.filter((encoded) => !encoded.startsWith(`${area}::`)),
        )
        return current.filter((item) => item !== area)
      }
      return [...current, area]
    })
  }

  const toggleProcess = (area: string, process: string) => {
    const encoded = encodeAccessProcess(area, process)
    setSelectedProcesses((current) =>
      current.includes(encoded)
        ? current.filter((item) => item !== encoded)
        : [...current, encoded],
    )
  }

  const handleApprove = async () => {
    if (needsCompany && !thirdPartyCompany) {
      onFeedback({ type: 'error', message: 'Selecione a empresa terceira antes de aprovar.' })
      return
    }
    if (needsSubtype && !workSubtype) {
      onFeedback({
        type: 'error',
        message:
          jobTitle === 'Engenheiro'
            ? 'Selecione a abrangência do engenheiro antes de aprovar.'
            : 'Selecione o escopo antes de aprovar.',
      })
      return
    }
    if (needsHomeSubareas && selectedSubareas.length === 0) {
      onFeedback({
        type: 'error',
        message: 'Selecione ao menos uma subárea da home para o engenheiro.',
      })
      return
    }
    if (needsHomeSubareas) {
      const conflict = selectedSubareas.find((area) => takenSubcellAreas.has(area))
      if (conflict) {
        onFeedback({
          type: 'error',
          message: `A subárea "${conflict}" já possui responsável: ${takenSubcellAreas.get(conflict)}.`,
        })
        return
      }
    }
    if (needsSpecificProcesses) {
      if (selectedProcessAreas.length === 0 || selectedProcesses.length === 0) {
        onFeedback({
          type: 'error',
          message:
            'Selecione a(s) subárea(s) e ao menos um processo específico dentro delas.',
        })
        return
      }
    }

    setSubmitting(true)
    try {
      await onApprove(user.id, {
        thirdPartyCompany: needsCompany ? thirdPartyCompany : '',
        workSubtype: needsSubtype ? workSubtype : '',
        accessAreas: needsHomeSubareas ? selectedSubareas : [],
        accessProcesses: needsProcessAssignment ? selectedProcesses : [],
      })
      onFeedback({
        type: 'success',
        message: `Acesso de ${user.name} aprovado com sucesso.`,
      })
    } catch (error) {
      onFeedback({
        type: 'error',
        message:
          error instanceof ApiError
            ? error.message
            : 'Não foi possível aprovar o usuário.',
      })
    } finally {
      setSubmitting(false)
    }
  }

  const handleReject = async () => {
    const reason = rejectReason.trim()
    if (reason.length < 5) {
      onFeedback({
        type: 'error',
        message: 'Informe a justificativa da reprovação (mínimo de 5 caracteres).',
      })
      return
    }

    setRejecting(true)
    try {
      const result = await onReject(user.id, reason)
      onFeedback({
        type: 'success',
        message: result.emailSent
          ? `Cadastro de ${user.name} reprovado. A justificativa foi enviada por e-mail.`
          : result.warning
            ? `Cadastro de ${user.name} reprovado. ${result.warning}`
            : `Cadastro de ${user.name} reprovado.`,
      })
      setShowRejectForm(false)
      setRejectReason('')
    } catch (error) {
      onFeedback({
        type: 'error',
        message:
          error instanceof ApiError
            ? error.message
            : 'Não foi possível reprovar o cadastro.',
      })
    } finally {
      setRejecting(false)
    }
  }

  return (
    <article className={`approval-item${expanded ? ' is-expanded' : ' is-collapsed'}`}>
      <button
        type="button"
        className="approval-item-summary"
        aria-expanded={expanded}
        onClick={() => setExpanded((current) => !current)}
      >
        {user.profilePhoto ? (
          <img
            className="profile-photo-thumb"
            src={user.profilePhoto}
            alt=""
          />
        ) : (
          <span className="profile-photo-placeholder" aria-hidden="true">
            {user.name.trim().charAt(0).toUpperCase() || '?'}
          </span>
        )}
        <strong>{user.name}</strong>
        <span className="approval-item-toggle" aria-hidden="true">
          {expanded ? '▾' : '▸'}
        </span>
      </button>

      {expanded ? (
        <>
          <dl className="user-detail-grid approval-item-details-grid">
            <div>
              <dt>Matrícula</dt>
              <dd>{user.registration || '—'}</dd>
            </div>
            {showPassword ? (
              <div>
                <dt>Senha</dt>
                <dd className="user-password-value">
                  {user.password?.trim() ? user.password : 'Indisponível (cadastro antigo)'}
                </dd>
              </div>
            ) : null}
            <div>
              <dt>E-mail</dt>
              <dd>{user.email || '—'}</dd>
            </div>
            <div>
              <dt>WhatsApp</dt>
              <dd>{user.whatsapp || '—'}</dd>
            </div>
            <div>
              <dt>CPF</dt>
              <dd>{user.cpf || '—'}</dd>
            </div>
            <div>
              <dt>Data de nascimento</dt>
              <dd>{user.birthDate || '—'}</dd>
            </div>
            <div>
              <dt>Tipo</dt>
              <dd>{user.employmentType || '—'}</dd>
            </div>
            <div>
              <dt>Abrangência EDP</dt>
              <dd>{user.edpUnit || '—'}</dd>
            </div>
            <div>
              <dt>Área</dt>
              <dd>{user.workArea || '—'}</dd>
            </div>
            <div>
              <dt>Cargo</dt>
              <dd>{user.jobTitle || '—'}</dd>
            </div>
            <div>
              <dt>Localidade</dt>
              <dd>{user.locality || '—'}</dd>
            </div>
            {user.employmentType === 'Terceira' ? (
              <div>
                <dt>Empresa terceira</dt>
                <dd>{user.thirdPartyCompany || '—'}</dd>
              </div>
            ) : null}
            <div>
              <dt>{jobTitle === 'Engenheiro' ? 'Abrangência' : 'Escopo'}</dt>
              <dd>{user.workSubtype || '—'}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>Pendente</dd>
            </div>
            <div>
              <dt>Data do cadastro</dt>
              <dd>{new Date(user.requestedAt).toLocaleString('pt-BR')}</dd>
            </div>
            {builtProfile ? (
              <div className="user-detail-full">
                <dt>Perfil a aprovar</dt>
                <dd>{builtProfile}</dd>
              </div>
            ) : null}
          </dl>

          <div className="approval-completion-fields">
            {needsCompany ? (
              <label>
                Empresa terceira
                <select
                  value={thirdPartyCompany}
                  onChange={(event) => setThirdPartyCompany(event.target.value)}
                >
                  <option value="" disabled hidden />
                  {terceiraOptions.map((company) => (
                    <option key={company} value={company}>
                      {company}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            {needsSubtype ? (
              <label>
                {jobTitle === 'Engenheiro' ? 'Abrangência do engenheiro' : 'Escopo'}
                <select
                  value={workSubtype}
                  onChange={(event) => {
                    setWorkSubtype(event.target.value)
                    setSelectedSubareas([])
                    setSelectedProcessAreas([])
                    setSelectedProcesses([])
                  }}
                >
                  <option value="" disabled>
                    {jobTitle === 'Engenheiro'
                      ? 'Selecione a abrangência'
                      : 'Selecione o escopo'}
                  </option>
                  {subtypeOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            {isCellOwnerSubtype ? (
              <p className="approval-subareas-hint" role="note">
                Como responsável pela célula, este engenheiro cobre todas as subáreas da
                área e não pode ser responsável por subárea individual.
              </p>
            ) : null}

            {needsHomeSubareas ? (
              <fieldset className="approval-subareas">
                <legend>Subáreas da home</legend>
                <p className="approval-subareas-hint">
                  Cada subárea pode ter apenas um responsável por sub-célula.
                </p>
                <div className="approval-subareas-grid">
                  {ENGINEER_HOME_SUBAREAS.map((area) => {
                    const takenBy = takenSubcellAreas.get(area)
                    const isTaken = Boolean(takenBy)
                    return (
                      <label
                        key={area}
                        className={`approval-subarea-option${isTaken ? ' is-taken' : ''}`}
                      >
                        <input
                          type="checkbox"
                          checked={selectedSubareas.includes(area)}
                          disabled={isTaken}
                          onChange={() => {
                            if (isTaken) return
                            toggleSubarea(area)
                          }}
                        />
                        <span>
                          {area}
                          {isTaken ? (
                            <small className="approval-subarea-taken">
                              Já responsável: {takenBy}
                            </small>
                          ) : null}
                        </span>
                      </label>
                    )
                  })}
                </div>
              </fieldset>
            ) : null}

            {needsProcessAssignment ? (
              <fieldset className="approval-subareas">
                <legend>
                  {needsInternProcesses
                    ? 'Processos atribuídos ao estagiário'
                    : 'Processos específicos por subárea'}
                </legend>
                <p className="approval-subareas-hint">
                  {needsInternProcesses
                    ? 'Opcional. Selecione as subáreas e os processos que este estagiário poderá visualizar na home (Seus processos).'
                    : 'Selecione as subáreas da home e, em cada uma, os processos específicos de responsabilidade deste engenheiro.'}
                </p>
                <div className="approval-subareas-grid">
                  {homeSubareaProcesses.map(({ area }) => (
                    <label key={area} className="approval-subarea-option">
                      <input
                        type="checkbox"
                        checked={selectedProcessAreas.includes(area)}
                        onChange={() => toggleProcessArea(area)}
                      />
                      <span>{area}</span>
                    </label>
                  ))}
                </div>
                {selectedProcessAreas.map((area) => {
                  const group = homeSubareaProcesses.find((item) => item.area === area)
                  if (!group) return null
                  return (
                    <div key={area} className="approval-process-group">
                      <p className="approval-process-group-title">Processos de {area}</p>
                      <div className="approval-subareas-grid">
                        {group.processes.map((process) => {
                          const encoded = encodeAccessProcess(area, process)
                          return (
                            <label key={encoded} className="approval-subarea-option">
                              <input
                                type="checkbox"
                                checked={selectedProcesses.includes(encoded)}
                                onChange={() => toggleProcess(area, process)}
                              />
                              <span>{process}</span>
                            </label>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </fieldset>
            ) : null}
          </div>

          <div className="approval-item-actions">
            <button
              className="secondary-button compact-button"
              type="button"
              onClick={() => onEdit(user)}
            >
              Editar
            </button>
            <button
              className="danger-button compact-button"
              type="button"
              disabled={submitting || rejecting}
              onClick={() => setShowRejectForm((current) => !current)}
            >
              {showRejectForm ? 'Cancelar reprovação' : 'Reprovar cadastro'}
            </button>
            <button
              className="success-button compact-button"
              type="button"
              disabled={submitting || rejecting || showRejectForm}
              onClick={() => void handleApprove()}
            >
              {submitting ? 'Aprovando...' : 'Aprovar acesso'}
            </button>
          </div>

          {showRejectForm ? (
            <div className="approval-reject-form">
              <label>
                Justificativa da reprovação
                <textarea
                  rows={4}
                  value={rejectReason}
                  onChange={(event) => setRejectReason(event.target.value)}
                  placeholder="Descreva o motivo da reprovação..."
                  maxLength={2000}
                />
              </label>
              <p className="approval-reject-notice" role="note">
                Esta justificativa será enviada por e-mail ao usuário, na mensagem:
                “Seu cadastro foi reprovado com a seguinte justificativa”.
              </p>
              <button
                className="danger-button compact-button"
                type="button"
                disabled={rejecting || rejectReason.trim().length < 5}
                onClick={() => void handleReject()}
              >
                {rejecting ? 'Reprovando...' : 'Confirmar reprovação e enviar e-mail'}
              </button>
            </div>
          ) : null}
        </>
      ) : null}
    </article>
  )
}

function HomePanel({
  currentUser,
  activeRoute,
  fixedRequestLink,
  users,
  homologationRequests,
  onApproveUser,
  onRejectUser,
  onUpdateUser,
  onDeleteUser,
  onCurrentUserChange,
  onCreateHomologationRequest,
  onLogout,
}: HomePanelProps) {
  const savedNav = useMemo(() => loadHomeNavState(currentUser.id), [currentUser.id])
  const [navReady, setNavReady] = useState(() => !savedNav?.selectedAreaTitle)

  const [selectedArea, setSelectedArea] = useState<Area | null>(null)
  const [selectedMeasurementSection, setSelectedMeasurementSection] = useState<string | null>(
    () => savedNav?.selectedMeasurementSection ?? null,
  )
  const [selectedLabMeasurementSection, setSelectedLabMeasurementSection] = useState<
    string | null
  >(() => savedNav?.selectedLabMeasurementSection ?? null)
  const [selectedFieldTeamSection, setSelectedFieldTeamSection] = useState<string | null>(null)
  const [selectedHomologationSection, setSelectedHomologationSection] = useState<string | null>(
    () => savedNav?.selectedHomologationSection ?? null,
  )
  const [selectedUserDetail, setSelectedUserDetail] = useState<AppUser | null>(null)
  const [userDetailStartEditing, setUserDetailStartEditing] = useState(false)
  const [usersView, setUsersView] = useState<UsersViewTab>(
    () => savedNav?.usersView ?? 'usuarios',
  )
  const [gestaoHomeTab, setGestaoHomeTab] = useState<GestaoHomeTab>(
    () => savedNav?.gestaoHomeTab ?? 'dash',
  )
  const [terceiraOptions, setTerceiraOptions] = useState<string[]>([...THIRD_PARTY_COMPANIES])
  const [csdScopeOptions, setCsdScopeOptions] = useState<string[]>([
    ...TECHNICIAN_SCOPES_BY_AREA.CSD,
  ])
  const [previewMode, setPreviewMode] = useState<'profile' | 'user'>('profile')
  const [previewProfileId, setPreviewProfileId] = useState(ADMIN_PREVIEW_PROFILE_ID)
  const [previewUserId, setPreviewUserId] = useState('')
  const resolvedPreviewProfileId =
    previewProfileId === ADMIN_PREVIEW_PROFILE_ID
      ? ADMIN_PREVIEW_PROFILE_ID
      : (getCadastroProfile(previewProfileId)?.id ?? ADMIN_PREVIEW_PROFILE_ID)
  const previewProfileOptions = useMemo(
    () =>
      [...CADASTRO_PROFILES].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
    [],
  )
  const [showSupport, setShowSupport] = useState(false)
  const [openSupportCount, setOpenSupportCount] = useState(0)
  const [assignedProcesses, setAssignedProcesses] = useState<
    Array<{ processKey: string; area: string; process: string }>
  >([])
  const [assignedProcessesLoading, setAssignedProcessesLoading] = useState(false)
  const [selectedOrgCell, setSelectedOrgCell] = useState<string | null>(
    () => savedNav?.selectedOrgCell ?? null,
  )
  const [selectedOrgSubcell, setSelectedOrgSubcell] = useState<string | null>(
    () => savedNav?.selectedOrgSubcell ?? null,
  )
  const [orgCells, setOrgCells] = useState(() => [...ORG_STRUCTURE.cells])
  const [orgAreas, setOrgAreas] = useState<OrgAreaLeadership[]>([DEFAULT_ORG_AREA_LEADERSHIP])
  const [orgArea, setOrgArea] = useState<OrgAreaLeadership>(DEFAULT_ORG_AREA_LEADERSHIP)
  const [selectedOrgAreaId, setSelectedOrgAreaId] = useState<string | null>(
    () => savedNav?.selectedOrgAreaId ?? null,
  )
  const [orgCellsBusy, setOrgCellsBusy] = useState(false)
  const [orgCellsError, setOrgCellsError] = useState<string | null>(null)
  const [selectedCodeMaterialsAction, setSelectedCodeMaterialsAction] = useState<
    'create' | null
  >(() => savedNav?.selectedCodeMaterialsAction ?? null)
  const [selectedPasswordAction, setSelectedPasswordAction] = useState<string | null>(
    () => savedNav?.selectedPasswordAction ?? null,
  )

  useEffect(() => {
    void api
      .listCatalogOptions()
      .then(({ catalogs }) => {
        const terceira = catalogs.find((catalog) => catalog.key === 'terceira')
        if (terceira?.options.length) {
          setTerceiraOptions(terceira.options.map((option) => option.value))
        }
        const escopoCsd = catalogs.find((catalog) => catalog.key === 'escopo_csd')
        if (escopoCsd?.options.length) {
          setCsdScopeOptions(escopoCsd.options.map((option) => option.value))
        }
      })
      .catch(() => {
        // Mantém fallback local.
      })
  }, [])

  useEffect(() => {
    if (selectedArea?.title !== 'Laboratório de Medição') return

    let cancelled = false
    const refreshOpenSupportCount = async () => {
      try {
        const { tickets } = await api.listSupportTickets()
        if (!cancelled) {
          setOpenSupportCount(
            tickets.filter((ticket) => ticket.status === 'aberto').length,
          )
        }
      } catch {
        if (!cancelled) setOpenSupportCount(0)
      }
    }

    void refreshOpenSupportCount()
    const intervalId = window.setInterval(() => {
      void refreshOpenSupportCount()
    }, 20000)

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
    }
  }, [selectedArea?.title, selectedLabMeasurementSection])

  useEffect(() => {
    const mapArea = (area: {
      id: string
      label: string
      description: string
      responsibleUserId: string | null
      responsibleName: string | null
      substituteUserId: string | null
      substituteName: string | null
      status: 'pendente' | 'ativa'
    }): OrgAreaLeadership => ({
      id: area.id,
      label: area.label,
      description: area.description,
      responsibleUserId: area.responsibleUserId,
      responsibleName: area.responsibleName,
      substituteUserId: area.substituteUserId,
      substituteName: area.substituteName,
      status: area.status,
    })

    void api
      .listOrgCells()
      .then(({ areas, area, cells }) => {
        const mappedAreas = (areas?.length ? areas : area ? [area] : []).map(mapArea)
        const nextAreas = mappedAreas.length ? mappedAreas : [DEFAULT_ORG_AREA_LEADERSHIP]
        setOrgAreas(nextAreas)
        setOrgCells(
          buildOrgCellsFromRecords(
            cells.map((cell) => ({
              id: cell.id,
              areaId: cell.areaId,
              label: cell.label,
              description: cell.description,
              responsibleUserId: cell.responsibleUserId,
              responsibleName: cell.responsibleName,
              substituteUserId: cell.substituteUserId,
              substituteName: cell.substituteName,
              status: cell.status,
            })),
          ),
        )

        const adminUser = currentUser.role === 'admin'
        const preferredAreaId = savedNav?.selectedOrgAreaId
        const preferredArea = preferredAreaId
          ? nextAreas.find((item) => item.id === preferredAreaId)
          : null

        if (preferredArea) {
          setSelectedOrgAreaId(preferredArea.id)
          setOrgArea(preferredArea)
        } else if (!adminUser && nextAreas.length === 1) {
          setSelectedOrgAreaId(nextAreas[0].id)
          setOrgArea(nextAreas[0])
        } else if (nextAreas.length === 1) {
          setOrgArea(nextAreas[0])
        }

        if (
          savedNav?.selectedOrgCell &&
          !cells.some((cell) => cell.id === savedNav.selectedOrgCell)
        ) {
          setSelectedOrgCell(null)
          setSelectedOrgSubcell(null)
        }
      })
      .catch(() => {
        setOrgAreas([DEFAULT_ORG_AREA_LEADERSHIP])
        setOrgArea(DEFAULT_ORG_AREA_LEADERSHIP)
        setOrgCells([...ORG_STRUCTURE.cells])
      })
  }, [currentUser.role, savedNav?.selectedOrgAreaId, savedNav?.selectedOrgCell])
  const [trailStepCounts, setTrailStepCounts] = useState<Record<string, number>>({})
  const [ratmLaudos, setRatmLaudos] = useState<RatmLaudo[]>([])
  const [meterNumbersInput, setMeterNumbersInput] = useState('')
  const [passwordDigitsInput, setPasswordDigitsInput] = useState('')
  const [passwordType, setPasswordType] = useState<PasswordTypeSelection>('')
  const [manufacturers, setManufacturers] = useState<string[]>([])
  const [selectedManufacturer, setSelectedManufacturer] = useState('')
  const [selectedMaterialType, setSelectedMaterialType] = useState('')
  const [orderNumber, setOrderNumber] = useState('')
  const [newManufacturer, setNewManufacturer] = useState('')
  const [generatedPasswords, setGeneratedPasswords] = useState<GeneratedPasswordResult[]>([])
  const [passwordRecords, setPasswordRecords] = useState<PasswordRecord[]>([])
  const [materialRows, setMaterialRows] = useState<MaterialRecord[]>([])
  const [materialForm, setMaterialForm] = useState<MaterialRecord>({
    material: '',
    oldCode: '',
    newCode: '',
    description: '',
    manufacturer: '',
    prefix: '',
    equipmentType: '',
  })
  const [materialCodeFilter, setMaterialCodeFilter] = useState('')
  const [materialOldCodeFilter, setMaterialOldCodeFilter] = useState('')
  const [materialDescriptionFilter, setMaterialDescriptionFilter] = useState('')
  const [materialEquipmentTypeFilter, setMaterialEquipmentTypeFilter] = useState('Todos')
  const [_dataLoading, setDataLoading] = useState(true)
  const [filterMetersInput, setFilterMetersInput] = useState('')
  const [filterManufacturer, setFilterManufacturer] = useState('Todos')
  const [filterMaterialType, setFilterMaterialType] = useState('Todos')
  const [filterStartDate, setFilterStartDate] = useState('')
  const [filterEndDate, setFilterEndDate] = useState('')
  const [passwordFeedback, setPasswordFeedback] = useState<{
    type: 'success' | 'error'
    message: string
  } | null>(null)
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null)
  const [userPendingDelete, setUserPendingDelete] = useState<AppUser | null>(null)
  const isAdmin = currentUser.role === 'admin'
  const pendingApprovalUsers = users.filter(
    (user) => user.role === 'compras' && user.approvalStatus === 'pending',
  )
  const registeredUsers = users.filter(
    (user) => user.role !== 'admin' && user.approvalStatus === 'approved',
  )
  const previewUserOptions = useMemo(
    () =>
      [...registeredUsers].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
    [registeredUsers],
  )
  const previewUser =
    isAdmin && previewMode === 'user' && previewUserId
      ? (previewUserOptions.find((user) => user.id === previewUserId) ?? null)
      : null
  const isAdminFullPreview =
    isAdmin &&
    ((previewMode === 'profile' &&
      resolvedPreviewProfileId === ADMIN_PREVIEW_PROFILE_ID) ||
      (previewMode === 'user' && !previewUser))
  const canViewUserPasswords = isAdminFullPreview
  const measurementSections = [
    'Faturamento de clientes livres',
    'Faturamento de clientes cativos',
    'Faturamento de consumo próprio',
    'Memória de massa',
    'Medidas inconsistentes',
    'Migração',
    'Arcesp',
    'Pirâmide',
    'Capex',
    'Geração de senha',
    'Geração de número de série',
    'Sap Hana',
  ]
  const labHighlightedSections = [
    'Auditoria',
    'Analisadores de Tensão',
    'Inventário',
    'Aferição de Padrões BT',
    'Grandes Clientes',
  ]
  const labOtherSections = [
    'Dashboard',
    'Consultar RATM',
    'Calendário de ensaios',
    'Criar Modelo',
    'Galeria',
    'Apresentação',
    'Fornecedores',
    'CSDs',
    'Suporte',
    'Treinamentos',
    'Softwares',
  ]

  const allAreas: Area[] = [
    {
      title: 'Gestão Operacional',
      description:
        'Painel para acompanhamento de indicadores, metas e decisões operacionais.',
      details:
        'Visualize indicadores de desempenho, acompanhe metas do setor e consolide decisões com rastreabilidade operacional.',
    },
    {
      title: 'Medição',
      description:
        'Acesso aos recursos de análise, validação e rastreabilidade das medições.',
      details:
        'Consulte medições, valide consistência de dados e acompanhe históricos técnicos para suportar auditorias internas.',
    },
    {
      title: 'Laboratório de Medição',
      description:
        'Ambiente laboratorial para ensaios, calibração e estudos técnicos da medição.',
      details: '',
    },
    {
      title: 'Laboratório de Homologação',
      description:
        'Ambiente para testes controlados, homologações e documentação de resultados.',
      details:
        'Execute cenários de homologação, registre evidências e mantenha documentação de conformidade dos processos.',
      },
    {
      title: 'Telemedição',
      description:
        'Monitoramento remoto, coleta de dados em tempo real e gestão de alertas.',
      details:
        'Monitore ativos remotamente, acompanhe telemetria em tempo real e trate alertas críticos com agilidade.',
    },
    {
      title: 'Equipe de campo',
      description:
        'Agendar e consultar medidores provenientes de lavratura de TOI e demais atividades de campo.',
      details: '',
    },
    {
      title: 'Usuários',
      description: 'Cadastros, aprovações e perfis de acesso ao portal.',
      details:
        'Consulte usuários cadastrados, aprove solicitações pendentes e acompanhe o perfil de cada matrícula.',
    },
    {
      title: 'Cadastros',
      description: 'Cadastros operacionais e dados de apoio do portal.',
      details:
        'Centralize cadastros de apoio da área de Medição, como bases, parâmetros e informações operacionais.',
    },
    {
      title: 'Agenda',
      description: 'Registro obrigatório do próximo período de férias.',
      details:
        'Informe suas próximas férias. Sem registro o status fica pendente; após 7 dias o perfil é bloqueado.',
    },
  ]

  const allowedHomeAreas = (() => {
    if (!isAdmin) return getHomeAreasForUser(currentUser)
    if (previewUser) return getHomeAreasForUser(previewUser)
    return getHomeAreasForProfilePreview(resolvedPreviewProfileId)
  })()

  const previewProfile =
    isAdmin &&
    previewMode === 'profile' &&
    resolvedPreviewProfileId !== ADMIN_PREVIEW_PROFILE_ID
      ? getCadastroProfile(resolvedPreviewProfileId) ?? null
      : null

  const activeFieldTeamSubtype =
    previewUser?.workSubtype ??
    previewProfile?.match.workSubtype ??
    currentUser.workSubtype

  const fieldTeamSections = (() => {
    const hasLavraturaAccess =
      isFieldTeamCsdScope(currentUser.workSubtype) ||
      isFieldTeamCsdScope(previewUser?.workSubtype) ||
      isFieldTeamCsdScope(previewProfile?.match.workSubtype) ||
      isAdminFullPreview

    if (!hasLavraturaAccess) {
      return ['Agendar', 'Consultar']
    }

    // Equipe de Campo: só Agendar e Meus TOIs (sem Consultar geral).
    if (isLavraturaEquipeCampoScope(activeFieldTeamSubtype)) {
      return ['Agendar', 'Meus TOIs']
    }

    // Ponto Focal: apenas Consultar.
    if (isLavraturaPontoFocalScope(activeFieldTeamSubtype)) {
      return ['Consultar']
    }

    return ['Agendar', 'Consultar', 'Meus TOIs']
  })()

  /** Perfis de Lavratura: home mostra as opções direto, sem o card Equipe de campo. */
  const flattenFieldTeamHome =
    isFieldTeamCsdScope(currentUser.workSubtype) ||
    isFieldTeamCsdScope(previewUser?.workSubtype) ||
    isFieldTeamCsdScope(previewProfile?.match.workSubtype)

  const fieldTeamArea = allAreas.find((area) => area.title === 'Equipe de campo') ?? null

  const areas = allAreas.filter((area) => {
    if (!allowedHomeAreas.includes(area.title as (typeof allowedHomeAreas)[number])) {
      return false
    }
    if (flattenFieldTeamHome && area.title === 'Equipe de campo') {
      return false
    }
    return true
  })

  const showEstagiarioHome =
    (previewUser != null && isMedicaoEstagiario(previewUser)) ||
    previewProfile?.id === 'estagiario-medicao' ||
    (!isAdmin && isMedicaoEstagiario(currentUser))

  const assignedProcessesUserId =
    previewUser?.id ?? (!isAdmin ? currentUser.id : null)

  const showAssignedProcesses =
    Boolean(assignedProcessesUserId) || previewProfile?.id === 'estagiario-medicao'

  useEffect(() => {
    if (!assignedProcessesUserId) {
      setAssignedProcesses([])
      setAssignedProcessesLoading(false)
      return
    }

    let cancelled = false
    setAssignedProcessesLoading(true)
    void api
      .listAssignedProcessesForUser(assignedProcessesUserId)
      .then(({ processes }) => {
        if (cancelled) return
        setAssignedProcesses(
          processes.map((item) => ({
            processKey: item.processKey,
            area: item.area,
            process: item.process,
          })),
        )
      })
      .catch(() => {
        if (cancelled) return
        setAssignedProcesses([])
      })
      .finally(() => {
        if (!cancelled) setAssignedProcessesLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [assignedProcessesUserId])

  const openAssignedProcess = (areaTitle: string, processName: string) => {
    const area = allAreas.find((item) => item.title === areaTitle)
    if (!area) return

    setSelectedOrgAreaId(null)
    setSelectedOrgCell(null)
    setSelectedOrgSubcell(null)
    setSelectedPasswordAction(null)
    setSelectedCodeMaterialsAction(null)
    setUsersView('usuarios')
    setGestaoHomeTab('dash')
    setSelectedMeasurementSection(null)
    setSelectedLabMeasurementSection(null)
    setSelectedFieldTeamSection(null)
    setSelectedHomologationSection(null)
    setSelectedArea(area)

    if (areaTitle === 'Medição') {
      setSelectedMeasurementSection(processName)
      return
    }
    if (areaTitle === 'Laboratório de Medição') {
      setSelectedLabMeasurementSection(processName)
      return
    }
    if (areaTitle === 'Laboratório de Homologação') {
      setSelectedHomologationSection(processName)
      return
    }
    if (areaTitle === 'Equipe de campo') {
      setSelectedFieldTeamSection(processName)
    }
  }

  const accessiblePortals = (() => {
    if (isAdminFullPreview) {
      return [...PORTAL_AREAS]
    }
    if (previewUser) {
      return [...getAccessiblePortals(previewUser)]
    }
    if (isAdmin && previewProfile) {
      const areas = [...previewProfile.areas] as Array<(typeof PORTAL_AREAS)[number]>
      if (
        !skipsVacationAgenda(previewProfile.match.workSubtype) &&
        !areas.includes('Agenda')
      ) {
        areas.push('Agenda')
      }
      return areas.filter(
        (area) =>
          area !== 'Agenda' || !skipsVacationAgenda(previewProfile.match.workSubtype),
      )
    }
    return getAccessiblePortals(currentUser)
  })()

  const gestaoArea = allAreas.find((area) => area.title === 'Gestão Operacional') ?? null
  const agendaArea = allAreas.find((area) => area.title === 'Agenda') ?? null

  const skipsVacation =
    skipsVacationAgenda(currentUser.workSubtype) ||
    skipsVacationAgenda(previewUser?.workSubtype) ||
    skipsVacationAgenda(previewProfile?.match.workSubtype)

  const isVacationBlocked =
    !skipsVacation &&
    currentUser.role !== 'admin' &&
    currentUser.vacationStatus === 'bloqueado'
  const isOnAbsence =
    currentUser.role !== 'admin' &&
    (currentUser.vacationStatus === 'em_ausencia' ||
      currentUser.vacationStatus === 'em_ferias')
  const coveringFor = currentUser.coveringFor ?? []
  const coveringKey = coveringFor.map((item) => item.userId).join('|')
  const [coveringAlertDismissed, setCoveringAlertDismissed] = useState(false)

  useEffect(() => {
    setCoveringAlertDismissed(false)
  }, [coveringKey])

  const isGestorView = !isAdmin && currentUser.jobTitle === 'Gestor'

  const clearAreaSections = () => {
    setSelectedMeasurementSection(null)
    setSelectedLabMeasurementSection(null)
    setSelectedFieldTeamSection(null)
    setSelectedHomologationSection(null)
    setSelectedPasswordAction(null)
    setSelectedCodeMaterialsAction(null)
    setUsersView('usuarios')
    setSelectedUserDetail(null)
    setUserDetailStartEditing(false)
  }

  const exitToHome = () => {
    setSelectedOrgCell(null)
    setSelectedOrgSubcell(null)
    setGestaoHomeTab('dash')
    clearAreaSections()
    if (isOnAbsence) {
      return
    }
    if (isVacationBlocked && agendaArea) {
      setSelectedOrgAreaId(null)
      setSelectedArea(agendaArea)
      return
    }
    if (isGestorView && gestaoArea) {
      setSelectedArea(gestaoArea)
      if (!isAdmin && orgAreas.length === 1) {
        setSelectedOrgAreaId(orgAreas[0].id)
        setOrgArea(orgAreas[0])
      } else {
        setSelectedOrgAreaId(null)
      }
      return
    }
    setSelectedOrgAreaId(null)
    setSelectedArea(null)
  }

  const refreshCurrentUser = async () => {
    const response = await api.me()
    onCurrentUserChange(response.user)
  }

  useEffect(() => {
    if (!isVacationBlocked || !agendaArea) return
    if (selectedArea?.title !== 'Agenda') {
      setSelectedArea(agendaArea)
      clearAreaSections()
      setSelectedOrgCell(null)
      setSelectedOrgSubcell(null)
    }
  }, [isVacationBlocked, agendaArea, selectedArea?.title])

  useEffect(() => {
    if (navReady) return
    const savedTitle = savedNav?.selectedAreaTitle
    if (!savedTitle) {
      setNavReady(true)
      return
    }
    const area = allAreas.find((item) => item.title === savedTitle) ?? null
    if (area) {
      setSelectedArea(area)
    }
    setNavReady(true)
  }, [navReady, savedNav?.selectedAreaTitle, allAreas])

  useEffect(() => {
    if (!navReady) return
    saveHomeNavState({
      userId: currentUser.id,
      selectedAreaTitle: selectedArea?.title ?? null,
      selectedOrgAreaId,
      selectedOrgCell,
      selectedOrgSubcell,
      gestaoHomeTab,
      selectedMeasurementSection,
      selectedLabMeasurementSection,
      selectedHomologationSection,
      selectedPasswordAction,
      selectedCodeMaterialsAction,
      usersView,
    })
  }, [
    navReady,
    currentUser.id,
    selectedArea?.title,
    selectedOrgAreaId,
    selectedOrgCell,
    selectedOrgSubcell,
    gestaoHomeTab,
    selectedMeasurementSection,
    selectedLabMeasurementSection,
    selectedHomologationSection,
    selectedPasswordAction,
    selectedCodeMaterialsAction,
    usersView,
  ])

  useEffect(() => {
    if (!navReady) return
    void api
      .me()
      .then(({ user }) => onCurrentUserChange(user))
      .catch(() => {
        // Mantém a sessão atual se a atualização falhar.
      })
  }, [navReady, onCurrentUserChange])

  useEffect(() => {
    if (!flattenFieldTeamHome) return
    if (selectedArea?.title === 'Equipe de campo' && !selectedFieldTeamSection) {
      setSelectedArea(null)
    }
  }, [flattenFieldTeamHome, selectedArea?.title, selectedFieldTeamSection])

  useEffect(() => {
    if (
      selectedFieldTeamSection === 'Consultar' &&
      isLavraturaEquipeCampoScope(activeFieldTeamSubtype)
    ) {
      setSelectedFieldTeamSection(null)
    }
  }, [selectedFieldTeamSection, activeFieldTeamSubtype])

  useEffect(() => {
    if (!navReady) return
    if (!isGestorView || !gestaoArea || isVacationBlocked || isOnAbsence) return
    if (!selectedArea) {
      setSelectedArea(gestaoArea)
      if (!savedNav?.selectedOrgCell) {
        setSelectedOrgCell(null)
        setSelectedOrgSubcell(null)
      }
      if (!isAdmin && orgAreas.length === 1) {
        setSelectedOrgAreaId(orgAreas[0].id)
        setOrgArea(orgAreas[0])
      }
    }
  }, [
    navReady,
    isGestorView,
    gestaoArea,
    selectedArea,
    isVacationBlocked,
    isOnAbsence,
    isAdmin,
    orgAreas,
    savedNav?.selectedOrgCell,
  ])

  useEffect(() => {
    if (selectedArea?.title !== 'Gestão Operacional') return
    if (selectedOrgAreaId) return
    if (isAdmin || orgAreas.length !== 1) return
    setSelectedOrgAreaId(orgAreas[0].id)
    setOrgArea(orgAreas[0])
  }, [selectedArea?.title, selectedOrgAreaId, isAdmin, orgAreas])

  const returnToOrgCell = () => {
    if (!gestaoArea || !selectedOrgCell) {
      exitToHome()
      return
    }
    setSelectedArea(gestaoArea)
    setSelectedOrgSubcell(null)
    clearAreaSections()
  }

  const handleAreaBack = () => {
    if (selectedOrgCell) {
      returnToOrgCell()
      return
    }
    exitToHome()
  }

  const openOrgSubcell = (cellId: string, subcellPortal: string) => {
    const portal = allAreas.find((area) => area.title === subcellPortal)
    if (!portal) return
    setSelectedOrgCell(cellId)
    setSelectedOrgSubcell(subcellPortal)
    setSelectedArea(portal)
    clearAreaSections()
  }

  const canManageOrgCells =
    isAdmin || (!isAdmin && currentUser.jobTitle === 'Gestor')

  const applyOrgStructure = (
    payload: {
      areas?: Array<{
        id: string
        label: string
        description: string
        responsibleUserId: string | null
        responsibleName: string | null
        substituteUserId: string | null
        substituteName: string | null
        status: 'pendente' | 'ativa'
      }>
      area: {
        id?: string
        label: string
        description: string
        responsibleUserId: string | null
        responsibleName: string | null
        substituteUserId: string | null
        substituteName: string | null
        status: 'pendente' | 'ativa'
      } | null
      cells: Array<{
        id: string
        areaId?: string
        label: string
        description: string
        responsibleUserId: string | null
        responsibleName: string | null
        substituteUserId: string | null
        substituteName: string | null
        status: 'pendente' | 'ativa'
      }>
    },
    options?: { selectAreaId?: string | null },
  ) => {
    const mappedAreas = (
      payload.areas?.length
        ? payload.areas
        : payload.area
          ? [{ id: payload.area.id ?? payload.area.label, ...payload.area }]
          : []
    ).map((area) => ({
      id: area.id,
      label: area.label,
      description: area.description,
      responsibleUserId: area.responsibleUserId,
      responsibleName: area.responsibleName,
      substituteUserId: area.substituteUserId,
      substituteName: area.substituteName,
      status: area.status,
    }))

    const nextAreas = mappedAreas.length ? mappedAreas : [DEFAULT_ORG_AREA_LEADERSHIP]
    setOrgAreas(nextAreas)
    setOrgCells(
      buildOrgCellsFromRecords(
        payload.cells.map((cell) => ({
          id: cell.id,
          areaId: cell.areaId,
          label: cell.label,
          description: cell.description,
          responsibleUserId: cell.responsibleUserId,
          responsibleName: cell.responsibleName,
          substituteUserId: cell.substituteUserId,
          substituteName: cell.substituteName,
          status: cell.status,
        })),
      ),
    )

    const preferredId =
      options?.selectAreaId !== undefined
        ? options.selectAreaId
        : selectedOrgAreaId
    const selected =
      (preferredId ? nextAreas.find((area) => area.id === preferredId) : null) ??
      (!isAdmin && nextAreas.length === 1 ? nextAreas[0] : null)

    if (selected) {
      setSelectedOrgAreaId(selected.id)
      setOrgArea(selected)
    } else if (options?.selectAreaId === null) {
      setSelectedOrgAreaId(null)
      if (nextAreas[0]) setOrgArea(nextAreas[0])
    } else if (nextAreas[0]) {
      setOrgArea(nextAreas[0])
    }
  }

  const handleUpdateOrgArea = async (payload: {
    label: string
    responsibleUserId: string | null
    substituteUserId: string | null
  }) => {
    const areaId = selectedOrgAreaId ?? orgArea.id
    setOrgCellsBusy(true)
    setOrgCellsError(null)
    try {
      const response = await api.updateOrgArea(areaId, payload)
      applyOrgStructure(response, { selectAreaId: areaId })
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'Não foi possível atualizar a liderança da gestão operacional.'
      setOrgCellsError(message)
      throw new Error(message)
    } finally {
      setOrgCellsBusy(false)
    }
  }

  const handleCreateOrgArea = async (payload: {
    label: string
    description: string
    responsibleUserId: string | null
    substituteUserId: string | null
  }) => {
    setOrgCellsBusy(true)
    setOrgCellsError(null)
    try {
      const response = await api.createOrgArea(payload)
      const createdId = response.createdArea?.id ?? payload.label
      applyOrgStructure(response, { selectAreaId: createdId })
      setGestaoHomeTab('dash')
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'Não foi possível criar a gestão operacional.'
      setOrgCellsError(message)
      throw new Error(message)
    } finally {
      setOrgCellsBusy(false)
    }
  }

  const handleCreateOrgCell = async (payload: {
    label: string
    description: string
    responsibleUserId: string | null
    substituteUserId: string | null
  }) => {
    const areaId = selectedOrgAreaId ?? orgArea.id
    setOrgCellsBusy(true)
    setOrgCellsError(null)
    try {
      const response = await api.createOrgCell({ ...payload, areaId })
      applyOrgStructure(response, { selectAreaId: areaId })
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Não foi possível criar a célula.'
      setOrgCellsError(message)
      throw new Error(message)
    } finally {
      setOrgCellsBusy(false)
    }
  }

  const handleAssignOrgCellLeadership = async (
    cellId: string,
    payload: {
      responsibleUserId: string | null
      substituteUserId: string | null
    },
  ) => {
    setOrgCellsBusy(true)
    setOrgCellsError(null)
    try {
      const response = await api.updateOrgCell(cellId, payload)
      applyOrgStructure(response, { selectAreaId: selectedOrgAreaId })
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Não foi possível salvar a liderança da célula.'
      setOrgCellsError(message)
      throw new Error(message)
    } finally {
      setOrgCellsBusy(false)
    }
  }

  const handleDeleteOrgCell = async (cellId: string) => {
    setOrgCellsBusy(true)
    setOrgCellsError(null)
    try {
      const response = await api.deleteOrgCell(cellId)
      applyOrgStructure(response, { selectAreaId: selectedOrgAreaId })
      setSelectedOrgCell(null)
      setSelectedOrgSubcell(null)
      setGestaoHomeTab('celulas')
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Não foi possível excluir a célula.'
      setOrgCellsError(message)
      throw new Error(message)
    } finally {
      setOrgCellsBusy(false)
    }
  }

  const hasPortalAccess = (portalKey: string) =>
    (accessiblePortals as readonly string[]).includes(portalKey)

  const cellsForSelectedArea = orgCells.filter((cell) => {
    if (!selectedOrgAreaId) return true
    return !cell.areaId || cell.areaId === selectedOrgAreaId
  })

  const visibleOrgCells = cellsForSelectedArea.filter((cell) => {
    if (isGestorView || isAdmin || hasPortalAccess('Gestão Operacional')) {
      return true
    }
    if (cell.subcells.length === 0) {
      return hasPortalAccess(cell.id)
    }
    return cell.subcells.some((sub) => hasPortalAccess(sub.portalKey))
  })

  const visibleSubcellsForCell = (cellId: string) => {
    const cell = getOrgCell(cellId, orgCells)
    if (!cell) return []
    return cell.subcells.filter(
      (sub) => isAdmin || hasPortalAccess(sub.portalKey) || hasPortalAccess('Gestão Operacional'),
    )
  }

  const previewProfileUsers = previewProfile
    ? listUsersForCadastroProfile(registeredUsers, previewProfile.id)
    : []

  useEffect(() => {
    if (!previewProfile || !selectedArea) return
    const allowed =
      previewProfile.areas.includes(selectedArea.title as (typeof previewProfile.areas)[number]) ||
      selectedArea.title === 'Gestão Operacional' ||
      selectedArea.title === 'Agenda'
    if (!allowed) {
      setSelectedArea(null)
      setSelectedOrgCell(null)
      setSelectedOrgSubcell(null)
      setSelectedMeasurementSection(null)
      setSelectedLabMeasurementSection(null)
      setSelectedHomologationSection(null)
    }
  }, [previewProfile, selectedArea])

  const handleRatmFinish = async (forms: RatmFormData[]) => {
    const response = await api.createRatmLaudos(forms)
    const laudos = response.laudos.map(mapRatmLaudoFromApi)
    setRatmLaudos((prev) => [...laudos, ...prev.filter((item) => !laudos.some((created) => created.id === item.id))])
    setSelectedLabMeasurementSection('Aprovação de RATM')
  }

  const loadRatmLaudos = async () => {
    try {
      const response = await api.listRatmLaudos()
      setRatmLaudos(response.laudos.map(mapRatmLaudoFromApi))
    } catch {
      setPasswordFeedback({
        type: 'error',
        message: 'Não foi possível carregar os laudos de RATM.',
      })
    }
  }

  const refreshTrailStepCounts = useCallback(async () => {
    try {
      const response = await api.getMeterRegistryTrailCounts()
      setTrailStepCounts(response.counts)
    } catch {
      setTrailStepCounts({})
    }
  }, [])

  const loadEntradaCount = useCallback(async () => {
    await refreshTrailStepCounts()
  }, [refreshTrailStepCounts])

  const resetGeneratePasswordForm = () => {
    setMeterNumbersInput('')
    setPasswordDigitsInput('')
    setPasswordType('')
    setSelectedManufacturer('')
    setSelectedMaterialType('')
    setOrderNumber('')
    setGeneratedPasswords([])
    setPasswordFeedback(null)
  }

  useEffect(() => {
    let cancelled = false

    async function loadOperationalData() {
      try {
        const [passwordsResult, manufacturersResult, materialsResult, ratmLaudosResult] =
          await Promise.allSettled([
            api.listPasswordRecords(),
            api.listManufacturers(),
            api.listMaterials(),
            api.listRatmLaudos(),
          ])

        if (cancelled) {
          return
        }

        if (passwordsResult.status === 'fulfilled') {
          setPasswordRecords(passwordsResult.value.records)
        }

        if (manufacturersResult.status === 'fulfilled') {
          setManufacturers(manufacturersResult.value.manufacturers)
        }

        if (materialsResult.status === 'fulfilled') {
          setMaterialRows(materialsResult.value.materials)
        }

        if (ratmLaudosResult.status === 'fulfilled') {
          setRatmLaudos(ratmLaudosResult.value.laudos.map(mapRatmLaudoFromApi))
        } else {
          setPasswordFeedback({
            type: 'error',
            message: 'Não foi possível carregar os laudos de RATM.',
          })
        }

        if (
          passwordsResult.status === 'rejected' &&
          manufacturersResult.status === 'rejected' &&
          materialsResult.status === 'rejected'
        ) {
          setPasswordFeedback({
            type: 'error',
            message: 'Não foi possível carregar os dados do servidor.',
          })
        }
      } finally {
        if (!cancelled) {
          setDataLoading(false)
        }
      }
    }

    loadOperationalData()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (selectedLabMeasurementSection === 'Aprovação de RATM') {
      void loadRatmLaudos()
    }
  }, [selectedLabMeasurementSection])

  useEffect(() => {
    if (selectedArea?.title === 'Laboratório de Medição') {
      void loadEntradaCount()
    }
  }, [selectedArea?.title, selectedLabMeasurementSection, loadEntradaCount])

  const materialTypeOptions = useMemo(() => {
    const codes = materialRows
      .map((row) => row.newCode.trim())
      .filter(Boolean)
    return codes.length ? Array.from(new Set(codes)) : defaultMaterialTypes
  }, [materialRows])

  useEffect(() => {
    if (selectedPasswordAction !== 'gerar') {
      resetGeneratePasswordForm()
    }
  }, [selectedPasswordAction])

  const filteredPasswordRecords = useMemo(() => {
    const normalizedMeterFilters = filterMetersInput
      .split(/[\n,;\t ]+/)
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean)

    return passwordRecords.filter((record) => {
      const normalizedRecordMeter = record.meter.trim().toLowerCase()
      const matchesMeter = normalizedMeterFilters.length
        ? normalizedMeterFilters.length === 1
          ? normalizedRecordMeter.includes(normalizedMeterFilters[0])
          : normalizedMeterFilters.includes(normalizedRecordMeter)
        : true
      const matchesManufacturer =
        filterManufacturer === 'Todos' ? true : record.manufacturer === filterManufacturer
      const matchesMaterialType =
        filterMaterialType === 'Todos' ? true : record.materialType === filterMaterialType
      const recordDate = new Date(record.createdAt)
      const startDate = filterStartDate ? new Date(`${filterStartDate}T00:00:00`) : null
      const endDate = filterEndDate ? new Date(`${filterEndDate}T23:59:59.999`) : null
      const matchesStartDate = startDate ? recordDate >= startDate : true
      const matchesEndDate = endDate ? recordDate <= endDate : true

      return (
        matchesMeter &&
        matchesManufacturer &&
        matchesMaterialType &&
        matchesStartDate &&
        matchesEndDate
      )
    })
  }, [
    passwordRecords,
    filterMetersInput,
    filterManufacturer,
    filterMaterialType,
    filterStartDate,
    filterEndDate,
  ])

  const filteredMaterialRows = useMemo(() => {
    const normalizedMaterialCode = materialCodeFilter.trim().toLowerCase()
    const normalizedOldCode = materialOldCodeFilter.trim().toLowerCase()
    const normalizedDescription = materialDescriptionFilter.trim().toLowerCase()

    return materialRows.filter((row) => {
      const matchesMaterialCode = normalizedMaterialCode
        ? row.material.toLowerCase().includes(normalizedMaterialCode)
        : true
      const matchesOldCode = normalizedOldCode
        ? row.oldCode.toLowerCase().includes(normalizedOldCode)
        : true
      const matchesDescription = normalizedDescription
        ? row.description.toLowerCase().includes(normalizedDescription)
        : true
      const matchesEquipmentType =
        materialEquipmentTypeFilter === 'Todos'
          ? true
          : row.equipmentType === materialEquipmentTypeFilter

      return (
        matchesMaterialCode &&
        matchesOldCode &&
        matchesDescription &&
        matchesEquipmentType
      )
    })
  }, [
    materialRows,
    materialCodeFilter,
    materialOldCodeFilter,
    materialDescriptionFilter,
    materialEquipmentTypeFilter,
  ])

  const homologationMaterialCatalog = useMemo(() => {
    const codeDescriptionMap = new Map<string, MaterialCatalogItem>()

    for (const row of materialRows) {
      const code = row.material.trim()
      const equipmentType = row.equipmentType.trim()

      if (!code || !equipmentType) {
        continue
      }

      const mapKey = `${equipmentType}::${code}`

      if (!codeDescriptionMap.has(mapKey)) {
        codeDescriptionMap.set(mapKey, {
          equipmentType,
          code,
          description: row.description.trim(),
        })
      }
    }

    return Array.from(codeDescriptionMap.values()).sort((a, b) => {
      const typeCompare = a.equipmentType.localeCompare(b.equipmentType, 'pt-BR')

      if (typeCompare !== 0) {
        return typeCompare
      }

      return a.code.localeCompare(b.code, 'pt-BR')
    })
  }, [materialRows])

  const handleCopyFilteredPasswords = async () => {
    if (!filteredPasswordRecords.length) {
      setPasswordFeedback({
        type: 'error',
        message: 'Nenhum resultado encontrado para copiar.',
      })
      return
    }

    const content = filteredPasswordRecords
      .map((record) => `${record.meter}\t${record.password}\t${record.manufacturer}`)
      .join('\n')

    try {
      await navigator.clipboard.writeText(content)
      setPasswordFeedback({
        type: 'success',
        message: 'Pesquisa copiada com sucesso.',
      })
    } catch {
      setPasswordFeedback({
        type: 'error',
        message: 'Não foi possível copiar a pesquisa automaticamente.',
      })
    }
  }

  const handleGeneratePassword = async () => {
    const meters = meterNumbersInput
      .split(/[\n,;\t ]+/)
      .map((value) => value.trim())
      .filter(Boolean)

    if (!meters.length) {
      setPasswordFeedback({
        type: 'error',
        message: 'Cole um ou mais números de medidor para gerar as senhas.',
      })
      return
    }

    const invalidMeters = meters.filter((meter) => !/^\d+$/.test(meter))

    if (invalidMeters.length) {
      setPasswordFeedback({
        type: 'error',
        message: `Medidor invalido: ${invalidMeters[0]}. Informe somente numeros.`,
      })
      return
    }

    if (
      !passwordDigitsInput.trim() ||
      !passwordType ||
      !selectedManufacturer ||
      !selectedMaterialType ||
      !orderNumber.trim()
    ) {
      setPasswordFeedback({
        type: 'error',
        message: 'Preencha todos os campos antes de gerar as senhas.',
      })
      return
    }

    const passwordDigits = Number(passwordDigitsInput)

    if (!Number.isInteger(passwordDigits)) {
      setPasswordFeedback({
        type: 'error',
        message: 'Informe uma quantidade inteira de digitos.',
      })
      return
    }

    if (passwordDigits < 1 || passwordDigits > 100) {
      setPasswordFeedback({
        type: 'error',
        message: 'Defina entre 1 e 100 dígitos para a senha.',
      })
      return
    }

    try {
      const response = await api.generatePasswords({
        meters,
        passwordDigits,
        passwordType,
        manufacturer: selectedManufacturer,
        materialType: selectedMaterialType,
        orderNumber: orderNumber.trim(),
      })

      const duplicateCount = response.results.filter((item) => item.status === 'duplicate').length

      setGeneratedPasswords(response.results)
      if (response.records.length) {
        setPasswordRecords((prev) => [...response.records, ...prev])
      }

      setPasswordFeedback({
        type: duplicateCount > 0 ? 'error' : 'success',
        message:
          duplicateCount > 0
            ? `${response.records.length} senha(s) gerada(s) e ${duplicateCount} medidor(es) já possuíam senha.`
            : `${response.records.length} senha(s) gerada(s) com sucesso para ${selectedManufacturer}.`,
      })
    } catch (error) {
      setPasswordFeedback({
        type: 'error',
        message:
          error instanceof ApiError
            ? error.message
            : 'Não foi possível gerar as senhas.',
      })
    }
  }

  const handleCopyAllPasswords = async () => {
    if (!generatedPasswords.length) {
      setPasswordFeedback({
        type: 'error',
        message: 'Gere as senhas antes de copiar.',
      })
      return
    }

    const content = generatedPasswords
      .filter((item) => item.status === 'generated')
      .map((item) => `${item.meter}\t${item.password}`)
      .join('\n')

    if (!content) {
      setPasswordFeedback({
        type: 'error',
        message: 'Nenhuma senha nova foi gerada para copiar.',
      })
      return
    }

    try {
      await navigator.clipboard.writeText(content)
      setPasswordFeedback({
        type: 'success',
        message: 'Lista copiada em duas colunas: medidor e senha.',
      })
    } catch {
      setPasswordFeedback({
        type: 'error',
        message: 'Não foi possível copiar automaticamente. Copie manualmente.',
      })
    }
  }

  const handleAddManufacturer = async () => {
    const manufacturerName = newManufacturer.trim()

    if (!manufacturerName) {
      setPasswordFeedback({
        type: 'error',
        message: 'Digite o nome do fabricante para cadastrar.',
      })
      return false
    }

    try {
      const { name } = await api.addManufacturer(manufacturerName)
      setManufacturers((prev) => [...prev, name])
      setSelectedManufacturer(name)
      setNewManufacturer('')
      setPasswordFeedback({
        type: 'success',
        message: `Fabricante ${name} cadastrado com sucesso.`,
      })
      return true
    } catch (error) {
      setPasswordFeedback({
        type: 'error',
        message:
          error instanceof ApiError
            ? error.message
            : 'Não foi possível cadastrar o fabricante.',
      })
      return false
    }
  }

  const resetMaterialForm = () => {
    setMaterialForm({
      material: '',
      oldCode: '',
      newCode: '',
      description: '',
      manufacturer: '',
      prefix: '',
      equipmentType: '',
    })
  }

  const handleCreateMaterial = async () => {
    if (
      !materialForm.material.trim() ||
      !materialForm.oldCode.trim() ||
      !materialForm.description.trim() ||
      !materialForm.equipmentType.trim()
    ) {
      setPasswordFeedback({
        type: 'error',
        message: 'Preencha todos os campos do material antes de salvar.',
      })
      return
    }

    if (!/^\d{8}$/.test(materialForm.material.trim())) {
      setPasswordFeedback({
        type: 'error',
        message: 'O código do material deve ter exatamente 8 números.',
      })
      return
    }

    try {
      const { material } = await api.createMaterial(materialForm)
      setMaterialRows((prev) => [material, ...prev])
      setPasswordFeedback({
        type: 'success',
        message: `Material ${material.material} cadastrado com sucesso.`,
      })
      resetMaterialForm()
      setSelectedCodeMaterialsAction(null)
    } catch (error) {
      setPasswordFeedback({
        type: 'error',
        message:
          error instanceof ApiError
            ? error.message
            : 'Não foi possível salvar o material.',
      })
    }
  }

  const handleCopyFixedRequestLink = async () => {
    try {
      await navigator.clipboard.writeText(fixedRequestLink)
      setPasswordFeedback({
        type: 'success',
        message: 'Link fixo copiado com sucesso.',
      })
    } catch {
      setPasswordFeedback({
        type: 'error',
        message: 'Não foi possível copiar o link automaticamente.',
      })
    }
  }

  // Em ausência (férias ou outro período): portal bloqueado; atividades com o substituto.
  if (isOnAbsence) {
    const start = currentUser.activeAbsenceStart ?? currentUser.nextVacationStart
    const end = currentUser.activeAbsenceEnd ?? currentUser.nextVacationEnd
    const periodLabel =
      start && end
        ? `${start.slice(8, 10)}/${start.slice(5, 7)}/${start.slice(0, 4)} a ${end.slice(8, 10)}/${end.slice(5, 7)}/${end.slice(0, 4)}`
        : null
    const absenceLabel = currentUser.activeAbsenceTypeLabel || 'Ausência'

    return (
      <main className="shell">
        <section className="home-card area-screen-card">
          <TopActionBar onLogout={onLogout} />
          <p className="section-tag">Portal · Ausência</p>
          <h2>Bloqueado devido a {absenceLabel.toLowerCase()}</h2>
          <div className="agenda-alert agenda-alert-blocked" role="alert">
            <strong>Seu acesso ao portal está bloqueado durante a ausência.</strong>
            {periodLabel ? ` Período: ${periodLabel}.` : null}
            {currentUser.vacationSubstituteName ? (
              <>
                {' '}
                As suas atividades estão atreladas ao substituto{' '}
                <strong>{currentUser.vacationSubstituteName}</strong> até o retorno.
              </>
            ) : (
              <>
                {' '}
                Cadastre um substituto na liderança da área/célula para cobertura automática das
                atividades.
              </>
            )}
          </div>
          <p>
            Ao término do período, o acesso é restabelecido automaticamente. Use a Agenda para
            registrar férias e demais ausências.
          </p>
        </section>
      </main>
    )
  }

  // Compras puro (sem subáreas/processos de portal) segue no formulário dedicado —
  // exceto se estiver bloqueado por férias: só Agenda.
  if (isVacationBlocked) {
    return (
      <main className="shell">
        <section className="home-card area-screen-card">
          <TopActionBar onLogout={onLogout} />
          <p className="section-tag">Agenda · Acesso restrito</p>
          <h2>Agenda</h2>
          <AgendaPanel
            locked
            vacationStatus={currentUser.vacationStatus}
            vacationDeadlineAt={currentUser.vacationDeadlineAt}
            nextVacationStart={currentUser.nextVacationStart}
            nextVacationEnd={currentUser.nextVacationEnd}
            onSaved={refreshCurrentUser}
          />
        </section>
      </main>
    )
  }

  if (
    currentUser.role === 'compras' &&
    !(currentUser.accessAreas?.length) &&
    !(currentUser.accessProcesses?.length) &&
    !(
      currentUser.workArea?.trim() === 'CSD' &&
      isFieldTeamCsdScope(currentUser.workSubtype)
    ) &&
    currentUser.vacationStatus === 'ok'
  ) {
    return (
      <HomologationRequestPortal
        currentUser={currentUser}
        activeRoute={activeRoute}
        manufacturers={manufacturers}
        materialCatalog={homologationMaterialCatalog}
        onCreateHomologationRequest={onCreateHomologationRequest}
        onLogout={onLogout}
      />
    )
  }

  if (selectedArea) {
    if (selectedArea.title === 'Agenda') {
      return (
        <main className="shell">
          <section className="home-card area-screen-card">
            <TopActionBar onBack={exitToHome} onHome={exitToHome} onLogout={onLogout} />
            <p className="section-tag">Área</p>
            <h2>Agenda</h2>
            <AgendaPanel
              vacationStatus={currentUser.vacationStatus}
              vacationDeadlineAt={currentUser.vacationDeadlineAt}
              nextVacationStart={currentUser.nextVacationStart}
              nextVacationEnd={currentUser.nextVacationEnd}
              onSaved={refreshCurrentUser}
            />
          </section>
        </main>
      )
    }

    if (selectedArea.title === 'Gestão Operacional') {
      const activeOrgArea =
        (selectedOrgAreaId
          ? orgAreas.find((area) => area.id === selectedOrgAreaId)
          : null) ?? orgArea
      const activeCell = selectedOrgCell
        ? getOrgCell(selectedOrgCell, cellsForSelectedArea)
        : null
      const cellSubcells = selectedOrgCell ? visibleSubcellsForCell(selectedOrgCell) : []
      const showAreaPicker = !selectedOrgAreaId
      const canGoToAreaList = isAdmin || orgAreas.length > 1

      const leaveSelectedArea = () => {
        setSelectedOrgCell(null)
        setSelectedOrgSubcell(null)
        setGestaoHomeTab('dash')
        if (canGoToAreaList) {
          setSelectedOrgAreaId(null)
          return
        }
        if (isGestorView) return
        exitToHome()
      }

      return (
        <main className="shell">
          <section className="home-card area-screen-card">
            <TopActionBar
              onBack={
                selectedOrgCell
                  ? () => {
                      setSelectedOrgCell(null)
                      setSelectedOrgSubcell(null)
                      setGestaoHomeTab('celulas')
                    }
                  : selectedOrgAreaId
                    ? leaveSelectedArea
                    : isGestorView
                      ? undefined
                      : exitToHome
              }
              onHome={exitToHome}
              onLogout={onLogout}
            />
            <p className="section-tag">{isGestorView ? 'Home · Gestor' : 'Área'}</p>
            <h2>{showAreaPicker ? 'Gestão Operacional' : activeOrgArea.label}</h2>
                <p>
                  {showAreaPicker
                    ? 'Cada gestão operacional tem um nome. Selecione uma ou crie uma nova (administrador).'
                    : 'Painel gerencial da área. Acompanhe células, subcélulas e processos sob sua responsabilidade.'}
                </p>

            {showAreaPicker ? (
              <>
                {isAdmin ? (
                  <CreateOrgAreaForm
                    candidateUsers={registeredUsers}
                    busy={orgCellsBusy}
                    error={orgCellsError}
                    onCreate={handleCreateOrgArea}
                  />
                ) : null}
                <h3 className="lab-other-heading">Gestões operacionais</h3>
                <div className="home-areas" aria-label="Gestões operacionais">
                  {orgAreas.map((area) => (
                    <button
                      key={area.id}
                      className={`area-card ${getAreaCardClassName('Gestão Operacional')}`}
                      type="button"
                      onClick={() => {
                        setSelectedOrgAreaId(area.id)
                        setOrgArea(area)
                        setSelectedOrgCell(null)
                        setSelectedOrgSubcell(null)
                        setGestaoHomeTab('dash')
                        setOrgCellsError(null)
                      }}
                    >
                      <span className="area-card-title">
                        <ItemIcon title="Gestão Operacional" />
                        <span>{area.label}</span>
                      </span>
                      <span
                        className={`gestao-cell-status-badge ${
                          area.status === 'ativa' ? 'is-ativa' : 'is-pendente'
                        }`}
                      >
                        {area.status === 'ativa' ? 'Ativa' : 'Pendente'}
                      </span>
                      {area.responsibleName && area.substituteName ? (
                        <span className="gestao-cell-card-owner">
                          Resp.: {area.responsibleName}
                          {` · Subst.: ${area.substituteName}`}
                        </span>
                      ) : (
                        <span className="gestao-cell-card-owner is-empty">
                          {leadershipPendingReason(
                            area.responsibleUserId,
                            area.substituteUserId,
                          )}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
                {!orgAreas.length ? (
                  <p className="generated-password-empty">
                    Nenhuma gestão operacional cadastrada.
                  </p>
                ) : null}
              </>
            ) : !selectedOrgCell ? (
              <>
                {canManageOrgCells ? (
                  <AreaLeadershipEditor
                    key={`${activeOrgArea.id}:${activeOrgArea.label}:${activeOrgArea.responsibleUserId ?? 'none'}:${activeOrgArea.substituteUserId ?? 'none'}`}
                    title="Dados da gestão operacional"
                    hint="Você pode editar o nome a qualquer momento. A área também precisa de 1 responsável e 1 substituto; sem qualquer um dos dois, fica pendente."
                    area={activeOrgArea}
                    candidateUsers={registeredUsers}
                    canManage={canManageOrgCells}
                    busy={orgCellsBusy}
                    onSave={handleUpdateOrgArea}
                  />
                ) : null}

                <div
                  className="panel-switch gestao-home-switch"
                  role="tablist"
                  aria-label={`Home ${activeOrgArea.label}`}
                >
                  <button
                    className={gestaoHomeTab === 'dash' ? 'active' : ''}
                    type="button"
                    role="tab"
                    aria-selected={gestaoHomeTab === 'dash'}
                    onClick={() => setGestaoHomeTab('dash')}
                  >
                    Dash
                  </button>
                  <button
                    className={gestaoHomeTab === 'celulas' ? 'active' : ''}
                    type="button"
                    role="tab"
                    aria-selected={gestaoHomeTab === 'celulas'}
                    onClick={() => setGestaoHomeTab('celulas')}
                  >
                    Células
                  </button>
                  <button
                    className={gestaoHomeTab === 'pessoas' ? 'active' : ''}
                    type="button"
                    role="tab"
                    aria-selected={gestaoHomeTab === 'pessoas'}
                    onClick={() => setGestaoHomeTab('pessoas')}
                  >
                    Pessoas
                  </button>
                </div>

                {gestaoHomeTab === 'dash' ? (
                  <GestaoDashboard
                    view="dash"
                    area={activeOrgArea}
                    cells={cellsForSelectedArea}
                    candidateUsers={registeredUsers}
                    canManage={canManageOrgCells}
                    busy={orgCellsBusy}
                    error={orgCellsError}
                    onCreateCell={handleCreateOrgCell}
                  />
                ) : gestaoHomeTab === 'pessoas' ? (
                  <GestaoPessoasPanel
                    area={activeOrgArea}
                    cells={cellsForSelectedArea}
                    candidateUsers={registeredUsers}
                  />
                ) : (
                  <>
                    <GestaoDashboard
                      view="celulas"
                      area={activeOrgArea}
                      cells={cellsForSelectedArea}
                      candidateUsers={registeredUsers}
                      canManage={canManageOrgCells}
                      busy={orgCellsBusy}
                      error={orgCellsError}
                      onCreateCell={handleCreateOrgCell}
                    />
                    <h3 className="lab-other-heading">Células</h3>
                    <div
                      className="home-areas"
                      aria-label={`Células da área ${activeOrgArea.label}`}
                    >
                      {visibleOrgCells.map((cell) => (
                        <button
                          key={cell.id}
                          className={`area-card ${getAreaCardClassName(cell.id)}`}
                          type="button"
                          onClick={() => {
                            setSelectedOrgCell(cell.id)
                            setSelectedOrgSubcell(null)
                          }}
                        >
                          <span className="area-card-title">
                            <ItemIcon title={cell.id} />
                            <span>{cell.label}</span>
                          </span>
                          <span
                            className={`gestao-cell-status-badge ${
                              cell.status === 'ativa' ? 'is-ativa' : 'is-pendente'
                            }`}
                          >
                            {cell.status === 'ativa' ? 'Ativa' : 'Pendente'}
                          </span>
                          {cell.responsibleName && cell.substituteName ? (
                            <span className="gestao-cell-card-owner">
                              Resp.: {cell.responsibleName}
                              {` · Subst.: ${cell.substituteName}`}
                            </span>
                          ) : (
                            <span className="gestao-cell-card-owner is-empty">
                              {leadershipPendingReason(
                                cell.responsibleUserId,
                                cell.substituteUserId,
                              )}
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                    {!visibleOrgCells.length ? (
                      <p className="generated-password-empty">
                        Nenhuma célula disponível para o seu perfil.
                      </p>
                    ) : null}
                  </>
                )}
              </>
            ) : (
              <>
                <p className="consultar-summary">
                  Célula <strong>{activeCell?.label}</strong> · {activeCell?.ownerRoleLabel}
                </p>
                <p>{activeCell?.description}</p>
                {activeCell ? (
                  <CellResponsibleEditor
                    key={`${activeCell.id}:${activeCell.responsibleUserId ?? 'none'}:${activeCell.substituteUserId ?? 'none'}`}
                    cell={activeCell}
                    candidateUsers={registeredUsers}
                    canManage={canManageOrgCells}
                    busy={orgCellsBusy}
                    onAssign={(payload) =>
                      handleAssignOrgCellLeadership(activeCell.id, payload)
                    }
                    onDelete={
                      canManageOrgCells
                        ? () => handleDeleteOrgCell(activeCell.id)
                        : undefined
                    }
                  />
                ) : null}
                <h3 className="lab-other-heading">Subcélulas</h3>
                {activeCell?.status !== 'ativa' ? (
                  <div className="agenda-alert agenda-alert-blocked" role="alert">
                    <strong>Subcélulas bloqueadas.</strong>{' '}
                    {leadershipPendingReason(
                      activeCell?.responsibleUserId,
                      activeCell?.substituteUserId,
                    ) ?? 'Liderança incompleta'}
                    . Defina responsável e substituto para liberar o acesso.
                  </div>
                ) : null}
                {activeCell?.status === 'ativa' && cellSubcells.length ? (
                  <div
                    className="home-areas"
                    aria-label={`Subcélulas de ${activeCell?.label}`}
                  >
                    {cellSubcells.map((sub) => (
                      <button
                        key={sub.id}
                        className={`area-card ${getAreaCardClassName(sub.portalKey)}`}
                        type="button"
                        onClick={() => openOrgSubcell(selectedOrgCell, sub.portalKey)}
                      >
                        <span className="area-card-title">
                          <ItemIcon title={sub.portalKey} />
                          <span>{sub.label}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                ) : activeCell?.status === 'ativa' ? (
                  <p className="generated-password-empty">
                    Esta célula ainda não possui subcélulas cadastradas.
                  </p>
                ) : null}
              </>
            )}
          </section>
        </main>
      )
    }

    if (selectedArea.title === 'Usuários') {
      const statusLabel = (status: AppUser['approvalStatus']) =>
        status === 'approved' ? 'Aprovado' : 'Pendente'

      const leaveUsersArea = () => {
        clearAreaSections()
        handleAreaBack()
      }

      const handleDeleteRegisteredUser = async (user: AppUser) => {
        if (deletingUserId) return

        setDeletingUserId(user.id)
        try {
          await api.deleteUser(user.id)
          onDeleteUser(user.id)
          setSelectedUserDetail((current) =>
            current?.id === user.id ? null : current,
          )
          setUserPendingDelete(null)
          setPasswordFeedback({ type: 'success', message: 'Cadastro excluído.' })
        } catch (error) {
          setPasswordFeedback({
            type: 'error',
            message:
              error instanceof ApiError
                ? error.message
                : 'Não foi possível excluir o cadastro.',
          })
        } finally {
          setDeletingUserId(null)
        }
      }

      return (
        <main className="shell">
          <section className="home-card area-screen-card">
            <TopActionBar
              onBack={leaveUsersArea}
              onHome={exitToHome}
              onLogout={onLogout}
            />
            <p className="section-tag">Usuários</p>
            <h2>Gestão de usuários</h2>
            <p>
              Consulte os usuários com acesso ao portal, os cadastros pendentes e o
              dashboard de distribuição. Clique em um usuário para ver os dados e
              editar as informações.
            </p>

            {passwordFeedback ? (
              <LoginFeedback
                type={passwordFeedback.type}
                message={passwordFeedback.message}
                onClose={() => setPasswordFeedback(null)}
              />
            ) : null}

            {!isAdmin ? (
              <p className="generated-password-empty">
                Somente o perfil administrador pode gerenciar usuários.
              </p>
            ) : (
              <>
                <div className="panel-switch users-view-switch" role="tablist" aria-label="Usuários">
                  <button
                    className={usersView === 'usuarios' ? 'active' : ''}
                    type="button"
                    role="tab"
                    aria-selected={usersView === 'usuarios'}
                    onClick={() => setUsersView('usuarios')}
                  >
                    Usuários
                    <span className="users-view-count">{registeredUsers.length}</span>
                  </button>
                  <button
                    className={usersView === 'pendentes' ? 'active' : ''}
                    type="button"
                    role="tab"
                    aria-selected={usersView === 'pendentes'}
                    onClick={() => setUsersView('pendentes')}
                  >
                    Cadastros pendentes
                    <span className="users-view-count">{pendingApprovalUsers.length}</span>
                  </button>
                  <button
                    className={usersView === 'dashboard' ? 'active' : ''}
                    type="button"
                    role="tab"
                    aria-selected={usersView === 'dashboard'}
                    onClick={() => setUsersView('dashboard')}
                  >
                    Dashboard
                  </button>
                </div>

                {usersView === 'pendentes' ? (
                  <div className="approval-list" aria-label="Solicitações pendentes para aprovação">
                    {pendingApprovalUsers.length ? (
                      pendingApprovalUsers.map((user) => (
                        <PendingApprovalItem
                          key={user.id}
                          user={user}
                          approvedUsers={registeredUsers}
                          orgCells={orgCells}
                          terceiraOptions={terceiraOptions}
                          csdScopeOptions={csdScopeOptions}
                          showPassword={canViewUserPasswords}
                          onApprove={onApproveUser}
                          onReject={async (userId, reason) => {
                            const result = await onRejectUser(userId, reason)
                            setSelectedUserDetail((current) =>
                              current?.id === userId ? null : current,
                            )
                            return result
                          }}
                          onEdit={(user) => {
                            setUserDetailStartEditing(true)
                            setSelectedUserDetail(user)
                          }}
                          onFeedback={setPasswordFeedback}
                        />
                      ))
                    ) : (
                      <p className="generated-password-empty">
                        Nenhuma solicitação pendente no momento.
                      </p>
                    )}
                  </div>
                ) : usersView === 'dashboard' ? (
                  <UsersDashboard
                    users={users.filter((user) => user.role !== 'admin')}
                    pendingCount={pendingApprovalUsers.length}
                    approvedCount={registeredUsers.length}
                  />
                ) : (
                  <>
                    <p className="consultar-summary">
                      {registeredUsers.length} usuário(s) com acesso aprovado
                    </p>
                    <div className="entrada-table-wrap">
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>Foto</th>
                            <th>Nome</th>
                            <th>Matrícula</th>
                            {canViewUserPasswords ? <th>Senha</th> : null}
                            <th>E-mail</th>
                            <th>Cargo</th>
                            <th>Perfil</th>
                            <th>Status</th>
                            <th>Aprovado por</th>
                            <th>Solicitado em</th>
                            <th>Ações</th>
                          </tr>
                        </thead>
                        <tbody>
                          {registeredUsers.map((user) => (
                            <tr
                              key={user.id}
                              className="users-table-row"
                              tabIndex={0}
                              role="button"
                              aria-label={`Ver detalhes de ${user.name}`}
                              onClick={() => {
                                setUserDetailStartEditing(false)
                                setSelectedUserDetail(user)
                              }}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter' || event.key === ' ') {
                                  event.preventDefault()
                                  setUserDetailStartEditing(false)
                                  setSelectedUserDetail(user)
                                }
                              }}
                            >
                              <td className="users-table-photo-cell">
                                {user.profilePhoto ? (
                                  <img
                                    className="users-table-photo"
                                    src={user.profilePhoto}
                                    alt=""
                                  />
                                ) : (
                                  <span
                                    className="users-table-photo-placeholder"
                                    aria-hidden="true"
                                  >
                                    {user.name.trim().charAt(0).toUpperCase() || '?'}
                                  </span>
                                )}
                              </td>
                              <td className="users-table-cell-compact">{user.name}</td>
                              <td className="users-table-cell-nowrap">{user.registration}</td>
                              {canViewUserPasswords ? (
                                <td className="user-password-value users-table-cell-nowrap">
                                  {user.password?.trim() ? user.password : '—'}
                                </td>
                              ) : null}
                              <td className="users-table-cell-compact">{user.email}</td>
                              <td className="users-table-cell-nowrap">{user.jobTitle || '—'}</td>
                              <td className="users-table-cell-nowrap">
                                <button
                                  type="button"
                                  className="users-table-profile-button"
                                  aria-label={`Ver perfil de ${user.name}`}
                                  title="Ver perfil"
                                  onClick={(event) => {
                                    event.stopPropagation()
                                    setUserDetailStartEditing(false)
                                    setSelectedUserDetail(user)
                                  }}
                                >
                                  <svg viewBox="0 0 24 24" aria-hidden="true">
                                    <path
                                      d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="2"
                                      strokeLinecap="round"
                                    />
                                    <circle
                                      cx="9"
                                      cy="7"
                                      r="3"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="2"
                                    />
                                    <path
                                      d="M22 21v-2a4 4 0 00-3-3.87M16 3.13a3 3 0 010 5.74"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="2"
                                      strokeLinecap="round"
                                    />
                                  </svg>
                                </button>
                              </td>
                              <td className="users-table-cell-nowrap">
                                {statusLabel(user.approvalStatus)}
                              </td>
                              <td className="users-table-cell-compact">
                                {user.approvedByName || user.approvedByRegistration
                                  ? `${user.approvedByName || '—'}${
                                      user.approvedByRegistration
                                        ? ` (${user.approvedByRegistration})`
                                        : ''
                                    }`
                                  : '—'}
                              </td>
                              <td className="users-table-cell-nowrap">
                                {new Date(user.requestedAt).toLocaleString('pt-BR')}
                              </td>
                              <td className="users-table-actions">
                                <button
                                  type="button"
                                  className="users-table-delete-button"
                                  disabled={deletingUserId === user.id}
                                  aria-label={
                                    deletingUserId === user.id
                                      ? `Excluindo cadastro de ${user.name}`
                                      : `Excluir cadastro de ${user.name}`
                                  }
                                  title={
                                    deletingUserId === user.id
                                      ? 'Excluindo…'
                                      : 'Excluir cadastro'
                                  }
                                  onClick={(event) => {
                                    event.stopPropagation()
                                    if (deletingUserId) return
                                    setUserPendingDelete(user)
                                  }}
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
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {!registeredUsers.length ? (
                      <p className="generated-password-empty">
                        Nenhum usuário aprovado no momento.
                      </p>
                    ) : null}
                  </>
                )}
              </>
            )}

            {userPendingDelete
              ? createPortal(
                  <div
                    className="ensaios-block-modal-overlay"
                    role="presentation"
                    onClick={() => {
                      if (deletingUserId) return
                      setUserPendingDelete(null)
                    }}
                  >
                    <div
                      className="ensaios-block-modal"
                      role="dialog"
                      aria-modal="true"
                      aria-labelledby="delete-user-title"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <h3 id="delete-user-title">Excluir cadastro</h3>
                      <p className="ensaios-unblock-message">
                        Excluir o cadastro de{' '}
                        <strong>{userPendingDelete.name}</strong> (
                        {userPendingDelete.registration})? Esta ação não pode ser
                        desfeita.
                      </p>
                      <div className="ensaios-block-modal-actions">
                        <button
                          type="button"
                          className="secondary-button"
                          disabled={Boolean(deletingUserId)}
                          onClick={() => setUserPendingDelete(null)}
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          className="danger-button"
                          disabled={Boolean(deletingUserId)}
                          onClick={() => void handleDeleteRegisteredUser(userPendingDelete)}
                        >
                          {deletingUserId === userPendingDelete.id
                            ? 'Excluindo...'
                            : 'Excluir'}
                        </button>
                      </div>
                    </div>
                  </div>,
                  document.body,
                )
              : null}

            {selectedUserDetail
              ? createPortal(
                  <UserDetailModal
                    user={selectedUserDetail}
                    approvedUsers={registeredUsers}
                    orgCells={orgCells}
                    terceiraOptions={terceiraOptions}
                    showPassword={canViewUserPasswords}
                    startInEditMode={userDetailStartEditing}
                    onClose={() => {
                      setSelectedUserDetail(null)
                      setUserDetailStartEditing(false)
                    }}
                    onSaved={(user) => {
                      onUpdateUser(user)
                      setSelectedUserDetail(user)
                      setUserDetailStartEditing(false)
                    }}
                    onDeleted={(userId) => {
                      onDeleteUser(userId)
                      setSelectedUserDetail(null)
                      setUserDetailStartEditing(false)
                    }}
                    onFeedback={setPasswordFeedback}
                  />,
                  document.body,
                )
              : null}
          </section>
        </main>
      )
    }

    if (selectedArea.title === 'Cadastros') {
      return (
        <main className="shell">
          <section className="home-card area-screen-card">
            <TopActionBar
              onBack={handleAreaBack}
              onHome={exitToHome}
              onLogout={onLogout}
            />
            <p className="section-tag">Cadastros</p>
            <h2>Perfis e listas suspensas</h2>
            <CadastrosPanel isAdmin={isAdmin} />
          </section>
        </main>
      )
    }

    if (selectedArea.title === 'Medição' && selectedMeasurementSection) {
      if (selectedMeasurementSection === 'Geração de senha' && selectedPasswordAction) {
        if (selectedPasswordAction === 'fabricante') {
          return (
            <main className="shell">
              <section className="home-card area-screen-card">
                <TopActionBar
                  onBack={() => setSelectedPasswordAction('gerar')}
                  onHome={() => {
                    setSelectedPasswordAction(null)
                    setSelectedMeasurementSection(null)
                    setSelectedArea(null)
                  }}
                  onLogout={onLogout}
                />
                <p className="section-tag">Geração de Senha</p>
                <h2>Cadastrar fabricante</h2>
                <p>
                  Informe o nome do fabricante para adicionar na lista de geração
                  de senhas.
                </p>

                {passwordFeedback ? (
                  <LoginFeedback
                    type={passwordFeedback.type}
                    message={passwordFeedback.message}
                    onClose={() => setPasswordFeedback(null)}
                  />
                ) : null}

                <div className="manufacturer-page-form">
                  <label>
                    Nome do fabricante
                    <input
                      type="text"
                      placeholder="Digite o nome do fabricante"
                      value={newManufacturer}
                      onChange={(event) => setNewManufacturer(event.target.value)}
                    />
                  </label>

                  <button
                    className="primary-button"
                    type="button"
                    onClick={() => {
                      void handleAddManufacturer().then((added) => {
                        if (added) {
                          setSelectedPasswordAction('gerar')
                        }
                      })
                    }}
                  >
                    Salvar fabricante
                  </button>
                </div>
              </section>
            </main>
          )
        }

        if (selectedPasswordAction === 'gerar') {
          return (
            <main className="shell">
              <section className="home-card area-screen-card">
                <TopActionBar
                  onBack={() => setSelectedPasswordAction(null)}
                  onHome={() => {
                    setSelectedPasswordAction(null)
                    setSelectedMeasurementSection(null)
                    setSelectedArea(null)
                  }}
                  onLogout={onLogout}
                />
                <p className="section-tag">Geração de Senha</p>
                <h2>Gerar senha</h2>
                <p>
                  Cole vários números de medidor para gerar senhas em lote e copiar
                  toda a lista em duas colunas (medidor e senha).
                </p>
                {passwordFeedback ? (
                  <LoginFeedback
                    type={passwordFeedback.type}
                    message={passwordFeedback.message}
                    onClose={() => setPasswordFeedback(null)}
                  />
                ) : null}
                <div className="password-config-row">
                  <label>
                    Dígitos da senha
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={passwordDigitsInput}
                      onChange={(event) => setPasswordDigitsInput(event.target.value)}
                    />
                  </label>
                  <label>
                    Tipo da senha
                    <select
                      value={passwordType}
                      onChange={(event) =>
                        setPasswordType(
                          event.target.value as PasswordTypeSelection,
                        )
                      }
                    >
                      <option value="" disabled>
                        Selecione
                      </option>
                      <option value="alphanumeric">Alphanumérico</option>
                      <option value="letters">Só letras</option>
                      <option value="numbers">Só números</option>
                    </select>
                  </label>
                  <label>
                    Fabricante
                    <div className="manufacturer-select-row">
                      <select
                        value={selectedManufacturer}
                        onChange={(event) => setSelectedManufacturer(event.target.value)}
                      >
                        <option value="" disabled>
                          Selecione
                        </option>
                        {manufacturers.map((manufacturer) => (
                          <option key={manufacturer} value={manufacturer}>
                            {manufacturer}
                          </option>
                        ))}
                      </select>
                      <button
                        className="secondary-button manufacturer-add-button"
                        type="button"
                        onClick={() => setSelectedPasswordAction('fabricante')}
                        aria-label="Cadastrar novo fabricante"
                        title="Cadastrar novo fabricante"
                      >
                        +
                      </button>
                    </div>
                  </label>
                  <label>
                    Codigo de material
                    <select
                      value={selectedMaterialType}
                      onChange={(event) => setSelectedMaterialType(event.target.value)}
                    >
                      <option value="" disabled>
                        Selecione
                      </option>
                      {materialTypeOptions.map((material) => (
                        <option key={material} value={material}>
                          {material}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Numero de pedido
                    <input
                      type="text"
                      placeholder="Digite o numero do pedido"
                      value={orderNumber}
                      onChange={(event) => setOrderNumber(event.target.value)}
                    />
                  </label>
                </div>
                <div className="password-generator-grid">
                  <label>
                    Números dos medidores
                    <textarea
                      rows={7}
                      placeholder="Cole um número por linha ou separe por vírgula"
                      value={meterNumbersInput}
                      onChange={(event) => setMeterNumbersInput(event.target.value)}
                    />
                  </label>

                  <div>
                    <p className="generated-password-title">Senhas geradas</p>
                    <div className="generated-password-list" aria-label="Resultado das senhas geradas">
                      {generatedPasswords.length ? (
                        generatedPasswords.map((item) => (
                          <div
                            key={`${item.meter}-${item.password}`}
                            className={`generated-password-row ${item.status}`}
                          >
                            <span>{item.meter}</span>
                            <span>{item.password}</span>
                            <span>Data carimbo: {new Date(item.createdAt).toLocaleString('pt-BR')}</span>
                          </div>
                        ))
                      ) : (
                        <p className="generated-password-empty">
                          As senhas serão exibidas aqui após a geração.
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="area-actions">
                  <button className="primary-button" type="button" onClick={handleGeneratePassword}>
                    Gerar senhas
                  </button>
                  <button className="secondary-button" type="button" onClick={handleCopyAllPasswords}>
                    Copiar
                  </button>
                </div>
              </section>
            </main>
          )
        }

        if (selectedPasswordAction === 'consultar') {
          return (
            <main className="shell">
              <section className="home-card area-screen-card">
                <TopActionBar
                  onBack={() => setSelectedPasswordAction(null)}
                  onHome={() => {
                    setSelectedPasswordAction(null)
                    setSelectedMeasurementSection(null)
                    setSelectedArea(null)
                  }}
                  onLogout={onLogout}
                />
                <p className="section-tag">Geração de Senha</p>
                <h2>Consultar senhas</h2>
                <p>
                  Pesquise as senhas salvas no banco local por medidor, fabricante e
                  codigo de material.
                </p>

                <div className="consult-filters-grid">
                  <label>
                    Fabricante
                    <select
                      value={filterManufacturer}
                      onChange={(event) => setFilterManufacturer(event.target.value)}
                    >
                      <option value="Todos">Todos</option>
                      {manufacturers.map((manufacturer) => (
                        <option key={manufacturer} value={manufacturer}>
                          {manufacturer}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label>
                    Codigo de material
                    <select
                      value={filterMaterialType}
                      onChange={(event) => setFilterMaterialType(event.target.value)}
                    >
                      <option value="Todos">Todos</option>
                      {materialTypeOptions.map((material) => (
                        <option key={material} value={material}>
                          {material}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label>
                    Data inicial
                    <input
                      type="date"
                      value={filterStartDate}
                      onChange={(event) => setFilterStartDate(event.target.value)}
                    />
                  </label>

                  <label>
                    Data final
                    <input
                      type="date"
                      value={filterEndDate}
                      onChange={(event) => setFilterEndDate(event.target.value)}
                    />
                  </label>
                </div>

                <div className="area-actions">
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={handleCopyFilteredPasswords}
                  >
                    Copiar pesquisa
                  </button>
                </div>

                <label className="consult-meter-field">
                  Medidores
                  <textarea
                    rows={4}
                    placeholder="Digite um ou mais medidores, um por linha ou separados por vírgula"
                    value={filterMetersInput}
                    onChange={(event) => setFilterMetersInput(event.target.value)}
                  />
                </label>

                <div className="consult-results" aria-label="Resultados da consulta de senhas">
                  {filteredPasswordRecords.length ? (
                    filteredPasswordRecords.map((record) => (
                      <article key={record.id} className="consult-item">
                        <strong>{record.meter}</strong>
                        <span>Senha: {record.password}</span>
                        <span>Fabricante: {record.manufacturer}</span>
                        <span>Codigo de material: {record.materialType}</span>
                        <span>Numero de pedido: {record.orderNumber || '-'}</span>
                        <span>Data carimbo: {new Date(record.createdAt).toLocaleString('pt-BR')}</span>
                      </article>
                    ))
                  ) : (
                    <p className="generated-password-empty">
                      Nenhum registro encontrado com os filtros atuais.
                    </p>
                  )}
                </div>

                {passwordFeedback ? (
                  <LoginFeedback
                    type={passwordFeedback.type}
                    message={passwordFeedback.message}
                    onClose={() => setPasswordFeedback(null)}
                  />
                ) : null}
              </section>
            </main>
          )
        }

        return (
          <main className="shell">
            <section className="home-card area-screen-card">
              <TopActionBar
                onBack={() => {
                  setSelectedPasswordAction(null)
                  setSelectedMeasurementSection(null)
                }}
                onHome={() => {
                  setSelectedPasswordAction(null)
                  setSelectedMeasurementSection(null)
                  setSelectedArea(null)
                }}
                onLogout={onLogout}
              />
              <p className="section-tag">Geração de Senha</p>
              <h2>
                {selectedPasswordAction === 'gerar'
                  ? 'Gerar senha'
                  : 'Consultar senhas'}
              </h2>
              <p>
                Página dedicada para {selectedPasswordAction === 'gerar' ? 'geração' : 'consulta'}
                {' '}de senhas, com regras e rastreabilidade de operação.
              </p>
            </section>
          </main>
        )
      }

      return (
        <main className="shell">
          <section className="home-card area-screen-card">
            <TopActionBar
              onBack={() => {
                setSelectedPasswordAction(null)
                setSelectedMeasurementSection(null)
              }}
              onHome={() => {
                setSelectedPasswordAction(null)
                setSelectedMeasurementSection(null)
                setSelectedArea(null)
              }}
              onLogout={onLogout}
            />
            <p className="section-tag">Subárea de Medição</p>
            <h2>{selectedMeasurementSection}</h2>
            <p>
              Página dedicada da subárea {selectedMeasurementSection}. Aqui você
              poderá concentrar funcionalidades, filtros e relatórios específicos.
            </p>
            {selectedMeasurementSection === 'Geração de senha' ? (
              <div className="measurement-sections" aria-label="Opções de geração de senha">
                <button
                  className="measurement-item"
                  type="button"
                  onClick={() => setSelectedPasswordAction('gerar')}
                >
                  Gerar senha
                </button>
                <button
                  className="measurement-item"
                  type="button"
                  onClick={() => setSelectedPasswordAction('consultar')}
                >
                  Consultar senhas
                </button>
              </div>
            ) : null}
          </section>
        </main>
      )
    }

    if (
      selectedArea.title === 'Equipe de campo' &&
      selectedFieldTeamSection
    ) {
      return (
        <main className="shell">
          <section className="home-card area-screen-card">
            <TopActionBar
              onBack={
                flattenFieldTeamHome
                  ? exitToHome
                  : () => setSelectedFieldTeamSection(null)
              }
              onHome={() => {
                setSelectedFieldTeamSection(null)
                setSelectedArea(null)
              }}
              onLogout={onLogout}
            />
            <p className="section-tag">
              {flattenFieldTeamHome ? 'Portal' : 'Equipe de campo'}
            </p>
            {selectedFieldTeamSection !== 'Agendar' ? (
              <h2>{selectedFieldTeamSection}</h2>
            ) : null}
            {selectedFieldTeamSection === 'Agendar' ? (
              <FieldTeamCadastrarForm
                requireToiTeam={isLavraturaBackofficeScope(currentUser.workSubtype)}
              />
            ) : selectedFieldTeamSection === 'Meus TOIs' ? (
              <FieldTeamConsultarPanel mode="mine" />
            ) : (
              <FieldTeamConsultarPanel />
            )}
          </section>
        </main>
      )
    }

    if (
      selectedArea.title === 'Laboratório de Medição' &&
      selectedLabMeasurementSection
    ) {
      return (
        <main className="shell">
          <section className="home-card area-screen-card">
            <TopActionBar
              onBack={() => setSelectedLabMeasurementSection(null)}
              onHome={() => {
                setSelectedLabMeasurementSection(null)
                setSelectedArea(null)
              }}
              onLogout={onLogout}
            />
            <p className="section-tag">Laboratório de Medição</p>
            <h2>
              {LAB_TRAIL_KEYS.has(selectedLabMeasurementSection)
                ? getLabTrailLabel(selectedLabMeasurementSection)
                : selectedLabMeasurementSection}
            </h2>
            {selectedLabMeasurementSection !== 'Calendário de ensaios' &&
            selectedLabMeasurementSection !== 'CSDs' &&
            selectedLabMeasurementSection !== 'Suporte' &&
            selectedLabMeasurementSection !== 'Auditoria' &&
            selectedLabMeasurementSection !== 'Galeria' &&
            selectedLabMeasurementSection !== 'Consultar RATM' &&
            selectedLabMeasurementSection !== 'Criar Modelo' &&
            selectedLabMeasurementSection !== 'Apresentação' ? (
              <LabMeasurementTrail
                activeStep={selectedLabMeasurementSection}
                onSelect={setSelectedLabMeasurementSection}
                renderIcon={(title) => <ItemIcon title={title} />}
                stepCounts={trailStepCounts}
              />
            ) : null}
            {selectedLabMeasurementSection === 'Calendário de ensaios' ? (
              <EnsaiosCalendar />
            ) : selectedLabMeasurementSection === 'CSDs' ? (
              <CsdsPanel />
            ) : selectedLabMeasurementSection === 'Suporte' ? (
              <SupportPanel onOpenCountChange={setOpenSupportCount} />
            ) : selectedLabMeasurementSection === 'Auditoria' ? (
              <AuditPanel />
            ) : selectedLabMeasurementSection === 'Galeria' ? (
              <GalleryPanel />
            ) : selectedLabMeasurementSection === 'Consultar RATM' ? (
              <ConsultarRatmPanel />
            ) : selectedLabMeasurementSection === 'Criar Modelo' ? (
              <CriarModeloPanel />
            ) : selectedLabMeasurementSection === 'Apresentação' ? (
              <ApresentacaoPanel />
            ) : selectedLabMeasurementSection === ENTRADA_TRAIL_STEP ? (
              <EntradaPanel onTrailCountsChange={refreshTrailStepCounts} />
            ) : selectedLabMeasurementSection === 'Agendar' ? (
              <>
                <p>Preencha os dados abaixo para reservar a data de agendamento.</p>
                <ScheduleAgendarForm />
              </>
            ) : selectedLabMeasurementSection === 'Ensaiar' ? (
              <>
                <p>Escolha quantos RATMs deseja realizar de uma vez (máximo 10).</p>
                <EnsaiarForm onFinish={handleRatmFinish} />
              </>
            ) : selectedLabMeasurementSection === 'Aprovação de RATM' ? (
              <RatmAprovacaoPanel
                laudos={ratmLaudos}
                onLaudoUpdated={(laudo) => {
                  setRatmLaudos((prev) =>
                    prev.map((item) => (item.id === laudo.id ? laudo : item)),
                  )
                }}
                onLaudoApproved={(laudo) => {
                  setRatmLaudos((prev) =>
                    prev.map((item) => (item.id === laudo.id ? laudo : item)),
                  )
                  setPasswordFeedback({
                    type: 'success',
                    message: `Laudo RATM ${laudo.ratmNumber} aprovado com sucesso.`,
                  })
                }}
              />
            ) : (
              <p>
                Página dedicada da área {selectedLabMeasurementSection}. Aqui você
                pode concentrar funcionalidades e informações específicas do
                laboratório.
              </p>
            )}
          </section>
        </main>
      )
    }

    if (
      selectedArea.title === 'Laboratório de Homologação' &&
      selectedHomologationSection
    ) {
      if (selectedHomologationSection === 'Pedidos de Homologação') {
        return (
          <main className="shell">
            <section className="home-card area-screen-card">
              <TopActionBar
                onBack={() => setSelectedHomologationSection(null)}
                onHome={() => {
                  setSelectedHomologationSection(null)
                  setSelectedArea(null)
                }}
                onLogout={onLogout}
              />
              <p className="section-tag">Laboratório de Homologação</p>
              <h2>Pedidos de Homologação</h2>
              <p>
                Compartilhe o link com a área de Compras. O acesso exige login,
                cadastro prévio e aprovação do ADM antes do preenchimento do formulário.
              </p>

              <div className="link-share-card">
                <label className="full-width">
                  Link do formulário
                  <input type="text" value={fixedRequestLink} readOnly />
                </label>
                <div className="area-actions">
                  <button
                    className="primary-button compact-button"
                    type="button"
                    onClick={handleCopyFixedRequestLink}
                  >
                    Copiar link
                  </button>
                  <a className="secondary-button compact-link-button" href={FIXED_PURCHASE_REQUEST_HASH}>
                    Abrir link
                  </a>
                </div>
              </div>

              {passwordFeedback ? (
                <LoginFeedback
                  type={passwordFeedback.type}
                  message={passwordFeedback.message}
                  onClose={() => setPasswordFeedback(null)}
                />
              ) : null}

              <div className="approval-list" aria-label="Pedidos recebidos de homologação">
                {homologationRequests.length ? (
                  homologationRequests.map((request) => (
                    <article key={request.id} className="approval-item">
                      <div>
                        <strong>{request.requesterName}</strong>
                        <span>Perfil: {request.requesterArea}</span>
                        <span>Matrícula: {request.requesterRegistration}</span>
                        <span>E-mail: {request.requesterEmail}</span>
                        <span>Número do pedido: {request.orderNumber}</span>
                        <span>Fabricante: {request.manufacturer}</span>
                        <div className="request-items-list" aria-label="Itens do pedido">
                          {request.items.map((item, index) => (
                            <div key={`${request.id}-${index}`} className="request-item-row">
                              <span>
                                Item {index + 1}: Tipo {item.equipmentType} | Código {item.materialCode} |
                                {' '}Quantidade {item.quantity} | Descrição {item.description}
                              </span>
                            </div>
                          ))}
                        </div>
                        <span>Observações sobre o pedido: {request.justification}</span>
                        <span>
                          Enviado em {new Date(request.requestedAt).toLocaleString('pt-BR')}
                        </span>
                      </div>
                      <span className="status-badge">{request.status}</span>
                    </article>
                  ))
                ) : (
                  <p className="generated-password-empty">
                    Nenhum pedido de homologação foi enviado ainda.
                  </p>
                )}
              </div>
            </section>
          </main>
        )
      }

      if (selectedHomologationSection === 'Código de materiais') {
        if (selectedCodeMaterialsAction === 'create') {
          return (
            <main className="shell">
              <section className="home-card area-screen-card">
                <TopActionBar
                  onBack={() => {
                    resetMaterialForm()
                    setSelectedCodeMaterialsAction(null)
                  }}
                  onHome={() => {
                    resetMaterialForm()
                    setSelectedCodeMaterialsAction(null)
                    setSelectedHomologationSection(null)
                    setSelectedArea(null)
                  }}
                  onLogout={onLogout}
                />
                <p className="section-tag">Laboratório de Homologação</p>
                <h2>Cadastrar novo material</h2>
                <p>
                  Informe os dados do material para adicionar um novo registro na
                  tabela de código de materiais.
                </p>

                {passwordFeedback ? (
                  <LoginFeedback
                    type={passwordFeedback.type}
                    message={passwordFeedback.message}
                    onClose={() => setPasswordFeedback(null)}
                  />
                ) : null}

                <div className="material-form-grid">
                  <label>
                    Material
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={8}
                      placeholder="Digite 8 números"
                      value={materialForm.material}
                      onChange={(event) =>
                        setMaterialForm((prev) => ({
                          ...prev,
                          material: event.target.value.replace(/\D/g, '').slice(0, 8),
                        }))
                      }
                    />
                  </label>
                  <label>
                    Código antigo
                    <input
                      type="text"
                      value={materialForm.oldCode}
                      onChange={(event) =>
                        setMaterialForm((prev) => ({ ...prev, oldCode: event.target.value }))
                      }
                    />
                  </label>
                  <label className="full-width">
                    Tipo do equipamento
                    <select
                      value={materialForm.equipmentType}
                      onChange={(event) =>
                        setMaterialForm((prev) => ({
                          ...prev,
                          equipmentType: event.target.value,
                        }))
                      }
                    >
                      <option value="" disabled>
                        Selecione
                      </option>
                      <option value="Medidor">Medidor</option>
                      <option value="TC">TC</option>
                      <option value="TP">TP</option>
                      <option value="Remota">Remota</option>
                      <option value="Concentrador">Concentrador</option>
                      <option value="Conjunto de medição">Conjunto de medição</option>
                    </select>
                  </label>
                  <label className="full-width">
                    Descrição
                    <textarea
                      rows={4}
                      value={materialForm.description}
                      onChange={(event) =>
                        setMaterialForm((prev) => ({
                          ...prev,
                          description: event.target.value,
                        }))
                      }
                    />
                  </label>
                </div>

                <div className="area-actions">
                  <button className="primary-button" type="button" onClick={handleCreateMaterial}>
                    Salvar material
                  </button>
                </div>
              </section>
            </main>
          )
        }

        return (
          <main className="shell">
            <section className="home-card area-screen-card">
              <TopActionBar
                onBack={() => setSelectedHomologationSection(null)}
                onHome={() => {
                  setSelectedHomologationSection(null)
                  setSelectedArea(null)
                }}
                onLogout={onLogout}
              />
              <p className="section-tag">Laboratório de Homologação</p>
              <h2>Código de materiais</h2>
              <p>
                Consulte a estrutura de materiais homologados com seus códigos antigo
                e novo, descrição e identificação técnica.
              </p>

              <div className="area-actions right-aligned-actions">
                <button
                  className="primary-button"
                  type="button"
                  onClick={() => {
                    resetMaterialForm()
                    setPasswordFeedback(null)
                    setSelectedCodeMaterialsAction('create')
                  }}
                >
                  Cadastrar novo material
                </button>
              </div>

              <div className="materials-filters-grid">
                <label>
                  Código do material
                  <input
                    type="text"
                    value={materialCodeFilter}
                    onChange={(event) => setMaterialCodeFilter(event.target.value)}
                    placeholder="Filtrar por código"
                  />
                </label>
                <label>
                  Código antigo
                  <input
                    type="text"
                    value={materialOldCodeFilter}
                    onChange={(event) => setMaterialOldCodeFilter(event.target.value)}
                    placeholder="Filtrar por código antigo"
                  />
                </label>
                <label>
                  Descrição do material
                  <input
                    type="text"
                    value={materialDescriptionFilter}
                    onChange={(event) => setMaterialDescriptionFilter(event.target.value)}
                    placeholder="Filtrar por descrição"
                  />
                </label>
                <label>
                  Tipo do equipamento
                  <select
                    value={materialEquipmentTypeFilter}
                    onChange={(event) => setMaterialEquipmentTypeFilter(event.target.value)}
                  >
                    <option value="Todos">Todos</option>
                    <option value="Medidor">Medidor</option>
                    <option value="TC">TC</option>
                    <option value="TP">TP</option>
                    <option value="Remota">Remota</option>
                    <option value="Concentrador">Concentrador</option>
                    <option value="Conjunto de medição">Conjunto de medição</option>
                  </select>
                </label>
              </div>

              <div className="table-wrap" aria-label="Tabela de código de materiais">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Código do material</th>
                      <th>Código antigo</th>
                      <th>Descrição do material</th>
                      <th>Tipo do equipamento</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredMaterialRows.map((row) => (
                      <tr key={`${row.newCode}-${row.material}`}>
                        <td>{row.material}</td>
                        <td>{row.oldCode}</td>
                        <td>{row.description}</td>
                        <td>{row.equipmentType}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </main>
        )

      }

      if (selectedHomologationSection === 'Homologações') {
        return (
          <main className="shell">
            <section className="home-card area-screen-card">
              <TopActionBar
                onBack={() => setSelectedHomologationSection(null)}
                onHome={() => {
                  setSelectedHomologationSection(null)
                  setSelectedArea(null)
                }}
                onLogout={onLogout}
              />
              <p className="section-tag">Laboratório de Homologação</p>
              <h2>Homologações</h2>
              <p>
                Acompanhe os processos homologados e o histórico de conclusões
                nesta etapa final da trilha.
              </p>
              <p className="generated-password-empty">
                Nenhuma homologação registrada ainda.
              </p>
            </section>
          </main>
        )
      }

      return (
        <main className="shell">
          <section className="home-card area-screen-card">
            <TopActionBar
              onBack={() => setSelectedHomologationSection(null)}
              onHome={() => {
                setSelectedHomologationSection(null)
                setSelectedArea(null)
              }}
              onLogout={onLogout}
            />
            <p className="section-tag">Laboratório de Homologação</p>
            <h2>{selectedHomologationSection}</h2>
            <p>
              Página dedicada da área {selectedHomologationSection}. Aqui você
              pode concentrar funcionalidades e informações específicas da
              homologação.
            </p>
          </section>
        </main>
      )
    }

    return (
      <main className="shell">
        <section className="home-card area-screen-card">
          <TopActionBar
            onBack={handleAreaBack}
            onHome={exitToHome}
            onLogout={onLogout}
          />
          <p className="section-tag">
            {selectedOrgCell ? `Subcélula · ${selectedOrgCell}` : 'Área'}
          </p>
          <h2>{selectedArea.title}</h2>
          {selectedArea.details ? <p>{selectedArea.details}</p> : null}
          {selectedArea.title === 'Medição' ? (
            <div className="measurement-sections" aria-label="Subáreas de medição">
              {measurementSections.map((section) => (
                <button
                  key={section}
                  className="measurement-item"
                  type="button"
                  onClick={() => {
                    setSelectedPasswordAction(null)
                    setSelectedMeasurementSection(section)
                  }}
                >
                  <span className="item-with-icon">
                    <ItemIcon title={section} />
                    <span>{section}</span>
                  </span>
                </button>
              ))}
            </div>
          ) : null}
          {selectedArea.title === 'Laboratório de Medição' ? (
            <>
              <LabMeasurementTrail
                activeStep={null}
                onSelect={setSelectedLabMeasurementSection}
                renderIcon={(title) => <ItemIcon title={title} />}
              />
              {labHighlightedSections.length > 0 ? (
                <div
                  className="measurement-sections lab-highlighted-sections"
                  aria-label="Processos em evidência do laboratório"
                >
                  {labHighlightedSections.map((section) => (
                    <button
                      key={section}
                      className="measurement-item measurement-item-highlighted"
                      type="button"
                      onClick={() => setSelectedLabMeasurementSection(section)}
                    >
                      <span className="item-with-icon">
                        <ItemIcon title={section} />
                        <span>{section}</span>
                      </span>
                    </button>
                  ))}
                </div>
              ) : null}
              {labOtherSections.length > 0 ? (
                <>
                  <h3 className="lab-other-heading">Demais processos</h3>
                  <div
                    className="measurement-sections lab-other-sections"
                    aria-label="Demais processos do laboratório"
                  >
                  {labOtherSections.map((section) => (
                    <button
                      key={section}
                      className="measurement-item"
                      type="button"
                      onClick={() => setSelectedLabMeasurementSection(section)}
                    >
                      <span className="item-with-icon measurement-item-row">
                        <ItemIcon title={section} />
                        <span>{section}</span>
                        {section === 'Suporte' && openSupportCount > 0 ? (
                          <span
                            className="support-alert-badge"
                            aria-label={`${openSupportCount} solicitação(ões) de suporte em aberto`}
                          >
                            Alerta
                            {openSupportCount > 1 ? ` · ${openSupportCount}` : ''}
                          </span>
                        ) : null}
                      </span>
                    </button>
                  ))}
                </div>
                </>
              ) : null}
            </>
          ) : null}
          {selectedArea.title === 'Laboratório de Homologação' ? (
            <LabMeasurementTrail
              activeStep={null}
              onSelect={setSelectedHomologationSection}
              renderIcon={(title) => <ItemIcon title={title} />}
              steps={HOMOLOGATION_TRAIL_STEPS}
              ariaLabel="Trilha operacional da homologação"
            />
          ) : null}
          {selectedArea.title === 'Equipe de campo' ? (
            flattenFieldTeamHome ? null : (
            <div className="measurement-sections" aria-label="Funções da equipe de campo">
              {fieldTeamSections.map((section) => (
                <button
                  key={section}
                  className="measurement-item"
                  type="button"
                  onClick={() => setSelectedFieldTeamSection(section)}
                >
                  <span className="item-with-icon">
                    <ItemIcon title={section} />
                    <span>{section}</span>
                  </span>
                </button>
              ))}
            </div>
            )
          ) : null}
        </section>
      </main>
    )
  }

  return (
    <main className="shell">
      <section className="home-card">
        <TopActionBar onLogout={onLogout} />
        <p className="section-tag">Home</p>
        <h2>Bem-vindo ao portal, {currentUser.name}</h2>

        {coveringFor.length && !coveringAlertDismissed ? (
          <div className="agenda-alert agenda-alert-ok has-dismiss" role="status">
            <span className="agenda-alert-message">
              <strong>Cobertura de ausência.</strong> Você está atuando como substituto de{' '}
              {coveringFor.map((item, index) => (
                <span key={item.userId}>
                  {index > 0 ? '; ' : null}
                  <strong>{item.name}</strong>
                  {item.absenceTypeLabel ? ` (${item.absenceTypeLabel})` : ''}
                  {` ${item.vacationStart.slice(8, 10)}/${item.vacationStart.slice(5, 7)} a ${item.vacationEnd.slice(8, 10)}/${item.vacationEnd.slice(5, 7)}`}
                </span>
              ))}
              . As atividades desses titulares estão atreladas a você neste período.
            </span>
            <button
              type="button"
              className="notice-dismiss"
              aria-label="Fechar aviso"
              onClick={() => setCoveringAlertDismissed(true)}
            >
              ×
            </button>
          </div>
        ) : null}

        {currentUser.role !== 'admin' &&
        !skipsVacation &&
        currentUser.vacationStatus === 'pendente' ? (
          <div className="agenda-alert agenda-alert-pending" role="status">
            <div className="agenda-alert-body">
              <p className="agenda-alert-text">
                <strong>Férias pendentes.</strong> Acesse a Agenda e registre o próximo período de
                férias
                {currentUser.vacationDeadlineAt
                  ? ` até ${new Date(currentUser.vacationDeadlineAt).toLocaleString('pt-BR')}`
                  : ' nos próximos 7 dias'}
                . Depois disso o perfil será bloqueado.
              </p>
              {agendaArea ? (
                <button
                  type="button"
                  className="agenda-alert-action"
                  onClick={() => {
                    setSelectedOrgCell(null)
                    setSelectedOrgSubcell(null)
                    setSelectedArea(agendaArea)
                  }}
                >
                  Ir para a Agenda
                </button>
              ) : null}
            </div>
          </div>
        ) : null}

        {isAdmin ? (
          <div className="profile-preview-bar">
            <div className="profile-preview-mode" role="group" aria-label="Modo de pré-visualização">
              <button
                type="button"
                className={`profile-preview-mode-btn${previewMode === 'profile' ? ' is-active' : ''}`}
                aria-pressed={previewMode === 'profile'}
                onClick={() => {
                  setPreviewMode('profile')
                  setPreviewUserId('')
                  setSelectedArea(null)
                  setSelectedOrgAreaId(null)
                  setSelectedOrgCell(null)
                  setSelectedOrgSubcell(null)
                  clearAreaSections()
                }}
              >
                Por perfil
              </button>
              <button
                type="button"
                className={`profile-preview-mode-btn${previewMode === 'user' ? ' is-active' : ''}`}
                aria-pressed={previewMode === 'user'}
                onClick={() => {
                  setPreviewMode('user')
                  setPreviewProfileId(ADMIN_PREVIEW_PROFILE_ID)
                  setSelectedArea(null)
                  setSelectedOrgAreaId(null)
                  setSelectedOrgCell(null)
                  setSelectedOrgSubcell(null)
                  clearAreaSections()
                }}
              >
                Por usuário
              </button>
            </div>

            {previewMode === 'profile' ? (
              <label htmlFor="admin-preview-profile">
                Ver como o perfil ({previewProfileOptions.length} perfis)
                <select
                  id="admin-preview-profile"
                  value={resolvedPreviewProfileId}
                  onChange={(event) => {
                    setPreviewProfileId(event.target.value)
                    setSelectedArea(null)
                    setSelectedOrgAreaId(null)
                    setSelectedOrgCell(null)
                    setSelectedOrgSubcell(null)
                    clearAreaSections()
                  }}
                >
                  <option value={ADMIN_PREVIEW_PROFILE_ID}>
                    Administrador (visão completa)
                  </option>
                  {previewProfileOptions.map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {profile.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <label htmlFor="admin-preview-user">
                Ver como o usuário ({previewUserOptions.length} aprovados)
                <select
                  id="admin-preview-user"
                  value={previewUserId}
                  onChange={(event) => {
                    setPreviewUserId(event.target.value)
                    setSelectedArea(null)
                    setSelectedOrgAreaId(null)
                    setSelectedOrgCell(null)
                    setSelectedOrgSubcell(null)
                    clearAreaSections()
                  }}
                >
                  <option value="">Selecione um usuário</option>
                  {previewUserOptions.map((user) => {
                    const profileLabel = buildRequestedProfile(
                      user.jobTitle ?? '',
                      user.workSubtype ?? '',
                      user.workArea ?? '',
                    )
                    return (
                      <option key={user.id} value={user.id}>
                        {user.name} ({user.registration})
                        {profileLabel ? ` — ${profileLabel}` : ''}
                      </option>
                    )
                  })}
                </select>
              </label>
            )}

            {previewProfile ? (
              <p className="profile-preview-note">
                Pré-visualização: <strong>{previewProfile.name}</strong>. Só as áreas desse
                perfil aparecem abaixo.
              </p>
            ) : null}
            {previewUser ? (
              <p className="profile-preview-note">
                Pré-visualização: <strong>{previewUser.name}</strong> (
                {previewUser.registration}
                ). Home e processos conforme o cadastro deste usuário.
              </p>
            ) : null}
            {previewMode === 'user' && !previewUser ? (
              <p className="profile-preview-note">
                Selecione um usuário aprovado para ver a home como ele vê.
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="home-areas" aria-label="Áreas do portal">
          {flattenFieldTeamHome
            ? fieldTeamSections.map((section) => (
                <button
                  key={section}
                  className={`area-card ${getAreaCardClassName(section)}`}
                  type="button"
                  onClick={() => {
                    if (!fieldTeamArea) return
                    setSelectedOrgCell(null)
                    setSelectedOrgSubcell(null)
                    setSelectedArea(fieldTeamArea)
                    setSelectedFieldTeamSection(section)
                  }}
                >
                  <span className="area-card-title">
                    <ItemIcon title={section} />
                    <span>{section}</span>
                  </span>
                </button>
              ))
            : null}
          <button
            className={`area-card ${getAreaCardClassName('Suporte')}`}
            type="button"
            onClick={() => setShowSupport(true)}
          >
            <span className="area-card-title">
              <ItemIcon title="Suporte" />
              <span>Suporte</span>
            </span>
          </button>
          {areas.map((area) => (
            <button
              key={area.title}
              className={`area-card ${getAreaCardClassName(area.title)}`}
              type="button"
              onClick={() => {
                setSelectedOrgCell(null)
                setSelectedOrgSubcell(null)
                setSelectedArea(area)
              }}
            >
              <span className="area-card-title">
                <ItemIcon title={area.title} />
                <span>{area.title}</span>
              </span>
            </button>
          ))}
        </div>

        {showAssignedProcesses &&
        (assignedProcessesLoading ||
          assignedProcesses.length > 0 ||
          showEstagiarioHome ||
          previewProfile?.id === 'estagiario-medicao') ? (
          <div className="home-assigned-processes" aria-label="Seus processos">
            <h3>Seus processos</h3>
            {assignedProcessesLoading ? (
              <p className="home-assigned-processes-empty">Carregando processos…</p>
            ) : assignedProcesses.length ? (
              <div
                className="home-assigned-processes-grid"
                aria-label="Processos atribuídos para execução"
              >
                {assignedProcesses.map((item) => (
                  <button
                    key={item.processKey}
                    type="button"
                    className="area-card home-assigned-process-card"
                    onClick={() => openAssignedProcess(item.area, item.process)}
                  >
                    <span className="area-card-title">
                      <ItemIcon title={item.process} />
                      <span>{item.process}</span>
                    </span>
                    <span className="home-assigned-process-area">{item.area}</span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="home-assigned-processes-empty">
                Nenhum processo atribuído a você
              </p>
            )}
          </div>
        ) : null}

        {previewProfile ? (
          <div className="profile-preview-people" aria-label={`Pessoas com o perfil ${previewProfile.name}`}>
            <h3>Pessoas com este perfil</h3>
            <p className="profile-preview-note">
              {previewProfileUsers.length
                ? `${previewProfileUsers.length} usuário(s) aprovado(s) com o perfil ${previewProfile.name}.`
                : `Nenhum usuário aprovado cadastrado com o perfil ${previewProfile.name}.`}
            </p>
            {previewProfileUsers.length ? (
              <div className="entrada-table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Nome</th>
                      <th>Matrícula</th>
                      <th>E-mail</th>
                      <th>Cidade</th>
                      <th>Tipo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewProfileUsers.map((user) => (
                      <tr key={user.id}>
                        <td>{user.name}</td>
                        <td>{user.registration}</td>
                        <td>{user.email}</td>
                        <td>{user.locality || '—'}</td>
                        <td>{user.employmentType || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>
        ) : null}
      </section>
      <SupportRequestModal open={showSupport} onClose={() => setShowSupport(false)} />
    </main>
  )
}

type HomologationRequestPortalProps = {
  currentUser: AppUser
  activeRoute: AppRoute
  manufacturers: string[]
  materialCatalog: MaterialCatalogItem[]
  onCreateHomologationRequest: (
    payload: Omit<
      HomologationRequest,
      | 'id'
      | 'requesterUserId'
      | 'requesterName'
      | 'requesterRegistration'
      | 'requesterEmail'
      | 'requesterArea'
      | 'requestedAt'
      | 'status'
    >,
  ) => Promise<void>
  onLogout: () => Promise<void>
}

type RequestGroupForm = {
  id: string
  equipmentType: string
  materialCode: string
  quantityInput: string
  description: string
}

function createEmptyRequestGroup(id: string): RequestGroupForm {
  return {
    id,
    equipmentType: '',
    materialCode: '',
    quantityInput: '',
    description: '',
  }
}

function HomologationRequestPortal({
  activeRoute,
  manufacturers,
  materialCatalog,
  onCreateHomologationRequest,
  onLogout,
}: HomologationRequestPortalProps) {
  const [orderNumber, setOrderNumber] = useState('')
  const [manufacturer, setManufacturer] = useState('')
  const [requestGroups, setRequestGroups] = useState<RequestGroupForm[]>([
    createEmptyRequestGroup('group-1'),
  ])
  const [justification, setJustification] = useState('')
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error'
    message: string
  } | null>(null)

  const handleGroupChange = (
    groupId: string,
    key: 'equipmentType' | 'materialCode' | 'quantityInput' | 'description',
    value: string,
  ) => {
    setRequestGroups((prev) =>
      prev.map((group) => {
        if (group.id !== groupId) {
          return group
        }

        if (key === 'equipmentType') {
          return {
            ...group,
            equipmentType: value,
            materialCode: '',
            description: '',
          }
        }

        if (key === 'materialCode') {
          const selectedMaterial = materialCatalog.find(
            (item) => item.equipmentType === group.equipmentType && item.code === value,
          )

          return {
            ...group,
            materialCode: value,
            description: selectedMaterial?.description ?? '',
          }
        }

        return {
          ...group,
          [key]: value,
        }
      }),
    )
  }

  const handleAddGroup = () => {
    setRequestGroups((prev) => [
      ...prev,
      createEmptyRequestGroup(`group-${Date.now()}-${prev.length + 1}`),
    ])
  }

  const handleRemoveGroup = (groupId: string) => {
    setRequestGroups((prev) => {
      if (prev.length <= 1) {
        return prev
      }

      return prev.filter((group) => group.id !== groupId)
    })
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const parsedItems = requestGroups.map((group) => ({
      equipmentType: group.equipmentType.trim(),
      materialCode: group.materialCode.trim(),
      description: group.description.trim(),
      quantity: Number(group.quantityInput),
    }))

    if (
      !orderNumber.trim() ||
      !manufacturer.trim() ||
      parsedItems.some(
        (item) =>
          !item.equipmentType ||
          !item.materialCode ||
          !item.description ||
          !Number.isInteger(item.quantity) ||
          item.quantity < 1,
      ) ||
      !justification.trim()
    ) {
      setFeedback({
        type: 'error',
        message:
          'Preencha todos os campos obrigatórios de cada material antes de enviar o pedido.',
      })
      return
    }

    try {
      await onCreateHomologationRequest({
        orderNumber: orderNumber.trim(),
        manufacturer: manufacturer.trim(),
        items: parsedItems,
        justification: justification.trim(),
      })

      setOrderNumber('')
      setManufacturer('')
      setRequestGroups([createEmptyRequestGroup(`group-${Date.now()}-1`)])
      setJustification('')
      setFeedback({
        type: 'success',
        message: 'Pedido enviado com sucesso para análise da homologação.',
      })
    } catch (error) {
      setFeedback({
        type: 'error',
        message:
          error instanceof ApiError
            ? error.message
            : 'Não foi possível enviar o pedido.',
      })
    }
  }

  return (
    <main className="shell">
      <section className="home-card area-screen-card limited-portal-card">
        <TopActionBar onLogout={onLogout} />
        <p className="section-tag">Compras</p>
        <h2>Formulário fixo de Pedidos de Homologação</h2>
        <p>
          Seu perfil está restrito a este formulário. Outras áreas do portal não
          ficam visíveis para o perfil Compras neste momento.
        </p>

        {activeRoute === 'compras-homologacao' ? (
          <div className="privacy-note">
            Você entrou pelo link fixo da área de Compras. O acesso permanece
            disponível sempre no mesmo endereço após a aprovação do ADM.
          </div>
        ) : null}

        {feedback ? (
          <LoginFeedback
            type={feedback.type}
            message={feedback.message}
            onClose={() => setFeedback(null)}
          />
        ) : null}

        <form className="form-grid request-form-grid" onSubmit={handleSubmit}>
          <label>
            Número do pedido
            <input
              type="text"
              placeholder="Informe o número do pedido"
              value={orderNumber}
              onChange={(event) => setOrderNumber(event.target.value)}
            />
          </label>

          <label>
            Fabricante
            <select
              value={manufacturer}
              onChange={(event) => setManufacturer(event.target.value)}
            >
              <option value="" disabled>
                Selecione
              </option>
              {manufacturers.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>

          <div className="full-width request-groups-list" aria-label="Materiais do pedido">
            {requestGroups.map((group, index) => {
              const filteredMaterialCodes = materialCatalog.filter(
                (item) => item.equipmentType === group.equipmentType,
              )

              return (
              <div key={group.id} className="request-group-card">
                <p className="section-tag">Material {index + 1}</p>

                <div className="request-group-grid">
                  <label>
                    Tipo do equipamento
                    <select
                      value={group.equipmentType}
                      onChange={(event) =>
                        handleGroupChange(group.id, 'equipmentType', event.target.value)
                      }
                    >
                      <option value="" disabled>
                        Selecione
                      </option>
                      <option value="Medidor">Medidor</option>
                      <option value="TC">TC</option>
                      <option value="TP">TP</option>
                      <option value="Remota">Remota</option>
                      <option value="Concentrador">Concentrador</option>
                      <option value="Conjunto de medição">Conjunto de medição</option>
                    </select>
                  </label>

                  <label>
                    Código do material
                    <input
                      type="text"
                      list={`material-codes-${group.id}`}
                      placeholder={
                        group.equipmentType
                          ? 'Digite ou selecione o código'
                          : 'Selecione primeiro o tipo'
                      }
                      value={group.materialCode}
                      disabled={!group.equipmentType}
                      onChange={(event) =>
                        handleGroupChange(group.id, 'materialCode', event.target.value)
                      }
                    />
                    <datalist id={`material-codes-${group.id}`}>
                      {filteredMaterialCodes.map((item) => (
                          <option
                            key={`${item.equipmentType}-${item.code}`}
                            value={item.code}
                          >
                            {item.code}
                          </option>
                      ))}
                    </datalist>
                  </label>

                  <label>
                    Quantidade
                    <input
                      type="number"
                      min={1}
                      step={1}
                      placeholder="Informe a quantidade"
                      value={group.quantityInput}
                      onChange={(event) =>
                        handleGroupChange(group.id, 'quantityInput', event.target.value)
                      }
                    />
                  </label>

                  <label className="full-width">
                    Descrição
                    <textarea
                      className="auto-grow-readonly-field"
                      rows={Math.max(2, group.description.split('\n').length)}
                      placeholder="Preenchida automaticamente pelo código do material"
                      value={group.description}
                      readOnly
                    />
                  </label>
                </div>

                {requestGroups.length > 1 ? (
                  <div className="area-actions">
                    <button
                      className="secondary-button compact-button"
                      type="button"
                      onClick={() => handleRemoveGroup(group.id)}
                    >
                      Remover material
                    </button>
                  </div>
                ) : null}
              </div>
              )
            })}

            <div className="area-actions">
              <button
                className="secondary-button compact-button"
                type="button"
                onClick={handleAddGroup}
              >
                Adicionar material
              </button>
            </div>
          </div>

          <label className="full-width">
            Observações sobre o pedido
            <textarea
              rows={5}
              placeholder="Descreva a necessidade do pedido de homologação"
              value={justification}
              onChange={(event) => setJustification(event.target.value)}
            />
          </label>

          <button className="primary-button" type="submit">
            Enviar pedido de homologação
          </button>
        </form>
      </section>
    </main>
  )
}

function getAreaCardClassName(title: string) {
  if (title === 'Gestão Operacional') {
    return 'area-card-gestao'
  }

  if (title === 'Medição') {
    return 'area-card-medicao'
  }

  if (title === 'Laboratório de Medição') {
    return 'area-card-lab-medicao'
  }

  if (title === 'Telemedição') {
    return 'area-card-telemedicao'
  }

  if (title === 'Laboratório de Homologação') {
    return 'area-card-lab-homologacao'
  }

  if (title === 'Equipe de campo') {
    return 'area-card-equipe-campo'
  }

  if (title === 'Agendar') {
    return 'area-card-equipe-campo'
  }

  if (title === 'Consultar' || title === 'Meus TOIs') {
    return 'area-card-equipe-campo'
  }

  if (title === 'Suporte') {
    return 'area-card-suporte'
  }

  if (title === 'Usuários') {
    return 'area-card-usuarios'
  }

  if (title === 'Cadastros') {
    return 'area-card-cadastros'
  }

  if (title === 'Agenda') {
    return 'area-card-agenda'
  }

  return ''
}

type RegisterPanelProps = {
  activeRoute: AppRoute
  onRegister: (payload: {
    name: string
    registration: string
    birthDate: string
    email: string
    jobTitle: string
    cpf: string
    password: string
    personalDescription: string
    hobby: string
    whatsapp: string
    employmentType: string
    thirdPartyCompany: string
    workArea: string
    workSubtype: string
    locality: string
    edpUnit: string
    profilePhoto: string
  }) => Promise<void>
  onRegistered: (message?: string) => void
}

function readImageAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('Selecione um arquivo de imagem.'))
      return
    }
    if (file.size > 2_000_000) {
      reject(new Error('A foto de perfil deve ter no máximo 2 MB.'))
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result)
        return
      }
      reject(new Error('Não foi possível ler a imagem selecionada.'))
    }
    reader.onerror = () => reject(new Error('Não foi possível ler a imagem selecionada.'))
    reader.readAsDataURL(file)
  })
}

function RegisterPanel({ activeRoute, onRegister, onRegistered }: RegisterPanelProps) {
  const [name, setName] = useState('')
  const [registration, setRegistration] = useState('')
  const [birthDate, setBirthDate] = useState('')
  const [email, setEmail] = useState('')
  const [jobTitle, setJobTitle] = useState('')
  const [workArea, setWorkArea] = useState('')
  const [employmentType, setEmploymentType] = useState('')
  const [edpUnit, setEdpUnit] = useState('')
  const [locality, setLocality] = useState('')
  const [cpf, setCpf] = useState('')
  const [whatsapp, setWhatsapp] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [profilePhoto, setProfilePhoto] = useState('')
  const [profilePhotoName, setProfilePhotoName] = useState('')
  const [observation, setObservation] = useState('')
  const [cargoOptions, setCargoOptions] = useState<string[]>([
    'Técnico',
    'Analista',
    'Engenheiro',
    'Gestor',
    'Estagiário',
    'Assistente Administrativo',
  ])
  const [areaOptions, setAreaOptions] = useState<string[]>([...AREA_OPTIONS])
  const [tipoOptions, setTipoOptions] = useState<string[]>(['Própria', 'Terceira'])
  const [localityOptions, setLocalityOptions] = useState<string[]>([...DEFAULT_LOCALITIES])
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error'
    message: string
  } | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    void api
      .listCatalogOptions()
      .then(({ catalogs }) => {
        const byKey = Object.fromEntries(
          catalogs.map((catalog) => [catalog.key, catalog.options.map((item) => item.value)]),
        ) as Partial<Record<'cargo' | 'area' | 'tipo' | 'localidade', string[]>>

        if (byKey.cargo?.length) setCargoOptions(byKey.cargo)
        if (byKey.area?.length) setAreaOptions(byKey.area)
        if (byKey.tipo?.length) setTipoOptions(byKey.tipo)
        if (byKey.localidade?.length) setLocalityOptions(byKey.localidade)
      })
      .catch(() => {
        // Mantém fallback local se a API estiver indisponível no cadastro público.
      })
  }, [])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (
      !name.trim() ||
      !registration.trim() ||
      !birthDate ||
      !email.trim() ||
      !jobTitle.trim() ||
      !workArea ||
      !employmentType ||
      !edpUnit ||
      !locality ||
      !cpf.trim() ||
      !whatsapp.trim() ||
      !password ||
      !confirmPassword ||
      !observation.trim() ||
      !profilePhoto.trim()
    ) {
      setFeedback({
        type: 'error',
        message: 'Preencha todos os campos obrigatórios antes de enviar o cadastro.',
      })
      return
    }

    if (password !== confirmPassword) {
      setFeedback({
        type: 'error',
        message: 'A confirmação de senha precisa ser igual à senha informada.',
      })
      return
    }

    setSubmitting(true)
    setFeedback(null)

    try {
      await onRegister({
        name: name.trim(),
        registration: registration.trim(),
        birthDate,
        email: email.trim(),
        jobTitle: jobTitle.trim(),
        cpf: cpf.trim(),
        password,
        personalDescription: observation.trim(),
        hobby: '',
        whatsapp: whatsapp.trim(),
        employmentType,
        thirdPartyCompany: '',
        workArea,
        workSubtype: '',
        locality,
        edpUnit,
        profilePhoto,
      })

      const successMessage =
        'Cadastro enviado para aprovação. Aguarde a liberação do ADM para entrar.'
      setName('')
      setRegistration('')
      setBirthDate('')
      setEmail('')
      setJobTitle('')
      setWorkArea('')
      setEmploymentType('')
      setEdpUnit('')
      setLocality('')
      setCpf('')
      setWhatsapp('')
      setPassword('')
      setConfirmPassword('')
      setObservation('')
      setProfilePhoto('')
      setProfilePhotoName('')
      onRegistered(successMessage)
    } catch (error) {
      setFeedback({
        type: 'error',
        message:
          error instanceof ApiError
            ? error.message
            : 'Não foi possível concluir o cadastro.',
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="auth-panel register-panel">
      <header>
        <p className="section-tag">Cadastro</p>
        {activeRoute === 'compras-homologacao' ? (
          <p>
            Este cadastro cria um acesso com perfil Compras. Depois da aprovação
            do ADM, o usuário visualizará somente o formulário fixo de Pedidos de
            Homologação.
          </p>
        ) : null}
      </header>

      {feedback ? (
        <LoginFeedback
          type={feedback.type}
          message={feedback.message}
          onClose={() => setFeedback(null)}
        />
      ) : null}

      <form className="form-grid register-grid" onSubmit={handleSubmit} noValidate>
        <label className="register-name-field">
          <span className="required-label">
            <span className="required-mark" aria-hidden="true">
              *
            </span>
            Nome completo
          </span>
          <input
            type="text"
            placeholder="Seu nome completo"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
          />
        </label>

        <label>
          <span className="required-label">
            <span className="required-mark" aria-hidden="true">
              *
            </span>
            Tipo
          </span>
          <select
            value={employmentType}
            onChange={(event) => setEmploymentType(event.target.value)}
            required
          >
            <option value="">Selecione</option>
            {tipoOptions.map((tipo) => (
              <option key={tipo} value={tipo}>
                {tipo}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span className="required-label">
            <span className="required-mark" aria-hidden="true">
              *
            </span>
            Abrangência
          </span>
          <select
            value={edpUnit}
            onChange={(event) => setEdpUnit(event.target.value)}
            required
          >
            <option value="">Selecione</option>
            {EDP_SCOPE_OPTIONS.map((unit) => (
              <option key={unit} value={unit}>
                {unit}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span className="required-label">
            <span className="required-mark" aria-hidden="true">
              *
            </span>
            Área
          </span>
          <select
            value={workArea}
            onChange={(event) => setWorkArea(event.target.value)}
            required
          >
            <option value="">Selecione</option>
            {areaOptions.map((area) => (
              <option key={area} value={area}>
                {area}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span className="required-label">
            <span className="required-mark" aria-hidden="true">
              *
            </span>
            Cargo
          </span>
          <select
            value={jobTitle}
            onChange={(event) => setJobTitle(event.target.value)}
            required
          >
            <option value="">Selecione</option>
            {cargoOptions.map((cargo) => (
              <option key={cargo} value={cargo}>
                {cargo}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span className="required-label">
            <span className="required-mark" aria-hidden="true">
              *
            </span>
            Localidade
          </span>
          <select
            value={locality}
            onChange={(event) => setLocality(event.target.value)}
            required
          >
            <option value="">Selecione</option>
            {localityOptions.map((city) => (
              <option key={city} value={city}>
                {city}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span className="required-label">
            <span className="required-mark" aria-hidden="true">
              *
            </span>
            Matrícula
          </span>
          <input
            type="text"
            placeholder="Sua matrícula"
            value={registration}
            onChange={(event) => setRegistration(event.target.value)}
            required
          />
        </label>

        <label>
          <span className="required-label">
            <span className="required-mark" aria-hidden="true">
              *
            </span>
            Data de nascimento
          </span>
          <input
            type="date"
            value={birthDate}
            onChange={(event) => setBirthDate(event.target.value)}
            required
          />
        </label>

        <label>
          <span className="required-label">
            <span className="required-mark" aria-hidden="true">
              *
            </span>
            E-mail corporativo
          </span>
          <input
            type="email"
            placeholder="nome@edp.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </label>

        <label>
          <span className="required-label">
            <span className="required-mark" aria-hidden="true">
              *
            </span>
            CPF
          </span>
          <input
            type="text"
            placeholder="000.000.000-00"
            value={cpf}
            onChange={(event) => setCpf(event.target.value)}
            required
          />
        </label>

        <label>
          <span className="required-label">
            <span className="required-mark" aria-hidden="true">
              *
            </span>
            WhatsApp
          </span>
          <input
            type="tel"
            inputMode="tel"
            placeholder="(00) 00000-0000"
            value={whatsapp}
            onChange={(event) => setWhatsapp(event.target.value)}
            required
          />
        </label>

        <PasswordInput
          id="register-password"
          label="Senha"
          placeholder="Crie sua senha"
          autoComplete="new-password"
          value={password}
          onChange={setPassword}
          required
        />

        <PasswordInput
          id="register-confirm-password"
          label="Confirmar senha"
          placeholder="Repita a senha"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={setConfirmPassword}
          required
        />

        <label className="register-photo-field">
          <span className="required-label">
            <span className="required-mark" aria-hidden="true">
              *
            </span>
            Observação
          </span>
          <textarea
            rows={3}
            value={observation}
            onChange={(event) => setObservation(event.target.value)}
            placeholder="Informe uma observação"
            required
          />
        </label>

        <div className="register-photo-field">
          <span className="required-label">
            <span className="required-mark" aria-hidden="true">
              *
            </span>
            Foto de perfil
          </span>
          <div className="file-picker">
            <input
              id="register-profile-photo"
              className="file-picker-input"
              type="file"
              accept="image/*"
              required={!profilePhoto}
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (!file) {
                  setProfilePhoto('')
                  setProfilePhotoName('')
                  return
                }

                void readImageAsDataUrl(file)
                  .then((dataUrl) => {
                    setProfilePhoto(dataUrl)
                    setProfilePhotoName(file.name)
                    setFeedback(null)
                  })
                  .catch((error: unknown) => {
                    setProfilePhoto('')
                    setProfilePhotoName('')
                    event.target.value = ''
                    setFeedback({
                      type: 'error',
                      message:
                        error instanceof Error
                          ? error.message
                          : 'Não foi possível carregar a foto de perfil.',
                    })
                  })
              }}
            />
            <label htmlFor="register-profile-photo" className="file-picker-button">
              Escolher imagem
            </label>
            <span className="file-picker-name">
              {profilePhotoName || 'Nenhuma imagem selecionada'}
            </span>
          </div>
          {profilePhoto ? (
            <span className="register-photo-preview">
              <img src={profilePhoto} alt="Pré-visualização da foto de perfil" />
            </span>
          ) : null}
        </div>

        <button
          className="primary-button login-enter-button"
          type="submit"
          disabled={submitting}
        >
          {submitting ? 'Enviando cadastro...' : 'Enviar cadastro para aprovação'}
        </button>
      </form>
    </section>
  )
}
