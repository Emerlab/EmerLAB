import React, { useEffect, useState } from 'react'
import GradeLimitesCarencias from './GradeLimitesCarencias.jsx'

export default function EditorLimitesCarenciasModal({
    titulo,
    planos,
    valoresIniciais,
    limiteGrupoPorPlanoId,
    salvando = false,
    onSalvar,
    onFechar,
}) {
    const [valores, setValores] = useState(() => ({ ...valoresIniciais }))

    useEffect(() => {
        const aoTeclar = (event) => {
            if (event.key === 'Escape' && !salvando) onFechar()
        }
        window.addEventListener('keydown', aoTeclar)
        return () => window.removeEventListener('keydown', aoTeclar)
    }, [onFechar, salvando])

    const alterar = (planoId, campo, valor) =>
        setValores((anterior) => ({
            ...anterior,
            [planoId]: { limite: '', carencia: '', ...anterior[planoId], [campo]: valor },
        }))

    return (
        <div className='supertabelaprocedimentos_modal_fundo' onMouseDown={() => !salvando && onFechar()}>
            <div
                className='supertabelaprocedimentos_modal'
                role='dialog'
                aria-modal='true'
                aria-label={titulo}
                onMouseDown={(event) => event.stopPropagation()}
            >
                <h3 className='supertabelaprocedimentos_modal_titulo'>{titulo}</h3>
                <GradeLimitesCarencias
                    planos={planos}
                    valores={valores}
                    onChange={alterar}
                    limiteGrupoPorPlanoId={limiteGrupoPorPlanoId}
                    desabilitado={salvando}
                />
                <div className='supertabelaprocedimentos_confirm_actions'>
                    <button type='button' className='supertabelaprocedimentos_confirm_btn' onClick={onFechar} disabled={salvando}>
                        Cancelar
                    </button>
                    <button
                        type='button'
                        className='supertabelaprocedimentos_massa_btn'
                        onClick={() => onSalvar(valores)}
                        disabled={salvando}
                    >
                        {salvando ? 'Salvando…' : 'Salvar'}
                    </button>
                </div>
            </div>
        </div>
    )
}
