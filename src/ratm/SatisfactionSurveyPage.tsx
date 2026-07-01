import { FormEvent, useEffect, useState } from 'react'
import { EdpLogo } from '../EdpLogo'

type SurveyData = {
  laudoId: string
  ratmNumber: number
  meter: string
  client: string
  alreadySubmitted: boolean
  response: {
    rating: number
    comment: string
    submittedAt: string
  } | null
}

type SatisfactionSurveyPageProps = {
  laudoId: string
}

export function SatisfactionSurveyPage({ laudoId }: SatisfactionSurveyPageProps) {
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [survey, setSurvey] = useState<SurveyData | null>(null)
  const [rating, setRating] = useState<number | null>(null)
  const [comment, setComment] = useState('')
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null,
  )

  useEffect(() => {
    let cancelled = false

    async function loadSurvey() {
      setLoading(true)
      setFeedback(null)

      try {
        const response = await fetch(`/api/public/pesquisa/${laudoId}`)
        const payload = (await response.json()) as SurveyData & { error?: string }

        if (!response.ok) {
          throw new Error(payload.error ?? 'Não foi possível carregar a pesquisa.')
        }

        if (!cancelled) {
          setSurvey(payload)
        }
      } catch (error) {
        if (!cancelled) {
          setFeedback({
            type: 'error',
            message:
              error instanceof Error ? error.message : 'Não foi possível carregar a pesquisa.',
          })
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void loadSurvey()

    return () => {
      cancelled = true
    }
  }, [laudoId])

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()

    if (!rating) {
      setFeedback({
        type: 'error',
        message: 'Selecione uma nota de 1 a 5 antes de enviar.',
      })
      return
    }

    setSubmitting(true)
    setFeedback(null)

    try {
      const response = await fetch(`/api/public/pesquisa/${laudoId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating, comment }),
      })
      const payload = (await response.json()) as { message?: string; error?: string }

      if (!response.ok) {
        throw new Error(payload.error ?? 'Não foi possível enviar a pesquisa.')
      }

      setSurvey((previous) =>
        previous
          ? {
              ...previous,
              alreadySubmitted: true,
              response: {
                rating,
                comment,
                submittedAt: new Date().toISOString(),
              },
            }
          : previous,
      )
      setFeedback({
        type: 'success',
        message: payload.message ?? 'Pesquisa enviada com sucesso. Obrigado!',
      })
    } catch (error) {
      setFeedback({
        type: 'error',
        message: error instanceof Error ? error.message : 'Não foi possível enviar a pesquisa.',
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="shell">
      <section className="home-card satisfaction-survey-card">
        <EdpLogo />
        <p className="section-tag">Laboratório de Medição</p>
        <h2>Pesquisa de Satisfação</h2>

        {loading ? <p>Carregando pesquisa...</p> : null}

        {feedback ? (
          <div className={`login-feedback ${feedback.type}`} role="status">
            {feedback.message}
          </div>
        ) : null}

        {!loading && survey ? (
          <>
            <p>
              Laudo RATM {survey.ratmNumber} — Medidor {survey.meter}
            </p>

            {survey.alreadySubmitted && survey.response ? (
              <div className="satisfaction-survey-summary">
                <p>Obrigado! Sua avaliação já foi registrada.</p>
                <strong>Nota: {survey.response.rating}/5</strong>
                {survey.response.comment ? <p>{survey.response.comment}</p> : null}
              </div>
            ) : (
              <form className="satisfaction-survey-form" onSubmit={handleSubmit}>
                <fieldset className="radio-fieldset full-width">
                  <legend>Como você avalia o atendimento?</legend>
                  <div className="radio-group">
                    {[1, 2, 3, 4, 5].map((value) => (
                      <label key={value} className="radio-option">
                        <input
                          type="radio"
                          name="survey-rating"
                          value={value}
                          checked={rating === value}
                          onChange={() => setRating(value)}
                        />
                        <span>{value}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>

                <label className="full-width">
                  Comentário (opcional)
                  <textarea
                    rows={4}
                    value={comment}
                    onChange={(event) => setComment(event.target.value)}
                    placeholder="Conte como foi sua experiência"
                  />
                </label>

                <button className="primary-button" type="submit" disabled={submitting}>
                  Enviar pesquisa
                </button>
              </form>
            )}
          </>
        ) : null}

        {!loading && !survey && !feedback ? (
          <p className="generated-password-empty">Pesquisa indisponível.</p>
        ) : null}
      </section>
    </main>
  )
}
