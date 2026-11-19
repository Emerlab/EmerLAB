import { partesTextoObservacao } from './logicaTabelaPlanos.js'

/** Texto de uma observação com **negrito** e links (inclusive link em negrito), sem inserir HTML cru. */
export default function TextoObservacao({ texto }) {
    return partesTextoObservacao(texto).map((p, i) => {
        let no =
            p.tipo === 'link' ? (
                <a key={i} href={p.href} target="_blank" rel="noreferrer">
                    {p.texto}
                </a>
            ) : (
                p.texto
            )
        if (p.negrito) no = <strong key={i}>{no}</strong>
        return no
    })
}
