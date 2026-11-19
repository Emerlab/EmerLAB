import React from 'react'

/**
 * Uma linha por plano com limite e carência. O limite fica bloqueado quando o plano usa limite de grupo
 * (o chamador passa `limiteGrupoPorPlanoId` vazio para procedimentos isentos).
 */
export default function GradeLimitesCarencias({
    planos,
    valores,
    onChange,
    limiteGrupoPorPlanoId = {},
    desabilitado = false,
}) {
    return (
        <div className='supertabelaprocedimentos_grade' role='group' aria-label='Limites e carências por plano'>
            <div className='supertabelaprocedimentos_grade_linha supertabelaprocedimentos_grade_cabecalho'>
                <span>Plano</span>
                <span>Limite</span>
                <span>Carência</span>
            </div>
            {planos.map((plano) => {
                const valor = valores?.[plano.id] || { limite: '', carencia: '' }
                const limiteGrupo = String(limiteGrupoPorPlanoId?.[plano.id] ?? '').trim()
                return (
                    <div key={`grade-${plano.id}`} className='supertabelaprocedimentos_grade_linha'>
                        <span className='supertabelaprocedimentos_grade_plano'>{plano.nome}</span>
                        <input
                            type='text'
                            className='supertabelaprocedimentos_input'
                            aria-label={`Limite — ${plano.nome}`}
                            placeholder={limiteGrupo ? `Grupo: ${limiteGrupo}` : 'Ex.: 10 - Grupo EESP'}
                            value={limiteGrupo ? '' : valor.limite}
                            disabled={desabilitado || Boolean(limiteGrupo)}
                            onChange={(event) => onChange(plano.id, 'limite', event.target.value)}
                        />
                        <input
                            type='text'
                            className='supertabelaprocedimentos_input'
                            aria-label={`Carência — ${plano.nome}`}
                            placeholder='Ex.: 60 Dias'
                            value={valor.carencia}
                            disabled={desabilitado}
                            onChange={(event) => onChange(plano.id, 'carencia', event.target.value)}
                        />
                    </div>
                )
            })}
        </div>
    )
}
