import { useEffect, useState } from 'react'
import { api } from './api'

export function useCsdsOptions() {
  const [options, setOptions] = useState<Array<{ id: string; label: string }>>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true

    void api
      .listCsds()
      .then(({ csds }) => {
        if (!active) return
        setOptions(csds.map((csd) => ({ id: csd.id, label: csd.name })))
      })
      .catch(() => {
        if (!active) return
        setOptions([])
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [])

  return { options, loading }
}
