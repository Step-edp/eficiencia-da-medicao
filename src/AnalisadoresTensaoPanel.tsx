import { useState } from 'react'

export function AnalisadoresTensaoPanel({ readOnly = false }: { readOnly?: boolean }) {
  const [showForm, setShowForm] = useState(false)

  return (
    <div className="analisadores-tensao-panel">
      <p>
        Página dedicada da área Analisadores de Tensão. Aqui você pode concentrar
        funcionalidades e informações específicas do laboratório.
      </p>

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
