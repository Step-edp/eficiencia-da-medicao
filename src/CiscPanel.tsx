import { useRef, useState, type RefObject } from 'react'
import { CiscCaptarPanel } from './CiscCaptarPanel'

type CiscView =
  | 'captar'
  | 'norte'
  | 'equipes'
  | 'ciclo'
  | 'relato'
  | 'frentes'
  | 'prompt'
  | 'indicadores'

const VIEWS: { id: CiscView; label: string }[] = [
  { id: 'captar', label: 'Captar' },
  { id: 'norte', label: 'Norte' },
  { id: 'equipes', label: 'Equipes' },
  { id: 'ciclo', label: 'Ciclo' },
  { id: 'relato', label: 'O relato' },
  { id: 'frentes', label: 'Compartilhar' },
  { id: 'prompt', label: 'Prompt' },
  { id: 'indicadores', label: 'Indicadores' },
]

const EQUIPES = [
  {
    relato: 'Relato 1',
    captacao: 'Benjamim Abreu',
    validacao: 'Igor Odilon Barbosa',
    construcao: 'Lucas Moreira',
    focoValidacao: 'Verificar fatos, a sequência e a consistência das informações.',
    focoConstrucao: 'Estruturar a narrativa e organizar o conteúdo.',
  },
  {
    relato: 'Relato 2',
    captacao: 'Gabriel Lourenço',
    validacao: 'Juliana Alves Miranda',
    construcao: 'Marcia dos Anjos',
    focoValidacao: 'Organizar evidências e identificar o impacto para o cliente.',
    focoConstrucao: 'Aplicar o prompt padrão no Copilot e montar os dois slides.',
  },
  {
    relato: 'Relato 3',
    captacao: 'Gustavo Seixas Mendonça',
    validacao: 'Lidiane Alves dos Santos',
    construcao: 'Sara da Silva Batista',
    focoValidacao: 'Identificar aprendizados e oportunidades.',
    focoConstrucao: 'Revisar conteúdo, ortografia, clareza e padronização visual.',
  },
]

const PROMPT_PADRAO = `Com base exclusivamente no relato de reclamação apresentado ao final deste prompt, transforme o caso em uma apresentação intitulada “Jornada de Resolução do Cliente”, com linguagem clara, executiva, humana e objetiva.

REGRAS OBRIGATÓRIAS

• Não invente, presuma ou complete informações. Utilize somente os fatos registrados no relato.
• Quando uma informação necessária não estiver disponível, escreva “Não informado”.
• Diferencie visualmente fatos descritos no relato de aprendizados, oportunidades ou recomendações.
• Não afirme que o cliente ficou satisfeito, teve sua confiança recuperada ou considerou o caso resolvido se isso não estiver explicitamente registrado.
• Não apresente recomendações como se fossem ações já realizadas.
• Corrija erros de ortografia, pontuação e concordância, preservando o sentido original.
• Use textos curtos, objetivos e adequados a uma apresentação executiva.

SLIDE 1 | A JORNADA DE RESOLUÇÃO

• 1. A situação inicial: qual era o problema e qual impacto para o cliente está descrito no relato.
• 2. O que aconteceu: principais fatos e acontecimentos que levaram à reclamação, em ordem lógica ou cronológica.
• 3. A atuação da empresa: ações efetivamente realizadas para investigar e corrigir o problema.
• 4. A resolução: como o caso foi solucionado e quais correções foram realizadas, conforme o relato.
• 5. Além do esperado: destaque alguma atuação que tenha ido além da correção básica somente se houver evidência explícita. Caso contrário, não crie esse destaque.

SLIDE 2 | DA FRUSTRAÇÃO À CONFIANÇA

• 1. Os resultados alcançados: o que efetivamente foi corrigido ou resolvido.
• 2. Aprendizados fundamentais: melhorias de processo que podem evitar a recorrência. Identifique-as como aprendizados ou recomendações, não como ações já implementadas.
• 3. O impacto além do imediato: possíveis contribuições da resolução para a experiência do cliente, apresentadas como potencial quando não houver resultado comprovado.
• 4. Confiança gera confiança: explique como transparência, agilidade e responsabilidade podem contribuir para a relação com o cliente, sem afirmar que a confiança foi recuperada se isso não estiver registrado.
• 5. A lição que fica: finalize com uma frase curta, forte e fiel ao principal aprendizado do caso.

TÍTULO EXECUTIVO

Crie um título executivo para o caso, no estilo “Da Frustração à Confiança: A Jornada de um Cliente Recuperado”. Adapte a frase aos fatos: não use “cliente recuperado” ou “confiança restaurada” se isso não estiver comprovado.

ORIENTAÇÕES VISUAIS

• Entregue uma apresentação PowerPoint editável com exatamente dois slides.
• Use visual corporativo, limpo e consistente, com hierarquia clara, pouco texto e elementos visuais que facilitem a leitura da jornada.
• Destaque a sequência dos acontecimentos e diferencie fatos comprovados de aprendizados/recomendações.
• Não utilize imagens decorativas que sugiram acontecimentos não descritos no relato.

RELATO DA RECLAMAÇÃO

[COLE AQUI O RELATO COMPLETO]`

export function CiscPanel() {
  const [view, setView] = useState<CiscView>('captar')
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const promptRef = useRef<HTMLTextAreaElement>(null)

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(PROMPT_PADRAO)
      setCopyState('copied')
      return
    } catch {
      const area = promptRef.current
      if (!area) {
        setCopyState('failed')
        return
      }
      area.focus()
      area.select()
      try {
        const ok = document.execCommand('copy')
        setCopyState(ok ? 'copied' : 'failed')
      } catch {
        setCopyState('failed')
      }
    }
  }

  return (
    <div className="cisc-panel">
      <p className="cisc-lead">
        Transformar a voz do cliente em histórias que geram aprendizado, reflexão e mudança de
        perspectiva.
      </p>
      <nav className="cisc-nav" aria-label="Relatos de Experiência">
        {VIEWS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={view === item.id ? 'is-active' : undefined}
            onClick={() => setView(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {view === 'captar' ? <CiscCaptarPanel /> : null}
      {view === 'norte' ? <Norte /> : null}
      {view === 'equipes' ? <Equipes /> : null}
      {view === 'ciclo' ? <Ciclo /> : null}
      {view === 'relato' ? <Relato /> : null}
      {view === 'frentes' ? <Frentes /> : null}
      {view === 'prompt' ? (
        <Prompt copyState={copyState} promptRef={promptRef} onCopy={() => void copyPrompt()} />
      ) : null}
      {view === 'indicadores' ? <Indicadores /> : null}
    </div>
  )
}

function Norte() {
  return (
    <div className="cisc-stack">
      <section className="cisc-card">
        <p className="cisc-kicker">Propósito</p>
        <p>
          Transformar experiências reais dos clientes em histórias que gerem aprendizado,
          reflexão e oportunidades de melhoria. A frente identifica situações relevantes, valida
          os fatos, compreende os impactos e estrutura relatos para as demais frentes da CISC.
        </p>
      </section>
      <section className="cisc-card">
        <p className="cisc-kicker">Papel da frente</p>
        <p>
          Dar visibilidade à voz do cliente. A frente produz e disponibiliza o relato. As demais
          frentes avaliam como utilizá-lo nas suas iniciativas.
        </p>
      </section>
      <section className="cisc-card cisc-scope">
        <p className="cisc-kicker">Onde a atuação termina</p>
        <p>
          Na construção, validação e disponibilização do relato. Não faz parte do escopo
          direcionar ações às áreas de negócio nem acompanhar a implementação de melhorias.
        </p>
      </section>
      <ol className="cisc-steps">
        {['Captar', 'Validar', 'Analisar', 'Estruturar', 'Compartilhar'].map((step, index) => (
          <li key={step}>
            <span>{index + 1}</span>
            {step}
          </li>
        ))}
      </ol>
    </div>
  )
}

function Equipes() {
  return (
    <div className="cisc-stack">
      <section className="cisc-card">
        <p className="cisc-kicker">Governança</p>
        <ul className="cisc-list">
          <li>
            <strong>Líder, Carlos Eduardo Rebelo.</strong> Conduz o ciclo, distribui atividades,
            mobiliza o time e garante as três entregas.
          </li>
          <li>
            <strong>Vice-líder, Janaina Crislaine.</strong> Organiza checkpoints, acompanha
            prazos e assegura a continuidade.
          </li>
          <li>
            <strong>Apoio da coordenação.</strong> Orienta a metodologia, integra a frente e
            consolida as entregas para a agenda mensal.
          </li>
        </ul>
        <p className="cisc-footnote">
          O líder conduz. O vice-líder mobiliza. Os membros constroem. A coordenação apoia.
        </p>
      </section>
      <div className="cisc-team-grid">
        {EQUIPES.map((equipe) => (
          <article key={equipe.relato} className="cisc-card">
            <p className="cisc-kicker">{equipe.relato}</p>
            <dl>
              <div>
                <dt>Captação</dt>
                <dd>{equipe.captacao}</dd>
              </div>
              <div>
                <dt>Validação e análise</dt>
                <dd>
                  {equipe.validacao}
                  <small>{equipe.focoValidacao}</small>
                </dd>
              </div>
              <div>
                <dt>Construção e revisão</dt>
                <dd>
                  {equipe.construcao}
                  <small>{equipe.focoConstrucao}</small>
                </dd>
              </div>
            </dl>
          </article>
        ))}
      </div>
      <p className="cisc-footnote">
        Cada equipe conduz uma história do início ao fim. As responsabilidades são a referência
        de cada etapa. Todos colaboram e podem atuar em outra etapa quando for preciso.
      </p>
    </div>
  )
}

function Ciclo() {
  const marcos = [
    ['D-15 a D-12', 'Captação', 'Levantar histórias, registrar a origem e reunir as informações iniciais.'],
    ['D-11 a D-8', 'Seleção e validação', 'Escolher os temas e confirmar fatos e evidências.'],
    ['D-7 a D-4', 'Construção', 'Estruturar os relatos, aplicar o prompt no Copilot e preparar os slides.'],
    ['D-3 a D-1', 'Revisão', 'Revisar o texto, padronizar e deixar os relatos disponíveis.'],
    ['Terceira quinta-feira', 'Agenda CISC', 'Apresentar as entregas, os aprendizados e os resultados do ciclo.'],
  ]

  return (
    <div className="cisc-stack">
      <section className="cisc-card">
        <p className="cisc-kicker">Marco do mês</p>
        <p>
          A terceira quinta-feira é a agenda oficial da CISC. O planejamento parte dessa data
          para trás. D é essa quinta-feira. O líder pode ajustar os intervalos ao calendário do
          mês.
        </p>
      </section>
      <ol className="cisc-timeline">
        {marcos.map(([quando, titulo, texto]) => (
          <li key={quando}>
            <strong>{quando}</strong>
            <span>{titulo}</span>
            <p>{texto}</p>
          </li>
        ))}
      </ol>
      <section className="cisc-card">
        <p className="cisc-kicker">Rotina de gestão</p>
        <ul className="cisc-list">
          <li>
            <strong>Início.</strong> Reunião de planejamento: três relatos, responsáveis, prazos e
            apoio.
          </li>
          <li>
            <strong>Meio.</strong> Checkpoint rápido: andamento, dificuldades, evidências e risco
            de atraso.
          </li>
          <li>
            <strong>Final.</strong> Validação e fechamento dos materiais e da apresentação.
          </li>
          <li>
            <strong>Terceira quinta-feira.</strong> Agenda mensal da CISC.
          </li>
        </ul>
      </section>
    </div>
  )
}

function Relato() {
  return (
    <div className="cisc-stack">
      <section className="cisc-card">
        <p className="cisc-kicker">Onde encontrar histórias</p>
        <ul className="cisc-list">
          <li>
            <strong>Notas da Ouvidoria.</strong> Falhas, dificuldades ou rupturas na jornada.
          </li>
          <li>
            <strong>Elogios.</strong> Experiências positivas, boas práticas e reconhecimento.
          </li>
          <li>
            <strong>Outras origens.</strong> Propostas pelos membros, avaliadas pelo grupo, com
            fatos e evidências suficientes.
          </li>
        </ul>
        <p className="cisc-footnote">
          Ouvidoria e elogios são as fontes prioritárias.
        </p>
      </section>
      <section className="cisc-card">
        <p className="cisc-kicker">Antes de avançar</p>
        <dl className="cisc-criteria">
          <div>
            <dt>Relevância</dt>
            <dd>A experiência é significativa para o cliente?</dd>
          </div>
          <div>
            <dt>Impacto</dt>
            <dd>Afetou satisfação, confiança, esforço ou resolução?</dd>
          </div>
          <div>
            <dt>Evidências</dt>
            <dd>Há informação suficiente para confirmar a situação?</dd>
          </div>
          <div>
            <dt>Aprendizado</dt>
            <dd>A história gera reflexão ou serve a outras áreas?</dd>
          </div>
          <div>
            <dt>Replicabilidade</dt>
            <dd>Há uma prática ou um aprendizado que possa ser compartilhado?</dd>
          </div>
        </dl>
      </section>
      <section className="cisc-card">
        <p className="cisc-kicker">Seis perguntas do relato</p>
        <ol className="cisc-list cisc-numbered">
          <li>O que aconteceu? Situação e contexto, de forma objetiva.</li>
          <li>Qual a evidência? Fonte, registros e o que comprova os fatos.</li>
          <li>Qual foi o impacto? Como a experiência afetou o cliente.</li>
          <li>O que contribuiu para a situação? Causa ou hipótese, quando houver.</li>
          <li>Qual o aprendizado? O que a experiência ensina.</li>
          <li>O que merece ser compartilhado? A mensagem central para as outras frentes.</li>
        </ol>
      </section>
      <section className="cisc-card cisc-scope">
        <p className="cisc-kicker">Cuidados</p>
        <ul className="cisc-list">
          <li>Separar fato confirmado de percepção e hipótese.</li>
          <li>Não apontar culpados e não antecipar solução.</li>
          <li>Preservar os dados pessoais do cliente.</li>
          <li>Manter uma mensagem central que gere reflexão.</li>
        </ul>
      </section>
      <section className="cisc-card">
        <p className="cisc-kicker">Controle do líder e do vice-líder</p>
        <p>
          A visão do andamento fica com tema, origem, tipo (positiva ou negativa), equipe,
          etapa, prazo, status e link do material. O status é não iniciado, em andamento ou
          concluído.
        </p>
      </section>
    </div>
  )
}

function Frentes() {
  const usos = [
    ['Roda de Conversa', 'Tema para discussão e reflexão coletiva.'],
    ['Preleção do Cliente', 'História para aproximar os colaboradores da realidade do cliente.'],
    ['Informativo', 'Relato para disseminar aprendizados e boas práticas.'],
    ['Diálogo do Cliente (DSC)', 'Experiência para discussão e cultura centrada no cliente.'],
  ]

  return (
    <div className="cisc-stack">
      <section className="cisc-card">
        <p className="cisc-kicker">Depois da validação</p>
        <p>
          O relato validado fica disponível para as outras frentes. Cada uma decide se o tema
          cabe no próprio planejamento e como vai usá-lo.
        </p>
      </section>
      <div className="cisc-team-grid">
        {usos.map(([frente, uso]) => (
          <article key={frente} className="cisc-card">
            <p className="cisc-kicker">{frente}</p>
            <p>{uso}</p>
          </article>
        ))}
      </div>
    </div>
  )
}

function Prompt({
  copyState,
  promptRef,
  onCopy,
}: {
  copyState: 'idle' | 'copied' | 'failed'
  promptRef: RefObject<HTMLTextAreaElement | null>
  onCopy: () => void
}) {
  return (
    <div className="cisc-stack">
      <section className="cisc-card">
        <p className="cisc-kicker">Jornada de Resolução do Cliente</p>
        <p>
          Use este prompt para transformar um relato de reclamação em dois slides. Substitua
          “[COLE AQUI O RELATO COMPLETO]” pelo texto integral antes de enviar ao Copilot.
        </p>
        <button type="button" className="cisc-copy" onClick={onCopy}>
          {copyState === 'copied' ? 'Prompt copiado' : 'Copiar prompt'}
        </button>
        {copyState === 'failed' ? (
          <p className="cisc-footnote">Não foi possível copiar. Selecione o texto abaixo.</p>
        ) : null}
        <textarea ref={promptRef} className="cisc-prompt" readOnly value={PROMPT_PADRAO} />
      </section>
    </div>
  )
}

function Indicadores() {
  const itens = [
    ['Relatos produzidos', '3 por mês.'],
    ['Relatos validados', '100% dos relatos produzidos.'],
    ['Relatos disponibilizados', '100% dos relatos validados.'],
    ['Participação', 'Todos os membros contribuem ao longo do ciclo, não só nas reuniões.'],
    ['Calendário', 'Materiais finalizados antes da terceira quinta-feira.'],
    ['Fontes', 'Ouvidoria e elogios acompanhados de forma contínua.'],
    ['Perspectivas', 'Relatos positivos e negativos.'],
  ]

  return (
    <div className="cisc-stack">
      <section className="cisc-card">
        <p className="cisc-kicker">Referência do ciclo</p>
        <dl className="cisc-criteria">
          {itens.map(([nome, meta]) => (
            <div key={nome}>
              <dt>{nome}</dt>
              <dd>{meta}</dd>
            </div>
          ))}
        </dl>
        <p className="cisc-footnote">
          A meta de três relatos é a referência inicial. As metas da cartilha ainda devem ser
          validadas pelo grupo.
        </p>
      </section>
    </div>
  )
}
