import { useEffect, useMemo, useState } from 'react'

export const STATUS_CISC = [
  { numero: 1, codigo: 'ANA', nome: 'Em Análise' },
  { numero: 2, codigo: 'INDE', nome: 'Aberta Indevidamente' },
  { numero: 3, codigo: 'ENCE', nome: 'Encerrada' },
  { numero: 4, codigo: 'DES', nome: 'Desistência do Cliente' },
  { numero: 5, codigo: 'PROC', nome: 'Procedente' },
  { numero: 6, codigo: 'CCLP', nome: 'Contato Cliente Procedente' },
  { numero: 7, codigo: 'LIPG', nome: 'Liberado para Pagamento' },
  { numero: 8, codigo: 'PGOK', nome: 'Pagamento Efetuado' },
  { numero: 9, codigo: 'ENCP', nome: 'Encerrado Procedente' },
  { numero: 10, codigo: 'IMPR', nome: 'Improcedente' },
  { numero: 11, codigo: 'CCLI', nome: 'Contato Cliente Improcedente' },
  { numero: 12, codigo: 'ENCI', nome: 'Encerrado Improcedente' },
] as const

const NOME_STATUS = new Map<string, string>(
  STATUS_CISC.map((item) => [item.codigo, item.nome]),
)

type Nota = {
  nota: number
  status: string
  inicio: string
  descricao: string
  canal: string
  cidade: string
  tipo: string
  nivel: string
  der: number | null
}

type Pacote = {
  desde: number
  descricoes: string[]
  canais: string[]
  cidades: string[]
  tipos: string[]
  niveis: string[]
  notas: Array<
    [number, string, string, number, number, number, number, number, number | null]
  >
}

const POR_PAGINA = 30

let pacotePromessa: Promise<Nota[]> | null = null

function carregarNotas() {
  if (!pacotePromessa) {
    pacotePromessa = fetch('/cisc-notas.json')
      .then((resposta) => {
        if (!resposta.ok) throw new Error('arquivo')
        return resposta.json() as Promise<Pacote>
      })
      .then((pacote) =>
        pacote.notas.map((linha) => ({
          nota: linha[0],
          status: linha[1],
          inicio: linha[2],
          descricao: pacote.descricoes[linha[3]] ?? '',
          canal: pacote.canais[linha[4]] ?? '',
          cidade: pacote.cidades[linha[5]] ?? '',
          tipo: pacote.tipos[linha[6]] ?? '',
          nivel: pacote.niveis[linha[7]] ?? '',
          der: linha[8],
        })),
      )
  }
  return pacotePromessa
}

function dataBr(iso: string) {
  const [ano, mes, dia] = iso.split('-')
  return `${dia}/${mes}/${ano}`
}

function numeroBr(valor: number) {
  return valor.toLocaleString('pt-BR')
}

export function CiscCaptarPanel() {
  const [notas, setNotas] = useState<Nota[] | null>(null)
  const [erro, setErro] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [ano, setAno] = useState<'todos' | number>('todos')
  const [canal, setCanal] = useState('')
  const [descricao, setDescricao] = useState('')
  const [busca, setBusca] = useState('')
  const [pagina, setPagina] = useState(0)

  useEffect(() => {
    let ativo = true
    carregarNotas()
      .then((linhas) => {
        if (ativo) setNotas(linhas)
      })
      .catch(() => {
        if (ativo) setErro(true)
      })
    return () => {
      ativo = false
    }
  }, [])

  useEffect(() => {
    setPagina(0)
  }, [status, ano, canal, descricao, busca])

  const base = useMemo(() => {
    if (!notas) return []
    const termo = busca.trim()
    return notas.filter((nota) => {
      if (ano !== 'todos' && !nota.inicio.startsWith(String(ano))) return false
      if (canal && nota.canal !== canal) return false
      if (descricao && nota.descricao !== descricao) return false
      if (termo && !String(nota.nota).includes(termo)) return false
      return true
    })
  }, [notas, ano, canal, descricao, busca])

  const contagem = useMemo(() => {
    const mapa = new Map<string, number>()
    for (const nota of base) {
      mapa.set(nota.status, (mapa.get(nota.status) ?? 0) + 1)
    }
    return mapa
  }, [base])

  const foraDaLista = useMemo(() => {
    const conhecidos = new Set<string>(STATUS_CISC.map((item) => item.codigo))
    return [...contagem.entries()]
      .filter(([codigo, total]) => total > 0 && !conhecidos.has(codigo))
      .sort((a, b) => b[1] - a[1])
  }, [contagem])

  const visiveis = useMemo(
    () => (status ? base.filter((nota) => nota.status === status) : base),
    [base, status],
  )

  const anos = useMemo(() => {
    const conjunto = new Set<number>()
    for (const nota of notas ?? []) conjunto.add(Number(nota.inicio.slice(0, 4)))
    return [...conjunto].sort()
  }, [notas])

  const opcoesCanal = useMemo(() => {
    const conjunto = new Set<string>()
    for (const nota of notas ?? []) if (nota.canal) conjunto.add(nota.canal)
    return [...conjunto].sort((a, b) => a.localeCompare(b, 'pt-BR'))
  }, [notas])

  const opcoesDescricao = useMemo(() => {
    const conjunto = new Set<string>()
    for (const nota of notas ?? []) if (nota.descricao) conjunto.add(nota.descricao)
    return [...conjunto].sort((a, b) => a.localeCompare(b, 'pt-BR'))
  }, [notas])

  if (erro) {
    return <p className="cisc-footnote">Não foi possível carregar as notas.</p>
  }

  if (!notas) {
    return <p className="cisc-footnote">Carregando notas desde 2024...</p>
  }

  const inicioPagina = pagina * POR_PAGINA
  const paginaAtual = visiveis.slice(inicioPagina, inicioPagina + POR_PAGINA)
  const totalPaginas = Math.max(1, Math.ceil(visiveis.length / POR_PAGINA))

  return (
    <div className="cisc-stack">
      <section className="cisc-card">
        <p className="cisc-kicker">Captação desde 2024</p>
        <p>
          {numeroBr(notas.length)} notas com início desejado a partir de 2024. Os doze status
          abaixo são a lista configurada. Clique em um status para ver as notas.
        </p>
        <div className="cisc-filters">
          <label>
            Ano
            <select
              value={ano}
              onChange={(evento) =>
                setAno(evento.target.value === 'todos' ? 'todos' : Number(evento.target.value))
              }
            >
              <option value="todos">Todos</option>
              {anos.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label>
            Canal
            <select value={canal} onChange={(evento) => setCanal(evento.target.value)}>
              <option value="">Todos</option>
              {opcoesCanal.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label>
            Assunto
            <select value={descricao} onChange={(evento) => setDescricao(evento.target.value)}>
              <option value="">Todos</option>
              {opcoesDescricao.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label>
            Nota
            <input
              value={busca}
              inputMode="numeric"
              placeholder="Número da nota"
              onChange={(evento) => setBusca(evento.target.value)}
            />
          </label>
        </div>
      </section>

      <div className="cisc-status-grid" aria-label="Status configurados">
        {STATUS_CISC.map((item) => {
          const total = contagem.get(item.codigo) ?? 0
          const ativo = status === item.codigo
          return (
            <button
              key={item.codigo}
              type="button"
              className={`cisc-status${ativo ? ' is-active' : ''}${total === 0 ? ' is-empty' : ''}`}
              onClick={() => setStatus(ativo ? null : item.codigo)}
            >
              <span className="cisc-status-num">{item.numero}</span>
              <strong>{item.codigo}</strong>
              <em>{item.nome}</em>
              <b>{numeroBr(total)}</b>
            </button>
          )
        })}
      </div>

      {foraDaLista.length > 0 ? (
        <section className="cisc-card">
          <p className="cisc-kicker">Códigos da planilha fora da lista</p>
          <div className="cisc-status-grid">
            {foraDaLista.map(([codigo, total]) => {
              const ativo = status === codigo
              return (
                <button
                  key={codigo}
                  type="button"
                  className={`cisc-status${ativo ? ' is-active' : ''}`}
                  onClick={() => setStatus(ativo ? null : codigo)}
                >
                  <strong>{codigo}</strong>
                  <em>Sem nome na lista configurada</em>
                  <b>{numeroBr(total)}</b>
                </button>
              )
            })}
          </div>
        </section>
      ) : null}

      <section className="cisc-card">
        <div className="cisc-table-head">
          <p>
            {numeroBr(visiveis.length)} {visiveis.length === 1 ? 'nota' : 'notas'}
            {status
              ? ` em ${status}${NOME_STATUS.get(status) ? ` · ${NOME_STATUS.get(status)}` : ''}`
              : ''}
          </p>
          <div className="cisc-pager">
            <button
              type="button"
              disabled={pagina === 0}
              onClick={() => setPagina((atual) => atual - 1)}
            >
              Anterior
            </button>
            <span>
              {pagina + 1} / {totalPaginas}
            </span>
            <button
              type="button"
              disabled={pagina + 1 >= totalPaginas}
              onClick={() => setPagina((atual) => atual + 1)}
            >
              Próxima
            </button>
          </div>
        </div>
        <div className="cisc-table-wrap">
          <table className="cisc-table">
            <thead>
              <tr>
                <th>Nota</th>
                <th>Status</th>
                <th>Início</th>
                <th>Assunto</th>
                <th>Canal</th>
                <th>Cidade</th>
                <th>Tipo</th>
                <th>Nível</th>
                <th>DER</th>
              </tr>
            </thead>
            <tbody>
              {paginaAtual.map((nota) => (
                <tr key={`${nota.nota}-${nota.inicio}-${nota.status}`}>
                  <td>{nota.nota}</td>
                  <td>
                    <strong>{nota.status}</strong>
                    {NOME_STATUS.get(nota.status) ? <small>{NOME_STATUS.get(nota.status)}</small> : null}
                  </td>
                  <td>{dataBr(nota.inicio)}</td>
                  <td>{nota.descricao}</td>
                  <td>{nota.canal}</td>
                  <td>{nota.cidade}</td>
                  <td>{nota.tipo}</td>
                  <td>{nota.nivel}</td>
                  <td>{nota.der ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
