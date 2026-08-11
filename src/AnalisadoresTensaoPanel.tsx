import { useState } from 'react'

export function AnalisadoresTensaoPanel({ readOnly = false }: { readOnly?: boolean }) {
  const [showForm, setShowForm] = useState(false)

  return (
    <div className="analisadores-tensao-panel">
      {readOnly ? null : (
        <div className="area-actions right-aligned-actions">
          <button
            type="button"
            className="primary-button"
            onClick={() => setShowForm((current) => !current)}
          >
            {showForm ? 'Fechar formulário' : 'Cadastrar analisador'}
          </button>
        </div>
      )}
    </div>
  )
}
