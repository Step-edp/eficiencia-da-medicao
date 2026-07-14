import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { EdpLogo } from './EdpLogo'
import { ScheduleAgendarForm } from './ScheduleAgendarForm'
import { EnsaiarForm } from './EnsaiarForm'
import { CadastrosPanel } from './CadastrosPanel'
import { getHomeAreasForRole, roleLabel } from './profilesAccess'
import { RatmAprovacaoPanel } from './ratm/RatmAprovacaoPanel'
import { SatisfactionSurveyPage } from './ratm/SatisfactionSurveyPage'
import { mapRatmLaudoFromApi, type RatmLaudo } from './ratm/laudos'
import type { RatmFormData } from './ratm/types'
import { LabMeasurementTrail } from './LabMeasurementTrail'
import { EnsaiosCalendar } from './EnsaiosCalendar'
import { CsdsPanel } from './CsdsPanel'
import { AuditPanel } from './AuditPanel'
import { EntradaPanel } from './EntradaPanel'
import { ENTRADA_TRAIL_STEP, getLabTrailLabel, LAB_TRAIL_KEYS } from './labTrailSteps'
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
  EDP_UNITS,
  subtypesForCargo,
} from './registrationOptions'

const FIXED_PURCHASE_REQUEST_HASH = '#/compras/pedidos-homologacao'
const FIELD_APP_URL =
  (import.meta.env.VITE_FIELD_APP_URL as string | undefined)?.trim() ||
  'https://agendamento-lab-med-production.up.railway.app'

const THIRD_PARTY_COMPANIES = [
  'Cennatech',
  'Ecori',
  'Landis+Gyr',
  'Metta Brasil',
  'SEW',
  'Steenge',
] as const

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
  }) => {
    await api.register(payload)
  }

  const handleApproveUser = async (userId: string) => {
    const { user } = await api.approveUser(userId)
    setRegisteredUsers((prev) => prev.map((item) => (item.id === user.id ? user : item)))
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
              onLoginSuccess={(user) => {
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
              onRegistered={() => setActivePanel('login')}
            />
          )}
        </div>
      </section>
    </main>
  )
}

type LoginPanelProps = {
  onLoginSuccess: (user: AppUser) => void
}

function LoginPanel({ onLoginSuccess }: LoginPanelProps) {
  const [registration, setRegistration] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error'
    message: string
  } | null>(null)

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

        <label>
          Senha
          <input
            type="password"
            placeholder="Digite sua senha"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>

        <button className="primary-button login-enter-button" type="submit" disabled={submitting}>
          {submitting ? 'Entrando...' : 'Entrar'}
        </button>
      </form>

      {feedback ? (
        <div className={`login-feedback ${feedback.type}`} role="status">
          {feedback.message}
        </div>
      ) : null}
    </section>
  )
}

type HomePanelProps = {
  currentUser: AppUser
  activeRoute: AppRoute
  fixedRequestLink: string
  users: AppUser[]
  homologationRequests: HomologationRequest[]
  onApproveUser: (userId: string) => Promise<void>
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
  const iconByTitle: Record<string, 'chart' | 'flask' | 'calendar' | 'search' | 'inbox' | 'cube' | 'check' | 'image' | 'bolt' | 'ruler' | 'smile' | 'shield' | 'archive' | 'trash' | 'presentation' | 'truck' | 'book' | 'code' | 'lock' | 'key' | 'database' | 'repeat' | 'building' | 'layer' | 'monitor' | 'star' | 'users'> = {
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
    'Equipe de campo': 'truck',
    Usuários: 'users',
    Cadastros: 'archive',
    Consultar: 'search',
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
        {icon === 'star' ? <path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9L12 3z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /> : null}
      </svg>
    </span>
  )
}

function HomePanel({
  currentUser,
  activeRoute,
  fixedRequestLink,
  users,
  homologationRequests,
  onApproveUser,
  onCreateHomologationRequest,
  onLogout,
}: HomePanelProps) {
  const [selectedArea, setSelectedArea] = useState<Area | null>(null)
  const [selectedMeasurementSection, setSelectedMeasurementSection] =
    useState<string | null>(null)
  const [selectedLabMeasurementSection, setSelectedLabMeasurementSection] =
    useState<string | null>(null)
  const [selectedHomologationSection, setSelectedHomologationSection] =
    useState<string | null>(null)
  const [openingFieldApp, setOpeningFieldApp] = useState(false)
  const [selectedUserDetail, setSelectedUserDetail] = useState<AppUser | null>(null)
  const [usersView, setUsersView] = useState<'usuarios' | 'pendentes'>('usuarios')
  const [trailStepCounts, setTrailStepCounts] = useState<Record<string, number>>({})
  const [ratmLaudos, setRatmLaudos] = useState<RatmLaudo[]>([])
  const [selectedCodeMaterialsAction, setSelectedCodeMaterialsAction] = useState<
    'create' | null
  >(null)
  const [selectedPasswordAction, setSelectedPasswordAction] = useState<string | null>(null)
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
  const isAdmin = currentUser.role === 'admin'
  const pendingApprovalUsers = users.filter(
    (user) => user.role === 'compras' && user.approvalStatus === 'pending',
  )
  const registeredUsers = users.filter((user) => user.approvalStatus === 'approved')
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
    'Treinamentos',
    'Softwares',
  ]
  const homologationSections = [
    'Ensaio',
    'Pedidos de Homologação',
    'Código de materiais',
  ]
  const fieldTeamSections = ['Agendar', 'Consultar']

  const openFieldApp = async (section: string) => {
    setOpeningFieldApp(true)
    setPasswordFeedback(null)
    try {
      const { ssoToken } = await api.createEmbedToken()
      const url = new URL(FIELD_APP_URL)
      url.hash = `sso=${encodeURIComponent(ssoToken)}&section=${encodeURIComponent(section)}`
      window.location.assign(url.toString())
    } catch (error) {
      setOpeningFieldApp(false)
      setPasswordFeedback({
        type: 'error',
        message:
          error instanceof ApiError
            ? error.message
            : 'Não foi possível abrir o Agendamento Lab Med.',
      })
    }
  }

  const allAreas: Area[] = [
    {
      title: 'Gestão',
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
        'Agendar e consultar medidores no Agendamento Lab Med (mesmo banco do laboratório).',
      details:
        'Abre o aplicativo Agendamento Lab Med com login automático. Os agendamentos entram direto na trilha Entrada de medidores.',
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
  ]

  const allowedHomeAreas = getHomeAreasForRole(currentUser.role)
  const areas = allAreas.filter((area) =>
    allowedHomeAreas.includes(area.title as (typeof allowedHomeAreas)[number]),
  )

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

  if (currentUser.role === 'compras') {
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
    if (selectedArea.title === 'Gestão') {
      return (
        <main className="shell">
          <section className="home-card area-screen-card">
            <TopActionBar
              onBack={() => setSelectedArea(null)}
              onHome={() => setSelectedArea(null)}
              onLogout={onLogout}
            />
            <p className="section-tag">Gestão</p>
            <h2>Solicitações de acesso</h2>
            <p>
              Acompanhe as solicitações de cadastro do perfil Compras e aprove o acesso
              ao formulário fixo de Pedidos de Homologação.
            </p>

            {passwordFeedback ? (
              <div className={`login-feedback ${passwordFeedback.type}`} role="status">
                {passwordFeedback.message}
              </div>
            ) : null}

            {isAdmin ? (
              <div className="approval-list" aria-label="Solicitações pendentes para aprovação">
                {pendingApprovalUsers.length ? (
                  pendingApprovalUsers.map((user) => (
                    <article key={user.id} className="approval-item">
                      <div>
                        <strong>{user.name}</strong>
                        <span>Matrícula: {user.registration}</span>
                        <span>E-mail: {user.email}</span>
                        <span>Cargo: {user.jobTitle || 'Não informado'}</span>
                        <span>Perfil solicitado: Compras</span>
                        <span>
                          Solicitação enviada em{' '}
                          {new Date(user.requestedAt).toLocaleString('pt-BR')}
                        </span>
                      </div>
                      <button
                        className="primary-button compact-button"
                        type="button"
                        onClick={() => {
                          void onApproveUser(user.id).then(() => {
                            setPasswordFeedback({
                              type: 'success',
                              message: `Acesso de ${user.name} aprovado com sucesso.`,
                            })
                          }).catch((error) => {
                            setPasswordFeedback({
                              type: 'error',
                              message:
                                error instanceof ApiError
                                  ? error.message
                                  : 'Não foi possível aprovar o usuário.',
                            })
                          })
                        }}
                      >
                        Aprovar acesso
                      </button>
                    </article>
                  ))
                ) : (
                  <p className="generated-password-empty">
                    Nenhuma solicitação pendente no momento.
                  </p>
                )}
              </div>
            ) : (
              <p className="generated-password-empty">
                Somente o perfil administrador pode aprovar cadastros.
              </p>
            )}
          </section>
        </main>
      )
    }

    if (selectedArea.title === 'Usuários') {
      const statusLabel = (status: AppUser['approvalStatus']) =>
        status === 'approved' ? 'Aprovado' : 'Pendente'

      const formatValue = (value?: string | null) => {
        const trimmed = value?.trim()
        return trimmed ? trimmed : '—'
      }

      const leaveUsersArea = () => {
        setSelectedUserDetail(null)
        setUsersView('usuarios')
        setSelectedArea(null)
      }

      return (
        <main className="shell">
          <section className="home-card area-screen-card">
            <TopActionBar
              onBack={leaveUsersArea}
              onHome={leaveUsersArea}
              onLogout={onLogout}
            />
            <p className="section-tag">Usuários</p>
            <h2>Gestão de usuários</h2>
            <p>
              Consulte os usuários com acesso ao portal e os cadastros ainda
              pendentes de aprovação. Clique em um usuário para ver todos os
              dados.
            </p>

            {passwordFeedback ? (
              <div className={`login-feedback ${passwordFeedback.type}`} role="status">
                {passwordFeedback.message}
              </div>
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
                </div>

                {usersView === 'pendentes' ? (
                  <div className="approval-list" aria-label="Solicitações pendentes para aprovação">
                    {pendingApprovalUsers.length ? (
                      pendingApprovalUsers.map((user) => (
                        <article key={user.id} className="approval-item">
                          <div>
                            <strong>{user.name}</strong>
                            <span>Matrícula: {user.registration}</span>
                            <span>E-mail: {user.email}</span>
                            <span>Cargo: {user.jobTitle || 'Não informado'}</span>
                            <span>Perfil solicitado: {roleLabel(user.role)}</span>
                            <span>
                              Solicitação enviada em{' '}
                              {new Date(user.requestedAt).toLocaleString('pt-BR')}
                            </span>
                          </div>
                          <div className="approval-item-actions">
                            <button
                              className="secondary-button compact-button"
                              type="button"
                              onClick={() => setSelectedUserDetail(user)}
                            >
                              Ver detalhes
                            </button>
                            <button
                              className="primary-button compact-button"
                              type="button"
                              onClick={() => {
                                void onApproveUser(user.id)
                                  .then(() => {
                                    setPasswordFeedback({
                                      type: 'success',
                                      message: `Acesso de ${user.name} aprovado com sucesso.`,
                                    })
                                  })
                                  .catch((error) => {
                                    setPasswordFeedback({
                                      type: 'error',
                                      message:
                                        error instanceof ApiError
                                          ? error.message
                                          : 'Não foi possível aprovar o usuário.',
                                    })
                                  })
                              }}
                            >
                              Aprovar acesso
                            </button>
                          </div>
                        </article>
                      ))
                    ) : (
                      <p className="generated-password-empty">
                        Nenhuma solicitação pendente no momento.
                      </p>
                    )}
                  </div>
                ) : (
                  <>
                    <p className="consultar-summary">
                      {registeredUsers.length} usuário(s) com acesso aprovado
                    </p>
                    <div className="entrada-table-wrap">
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>Nome</th>
                            <th>Matrícula</th>
                            <th>E-mail</th>
                            <th>Cargo</th>
                            <th>Perfil</th>
                            <th>Status</th>
                            <th>Solicitado em</th>
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
                              onClick={() => setSelectedUserDetail(user)}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter' || event.key === ' ') {
                                  event.preventDefault()
                                  setSelectedUserDetail(user)
                                }
                              }}
                            >
                              <td>{user.name}</td>
                              <td>{user.registration}</td>
                              <td>{user.email}</td>
                              <td>{user.jobTitle || '—'}</td>
                              <td>{roleLabel(user.role)}</td>
                              <td>{statusLabel(user.approvalStatus)}</td>
                              <td>
                                {new Date(user.requestedAt).toLocaleString('pt-BR')}
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

            {selectedUserDetail
              ? createPortal(
                  <div
                    className="ensaios-block-modal-overlay"
                    role="presentation"
                    onClick={() => setSelectedUserDetail(null)}
                  >
                    <div
                      className="ensaios-block-modal user-detail-modal"
                      role="dialog"
                      aria-modal="true"
                      aria-labelledby="user-detail-title"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <button
                        type="button"
                        className="icon-button schedule-slot-modal-close"
                        onClick={() => setSelectedUserDetail(null)}
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

                      <h3 id="user-detail-title">{selectedUserDetail.name}</h3>
                      <p className="user-detail-subtitle">
                        {roleLabel(selectedUserDetail.role)} ·{' '}
                        {statusLabel(selectedUserDetail.approvalStatus)}
                      </p>

                      <dl className="user-detail-grid">
                        <div>
                          <dt>Matrícula</dt>
                          <dd>{formatValue(selectedUserDetail.registration)}</dd>
                        </div>
                        <div>
                          <dt>E-mail</dt>
                          <dd>{formatValue(selectedUserDetail.email)}</dd>
                        </div>
                        <div>
                          <dt>WhatsApp</dt>
                          <dd>{formatValue(selectedUserDetail.whatsapp)}</dd>
                        </div>
                        <div>
                          <dt>Cargo</dt>
                          <dd>{formatValue(selectedUserDetail.jobTitle)}</dd>
                        </div>
                        <div>
                          <dt>Tipo</dt>
                          <dd>{formatValue(selectedUserDetail.employmentType)}</dd>
                        </div>
                        <div>
                          <dt>
                            {selectedUserDetail.employmentType === 'Terceira'
                              ? 'Empresa terceira'
                              : 'Empresa'}
                          </dt>
                          <dd>{formatValue(selectedUserDetail.thirdPartyCompany)}</dd>
                        </div>
                        <div>
                          <dt>CPF</dt>
                          <dd>{formatValue(selectedUserDetail.cpf)}</dd>
                        </div>
                        <div>
                          <dt>Data de nascimento</dt>
                          <dd>{formatValue(selectedUserDetail.birthDate)}</dd>
                        </div>
                        <div>
                          <dt>Perfil</dt>
                          <dd>
                            {buildRequestedProfile(
                              selectedUserDetail.jobTitle,
                              selectedUserDetail.workSubtype ?? '',
                              selectedUserDetail.workArea ?? '',
                            ) || roleLabel(selectedUserDetail.role)}
                          </dd>
                        </div>
                        <div>
                          <dt>Status</dt>
                          <dd>{statusLabel(selectedUserDetail.approvalStatus)}</dd>
                        </div>
                        <div>
                          <dt>Área</dt>
                          <dd>{formatValue(selectedUserDetail.workArea)}</dd>
                        </div>
                        <div>
                          <dt>Subtipo</dt>
                          <dd>{formatValue(selectedUserDetail.workSubtype)}</dd>
                        </div>
                        <div>
                          <dt>Localidade</dt>
                          <dd>{formatValue(selectedUserDetail.locality)}</dd>
                        </div>
                        <div>
                          <dt>Solicitado em</dt>
                          <dd>
                            {new Date(selectedUserDetail.requestedAt).toLocaleString('pt-BR')}
                          </dd>
                        </div>
                        <div>
                          <dt>Aprovado em</dt>
                          <dd>
                            {selectedUserDetail.approvedAt
                              ? new Date(selectedUserDetail.approvedAt).toLocaleString('pt-BR')
                              : '—'}
                          </dd>
                        </div>
                        <div className="user-detail-full">
                          <dt>Descrição pessoal</dt>
                          <dd>{formatValue(selectedUserDetail.personalDescription)}</dd>
                        </div>
                        <div className="user-detail-full">
                          <dt>Hobby</dt>
                          <dd>{formatValue(selectedUserDetail.hobby)}</dd>
                        </div>
                      </dl>
                    </div>
                  </div>,
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
              onBack={() => setSelectedArea(null)}
              onHome={() => setSelectedArea(null)}
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
                  <div className={`login-feedback ${passwordFeedback.type}`} role="status">
                    {passwordFeedback.message}
                  </div>
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
                  <div className={`login-feedback ${passwordFeedback.type}`} role="status">
                    {passwordFeedback.message}
                  </div>
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
                  <div className={`login-feedback ${passwordFeedback.type}`} role="status">
                    {passwordFeedback.message}
                  </div>
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
      openingFieldApp
    ) {
      return (
        <main className="shell">
          <section className="home-card area-screen-card">
            <p className="section-tag">Equipe de campo</p>
            <h2>Abrindo Agendamento Lab Med...</h2>
            <p>Você será redirecionado para o aplicativo de agendamento.</p>
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
            selectedLabMeasurementSection !== 'Auditoria' ? (
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
            ) : selectedLabMeasurementSection === 'Auditoria' ? (
              <AuditPanel />
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
                <div className={`login-feedback ${passwordFeedback.type}`} role="status">
                  {passwordFeedback.message}
                </div>
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
                  <div className={`login-feedback ${passwordFeedback.type}`} role="status">
                    {passwordFeedback.message}
                  </div>
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
            onBack={() => setSelectedArea(null)}
            onHome={() => setSelectedArea(null)}
            onLogout={onLogout}
          />
          <p className="section-tag">Área</p>
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
                      <span className="item-with-icon">
                        <ItemIcon title={section} />
                        <span>{section}</span>
                      </span>
                    </button>
                  ))}
                </div>
                </>
              ) : null}
            </>
          ) : null}
          {selectedArea.title === 'Laboratório de Homologação' ? (
            <div className="measurement-sections" aria-label="Áreas de homologação">
              {homologationSections.map((section) => (
                <button
                  key={section}
                  className="measurement-item"
                  type="button"
                  onClick={() => setSelectedHomologationSection(section)}
                >
                  <span className="item-with-icon">
                    <ItemIcon title={section} />
                    <span>{section}</span>
                  </span>
                </button>
              ))}
            </div>
          ) : null}
          {selectedArea.title === 'Equipe de campo' ? (
            <div className="measurement-sections" aria-label="Funções da equipe de campo">
              {passwordFeedback ? (
                <div className={`login-feedback ${passwordFeedback.type}`} role="status">
                  {passwordFeedback.message}
                </div>
              ) : null}
              <p>
                Agendar e consultar abrem o aplicativo{' '}
                <strong>Agendamento Lab Med</strong>, integrado ao mesmo banco do
                laboratório.
              </p>
              {fieldTeamSections.map((section) => (
                <button
                  key={section}
                  className="measurement-item"
                  type="button"
                  disabled={openingFieldApp}
                  onClick={() => void openFieldApp(section)}
                >
                  <span className="item-with-icon">
                    <ItemIcon title={section} />
                    <span>{openingFieldApp ? 'Abrindo...' : section}</span>
                  </span>
                </button>
              ))}
            </div>
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
        <div className="home-areas" aria-label="Áreas do portal">
          {areas.map((area) => (
            <button
              key={area.title}
              className={`area-card ${getAreaCardClassName(area.title)}`}
              type="button"
              onClick={() => setSelectedArea(area)}
            >
              <span className="area-card-title">
                <ItemIcon title={area.title} />
                <span>{area.title}</span>
              </span>
            </button>
          ))}
        </div>
      </section>
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
          <div className={`login-feedback ${feedback.type}`} role="status">
            {feedback.message}
          </div>
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
  if (title === 'Gestão') {
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

  if (title === 'Usuários') {
    return 'area-card-usuarios'
  }

  if (title === 'Cadastros') {
    return 'area-card-cadastros'
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
  }) => Promise<void>
  onRegistered: () => void
}

function RegisterPanel({ activeRoute, onRegister, onRegistered }: RegisterPanelProps) {
  const [name, setName] = useState('')
  const [registration, setRegistration] = useState('')
  const [birthDate, setBirthDate] = useState('')
  const [email, setEmail] = useState('')
  const [jobTitle, setJobTitle] = useState('')
  const [workArea, setWorkArea] = useState('')
  const [workSubtype, setWorkSubtype] = useState('')
  const [employmentType, setEmploymentType] = useState('')
  const [employerCompany, setEmployerCompany] = useState('')
  const [locality, setLocality] = useState('')
  const [cpf, setCpf] = useState('')
  const [whatsapp, setWhatsapp] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [cargoOptions, setCargoOptions] = useState<string[]>([
    'Técnico',
    'Analista',
    'Engenheiro',
  ])
  const [areaOptions, setAreaOptions] = useState<string[]>([...AREA_OPTIONS])
  const [tipoOptions, setTipoOptions] = useState<string[]>(['Própria', 'Terceira'])
  const [terceiraOptions, setTerceiraOptions] = useState<string[]>([...THIRD_PARTY_COMPANIES])
  const [localityOptions, setLocalityOptions] = useState<string[]>([...DEFAULT_LOCALITIES])
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error'
    message: string
  } | null>(null)

  const subtypeOptions = subtypesForCargo(jobTitle)
  const requestedProfile = buildRequestedProfile(jobTitle, workSubtype, workArea)

  useEffect(() => {
    void api
      .listCatalogOptions()
      .then(({ catalogs }) => {
        const byKey = Object.fromEntries(
          catalogs.map((catalog) => [catalog.key, catalog.options.map((item) => item.value)]),
        ) as Partial<Record<'cargo' | 'area' | 'tipo' | 'terceira' | 'localidade', string[]>>

        if (byKey.cargo?.length) setCargoOptions(byKey.cargo)
        if (byKey.area?.length) setAreaOptions(byKey.area)
        if (byKey.tipo?.length) setTipoOptions(byKey.tipo)
        if (byKey.terceira?.length) setTerceiraOptions(byKey.terceira)
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
      !employerCompany ||
      !locality ||
      !cpf.trim() ||
      !whatsapp.trim() ||
      !password ||
      !confirmPassword
    ) {
      setFeedback({
        type: 'error',
        message: 'Preencha os campos obrigatórios antes de enviar o cadastro.',
      })
      return
    }

    if (subtypeOptions.length > 0 && !workSubtype) {
      setFeedback({
        type: 'error',
        message:
          jobTitle === 'Engenheiro'
            ? 'Selecione a função do engenheiro.'
            : 'Selecione o tipo de técnico.',
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

    try {
      await onRegister({
        name: name.trim(),
        registration: registration.trim(),
        birthDate,
        email: email.trim(),
        jobTitle: jobTitle.trim(),
        cpf: cpf.trim(),
        password,
        personalDescription: '',
        hobby: '',
        whatsapp: whatsapp.trim(),
        employmentType,
        thirdPartyCompany: employerCompany,
        workArea,
        workSubtype: jobTitle === 'Analista' ? '' : workSubtype,
        locality,
      })

      setFeedback({
        type: 'success',
        message:
          'Cadastro enviado para aprovação do ADM. Após a liberação, o perfil Compras poderá acessar somente o formulário fixo de Pedidos de Homologação.',
      })
      setName('')
      setRegistration('')
      setBirthDate('')
      setEmail('')
      setJobTitle('')
      setWorkArea('')
      setWorkSubtype('')
      setEmploymentType('')
      setEmployerCompany('')
      setLocality('')
      setCpf('')
      setWhatsapp('')
      setPassword('')
      setConfirmPassword('')
      onRegistered()
    } catch (error) {
      setFeedback({
        type: 'error',
        message:
          error instanceof ApiError
            ? error.message
            : 'Não foi possível concluir o cadastro.',
      })
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
        <div className={`login-feedback ${feedback.type}`} role="status">
          {feedback.message}
        </div>
      ) : null}

      <form className="form-grid register-grid" onSubmit={handleSubmit}>
        <label>
          Tipo
          <select
            value={employmentType}
            onChange={(event) => {
              const nextType = event.target.value
              setEmploymentType(nextType)
              setEmployerCompany('')
            }}
            required
          >
            {tipoOptions.map((tipo) => (
              <option key={tipo} value={tipo}>
                {tipo}
              </option>
            ))}
          </select>
        </label>

        {employmentType === 'Própria' ? (
          <label>
            Empresa EDP
            <select
              value={employerCompany}
              onChange={(event) => setEmployerCompany(event.target.value)}
              required
            >
              <option value="" disabled>
                Selecione EDP SP ou EDP ES
              </option>
              {EDP_UNITS.map((unit) => (
                <option key={unit} value={unit}>
                  {unit}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {employmentType === 'Terceira' ? (
          <label>
            Empresa terceira
            <select
              value={employerCompany}
              onChange={(event) => setEmployerCompany(event.target.value)}
              required
            >
              <option value="" disabled>
                Selecione a empresa
              </option>
              {terceiraOptions.map((company) => (
                <option key={company} value={company}>
                  {company}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <label>
          Área
          <select
            value={workArea}
            onChange={(event) => setWorkArea(event.target.value)}
            required
          >
            <option value="" disabled>
              Selecione a área
            </option>
            {areaOptions.map((area) => (
              <option key={area} value={area}>
                {area}
              </option>
            ))}
          </select>
        </label>

        <label>
          Cargo
          <select
            value={jobTitle}
            onChange={(event) => {
              setJobTitle(event.target.value)
              setWorkSubtype('')
            }}
            required
          >
            <option value="" disabled>
              Selecione o cargo
            </option>
            {cargoOptions.map((cargo) => (
              <option key={cargo} value={cargo}>
                {cargo}
              </option>
            ))}
          </select>
        </label>

        {subtypeOptions.length > 0 ? (
          <label>
            {jobTitle === 'Engenheiro' ? 'Função do engenheiro' : 'Tipo de técnico'}
            <select
              value={workSubtype}
              onChange={(event) => setWorkSubtype(event.target.value)}
              required
            >
              <option value="" disabled>
                Selecione...
              </option>
              {subtypeOptions.map((subtype) => (
                <option key={subtype} value={subtype}>
                  {subtype}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <label>
          Localidade
          <select
            value={locality}
            onChange={(event) => setLocality(event.target.value)}
            required
          >
            <option value="" disabled>
              Selecione a cidade
            </option>
            {localityOptions.map((city) => (
              <option key={city} value={city}>
                {city}
              </option>
            ))}
          </select>
        </label>

        <label className="full-width">
          Perfil construído
          <input
            type="text"
            value={requestedProfile || 'Selecione tipo, área e cargo'}
            readOnly
          />
        </label>

        <label>
          Nome completo
          <input
            type="text"
            placeholder="Seu nome completo"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>

        <label>
          Matrícula
          <input
            type="text"
            placeholder="Sua matrícula"
            value={registration}
            onChange={(event) => setRegistration(event.target.value)}
          />
        </label>

        <label>
          Data de nascimento
          <input type="date" value={birthDate} onChange={(event) => setBirthDate(event.target.value)} />
        </label>

        <label>
          E-mail corporativo
          <input
            type="email"
            placeholder="nome@edp.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>

        <label>
          CPF
          <input
            type="text"
            placeholder="000.000.000-00"
            value={cpf}
            onChange={(event) => setCpf(event.target.value)}
          />
        </label>

        <label>
          WhatsApp
          <input
            type="tel"
            inputMode="tel"
            placeholder="(00) 00000-0000"
            value={whatsapp}
            onChange={(event) => setWhatsapp(event.target.value)}
          />
        </label>

        <label>
          Senha
          <input
            type="password"
            placeholder="Crie sua senha"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>

        <label>
          Confirmar senha
          <input
            type="password"
            placeholder="Repita a senha"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
          />
        </label>

        <button className="primary-button login-enter-button" type="submit">
          Cadastrar para aprovação
        </button>
      </form>
    </section>
  )
}
