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

const STATUS_COMPLEMENTO = [
  { codigo: 'VIMP', nome: 'Verificado Improcedente' },
  { codigo: 'VPRO', nome: 'Verificado Procedente' },
  { codigo: 'DILA', nome: 'Dilatação' },
  { codigo: 'ENPD', nome: 'Encer Proc Dilatação' },
  { codigo: 'ENID', nome: 'Encer Impr Dilatação' },
  { codigo: 'EARD', nome: 'Encer Aguard Cliente Dilatação' },
  { codigo: 'ENDD', nome: 'Encerr Orgao Ext Dilatação' },
] as const

const NOME_STATUS = new Map<string, string>([
  ...STATUS_CISC.map((item) => [item.codigo, item.nome] as const),
  ...STATUS_COMPLEMENTO.map((item) => [item.codigo, item.nome] as const),
])

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

function mesesEntre(inicio: string, fim: string) {
  const itens: string[] = []
  let [ano, mes] = inicio.split('-').map(Number)
  const [anoFim, mesFim] = fim.split('-').map(Number)
  while (ano < anoFim || (ano === anoFim && mes <= mesFim)) {
    itens.push(`${ano}-${String(mes).padStart(2, '0')}`)
    mes += 1
    if (mes > 12) {
      mes = 1
      ano += 1
    }
  }
  return itens
}

function GraficoBarras({
  titulo,
  itens,
  ativo,
  onEscolher,
}: {
  titulo: string
  itens: { id: string; rotulo: string; total: number }[]
  ativo: string | null
  onEscolher: (id: string) => void
}) {
  const maximo = Math.max(1, ...itens.map((item) => item.total))
  return (
    <section className="cisc-card cisc-chart">
      <p className="cisc-kicker">{titulo}</p>
      <div className="cisc-bars">
        {itens.map((item) => {
          const selecionado = ativo === item.id
          const largura = item.total === 0 ? '0%' : `${Math.max(2, (item.total / maximo) * 100)}%`
          return (
            <button
              key={item.id}
              type="button"
              className={selecionado ? 'is-active' : undefined}
              onClick={() => onEscolher(item.id)}
            >
              <span className="cisc-bar-name">{item.rotulo}</span>
              <span className="cisc-bar-track">
                <span className="cisc-bar-fill" style={{ width: largura }} />
              </span>
              <span className="cisc-bar-value">{numeroBr(item.total)}</span>
            </button>
          )
        })}
      </div>
    </section>
  )
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

  const porAno = useMemo(() => {
    if (!notas) return []
    const termo = busca.trim()
    const mapa = new Map<string, number>()
    for (const nota of notas) {
      if (canal && nota.canal !== canal) continue
      if (descricao && nota.descricao !== descricao) continue
      if (termo && !String(nota.nota).includes(termo)) continue
      if (status && nota.status !== status) continue
      const anoNota = nota.inicio.slice(0, 4)
      mapa.set(anoNota, (mapa.get(anoNota) ?? 0) + 1)
    }
    return [...mapa.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([id, total]) => ({ id, rotulo: id, total }))
  }, [notas, canal, descricao, busca, status])

  const porCanal = useMemo(() => {
    if (!notas) return []
    const termo = busca.trim()
    const mapa = new Map<string, number>()
    for (const nota of notas) {
      if (ano !== 'todos' && !nota.inicio.startsWith(String(ano))) continue
      if (descricao && nota.descricao !== descricao) continue
      if (termo && !String(nota.nota).includes(termo)) continue
      if (status && nota.status !== status) continue
      const nome = nota.canal || 'Sem canal'
      mapa.set(nome, (mapa.get(nome) ?? 0) + 1)
    }
    return [...mapa.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([id, total]) => ({ id, rotulo: id, total }))
  }, [notas, ano, descricao, busca, status])

  const porMes = useMemo(() => {
    if (visiveis.length === 0) return []
    const mapa = new Map<string, number>()
    for (const nota of visiveis) {
      const chave = nota.inicio.slice(0, 7)
      mapa.set(chave, (mapa.get(chave) ?? 0) + 1)
    }
    const chaves = [...mapa.keys()].sort()
    return mesesEntre(chaves[0], chaves[chaves.length - 1]).map((chave) => ({
      id: chave,
      rotulo: `${chave.slice(5)}/${chave.slice(2, 4)}`,
      total: mapa.get(chave) ?? 0,
    }))
  }, [visiveis])

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
          {numeroBr(notas.length)} notas com início desejado a partir de 2024. Clique em uma barra
          para filtrar a lista.
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

      <div className="cisc-kpis">
        <article className="cisc-card">
          <p className="cisc-kicker">No filtro</p>
          <strong>{numeroBr(visiveis.length)}</strong>
        </article>
        <article className="cisc-card">
          <p className="cisc-kicker">Status</p>
          <strong>{status ? `${status}${NOME_STATUS.get(status) ? ` · ${NOME_STATUS.get(status)}` : ''}` : 'Todos'}</strong>
        </article>
        <article className="cisc-card">
          <p className="cisc-kicker">Ano</p>
          <strong>{ano === 'todos' ? '2024 a 2026' : ano}</strong>
        </article>
      </div>

      <GraficoBarras
        titulo="Status configurados"
        ativo={status}
        onEscolher={(codigo) => setStatus(status === codigo ? null : codigo)}
        itens={STATUS_CISC.map((item) => ({
          id: item.codigo,
          rotulo: `${item.numero}. ${item.codigo} ${item.nome}`,
          total: contagem.get(item.codigo) ?? 0,
        }))}
      />

      <div className="cisc-dash-grid">
        <GraficoBarras
          titulo="Por ano"
          ativo={ano === 'todos' ? null : String(ano)}
          onEscolher={(valor) => setAno(ano === Number(valor) ? 'todos' : Number(valor))}
          itens={porAno}
        />
        <GraficoBarras
          titulo="Por canal"
          ativo={canal || null}
          onEscolher={(valor) => setCanal(canal === valor ? '' : valor)}
          itens={porCanal}
        />
      </div>

      <section className="cisc-card cisc-chart">
        <p className="cisc-kicker">Notas por mês</p>
        <div className="cisc-vbars" aria-label="Notas por mês">
          {porMes.map((item) => {
            const maximo = Math.max(1, ...porMes.map((mes) => mes.total))
            const altura = item.total === 0 ? '0%' : `${Math.max(4, (item.total / maximo) * 100)}%`
            return (
              <div key={item.id} className="cisc-vbar" title={`${item.rotulo}: ${numeroBr(item.total)}`}>
                <span>{item.total > 0 ? numeroBr(item.total) : ''}</span>
                <i style={{ height: altura }} />
                <em>{item.rotulo}</em>
              </div>
            )
          })}
        </div>
      </section>

      {foraDaLista.length > 0 ? (
        <GraficoBarras
          titulo="Outros status"
          ativo={status}
          onEscolher={(codigo) => setStatus(status === codigo ? null : codigo)}
          itens={[
            ...STATUS_COMPLEMENTO.map((item) => ({
              id: item.codigo,
              rotulo: `${item.codigo} ${item.nome}`,
              total: contagem.get(item.codigo) ?? 0,
            })),
            ...foraDaLista
              .filter(([codigo]) => !NOME_STATUS.has(codigo))
              .map(([codigo, total]) => ({
                id: codigo,
                rotulo: codigo,
                total,
              })),
          ]}
        />
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
