import { useEffect, useState } from 'react'
import { api, ApiError } from './api'

export function useCsdsOptions() {
  const [options, setOptions] = useState<Array<{ id: string; label: string }>>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    void api
      .listCsds()
      .then(({ csds }) => {
        if (!active) return
        setOptions(csds.map((csd) => ({ id: csd.id, label: csd.name })))
        setError(null)
      })
      .catch((err) => {
        if (!active) return
        setOptions([])
        setError(err instanceof ApiError ? err.message : 'Não foi possível carregar os CSDs.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [])

  return { options, loading, error }
}
