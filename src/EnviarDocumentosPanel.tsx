import { FormEvent, useCallback, useEffect, useState } from 'react'
import {
  api,
  ApiError,
  type DemmUploadConflictRecord,
  type MeterInspectionPendenciaRecord,
} from './api'
import { useCsdsOptions } from './useCsdsOptions'
import { inspectionPdfFilesFromList, readFileAsBase64 } from './fileUtils'
import { DemmUploadConflicts } from './EntradaPanel'
import { LoginFeedback } from './LoginFeedback'

function formatDateTime(isoDate: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(isoDate))
}

type Feedback = { type: 'success' | 'error'; message: string }

type EnviarDocumentosPanelProps = {
  /** Ponto Focal: restringe DEMM e pendências aos CSDs em que este usuário é responsável. */
  scopeUserId?: string
}

export function EnviarDocumentosPanel({ scopeUserId }: EnviarDocumentosPanelProps) {
  const { options: csdOptions, loading: csdOptionsLoading, error: csdOptionsError } =
    useCsdsOptions(scopeUserId ? { responsibleUserId: scopeUserId } : undefined)
  const [demmCsdId, setDemmCsdId] = useState('')
  const [demmFile, setDemmFile] = useState<File | null>(null)
  const [submittingDemm, setSubmittingDemm] = useState(false)
  const [demmFeedback, setDemmFeedback] = useState<Feedback | null>(null)
  const [demmConflicts, setDemmConflicts] = useState<DemmUploadConflictRecord[] | undefined>(
    undefined,
  )

  const [inspectionPendencias, setInspectionPendencias] = useState<
    MeterInspectionPendenciaRecord[]
  >([])
  const [inspectionLoading, setInspectionLoading] = useState(true)
  const [uploadingInspectionId, setUploadingInspectionId] = useState<string | null>(null)
  const [inspectionFeedback, setInspectionFeedback] = useState<Feedback | null>(null)

  const loadInspectionPendencias = useCallback(async () => {
    setInspectionLoading(true)
    try {
      const response = await api.listInspectionPendencias(scopeUserId)
      setInspectionPendencias(response.pendencias)
    } catch (error) {
      setInspectionFeedback({
        type: 'error',
        message:
          error instanceof ApiError
            ? error.message
            : 'Não foi possível carregar as pendências de documento de inspeção.',
      })
    } finally {
      setInspectionLoading(false)
    }
  }, [scopeUserId])

  useEffect(() => {
    void loadInspectionPendencias()
  }, [loadInspectionPendencias])

  useEffect(() => {
    if (!scopeUserId || csdOptions.length !== 1) return
    if (demmCsdId !== csdOptions[0].id) {
      setDemmCsdId(csdOptions[0].id)
    }
  }, [scopeUserId, demmCsdId, csdOptions])

  const handleDemmSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!demmCsdId) {
      setDemmFeedback({
        type: 'error',
        message: scopeUserId
          ? 'Não foi possível identificar o CSD de responsabilidade.'
          : 'Selecione o CSD dessa DEMM.',
      })
      return
    }
    if (!demmFile) {
      setDemmFeedback({ type: 'error', message: 'Envie o arquivo PDF da DEMM.' })
      return
    }

    setSubmittingDemm(true)
    setDemmFeedback(null)
    setDemmConflicts(undefined)

    try {
      const fileBase64 = await readFileAsBase64(demmFile)
      const response = await api.createDemmDocument({
        fileName: demmFile.name,
        fileBase64,
        csdId: demmCsdId,
      })
      setDemmFeedback({
        type: 'success',
        message: `DEMM registrada. ${response.analysis.total} medidor(es) identificado(s).`,
      })
      setDemmFile(null)
      if (!scopeUserId || csdOptions.length !== 1) {
        setDemmCsdId('')
      }
      void loadInspectionPendencias()
    } catch (error) {
      if (error instanceof ApiError) {
        setDemmFeedback({
          type: 'error',
          message: error.conflicts?.length
            ? `A DEMM não pode ser cadastrada. ${error.conflicts.length} medidor(es) com pendência.`
            : error.message,
        })
        setDemmConflicts(error.conflicts)
      } else {
        setDemmFeedback({ type: 'error', message: 'Não foi possível registrar a DEMM.' })
      }
    } finally {
      setSubmittingDemm(false)
    }
  }

  const handleUploadInspectionDocument = async (
    pendencia: MeterInspectionPendenciaRecord,
    files: File[],
  ) => {
    const pdfs = files.filter(
      (file) =>
        file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf'),
    )
    if (!pdfs.length) {
      setInspectionFeedback({
        type: 'error',
        message: 'Envie um ou mais arquivos PDF (TOI e/ou CSM).',
      })
      return
    }

    setUploadingInspectionId(pendencia.id)
    setInspectionFeedback(null)

    try {
      let document: Awaited<ReturnType<typeof api.uploadInspectionDocument>>['document'] | null =
        null
      for (const file of pdfs) {
        const fileBase64 = await readFileAsBase64(file)
        const response = await api.uploadInspectionDocument(pendencia.id, {
          fileName: file.name,
          fileBase64,
        })
        document = response.document
      }
      if (!document) return

      if (!document.complete) {
        const missing = !document.hasToi ? 'TOI' : 'CSM'
        setInspectionFeedback({
          type: 'success',
          message: `Documento anexado ao medidor ${pendencia.meter}. Ainda falta anexar o ${missing}.`,
        })
      } else if (document.blocked) {
        setInspectionFeedback({
          type: 'error',
          message: `Documento anexado, mas o medidor ${pendencia.meter} ficou bloqueado: ${document.blockReason}`,
        })
      } else {
        setInspectionFeedback({
          type: 'success',
          message: `Documento de inspeção anexado ao medidor ${pendencia.meter}.`,
        })
      }

      void loadInspectionPendencias()
    } catch (error) {
      setInspectionFeedback({
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

  return (
    <div className="entrada-panel">
      <section className="entrada-section">
        <h3 className="entrada-section-title">Nova DEMM</h3>

        {demmFeedback ? (
          <LoginFeedback
            fixed
            type={demmFeedback.type}
            message={demmFeedback.message}
            onClose={() => setDemmFeedback(null)}
          />
        ) : null}
        {demmConflicts?.length ? <DemmUploadConflicts conflicts={demmConflicts} /> : null}

        <form className="form-grid demm-form-grid" onSubmit={(event) => void handleDemmSubmit(event)}>
          {scopeUserId ? (
            <p className="demm-csd-notice full-width" role="status">
              {csdOptionsLoading
                ? 'Identificando o CSD de responsabilidade...'
                : csdOptions.length === 0
                  ? 'Você não está definido como responsável de nenhum CSD.'
                  : csdOptions.length === 1
                    ? `A DEMM que você está importando é do ${csdOptions[0].label}.`
                    : 'A DEMM que você está importando é de um dos CSDs em que você é responsável.'}
            </p>
          ) : (
            <label className="full-width">
              CSD
              <select
                value={demmCsdId}
                onChange={(event) => setDemmCsdId(event.target.value)}
                disabled={submittingDemm}
                required
              >
                <option value="">{csdOptionsLoading ? 'Carregando CSDs...' : 'Selecione o CSD'}</option>
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
          )}

          {scopeUserId && csdOptions.length > 1 ? (
            <label className="full-width">
              CSD desta DEMM
              <select
                value={demmCsdId}
                onChange={(event) => setDemmCsdId(event.target.value)}
                disabled={submittingDemm}
                required
              >
                <option value="">Selecione o CSD</option>
                {csdOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {scopeUserId && csdOptionsError ? (
            <span className="field-error full-width" role="alert">
              {csdOptionsError}
            </span>
          ) : null}

          <label className="full-width photo-upload-field">
            PDF da DEMM
            <div className="photo-upload-area demm-upload-area">
              <input
                type="file"
                accept="application/pdf,.pdf"
                onChange={(event) => {
                  setDemmFile(event.target.files?.[0] ?? null)
                  setDemmFeedback(null)
                }}
                required
              />
              <span className="photo-upload-hint">
                {demmFile ? demmFile.name : 'Clique para selecionar o PDF da DEMM'}
              </span>
            </div>
          </label>

          <div className="ensaios-block-modal-actions full-width">
            <button
              type="submit"
              className="primary-button"
              disabled={
                submittingDemm ||
                Boolean(scopeUserId && !csdOptionsLoading && csdOptions.length === 0)
              }
            >
              {submittingDemm ? 'Lendo PDF...' : 'Enviar DEMM'}
            </button>
          </div>
        </form>
      </section>

      <section className="entrada-section">
        <div className="entrada-section-heading">
          <h3 className="entrada-section-title">Documentos de inspeção pendentes</h3>
          {inspectionPendencias.length > 0 ? (
            <span className="entrada-section-total">
              {inspectionPendencias.length} pendência(s)
            </span>
          ) : null}
        </div>

        {inspectionFeedback ? (
          <LoginFeedback
            fixed
            type={inspectionFeedback.type}
            message={inspectionFeedback.message}
            onClose={() => setInspectionFeedback(null)}
          />
        ) : null}

        {inspectionLoading && inspectionPendencias.length === 0 ? (
          <p className="entrada-panel-empty">Carregando pendências...</p>
        ) : inspectionPendencias.length === 0 ? (
          <p className="entrada-panel-empty">
            {scopeUserId && !csdOptionsLoading && csdOptions.length === 0
              ? 'Você não está definido como responsável de nenhum CSD.'
              : scopeUserId
                ? 'Não há documentos de inspeção pendentes nos CSDs em que você é responsável.'
                : 'Todos os medidores agendados têm documento de inspeção anexado.'}
          </p>
        ) : (
          <div className="entrada-table-wrap">
            <table className="data-table entrada-table">
              <thead>
                <tr>
                  <th>Medidor</th>
                  <th>Instalação</th>
                  <th>CSD</th>
                  <th>Data agendada</th>
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
                    <td>{formatDateTime(pendencia.scheduledAt)}</td>
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
                        id={`enviar-doc-inspection-${pendencia.id}`}
                        type="file"
                        accept="application/pdf,.pdf"
                        multiple
                        className="file-picker-input"
                        disabled={uploadingInspectionId === pendencia.id}
                        onChange={(event) => {
                          const files = inspectionPdfFilesFromList(event.target.files)
                          event.target.value = ''
                          if (files.length) void handleUploadInspectionDocument(pendencia, files)
                        }}
                      />
                      <label
                        htmlFor={`enviar-doc-inspection-${pendencia.id}`}
                        className="file-picker-button"
                      >
                        {uploadingInspectionId === pendencia.id ? 'Enviando...' : 'Importar documento'}
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
  )
}
