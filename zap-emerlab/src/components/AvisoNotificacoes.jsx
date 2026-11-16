import { useState } from 'react'
import Modal from './Modal.jsx'
import { ler, gravar } from '../util.js'

const CHAVE = 'zap.avisoNotificacoes'
const suportado = () => typeof window !== 'undefined' && 'Notification' in window

// Popup da tela inicial: convida a ligar as notificações e explica como liberar quando o navegador bloqueou.
export default function AvisoNotificacoes({ prefs, setPrefs }) {
    const [fechado, setFechado] = useState(() => Boolean(ler(CHAVE, false)))
    const [permissao, setPermissao] = useState(() => (suportado() ? Notification.permission : 'unsupported'))

    const ligadas = prefs.notificacoes && permissao === 'granted'
    if (fechado || ligadas || permissao === 'unsupported') return null

    const fechar = () => {
        gravar(CHAVE, true)
        setFechado(true)
    }

    const ativar = async () => {
        const p = await Notification.requestPermission()
        setPermissao(p)
        if (p === 'granted') {
            setPrefs({ notificacoes: true })
            fechar()
        }
    }

    const bloqueado = permissao === 'denied'

    return (
        <Modal titulo="Ative as notificações" aoFechar={fechar}>
            <p>Receba um aviso no canto da tela, mesmo com o navegador minimizado ou em outra aba, quando:</p>
            <ul>
                <li>uma conversa for transferida ou atribuída a você;</li>
                <li>um cliente responder numa conversa sua;</li>
                <li>alguém mencionar você (@) nas notas.</li>
            </ul>
            {bloqueado ? (
                <>
                    <p>
                        <strong>O navegador está bloqueando as notificações deste site.</strong> Para liberar:
                    </p>
                    <ol>
                        <li>Clique no ícone de cadeado (ou de ajustes) ao lado do endereço, no alto da página.</li>
                        <li>
                            Em <em>Notificações</em>, escolha <em>Permitir</em>.
                        </li>
                        <li>Recarregue a página (F5) e ative em Configurações → Conversas.</li>
                    </ol>
                    <p>No Windows, confira também se o modo “Não perturbe”/“Assistente de foco” está desligado.</p>
                </>
            ) : (
                <p>
                    Ao clicar em <strong>Ativar</strong>, o navegador vai pedir permissão: escolha <em>Permitir</em>. Você pode desligar depois em
                    Configurações.
                </p>
            )}
            <div className="admin-acoes">
                {!bloqueado ? (
                    <button className="botao botao-primario" onClick={ativar}>
                        Ativar notificações
                    </button>
                ) : null}
                <button className="botao" onClick={fechar}>
                    {bloqueado ? 'Entendi' : 'Agora não'}
                </button>
            </div>
        </Modal>
    )
}
