import { IconeBusca } from './iconesTabelaPlanos.jsx'

/** Busca sempre visível, com atalhos dos termos populares. */
export default function BuscaProcedimentos({ valor, onChange, termosPopulares = [], desabilitado = false, resumo = '' }) {
    return (
        <div className="tp_busca" role="search">
            <label className="tp_busca__campo">
                <IconeBusca className="tp_busca__icone" />
                <input
                    className="tp_busca__input"
                    type="search"
                    inputMode="search"
                    autoComplete="off"
                    placeholder="Buscar procedimento (ex.: raio x, castração, vacina)"
                    value={valor}
                    disabled={desabilitado}
                    onChange={(e) => onChange(e.target.value)}
                    aria-label="Buscar procedimento"
                />
            </label>
            {termosPopulares.length > 0 ? (
                <div className="tp_atalhos" role="group" aria-label="Buscas populares">
                    {termosPopulares.map((t) => (
                        <button key={t} type="button" className="tp_chip" disabled={desabilitado} onClick={() => onChange(t)}>
                            {t}
                        </button>
                    ))}
                </div>
            ) : null}
            {resumo ? (
                <p className="tp_busca__resumo" aria-live="polite">
                    {resumo}
                </p>
            ) : null}
        </div>
    )
}
