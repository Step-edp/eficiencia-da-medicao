import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { EdpLogo } from './EdpLogo'
import { ScheduleAgendarForm } from './ScheduleAgendarForm'
import { EnsaiarForm } from './EnsaiarForm'
import { LabMeasurementTrail } from './LabMeasurementTrail'
import { getLabTrailLabel, LAB_TRAIL_KEYS } from './labTrailSteps'
import {
  api,
  ApiError,
  type AppUser,
  type HomologationRequest,
  type MaterialRecord,
  type PasswordRecord,
  type PasswordType,
} from './api'

const hobbyOptions = [
  'Esportes',
  'Leitura',
  'Música',
  'Tecnologia',
  'Viagens',
  'Fotografia',
]

const FIXED_PURCHASE_REQUEST_HASH = '#/compras/pedidos-homologacao'

type Panel = 'login' | 'cadastro'
type AppRoute = 'default' | 'compras-homologacao'

function getRouteFromHash(hash: string): AppRoute {
  return hash === FIXED_PURCHASE_REQUEST_HASH ? 'compras-homologacao' : 'default'
}

export default function App() {
  const [activePanel, setActivePanel] = useState<Panel>('login')
  const [activeRoute, setActiveRoute] = useState<AppRoute>(() =>
    getRouteFromHash(window.location.hash),
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
      setActiveRoute(getRouteFromHash(window.location.hash))
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
            <h1>Controle de acessos e jornada operacional da área de Medição</h1>
            <p className="lead">
              Plataforma para centralizar autenticação, cadastro de usuários e
              governança de acesso com aprovação do administrador.
            </p>
          </div>

          <div className="status-card">
            <span className="status-pill">Fluxo com aprovação do ADM</span>
            <h2>Solicitação protegida</h2>
            <p>
              Depois do cadastro, o acesso permanece como pendente até a validação
              administrativa. Informações pessoais ficam visíveis somente para o
              próprio colaborador.
            </p>
          </div>
        </div>

        <div className="panel-column">
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

          {activePanel === 'login' ? (
            <LoginPanel
              activeRoute={activeRoute}
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
  activeRoute: AppRoute
  onLoginSuccess: (user: AppUser) => void
}

function LoginPanel({ activeRoute, onLoginSuccess }: LoginPanelProps) {
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
      <header>
        <p className="section-tag">Acesso seguro</p>
        <h2>Entrar com matrícula e senha</h2>
        <p>
          {activeRoute === 'compras-homologacao'
            ? 'Entre para preencher o formulário fixo de Pedidos de Homologação. Se ainda não tiver cadastro, solicite acesso com perfil Compras.'
            : 'Use sua matrícula corporativa e a senha cadastrada. Se sua solicitação ainda estiver pendente, aguarde a aprovação do ADM.'}
        </p>
      </header>

      <div className="demo-access-box">
        <strong>Acesso fictício para teste</strong>
        <span>ADM - Matrícula: E706032 | Senha: Step@241</span>
        <span>Compras - Matrícula: C900001 | Senha: Compras@241</span>
      </div>

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

        <button className="primary-button" type="submit" disabled={submitting}>
          {submitting ? 'Entrando...' : 'Entrar'}
        </button>
      </form>

      {feedback ? (
        <div className={`login-feedback ${feedback.type}`} role="status">
          {feedback.message}
        </div>
      ) : null}

      <div className="helper-box">
        <strong>Status de acesso</strong>
        <span>
          {activeRoute === 'compras-homologacao'
            ? 'Link fixo protegido por login e aprovação do ADM'
            : 'Pendente de aprovação do administrador'}
        </span>
      </div>
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
  const iconByTitle: Record<string, 'chart' | 'flask' | 'calendar' | 'search' | 'inbox' | 'cube' | 'check' | 'image' | 'bolt' | 'ruler' | 'smile' | 'shield' | 'archive' | 'trash' | 'presentation' | 'truck' | 'book' | 'code' | 'lock' | 'key' | 'database' | 'repeat' | 'building' | 'layer' | 'monitor' | 'star'> = {
    Dashboard: 'chart',
    Ensaiar: 'flask',
    Agendar: 'calendar',
    'Consultar RATM': 'search',
    'Entrada de medidores': 'inbox',
    'Criar Modelo': 'cube',
    'Aprovação de RATM': 'check',
    Galeria: 'image',
    'Analisadores de tensão': 'bolt',
    'Padrões': 'ruler',
    'Pesquisa de satisfação': 'smile',
    Auditoria: 'shield',
    Inventário: 'archive',
    Sucata: 'trash',
    Apresentação: 'presentation',
    Fornecedores: 'truck',
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
    Cadastrar: 'archive',
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
  const [selectedFieldTeamSection, setSelectedFieldTeamSection] = useState<string | null>(null)
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
  const labOtherSections = [
    'Dashboard',
    'Consultar RATM',
    'Criar Modelo',
    'Galeria',
    'Analisadores de tensão',
    'Padrões',
    'Auditoria',
    'Inventário',
    'Apresentação',
    'Fornecedores',
    'Treinamentos',
    'Softwares',
  ]
  const homologationSections = [
    'Ensaio',
    'Pedidos de Homologação',
    'Código de materiais',
  ]
  const fieldTeamSections = ['Cadastrar', 'Consultar']

  const areas: Area[] = [
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
      details:
        'Acesse recursos específicos de bancada, procedimentos laboratoriais e análises avançadas para avaliação de equipamentos.',
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
        'Operações em campo, visitas técnicas e acompanhamento de atividades externas.',
      details:
        'Organize rotinas de campo, registre visitas técnicas e acompanhe a execução de serviços externos da operação de Medição.',
    },
  ]

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
        const [passwordsResponse, manufacturersResponse, materialsResponse] = await Promise.all([
          api.listPasswordRecords(),
          api.listManufacturers(),
          api.listMaterials(),
        ])

        if (cancelled) {
          return
        }

        setPasswordRecords(passwordsResponse.records)
        setManufacturers(manufacturersResponse.manufacturers)
        setMaterialRows(materialsResponse.materials)
      } catch {
        if (!cancelled) {
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
      selectedFieldTeamSection
    ) {
      return (
        <main className="shell">
          <section className="home-card area-screen-card">
            <TopActionBar
              onBack={() => setSelectedFieldTeamSection(null)}
              onHome={() => {
                setSelectedFieldTeamSection(null)
                setSelectedArea(null)
              }}
              onLogout={onLogout}
            />
            <p className="section-tag">Equipe de campo</p>
            <h2>{selectedFieldTeamSection}</h2>
            {selectedFieldTeamSection === 'Cadastrar' ? (
              <p>
                Registre visitas técnicas, atividades externas e informações de
                campo da operação de Medição.
              </p>
            ) : (
              <p>
                Consulte registros de visitas, atividades e informações de campo
                já cadastradas pela equipe.
              </p>
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
            <LabMeasurementTrail
              activeStep={selectedLabMeasurementSection}
              onSelect={setSelectedLabMeasurementSection}
              renderIcon={(title) => <ItemIcon title={title} />}
            />
            {selectedLabMeasurementSection === 'Agendar' ? (
              <>
                <p>Preencha os dados abaixo para reservar a data de agendamento.</p>
                <ScheduleAgendarForm />
              </>
            ) : selectedLabMeasurementSection === 'Ensaiar' ? (
              <>
                <p>Escolha quantos RATMs deseja realizar de uma vez (máximo 10).</p>
                <EnsaiarForm />
              </>
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
          <p>{selectedArea.details}</p>
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
              {labOtherSections.length > 0 ? (
                <div
                  className="measurement-sections lab-other-sections"
                  aria-label="Outras funcionalidades do laboratório"
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
        <p>
          Seu acesso foi validado com sucesso. Nesta área você pode consultar os
          recursos liberados para a operação da Medição.
        </p>
        <div className="home-areas" aria-label="Áreas do portal">
          {areas.map((area) => (
            <article
              key={area.title}
              className={`area-card ${getAreaCardClassName(area.title)}`}
            >
              <h3 className="area-card-title">
                <ItemIcon title={area.title} />
                <span>{area.title}</span>
              </h3>
              <p>{area.description}</p>
              <button
                className="secondary-button"
                type="button"
                onClick={() => setSelectedArea(area)}
              >
                Acessar área
              </button>
            </article>
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
  }) => Promise<void>
  onRegistered: () => void
}

function RegisterPanel({ activeRoute, onRegister, onRegistered }: RegisterPanelProps) {
  const [name, setName] = useState('')
  const [registration, setRegistration] = useState('')
  const [birthDate, setBirthDate] = useState('')
  const [email, setEmail] = useState('')
  const [jobTitle, setJobTitle] = useState('')
  const [cpf, setCpf] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [personalDescription, setPersonalDescription] = useState('')
  const [hobby, setHobby] = useState('')
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error'
    message: string
  } | null>(null)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (
      !name.trim() ||
      !registration.trim() ||
      !birthDate ||
      !email.trim() ||
      !jobTitle.trim() ||
      !cpf.trim() ||
      !password ||
      !confirmPassword
    ) {
      setFeedback({
        type: 'error',
        message: 'Preencha os campos obrigatórios antes de enviar o cadastro.',
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
        personalDescription: personalDescription.trim(),
        hobby,
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
      setCpf('')
      setPassword('')
      setConfirmPassword('')
      setPersonalDescription('')
      setHobby('')
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
        <h2>Cadastre-se para solicitar liberação no portal</h2>
        <p>
          {activeRoute === 'compras-homologacao'
            ? 'Este cadastro cria um acesso com perfil Compras. Depois da aprovação do ADM, o usuário visualizará somente o formulário fixo de Pedidos de Homologação.'
            : 'Preencha seus dados profissionais e pessoais. As informações pessoais terão visualização restrita somente a você.'}
        </p>
      </header>

      <div className="privacy-note">
        Observação: foto de perfil, fotos de pessoas que você ama, descrição
        pessoal, hobbies e demais informações pessoais serão visualizadas somente
        por você.
      </div>

      {feedback ? (
        <div className={`login-feedback ${feedback.type}`} role="status">
          {feedback.message}
        </div>
      ) : null}

      <form className="form-grid register-grid" onSubmit={handleSubmit}>
        <label className="full-width">
          Perfil solicitado
          <input type="text" value="Compras" readOnly />
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
          Cargo
          <input
            type="text"
            placeholder="Seu cargo atual"
            value={jobTitle}
            onChange={(event) => setJobTitle(event.target.value)}
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

        <label>
          Foto de perfil
          <input type="file" accept="image/*" />
        </label>

        <label>
          Fotos de pessoas que você ama
          <input type="file" accept="image/*" multiple />
        </label>

        <label className="full-width">
          Quem é você na vida pessoal
          <textarea
            rows={4}
            placeholder="Descreva um pouco sobre você fora do trabalho"
            value={personalDescription}
            onChange={(event) => setPersonalDescription(event.target.value)}
          />
        </label>

        <label className="full-width">
          Hobby
          <select value={hobby} onChange={(event) => setHobby(event.target.value)}>
            <option value="" disabled>
              Selecione um hobby
            </option>
            {hobbyOptions.map((hobby) => (
              <option key={hobby} value={hobby}>
                {hobby}
              </option>
            ))}
          </select>
        </label>

        <button className="primary-button" type="submit">
          Cadastrar para aprovação
        </button>
      </form>
    </section>
  )
}
