import { FormEvent, useMemo, useState } from 'react'
import { api, ApiError, type PasswordRecord, type PasswordType } from './api'
import { LoginFeedback } from './LoginFeedback'

type PassiveMode = 'individual' | 'massa'

type PassiveInputRow = {
  meter: string
  password: string
  manufacturer?: string
  materialType?: string
  orderNumber?: string
  passwordType?: PasswordType | ''
  digits?: number
}

type PassiveRowResult = {
  meter: string
  password: string
  status: 'created' | 'duplicate' | 'invalid'
  error?: string
}

const HEADER_ALIASES: Record<string, keyof PassiveInputRow | 'skip'> = {
  medidor: 'meter',
  meter: 'meter',
  senha: 'password',
  password: 'password',
  fabricante: 'manufacturer',
  manufacturer: 'manufacturer',
  material: 'materialType',
  'codigo de material': 'materialType',
  'código de material': 'materialType',
  'codigo material': 'materialType',
  'código material': 'materialType',
  material_type: 'materialType',
  materialtype: 'materialType',
  pedido: 'orderNumber',
  'numero de pedido': 'orderNumber',
  'número de pedido': 'orderNumber',
  'n pedido': 'orderNumber',
  order_number: 'orderNumber',
  ordernumber: 'orderNumber',
  tipo: 'passwordType',
  'tipo da senha': 'passwordType',
  'tipo senha': 'passwordType',
  password_type: 'passwordType',
  passwordtype: 'passwordType',
  digitos: 'digits',
  dígitos: 'digits',
  digits: 'digits',
}

function splitLine(line: string): string[] {
  if (line.includes('\t')) return line.split('\t')
  if (line.includes(';')) return line.split(';')
  if (line.includes(',')) return line.split(',')
  return line.split(/\s+/)
}

function normalizeHeader(value: string): string {
  return value
    .replace(/^\uFEFF/, '')
    .replace(/\u00a0/g, ' ')
    .trim()
    .toLowerCase()
}

function parsePasswordTypeLabel(value: string): PasswordType | '' {
  const raw = value.trim().toLowerCase()
  if (!raw) return ''
  if (
    raw === 'alphanumeric' ||
    raw === 'alphanumerico' ||
    raw === 'alphanumérico' ||
    raw === 'alfa' ||
    raw === 'misto'
  ) {
    return 'alphanumeric'
  }
  if (raw === 'letters' || raw === 'letras' || raw === 'só letras' || raw === 'so letras') {
    return 'letters'
  }
  if (
    raw === 'numbers' ||
    raw === 'numeros' ||
    raw === 'números' ||
    raw === 'só números' ||
    raw === 'so numeros'
  ) {
    return 'numbers'
  }
  return ''
}

function parsePassivePaste(text: string): PassiveInputRow[] {
  const lines = text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  if (!lines.length) return []

  const firstCells = splitLine(lines[0]).map((cell) =>
    cell.replace(/\u00a0/g, ' ').trim(),
  )
  const mappedHeaders = firstCells.map(
    (cell) => HEADER_ALIASES[normalizeHeader(cell)] ?? null,
  )
  const hasHeader = mappedHeaders.some((key) => key === 'meter' || key === 'password')

  const rows: PassiveInputRow[] = []
  const dataLines = hasHeader ? lines.slice(1) : lines
  const columnKeys = hasHeader
    ? mappedHeaders
    : ([
        'meter',
        'password',
        'manufacturer',
        'materialType',
        'orderNumber',
        'passwordType',
        'digits',
      ] as Array<keyof PassiveInputRow | null>)

  for (const line of dataLines) {
    const cells = splitLine(line).map((cell) =>
      cell.replace(/\u00a0/g, ' ').trim(),
    )
    if (!cells.some(Boolean)) continue

    const first = normalizeHeader(cells[0] ?? '')
    if (
      first === 'medidor' ||
      first === 'meter' ||
      first === 'senha' ||
      first === 'password'
    ) {
      continue
    }

    const row: PassiveInputRow = { meter: '', password: '' }

    columnKeys.forEach((key, index) => {
      if (!key || key === 'skip') return
      const value = cells[index] ?? ''
      if (!value) return
      if (key === 'meter') {
        row.meter = value.replace(/\D/g, '')
        return
      }
      if (key === 'password') {
        row.password = value
        return
      }
      if (key === 'passwordType') {
        row.passwordType = parsePasswordTypeLabel(value)
        return
      }
      if (key === 'digits') {
        const digits = Number(value.replace(/\D/g, ''))
        if (Number.isInteger(digits) && digits > 0) row.digits = digits
        return
      }
      row[key] = value
    })

    if (!hasHeader && cells.length >= 2 && !row.password) {
      row.meter = (cells[0] ?? '').replace(/\D/g, '')
      row.password = cells[1] ?? ''
    }

    if (!row.meter && !row.password) continue
    rows.push(row)
  }

  return rows
}

type PassivoPanelProps = {
  manufacturers: string[]
  materialTypeOptions: string[]
  onCreated: (records: PasswordRecord[]) => void
  onAddManufacturer: () => void
}

export function PassivoPanel({
  manufacturers,
  materialTypeOptions,
  onCreated,
  onAddManufacturer,
}: PassivoPanelProps) {
  const [mode, setMode] = useState<PassiveMode>('individual')
  const [meter, setMeter] = useState('')
  const [password, setPassword] = useState('')
  const [digits, setDigits] = useState('')
  const [manufacturer, setManufacturer] = useState('')
  const [materialType, setMaterialType] = useState('')
  const [orderNumber, setOrderNumber] = useState('')
  const [passwordType, setPasswordType] = useState<PasswordType | ''>('')
  const [pasteText, setPasteText] = useState('')
  const [saving, setSaving] = useState(false)
  const [results, setResults] = useState<PassiveRowResult[]>([])
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error'
    message: string
  } | null>(null)

  const previewRows = useMemo(() => parsePassivePaste(pasteText).slice(0, 8), [pasteText])
  const computedDigits = password.length || Number(digits) || ''

  const sharedFields = (
    <>
      <label>
        Fabricante
        <div className="manufacturer-select-row">
          <select
            value={manufacturer}
            onChange={(event) => setManufacturer(event.target.value)}
            required={mode === 'individual'}
            disabled={saving}
          >
            <option value="" disabled={mode === 'individual'}>
              {mode === 'individual' ? 'Selecione' : 'Opcional (padrão)'}
            </option>
            {manufacturers.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <button
            className="secondary-button manufacturer-add-button"
            type="button"
            onClick={onAddManufacturer}
            aria-label="Cadastrar novo fabricante"
            title="Cadastrar novo fabricante"
            disabled={saving}
          >
            +
          </button>
        </div>
      </label>
      <label>
        Código de material
        <select
          value={materialType}
          onChange={(event) => setMaterialType(event.target.value)}
          required={mode === 'individual'}
          disabled={saving}
        >
          <option value="" disabled={mode === 'individual'}>
            {mode === 'individual' ? 'Selecione' : 'Opcional (padrão)'}
          </option>
          {materialTypeOptions.map((material) => (
            <option key={material} value={material}>
              {material}
            </option>
          ))}
        </select>
      </label>
      <label>
        Número de pedido
        <input
          type="text"
          value={orderNumber}
          onChange={(event) => setOrderNumber(event.target.value)}
          placeholder="Digite o número do pedido"
          required={mode === 'individual'}
          disabled={saving}
        />
      </label>
      <label>
        Tipo da senha
        <select
          value={passwordType}
          onChange={(event) =>
            setPasswordType(event.target.value as PasswordType | '')
          }
          disabled={saving}
        >
          <option value="">Detectar automaticamente</option>
          <option value="alphanumeric">Alphanumérico</option>
          <option value="letters">Só letras</option>
          <option value="numbers">Só números</option>
        </select>
      </label>
    </>
  )

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()

    const records: PassiveInputRow[] =
      mode === 'individual'
        ? [
            {
              meter: meter.replace(/\D/g, ''),
              password: password.trim(),
              manufacturer: manufacturer.trim(),
              materialType: materialType.trim(),
              orderNumber: orderNumber.trim(),
              passwordType,
              digits: digits.trim()
                ? Number(digits)
                : password.trim().length || undefined,
            },
          ]
        : parsePassivePaste(pasteText)

    if (!records.length) {
      setFeedback({
        type: 'error',
        message:
          mode === 'individual'
            ? 'Preencha medidor e senha.'
            : 'Cole ao menos uma linha com os campos do banco.',
      })
      return
    }

    if (mode === 'individual') {
      if (!manufacturer.trim() || !materialType.trim() || !orderNumber.trim()) {
        setFeedback({
          type: 'error',
          message: 'Preencha fabricante, código de material e número de pedido.',
        })
        return
      }
    }

    setSaving(true)
    setFeedback(null)
    try {
      const response = await api.createPassivePasswords({
        records,
        manufacturer: manufacturer.trim() || undefined,
        materialType: materialType.trim() || undefined,
        orderNumber: orderNumber.trim() || undefined,
        passwordType,
      })
      setResults(response.results)
      onCreated(response.records)
      if (mode === 'individual' && response.createdCount > 0) {
        setMeter('')
        setPassword('')
        setDigits('')
      }
      if (mode === 'massa') {
        setPasteText('')
      }
      if (mode === 'individual' && response.createdCount === 0) {
        const firstError =
          response.results.find((row) => row.error)?.error ||
          'Não foi possível cadastrar a senha passiva.'
        setFeedback({
          type: 'error',
          message: firstError,
        })
      } else {
        setFeedback({
          type: 'success',
          message: `${response.createdCount} senha(s) cadastrada(s)${
            response.duplicateCount || response.invalidCount
              ? ` · ${response.duplicateCount} duplicada(s) · ${response.invalidCount} inválida(s)`
              : ''
          }.`,
        })
      }
    } catch (error) {
      setFeedback({
        type: 'error',
        message:
          error instanceof ApiError
            ? error.message
            : 'Não foi possível cadastrar as senhas passivas.',
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="passivo-panel" onSubmit={(event) => void handleSubmit(event)}>
      <p className="passivo-intro">
        Cadastro de senhas já existentes (passivo). Campos do banco:{' '}
        <strong>medidor</strong>, <strong>senha</strong>, <strong>fabricante</strong>,{' '}
        <strong>código de material</strong>, <strong>número de pedido</strong>,{' '}
        <strong>tipo</strong> e <strong>dígitos</strong>.
      </p>

      <div className="passivo-mode-toggle" role="group" aria-label="Modo de cadastro">
        <button
          type="button"
          className={mode === 'individual' ? 'passivo-mode-active' : undefined}
          onClick={() => setMode('individual')}
          disabled={saving}
        >
          Individual
        </button>
        <button
          type="button"
          className={mode === 'massa' ? 'passivo-mode-active' : undefined}
          onClick={() => setMode('massa')}
          disabled={saving}
        >
          Em massa
        </button>
      </div>

      {feedback ? (
        <LoginFeedback
          type={feedback.type}
          message={feedback.message}
          onClose={() => setFeedback(null)}
        />
      ) : null}

      <div className="password-config-row">{sharedFields}</div>

      {mode === 'individual' ? (
        <div className="password-config-row">
          <label>
            Medidor
            <input
              type="text"
              inputMode="numeric"
              value={meter}
              onChange={(event) => setMeter(event.target.value.replace(/\D/g, ''))}
              placeholder="Somente números"
              required
              disabled={saving}
            />
          </label>
          <label>
            Senha
            <input
              type="text"
              value={password}
              onChange={(event) => {
                setPassword(event.target.value)
                if (!digits.trim()) setDigits(String(event.target.value.length || ''))
              }}
              placeholder="Senha existente"
              required
              disabled={saving}
            />
          </label>
          <label>
            Dígitos
            <input
              type="number"
              min={1}
              max={100}
              value={digits || computedDigits}
              onChange={(event) => setDigits(event.target.value)}
              placeholder="Calculado pelo tamanho"
              disabled={saving}
            />
          </label>
        </div>
      ) : (
        <>
          <label className="passivo-paste-label">
            Colar registros (em massa)
            <textarea
              rows={10}
              value={pasteText}
              onChange={(event) => setPasteText(event.target.value)}
              placeholder={
                'Medidor\tSenha\tFabricante\tCódigo de material\tNúmero de pedido\tTipo\tDígitos\n12345678\tAb12Cd\tLANDIS\t12345678\tPED-001\talphanumeric\t6'
              }
              spellCheck={false}
              disabled={saving}
              required
            />
          </label>
          <p className="field-hint">
            Uma linha por registro. Aceita tab, vírgula ou ponto e vírgula. Colunas
            opcionais usam os valores padrão acima. Dígitos em branco = tamanho da senha.
          </p>

          {previewRows.length ? (
            <div className="entrada-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Prévia · Medidor</th>
                    <th>Prévia · Senha</th>
                    <th>Fabricante</th>
                    <th>Material</th>
                    <th>Pedido</th>
                    <th>Tipo</th>
                    <th>Dígitos</th>
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row, index) => (
                    <tr key={`${row.meter}-${index}`}>
                      <td>{row.meter || '—'}</td>
                      <td>{row.password || '—'}</td>
                      <td>{row.manufacturer || manufacturer || '—'}</td>
                      <td>{row.materialType || materialType || '—'}</td>
                      <td>{row.orderNumber || orderNumber || '—'}</td>
                      <td>{row.passwordType || passwordType || 'auto'}</td>
                      <td>{row.digits ?? row.password.length ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </>
      )}

      <div className="agenda-form-actions">
        <button
          type="submit"
          className="primary-button"
          disabled={
            saving ||
            (mode === 'individual'
              ? !meter.trim() || !password.trim()
              : !pasteText.trim())
          }
        >
          {saving
            ? 'Cadastrando…'
            : mode === 'individual'
              ? 'Cadastrar passivo'
              : 'Cadastrar em massa'}
        </button>
      </div>

      {results.length ? (
        <div className="entrada-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Medidor</th>
                <th>Senha</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {results.map((row, index) => (
                <tr key={`${row.meter}-${index}`}>
                  <td>{row.meter}</td>
                  <td>{row.password}</td>
                  <td>
                    {row.status === 'created'
                      ? 'Cadastrado'
                      : row.error ||
                        (row.status === 'duplicate' ? 'Duplicado' : 'Inválido')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </form>
  )
}
