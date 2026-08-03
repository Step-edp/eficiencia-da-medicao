import { FormEvent, useMemo, useState } from 'react'
import { api, ApiError, type PasswordRecord, type PasswordType } from './api'
import { LoginFeedback } from './LoginFeedback'

type PassiveRowResult = {
  meter: string
  password: string
  status: 'created' | 'duplicate' | 'invalid'
  error?: string
}

function parsePassivePaste(text: string): Array<{ meter: string; password: string }> {
  const lines = text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  const rows: Array<{ meter: string; password: string }> = []

  for (const line of lines) {
    const cells = line.includes('\t')
      ? line.split('\t')
      : line.includes(';')
        ? line.split(';')
        : line.includes(',')
          ? line.split(',')
          : line.split(/\s+/)

    const cleaned = cells.map((cell) => cell.replace(/\u00a0/g, ' ').trim()).filter(Boolean)
    if (!cleaned.length) continue

    const first = cleaned[0].toLowerCase()
    if (
      first === 'medidor' ||
      first === 'meter' ||
      first === 'senha' ||
      first === 'password'
    ) {
      continue
    }

    const meter = cleaned[0].replace(/\D/g, '')
    const password = cleaned[1] ?? ''
    if (!meter && !password) continue
    rows.push({ meter, password })
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

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    const records = parsePassivePaste(pasteText)
    if (!records.length) {
      setFeedback({
        type: 'error',
        message: 'Cole ao menos uma linha com Medidor e Senha.',
      })
      return
    }
    if (!manufacturer.trim() || !materialType.trim() || !orderNumber.trim()) {
      setFeedback({
        type: 'error',
        message: 'Preencha fabricante, código de material e número de pedido.',
      })
      return
    }

    setSaving(true)
    setFeedback(null)
    try {
      const response = await api.createPassivePasswords({
        records,
        manufacturer: manufacturer.trim(),
        materialType: materialType.trim(),
        orderNumber: orderNumber.trim(),
        passwordType,
      })
      setResults(response.results)
      onCreated(response.records)
      setPasteText('')
      setFeedback({
        type: 'success',
        message: `${response.createdCount} senha(s) cadastrada(s)${
          response.duplicateCount || response.invalidCount
            ? ` · ${response.duplicateCount} duplicada(s) · ${response.invalidCount} inválida(s)`
            : ''
        }.`,
      })
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
        Cadastro em massa de senhas já existentes (passivo). Preencha os campos do banco e
        cole as linhas <strong>Medidor</strong> + <strong>Senha</strong>.
      </p>

      {feedback ? (
        <LoginFeedback
          type={feedback.type}
          message={feedback.message}
          onClose={() => setFeedback(null)}
        />
      ) : null}

      <div className="password-config-row">
        <label>
          Fabricante
          <div className="manufacturer-select-row">
            <select
              value={manufacturer}
              onChange={(event) => setManufacturer(event.target.value)}
              required
              disabled={saving}
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
            required
            disabled={saving}
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
          Número de pedido
          <input
            type="text"
            value={orderNumber}
            onChange={(event) => setOrderNumber(event.target.value)}
            placeholder="Digite o número do pedido"
            required
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
      </div>

      <label className="passivo-paste-label">
        Medidor e senha (em massa)
        <textarea
          rows={10}
          value={pasteText}
          onChange={(event) => setPasteText(event.target.value)}
          placeholder={'Medidor\tSenha\n12345678\tAb12Cd\n87654321\t998877'}
          spellCheck={false}
          disabled={saving}
          required
        />
      </label>
      <p className="field-hint">
        Uma linha por registro. Aceita tab, vírgula ou ponto e vírgula. Dígitos da senha
        são calculados automaticamente pelo tamanho.
      </p>

      {previewRows.length ? (
        <div className="entrada-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Prévia · Medidor</th>
                <th>Prévia · Senha</th>
              </tr>
            </thead>
            <tbody>
              {previewRows.map((row, index) => (
                <tr key={`${row.meter}-${index}`}>
                  <td>{row.meter || '—'}</td>
                  <td>{row.password || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <div className="agenda-form-actions">
        <button type="submit" className="primary-button" disabled={saving || !pasteText.trim()}>
          {saving ? 'Cadastrando…' : 'Cadastrar passivo'}
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
                      : row.status === 'duplicate'
                        ? 'Duplicado'
                        : row.error || 'Inválido'}
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
