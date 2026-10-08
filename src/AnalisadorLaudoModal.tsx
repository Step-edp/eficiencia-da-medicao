import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { api, ApiError, type AnalisadorTensaoRecord, type EnsaioMedicaoRecord } from './api'
import {
  PADRAO_CALIBRACAO,
  buildCertificado,
  formatClassePadrao,
  formatErroPercent,
  formatIsoDate,
  formatVolt,
  type FaseCalibracao,
} from '../server/analisador-calibracao'

type AnalisadorLaudoModalProps = {
  analisador: AnalisadorTensaoRecord | null
  ensaioId?: string | null
  dataCalibracao?: string | null
  onClose: () => void
}

const FASES: Array<{ key: FaseCalibracao; label: string }> = [
  { key: 'a', label: 'Fase A' },
  { key: 'b', label: 'Fase B' },
  { key: 'c', label: 'Fase C' },
]

function formatLaudoDate(value: string | null | undefined) {
  if (!value) return '—'
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return formatIsoDate(value)
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return formatIsoDate(value)
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo' }).format(date)
}

function formatFase(value: string) {
  const number = Number(value)
  if (!Number.isFinite(number)) return value
  return number.toFixed(2).replace('.', ',')
}

export function AnalisadorLaudoModal({
  analisador,
  ensaioId = null,
  dataCalibracao = null,
  onClose,
}: AnalisadorLaudoModalProps) {
  const [loading, setLoading] = useState(true)
  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [medicoes, setMedicoes] = useState<EnsaioMedicaoRecord[]>([])

  useEffect(() => {
    if (!analisador) return
    setLoading(true)
    setError(null)
    setMedicoes([])

    const request = ensaioId
      ? api.getEnsaioSessaoMedicoes(ensaioId).then(({ medicoes: rows }) =>
          rows.filter((row) => row.numeroSerie === analisador.numeroSerie),
        )
      : api.getAnalisadorEnsaioMedicoes(analisador.id).then(({ medicoes: rows }) => rows)

    request
      .then((rows) => setMedicoes(rows))
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : 'Não foi possível carregar o laudo.')
      })
      .finally(() => setLoading(false))
  }, [analisador, ensaioId])

  useEffect(() => {
    if (!analisador) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [analisador, onClose])

  if (!analisador) return null

  const certificado = medicoes.length ? buildCertificado(medicoes) : null

  const handleDownload = async () => {
    setDownloading(true)
    setError(null)
    try {
      await api.downloadAnalisadorLaudo(analisador.id, ensaioId)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível gerar o laudo.')
    } finally {
      setDownloading(false)
    }
  }

  return createPortal(
    <div className="ensaios-block-modal-overlay" role="presentation" onClick={onClose}>
      <div
        className="ensaios-block-modal analisador-laudo-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="analisador-laudo-modal-title"
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

        <h3 id="analisador-laudo-modal-title">Certificado de calibração</h3>
        <p className="ensaios-block-modal-date">
          {analisador.identificacaoLaudo || 'Sem identificação de laudo'} · {analisador.numeroSerie}
        </p>

        {loading ? (
          <p className="entrada-panel-empty">Carregando medições...</p>
        ) : error && !certificado ? (
          <div className="login-feedback error" role="alert">
            {error}
          </div>
        ) : medicoes.length && !certificado ? (
          <p className="entrada-panel-empty">
            O ensaio não tem as cinco leituras de 127 V e 220 V necessárias para o laudo.
          </p>
        ) : certificado ? (
          <div className="laudo-sheet">
            <div className="laudo-brand">
              <img src="/logo/edp-logo.png" alt="EDP" />
              <div>
                <strong>Certificado de calibração</strong>
                <span>{analisador.identificacaoLaudo || analisador.numeroSerie}</span>
              </div>
            </div>
            <div className="laudo-blocks">
            <section className="laudo-block">
            <h4>Padrão utilizado</h4>
            <dl className="laudo-meta">
              <div>
                <dt>Instrumento</dt>
                <dd>{PADRAO_CALIBRACAO.instrumento}</dd>
              </div>
              <div>
                <dt>Modelo</dt>
                <dd>{PADRAO_CALIBRACAO.modelo}</dd>
              </div>
              <div>
                <dt>Nº série</dt>
                <dd>{PADRAO_CALIBRACAO.serie}</dd>
              </div>
              <div>
                <dt>Fabricante</dt>
                <dd>{PADRAO_CALIBRACAO.fabricante}</dd>
              </div>
              <div>
                <dt>Certificado</dt>
                <dd>{PADRAO_CALIBRACAO.certificado}</dd>
              </div>
              <div>
                <dt>Classe</dt>
                <dd>{formatClassePadrao(PADRAO_CALIBRACAO.classe)}</dd>
              </div>
              <div>
                <dt>Calibrado em</dt>
                <dd>{formatIsoDate(PADRAO_CALIBRACAO.calibradoEm)}</dd>
              </div>
              <div>
                <dt>Próxima calibração</dt>
                <dd>{formatIsoDate(PADRAO_CALIBRACAO.proximaCalibracao)}</dd>
              </div>
            </dl>
            </section>

            <section className="laudo-block">
            <h4>Instrumento calibrado</h4>
            <dl className="laudo-meta">
              <div>
                <dt>Instrumento</dt>
                <dd>{analisador.instrumento}</dd>
              </div>
              <div>
                <dt>Fabricante</dt>
                <dd>{analisador.fabricante}</dd>
              </div>
              <div>
                <dt>Modelo</dt>
                <dd>{analisador.modelo}</dd>
              </div>
              <div>
                <dt>Patrimônio</dt>
                <dd>{analisador.equipmentNumber}</dd>
              </div>
              <div>
                <dt>Nº série</dt>
                <dd>{analisador.numeroSerie}</dd>
              </div>
              <div>
                <dt>Classe</dt>
                <dd>{analisador.classe}</dd>
              </div>
              <div>
                <dt>VN</dt>
                <dd>{analisador.vn}</dd>
              </div>
              <div>
                <dt>Vmáx</dt>
                <dd>{analisador.vmax}</dd>
              </div>
            </dl>
            <p className="laudo-classe">
              Classe de exatidão: {analisador.classe} - {analisador.vn} a {analisador.vmax}
            </p>
            </section>
            </div>

            <div className="entrada-table-wrap">
              <table className="laudo-result">
                <thead>
                  <tr>
                    <th rowSpan={2}>Tensão</th>
                    {FASES.map((fase) => (
                      <th key={fase.key} colSpan={4}>
                        {fase.label}
                      </th>
                    ))}
                    <th rowSpan={2}>Resultado</th>
                  </tr>
                  <tr>
                    {FASES.map((fase) =>
                      ['UMP', 'UST', 'Erro(%)', 'U(%)'].map((label) => (
                        <th key={`${fase.key}-${label}`}>{label}</th>
                      )),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {certificado.tensoes.map((tensao) => (
                    <tr key={tensao.voltage}>
                      <td>{tensao.voltage}</td>
                      {FASES.map((fase) => {
                        const resultado = tensao.fases[fase.key]
                        return [
                          <td key={`${tensao.voltage}-${fase.key}-ump`}>{formatVolt(resultado.ump)}</td>,
                          <td key={`${tensao.voltage}-${fase.key}-ust`}>{formatVolt(resultado.ust)}</td>,
                          <td key={`${tensao.voltage}-${fase.key}-erro`}>
                            {formatErroPercent(resultado.erro)}
                          </td>,
                          <td key={`${tensao.voltage}-${fase.key}-u`}>
                            {formatErroPercent(resultado.incerteza)}
                          </td>,
                        ]
                      })}
                      <td className={tensao.aprovado ? 'laudo-ok' : 'laudo-bad'}>
                        {tensao.aprovado ? 'APROVADO' : 'REPROVADO'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="laudo-geral">
              Resultado:{' '}
              <strong className={certificado.resultado === 'Aprovado' ? 'laudo-ok' : 'laudo-bad'}>
                {certificado.resultado === 'Aprovado' ? 'APROVADO' : 'REPROVADO'}
              </strong>
            </p>
            <ul className="laudo-notes">
              <li>UMP: unidade de medida do padrão. UST: unidade sendo testada.</li>
              <li>Erro: maior erro absoluto entre as cinco leituras, (UST − UMP) / UMP.</li>
              <li>
                U: incerteza expandida, com fator de abrangência de uma distribuição t e
                probabilidade de 95%.
              </li>
              <li>
                Aprovado quando o erro somado e subtraído da incerteza permanece dentro de ±1% em
                todas as fases.
              </li>
            </ul>
            <dl className="laudo-signs">
              <div>
                <dt>Realizado por</dt>
                <dd>{PADRAO_CALIBRACAO.realizadoPor}</dd>
              </div>
              <div>
                <dt>Aprovado por</dt>
                <dd>{PADRAO_CALIBRACAO.aprovadoPor}</dd>
              </div>
              <div>
                <dt>Data da calibração</dt>
                <dd>{formatLaudoDate(dataCalibracao || analisador.dataUltimaCalibracao)}</dd>
              </div>
            </dl>
          </div>
        ) : (
          <p className="entrada-panel-empty">Nenhum ensaio registrado para esse analisador ainda.</p>
        )}

        {error && certificado ? (
          <div className="login-feedback error" role="alert">
            {error}
          </div>
        ) : null}

        {medicoes.length ? (
          <details className="laudo-leituras">
            <summary>Leituras do ensaio</summary>
            <div className="entrada-table-wrap">
              <table className="data-table ensaio-medicao-table">
                <thead>
                  <tr>
                    <th>Tensão</th>
                    <th>Teste</th>
                    <th>Padrão A</th>
                    <th>Padrão B</th>
                    <th>Padrão C</th>
                    <th>Equip. A</th>
                    <th>Equip. B</th>
                    <th>Equip. C</th>
                  </tr>
                </thead>
                <tbody>
                  {medicoes.map((row) => (
                    <tr key={`${row.voltage}-${row.testeNumero}`}>
                      <td>{row.voltage}</td>
                      <td>{row.testeNumero}</td>
                      <td>{formatFase(row.padraoFaseA)}</td>
                      <td>{formatFase(row.padraoFaseB)}</td>
                      <td>{formatFase(row.padraoFaseC)}</td>
                      <td>{formatFase(row.equipamentoFaseA)}</td>
                      <td>{formatFase(row.equipamentoFaseB)}</td>
                      <td>{formatFase(row.equipamentoFaseC)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        ) : null}

        <div className="ensaios-block-modal-actions">
          {certificado ? (
            <button
              type="button"
              className="primary-button"
              onClick={() => void handleDownload()}
              disabled={downloading}
            >
              {downloading ? 'Gerando laudo...' : 'Baixar laudo'}
            </button>
          ) : null}
          <button type="button" className="primary-button" onClick={onClose}>
            Fechar
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
