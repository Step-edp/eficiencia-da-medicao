import {
  ClipboardEvent,
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  api,
  ApiError,
  type ConsolidacaoCargaClienteRecord,
} from './api'
import { LoginFeedback } from './LoginFeedback'

const CLIENT_FORM_FIELDS = [
  { key: 'nomeCliente', label: 'Nome do cliente' },
  { key: 'instalacao', label: 'Instalação' },
  { key: 'dataDenuncia', label: 'Data denúncia', kind: 'date' },
  {
    key: 'dataPrevistaMigracao',
    label: 'Data prevista para migração',
    kind: 'date',
  },
  { key: 'nota', label: 'Nota', fullWidth: true },
] as const

type ClientFieldKey = (typeof CLIENT_FORM_FIELDS)[number]['key']

type ClientFormValues = Record<ClientFieldKey, string>

type BulkRow = ClientFormValues & {
  id: string
  error?: string
}

const EMPTY_FORM: ClientFormValues = Object.fromEntries(
  CLIENT_FORM_FIELDS.map((field) => [field.key, '']),
) as ClientFormValues

function createEmptyForm(): ClientFormValues {
  return { ...EMPTY_FORM }
}

function createBulkRow(): BulkRow {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ...createEmptyForm(),
  }
}

function createInitialBulkRows(count = 5): BulkRow[] {
  return Array.from({ length: count }, () => createBulkRow())
}

function formatDateBr(value: string): string {
  if (!value) return '—'
  const [year, month, day] = value.split('-')
  if (!year || !month || !day) return value
  return `${day}/${month}/${year}`
}

function formatDateTimeBr(value: string): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('pt-BR')
}

const MS_PER_DAY = 24 * 60 * 60 * 1000
const MIN_DATE_GAP_DAYS = 180
const NINE_DIGITS = 9

function daysBetween(dateA: string, dateB: string): number | null {
  const a = new Date(`${dateA}T00:00:00`)
  const b = new Date(`${dateB}T00:00:00`)
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null
  return Math.abs(Math.round((b.getTime() - a.getTime()) / MS_PER_DAY))
}

function formatNineDigits(value: string): string {
  return value.replace(/\D/g, '').slice(0, NINE_DIGITS)
}

function padInstalacao(value: string): string {
  const digits = formatNineDigits(value)
  return digits ? digits.padStart(NINE_DIGITS, '0') : ''
}

function isoToBrDate(value: string): string {
  if (!value) return ''
  const [year, month, day] = value.split('-')
  if (!year || !month || !day) return ''
  return `${day}/${month}/${year}`
}

function formatBrDateTyping(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 8)
  if (digits.length <= 2) return digits
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`
}

function brDateToIso(value: string): string | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim())
  if (!match) return null
  const day = Number(match[1])
  const month = Number(match[2])
  const year = Number(match[3])
  const date = new Date(year, month - 1, day)
  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null
  }
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

const BULK_FIELDS: ClientFieldKey[] = [
  'nomeCliente',
  'instalacao',
  'dataDenuncia',
  'dataPrevistaMigracao',
  'nota',
]

function parseFlexibleDateToIso(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return ''

  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    return trimmed.slice(0, 10)
  }

  const digits = trimmed.replace(/\D/g, '')
  if (digits.length === 8) {
    const asBr = `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`
    const isoFromDigits = brDateToIso(asBr)
    if (isoFromDigits) return isoFromDigits
  }

  const parts = trimmed.split(/[/\-.]/).map((part) => part.trim())
  if (parts.length === 3) {
    const [first, second, third] = parts
    if (third.length === 4) {
      const iso = brDateToIso(
        `${first.padStart(2, '0')}/${second.padStart(2, '0')}/${third}`,
      )
      if (iso) return iso
    }
    if (first.length === 4) {
      const iso = `${first}-${second.padStart(2, '0')}-${third.padStart(2, '0')}`
      if (brDateToIso(isoToBrDate(iso))) return iso
      const probe = new Date(`${iso}T00:00:00`)
      if (!Number.isNaN(probe.getTime())) return iso
    }
  }

  const serial = Number(trimmed.replace(',', '.'))
  if (Number.isFinite(serial) && serial > 20000 && serial < 90000) {
    const epoch = Date.UTC(1899, 11, 30)
    const date = new Date(epoch + Math.round(serial) * MS_PER_DAY)
    if (!Number.isNaN(date.getTime())) {
      const year = date.getUTCFullYear()
      const month = String(date.getUTCMonth() + 1).padStart(2, '0')
      const day = String(date.getUTCDate()).padStart(2, '0')
      return `${year}-${month}-${day}`
    }
  }

  return ''
}

function normalizeBulkCell(key: ClientFieldKey, raw: string): string {
  const value = raw.replace(/^["']|["']$/g, '').trim()
  if (!value) return ''

  if (key === 'instalacao') {
    return padInstalacao(value)
  }
  if (key === 'nota') {
    return formatNineDigits(value)
  }
  if (key === 'dataDenuncia' || key === 'dataPrevistaMigracao') {
    return parseFlexibleDateToIso(value)
  }
  return value
}

function parseClipboardGrid(text: string): string[][] {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  if (!normalized.trim()) return []

  return normalized
    .split('\n')
    .map((line) => {
      if (line.includes('\t')) {
        return line.split('\t').map((cell) => cell.trim())
      }
      if (line.includes(';')) {
        return line.split(';').map((cell) => cell.trim())
      }
      const commaCount = (line.match(/,/g) ?? []).length
      if (commaCount >= 2) {
        return line.split(',').map((cell) => cell.trim())
      }
      return [line.trim()]
    })
    .filter((row) => row.some((cell) => cell.length > 0))
}

function looksLikeBulkHeader(row: string[]): boolean {
  const first = (row[0] ?? '').trim().toLowerCase()
  const second = (row[1] ?? '').trim().toLowerCase()
  return (
    first === 'nome' ||
    first === 'nome do cliente' ||
    first === 'cliente' ||
    (first.includes('nome') && second.includes('instal'))
  )
}

function applyPasteGridToRows(
  currentRows: BulkRow[],
  grid: string[][],
  startRow: number,
  startCol: number,
): BulkRow[] {
  let rows = grid
  if (rows.length > 0 && looksLikeBulkHeader(rows[0]) && startRow === 0 && startCol === 0) {
    rows = rows.slice(1)
  }

  const next = currentRows.map((row) => ({ ...row }))
  rows.forEach((cells, rowOffset) => {
    const rowIndex = startRow + rowOffset
    while (next.length <= rowIndex) {
      next.push(createBulkRow())
    }
    const updated = { ...next[rowIndex], error: undefined }
    cells.forEach((cell, colOffset) => {
      const fieldIndex = startCol + colOffset
      if (fieldIndex < 0 || fieldIndex >= BULK_FIELDS.length) return
      const key = BULK_FIELDS[fieldIndex]
      updated[key] = normalizeBulkCell(key, cell)
    })
    next[rowIndex] = updated
  })

  return next
}

type ConsolidacaoDateFieldProps = {
  value: string
  onChange: (value: string) => void
  required?: boolean
  disabled?: boolean
  id?: string
}

function ConsolidacaoDateField({
  value,
  onChange,
  required = false,
  disabled = false,
  id,
}: ConsolidacaoDateFieldProps) {
  const pickerRef = useRef<HTMLInputElement>(null)
  const [text, setText] = useState(() => isoToBrDate(value))

  useEffect(() => {
    setText(isoToBrDate(value))
  }, [value])

  const openCalendar = () => {
    const input = pickerRef.current
    if (!input || disabled) return
    if (typeof input.showPicker === 'function') {
      try {
        input.showPicker()
        return
      } catch {
        // fallback: focus native date input
      }
    }
    input.focus()
    input.click()
  }

  return (
    <div className="consolidacao-date-field">
      <input
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder="dd/mm/aaaa"
        maxLength={10}
        value={text}
        required={required}
        disabled={disabled}
        onChange={(event) => {
          const masked = formatBrDateTyping(event.target.value)
          setText(masked)
          if (!masked) {
            onChange('')
            return
          }
          const iso = brDateToIso(masked)
          if (iso) onChange(iso)
        }}
        onBlur={() => {
          if (!text.trim()) {
            onChange('')
            setText('')
            return
          }
          const iso = brDateToIso(text)
          if (iso) {
            onChange(iso)
            setText(isoToBrDate(iso))
            return
          }
          setText(isoToBrDate(value))
        }}
      />
      <input
        ref={pickerRef}
        type="date"
        className="consolidacao-date-picker-native"
        value={value}
        tabIndex={-1}
        aria-hidden="true"
        disabled={disabled}
        onChange={(event) => {
          onChange(event.target.value)
          setText(isoToBrDate(event.target.value))
        }}
      />
      <button
        type="button"
        className="consolidacao-date-calendar-button"
        onClick={openCalendar}
        disabled={disabled}
        aria-label="Abrir calendário"
        title="Abrir calendário"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect
            x="4"
            y="6"
            width="16"
            height="14"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          />
          <path
            d="M8 3v6M16 3v6M4 10h16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          />
        </svg>
      </button>
    </div>
  )
}

function isRowEmpty(row: ClientFormValues): boolean {
  return CLIENT_FORM_FIELDS.every((field) => !row[field.key].trim())
}

function validateClientRow(row: ClientFormValues): string | null {
  for (const field of CLIENT_FORM_FIELDS) {
    if (!row[field.key].trim()) {
      return `Preencha o campo ${field.label}.`
    }
  }

  if (!row.instalacao.trim()) {
    return 'Preencha o campo Instalação.'
  }

  if (row.nota.length !== NINE_DIGITS) {
    return `O campo Nota deve ter exatamente ${NINE_DIGITS} dígitos.`
  }

  const gapDays = daysBetween(row.dataDenuncia, row.dataPrevistaMigracao)
  if (gapDays === null || gapDays < MIN_DATE_GAP_DAYS) {
    return 'As datas devem ter pelo menos 180 dias de diferença.'
  }

  return null
}

type ConsolidacaoCargaPanelProps = {
  readOnly?: boolean
}

export function ConsolidacaoCargaPanel({ readOnly = false }: ConsolidacaoCargaPanelProps) {
  const [showForm, setShowForm] = useState(false)
  const [showBulk, setShowBulk] = useState(false)
  const [form, setForm] = useState<ClientFormValues>(createEmptyForm)
  const [bulkRows, setBulkRows] = useState<BulkRow[]>(createInitialBulkRows)
  const [clients, setClients] = useState<ConsolidacaoCargaClienteRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [showBulkConfirm, setShowBulkConfirm] = useState(false)
  const [pendingValidRows, setPendingValidRows] = useState<BulkRow[]>([])
  const [bulkPasteText, setBulkPasteText] = useState('')
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error'
    message: string
  } | null>(null)

  const requiredKeys = useMemo(
    () => CLIENT_FORM_FIELDS.map((field) => field.key),
    [],
  )

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { clients: rows } = await api.listConsolidacaoCargaClientes()
      setClients(rows)
    } catch (error) {
      setClients([])
      setFeedback({
        type: 'error',
        message:
          error instanceof ApiError
            ? error.message
            : 'Não foi possível carregar os clientes cadastrados.',
      })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const updateField = (key: ClientFieldKey, value: string) => {
    setForm((current) => ({ ...current, [key]: value }))
  }

  const resetForm = () => {
    setForm(createEmptyForm())
  }

  const resetBulk = () => {
    setBulkRows(createInitialBulkRows())
    setBulkPasteText('')
    setShowBulkConfirm(false)
    setPendingValidRows([])
  }

  const updateBulkField = (rowId: string, key: ClientFieldKey, value: string) => {
    setBulkRows((current) =>
      current.map((row) =>
        row.id === rowId
          ? {
              ...row,
              [key]: value,
              error: undefined,
            }
          : row,
      ),
    )
  }

  const applyBulkPaste = (
    text: string,
    startRow = 0,
    startCol = 0,
    options?: { allowSingleCell?: boolean },
  ) => {
    const grid = parseClipboardGrid(text)
    if (grid.length === 0) {
      setFeedback({
        type: 'error',
        message: 'Não foi possível ler os dados colados.',
      })
      return 0
    }

    // Colagem de uma única célula no input: deixa o comportamento padrão.
    if (
      !options?.allowSingleCell &&
      grid.length === 1 &&
      (grid[0]?.length ?? 0) <= 1
    ) {
      return 0
    }

    setBulkRows((current) => applyPasteGridToRows(current, grid, startRow, startCol))
    return grid.length
  }

  const handleBulkTablePaste = (event: ClipboardEvent<HTMLElement>) => {
    if (creating) return

    const text = event.clipboardData.getData('text/plain')
    const grid = parseClipboardGrid(text)
    if (grid.length === 0) return
    if (grid.length === 1 && (grid[0]?.length ?? 0) <= 1) return

    const target = event.target as HTMLElement | null
    const cell = target?.closest('[data-bulk-row][data-bulk-col]') as HTMLElement | null
    const startRow = Number(cell?.dataset.bulkRow ?? 0)
    const startCol = Number(cell?.dataset.bulkCol ?? 0)

    event.preventDefault()
    const pastedLines = applyBulkPaste(
      text,
      Number.isFinite(startRow) ? startRow : 0,
      Number.isFinite(startCol) ? startCol : 0,
    )
    if (pastedLines > 0) {
      setBulkPasteText('')
      setFeedback({
        type: 'success',
        message: `${pastedLines} linha(s) colada(s) na tabela.`,
      })
    }
  }

  const handleApplyPasteArea = () => {
    if (creating) return
    const pastedLines = applyBulkPaste(bulkPasteText, 0, 0, {
      allowSingleCell: true,
    })
    if (pastedLines > 0) {
      setBulkPasteText('')
      setFeedback({
        type: 'success',
        message: `${pastedLines} linha(s) aplicadas na tabela.`,
      })
    }
  }

  const saveValidBulkRows = async (rowsToSave: BulkRow[]) => {
    if (rowsToSave.length === 0) return

    setCreating(true)
    setFeedback(null)
    try {
      const { clients: created, createdCount } =
        await api.createConsolidacaoCargaClientesBulk(
          rowsToSave.map((row) => ({
            nomeCliente: row.nomeCliente.trim(),
            instalacao: padInstalacao(row.instalacao),
            dataDenuncia: row.dataDenuncia,
            dataPrevistaMigracao: row.dataPrevistaMigracao,
            nota: row.nota,
          })),
        )

      setClients((current) => [...created, ...current])
      setBulkRows((current) => {
        const savedIds = new Set(rowsToSave.map((row) => row.id))
        const remaining = current.filter((row) => !savedIds.has(row.id))
        return remaining.length > 0 ? remaining : createInitialBulkRows()
      })
      setShowBulkConfirm(false)
      setPendingValidRows([])
      setFeedback({
        type: 'success',
        message:
          createdCount === 1
            ? '1 cliente cadastrado com sucesso.'
            : `${createdCount} clientes cadastrados com sucesso.`,
      })
    } catch (error) {
      setFeedback({
        type: 'error',
        message:
          error instanceof ApiError
            ? error.message
            : 'Não foi possível cadastrar os clientes em massa.',
      })
    } finally {
      setCreating(false)
    }
  }

  const handleBulkSubmit = async () => {
    if (readOnly || creating) return

    const filledRows = bulkRows.filter((row) => !isRowEmpty(row))
    if (filledRows.length === 0) {
      setFeedback({
        type: 'error',
        message: 'Preencha ao menos uma linha para cadastrar em massa.',
      })
      return
    }

    const validRows: BulkRow[] = []
    const markedRows = bulkRows.map((row) => {
      if (isRowEmpty(row)) {
        return { ...row, error: undefined }
      }
      const error = validateClientRow(row)
      if (error) {
        return { ...row, error }
      }
      validRows.push(row)
      return { ...row, error: undefined }
    })

    setBulkRows(markedRows)

    const invalidCount = filledRows.length - validRows.length
    if (invalidCount > 0) {
      if (validRows.length === 0) {
        setFeedback({
          type: 'error',
          message:
            'Existem cadastros com erros. Corrija as linhas destacadas para continuar.',
        })
        return
      }

      setPendingValidRows(validRows)
      setShowBulkConfirm(true)
      return
    }

    await saveValidBulkRows(validRows)
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (readOnly || creating) return

    for (const key of requiredKeys) {
      if (!form[key].trim()) {
        const label =
          CLIENT_FORM_FIELDS.find((field) => field.key === key)?.label ?? key
        setFeedback({
          type: 'error',
          message: `Preencha o campo ${label}.`,
        })
        return
      }
    }

    const gapDays = daysBetween(form.dataDenuncia, form.dataPrevistaMigracao)
    if (gapDays === null || gapDays < MIN_DATE_GAP_DAYS) {
      setFeedback({
        type: 'error',
        message:
          'A Data denúncia e a Data prevista para migração devem ter pelo menos 180 dias de diferença.',
      })
      return
    }

    if (!form.instalacao.trim()) {
      setFeedback({
        type: 'error',
        message: 'Preencha o campo Instalação.',
      })
      return
    }

    if (form.nota.length !== NINE_DIGITS) {
      setFeedback({
        type: 'error',
        message: `O campo Nota deve ter exatamente ${NINE_DIGITS} dígitos.`,
      })
      return
    }

    setCreating(true)
    setFeedback(null)
    try {
      const instalacao = padInstalacao(form.instalacao)
      const { client } = await api.createConsolidacaoCargaCliente({
        nomeCliente: form.nomeCliente.trim(),
        instalacao,
        dataDenuncia: form.dataDenuncia,
        dataPrevistaMigracao: form.dataPrevistaMigracao,
        nota: form.nota,
      })
      setClients((current) => [client, ...current])
      setFeedback({
        type: 'success',
        message: `Cliente "${client.nomeCliente}" cadastrado com sucesso (instalação ${client.instalacao}).`,
      })
      resetForm()
      setShowForm(false)
    } catch (error) {
      setFeedback({
        type: 'error',
        message:
          error instanceof ApiError
            ? error.message
            : 'Não foi possível cadastrar o cliente.',
      })
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="consolidacao-carga-panel">
      {readOnly ? null : (
        <div className="area-actions right-aligned-actions">
          <button
            type="button"
            className="secondary-button consolidacao-action-button"
            onClick={() => {
              setFeedback(null)
              setShowForm(false)
              resetForm()
              setShowBulk((current) => {
                if (current) resetBulk()
                return !current
              })
            }}
          >
            {showBulk ? 'Fechar cadastro em massa' : 'Cadastrar em massa'}
          </button>
          <button
            type="button"
            className="primary-button consolidacao-action-button"
            onClick={() => {
              setFeedback(null)
              setShowBulk(false)
              resetBulk()
              setShowForm((current) => !current)
              if (showForm) resetForm()
            }}
          >
            {showForm ? 'Fechar formulário' : 'Cadastrar cliente'}
          </button>
        </div>
      )}

      {feedback ? (
        <LoginFeedback
          type={feedback.type}
          message={feedback.message}
          onClose={() => setFeedback(null)}
        />
      ) : null}

      {!readOnly && showForm ? (
        <form
          className="form-grid consolidacao-cliente-form"
          onSubmit={handleSubmit}
          noValidate
        >
          {CLIENT_FORM_FIELDS.map((field) => {
            const isDate = 'kind' in field && field.kind === 'date'
            const isFullWidth = 'fullWidth' in field && field.fullWidth

            return (
              <label
                key={field.key}
                className={isFullWidth ? 'full-width' : undefined}
              >
                {field.label}
                {field.key === 'instalacao' ? (
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    maxLength={NINE_DIGITS}
                    value={form.instalacao}
                    onChange={(event) =>
                      updateField('instalacao', formatNineDigits(event.target.value))
                    }
                    onBlur={() => {
                      if (form.instalacao.trim()) {
                        updateField('instalacao', padInstalacao(form.instalacao))
                      }
                    }}
                    placeholder="Ex.: 123456"
                    required
                    disabled={creating}
                  />
                ) : field.key === 'nota' ? (
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    maxLength={NINE_DIGITS}
                    value={form.nota}
                    onChange={(event) =>
                      updateField('nota', formatNineDigits(event.target.value))
                    }
                    placeholder="000000000"
                    required
                    disabled={creating}
                  />
                ) : isDate ? (
                  <ConsolidacaoDateField
                    value={form[field.key]}
                    onChange={(next) => updateField(field.key, next)}
                    required
                    disabled={creating}
                  />
                ) : (
                  <input
                    type="text"
                    value={form[field.key]}
                    onChange={(event) => updateField(field.key, event.target.value)}
                    placeholder={field.label}
                    required
                    disabled={creating}
                  />
                )}
              </label>
            )
          })}

          <div className="consolidacao-cliente-actions full-width">
            <button
              type="button"
              className="secondary-button"
              onClick={() => {
                resetForm()
                setShowForm(false)
              }}
              disabled={creating}
            >
              Cancelar
            </button>
            <button type="submit" className="primary-button" disabled={creating}>
              {creating ? 'Salvando…' : 'Salvar cliente'}
            </button>
          </div>
        </form>
      ) : null}

      {!readOnly && showBulk ? (
        <div className="consolidacao-bulk-panel">
          <p className="consolidacao-bulk-hint">
            Cole do Excel de uma vez (colunas: Nome do cliente, Instalação, Data
            denúncia, Data prevista para migração, Nota). Você pode colar na área
            abaixo ou diretamente em qualquer célula da tabela.
          </p>

          <label className="consolidacao-bulk-paste-area">
            Colar dados
            <textarea
              value={bulkPasteText}
              onChange={(event) => setBulkPasteText(event.target.value)}
              onPaste={(event) => {
                // Aplica automaticamente ao colar na área.
                const text = event.clipboardData.getData('text/plain')
                if (!text.trim()) return
                event.preventDefault()
                const pastedLines = applyBulkPaste(text, 0, 0, {
                  allowSingleCell: true,
                })
                if (pastedLines > 0) {
                  setBulkPasteText('')
                  setFeedback({
                    type: 'success',
                    message: `${pastedLines} linha(s) aplicadas na tabela.`,
                  })
                } else {
                  setBulkPasteText(text)
                }
              }}
              placeholder={
                'Nome A\t123456\t01/01/2024\t01/07/2024\t123456789\nNome B\t654321\t02/01/2024\t02/07/2024\t987654321'
              }
              rows={4}
              disabled={creating}
            />
          </label>
          <div className="consolidacao-cliente-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={handleApplyPasteArea}
              disabled={creating || !bulkPasteText.trim()}
            >
              Aplicar dados colados
            </button>
          </div>

          <div
            className="entrada-table-wrap consolidacao-bulk-table-wrap"
            onPaste={handleBulkTablePaste}
          >
            <table className="data-table consolidacao-bulk-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Nome do cliente</th>
                  <th>Instalação</th>
                  <th>Data denúncia</th>
                  <th>Data prevista para migração</th>
                  <th>Nota</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {bulkRows.map((row, index) => (
                  <tr
                    key={row.id}
                    className={row.error ? 'consolidacao-bulk-row-error' : undefined}
                  >
                    <td>{index + 1}</td>
                    <td>
                      <input
                        type="text"
                        data-bulk-row={index}
                        data-bulk-col={0}
                        value={row.nomeCliente}
                        onChange={(event) =>
                          updateBulkField(row.id, 'nomeCliente', event.target.value)
                        }
                        placeholder="Nome do cliente"
                        disabled={creating}
                      />
                    </td>
                    <td>
                      <input
                        type="text"
                        inputMode="numeric"
                        maxLength={NINE_DIGITS}
                        data-bulk-row={index}
                        data-bulk-col={1}
                        value={row.instalacao}
                        onChange={(event) =>
                          updateBulkField(
                            row.id,
                            'instalacao',
                            formatNineDigits(event.target.value),
                          )
                        }
                        onBlur={() => {
                          if (row.instalacao.trim()) {
                            updateBulkField(
                              row.id,
                              'instalacao',
                              padInstalacao(row.instalacao),
                            )
                          }
                        }}
                        placeholder="Ex.: 123456"
                        disabled={creating}
                      />
                    </td>
                    <td data-bulk-row={index} data-bulk-col={2}>
                      <ConsolidacaoDateField
                        value={row.dataDenuncia}
                        onChange={(next) =>
                          updateBulkField(row.id, 'dataDenuncia', next)
                        }
                        disabled={creating}
                      />
                    </td>
                    <td data-bulk-row={index} data-bulk-col={3}>
                      <ConsolidacaoDateField
                        value={row.dataPrevistaMigracao}
                        onChange={(next) =>
                          updateBulkField(row.id, 'dataPrevistaMigracao', next)
                        }
                        disabled={creating}
                      />
                    </td>
                    <td>
                      <input
                        type="text"
                        inputMode="numeric"
                        maxLength={NINE_DIGITS}
                        data-bulk-row={index}
                        data-bulk-col={4}
                        value={row.nota}
                        onChange={(event) =>
                          updateBulkField(
                            row.id,
                            'nota',
                            formatNineDigits(event.target.value),
                          )
                        }
                        placeholder="000000000"
                        disabled={creating}
                      />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="secondary-button consolidacao-bulk-remove"
                        onClick={() =>
                          setBulkRows((current) =>
                            current.length <= 1
                              ? createInitialBulkRows(1)
                              : current.filter((item) => item.id !== row.id),
                          )
                        }
                        disabled={creating}
                      >
                        Remover
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {bulkRows.some((row) => row.error) ? (
            <p className="consolidacao-bulk-errors" role="status">
              Linhas com erro foram destacadas e não serão cadastradas.
            </p>
          ) : null}

          <div className="consolidacao-cliente-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={() =>
                setBulkRows((current) => [...current, createBulkRow()])
              }
              disabled={creating}
            >
              Adicionar linha
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={() => {
                resetBulk()
                setShowBulk(false)
              }}
              disabled={creating}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="primary-button"
              onClick={() => void handleBulkSubmit()}
              disabled={creating}
            >
              {creating ? 'Salvando…' : 'Salvar cadastros'}
            </button>
          </div>
        </div>
      ) : null}

      {showBulkConfirm ? (
        <div
          className="laudo-confirm-overlay"
          role="presentation"
          onClick={() => {
            if (!creating) {
              setShowBulkConfirm(false)
              setPendingValidRows([])
            }
          }}
        >
          <div
            className="laudo-confirm-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="consolidacao-bulk-confirm-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h4 id="consolidacao-bulk-confirm-title">Cadastros com erros</h4>
            <p>
              Existem cadastros com erros, deseja cadastrar apenas os cadastros
              corretos?
            </p>
            <div className="laudo-confirm-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  setShowBulkConfirm(false)
                  setPendingValidRows([])
                }}
                disabled={creating}
              >
                Não
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={() => void saveValidBulkRows(pendingValidRows)}
                disabled={creating}
              >
                {creating ? 'Salvando…' : 'Sim, cadastrar corretos'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="entrada-table-wrap consolidacao-clientes-table-wrap">
        <table className="data-table consolidacao-clientes-table">
          <thead>
            <tr>
              <th>Nome do cliente</th>
              <th>Instalação</th>
              <th>Data denúncia</th>
              <th>Data prevista para migração</th>
              <th>Nota</th>
              <th>Cadastrado em</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6}>Carregando clientes…</td>
              </tr>
            ) : clients.length === 0 ? (
              <tr>
                <td colSpan={6}>
                  Nenhum cliente cadastrado. Clique em Cadastrar cliente para
                  preencher o formulário.
                </td>
              </tr>
            ) : (
              clients.map((client) => (
                <tr key={client.id}>
                  <td>{client.nomeCliente || '—'}</td>
                  <td>{client.instalacao || '—'}</td>
                  <td>{formatDateBr(client.dataDenuncia)}</td>
                  <td>{formatDateBr(client.dataPrevistaMigracao)}</td>
                  <td>{client.nota || '—'}</td>
                  <td>{formatDateTimeBr(client.createdAt)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
