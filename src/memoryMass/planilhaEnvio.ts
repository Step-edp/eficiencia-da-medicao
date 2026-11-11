import * as XLSX from 'xlsx'
import {
  COLUNAS,
  COLUNAS_NUMERO,
  nomeArquivoEnvio,
  numeroBr,
  type ComparacaoItem,
  type LinhaMemoria,
} from './modelador'

export type BlocoEnvio = {
  medidor: string
  linhas: LinhaMemoria[]
  comparacao: ComparacaoItem[]
}

function nomeAba(medidor: string, usados: Set<string>) {
  const base = (medidor || 'Linha 01').replace(/[\\/?*[\]:]/g, '').trim().slice(0, 31) || 'Linha 01'
  let nome = base
  let indice = 2
  while (usados.has(nome)) {
    const sufixo = ` ${indice}`
    nome = `${base.slice(0, 31 - sufixo.length)}${sufixo}`
    indice += 1
  }
  usados.add(nome)
  return nome
}

function valorCelula(nome: (typeof COLUNAS)[number], bruto: string | null) {
  if (bruto == null || bruto.trim() === '') return null
  if (COLUNAS_NUMERO.has(nome)) {
    const numero = numeroBr(bruto)
    return numero == null ? bruto : numero
  }
  return bruto
}

export function baixarPlanilhaEnvio(opcoes: {
  blocos: BlocoEnvio[]
  instalacao?: string
  inicio?: string
  fim?: string
  divergente?: boolean
}) {
  const wb = XLSX.utils.book_new()
  const usados = new Set<string>()
  const comLinha = opcoes.blocos.filter((bloco) => bloco.linhas.length)
  for (const bloco of comLinha) {
    const aoa: (string | number | null)[][] = [
      [],
      [...COLUNAS],
      ...bloco.linhas.map((linha) => COLUNAS.map((nome) => valorCelula(nome, linha[nome]))),
    ]
    const aba = XLSX.utils.aoa_to_sheet(aoa)
    aba['!cols'] = COLUNAS.map((nome) => ({ wch: nome === 'Data' || nome === 'Segmentos reativos' ? 20 : 16 }))
    XLSX.utils.book_append_sheet(wb, aba, nomeAba(bloco.medidor, usados))
  }

  const comparacoes = comLinha.flatMap((bloco) =>
    bloco.comparacao.map((item) => ({ medidor: bloco.medidor, item })),
  )
  if (comparacoes.length) {
    const aoa: (string | number | null)[][] = [
      ['Diferença = conta SAP ? resumo Hemera. Impedido quando passa de 1.'],
      [],
      ['Medidor', 'Grandeza', 'Posto', 'Resumo Hemera', 'Conta SAP', 'Diferença', 'Situação'],
      ...comparacoes.map(({ medidor, item }) => [
        medidor,
        item.grupo,
        item.posto,
        item.hemera,
        item.sapMedido,
        item.diferenca,
        item.impede ? 'Impedido' : '',
      ]),
    ]
    const aba = XLSX.utils.aoa_to_sheet(aoa)
    aba['!cols'] = [16, 24, 16, 18, 16, 14, 14].map((wch) => ({ wch }))
    XLSX.utils.book_append_sheet(wb, aba, 'Comparação')
  }

  const nome = nomeArquivoEnvio({
    instalacao: opcoes.instalacao,
    medidor: comLinha[0]?.medidor,
    inicio: opcoes.inicio,
    fim: opcoes.fim,
    divergente: opcoes.divergente,
  })
  XLSX.writeFile(wb, nome)
  return nome
}
