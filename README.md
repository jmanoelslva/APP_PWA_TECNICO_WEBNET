# WEBNET Técnico

PWA de campo para os técnicos da WEBNET, em `tecnico.webnetse.com.br`. O app fala com
um backend próprio, que fala com o Controllr usando a sessão do técnico; o
navegador nunca acessa o Controllr direto.

## Funções

- **Início:** OS do dia (abertas, atrasadas e concluídas), próxima OS, busca única (cliente, CPF/CNPJ, contrato, PPPoE, serial da ONU ou leitor de código) e "Continuar atendimento".
- **Barra do atendimento:** liga Cliente, Conexão, ONU, OS e Financeiro do mesmo cliente, sem empilhar telas.
- **Cliente:** contratos, contato (ligar e WhatsApp) e endereço com CEP e localização pelo GPS.
- **Conexão:** diagnóstico "Por que está sem internet?", PPPoE, sessão online, Wi-Fi, acesso ao roteador, CTO e porta, histórico e quedas.
- **ONU:** sinal da ONU e da OLT, credenciais com QR Code do Wi-Fi, renomear, reiniciar, remover e vincular a um cliente.
- **OS:** etapas (responder, iniciar e finalizar), "Antes de finalizar", mensagens prontas para o cliente e anexos com fila sem internet.
- **Mapa de CTOs:** CTOs mais próximas, portas livres, rota e cadastro ou edição de CTO pelo GPS.
- **Outras telas:** Clientes offline, Financeiro (conforme a permissão no Controllr), chamados de suporte, Ferramentas (Meu IP e potência óptica) e Auditoria.
- **Avisos de OS nova** no celular (Web Push).

## Estrutura

- `backend/`: API em FastAPI. Usa o pacote `brbyteapi` (vendorizado em `backend/app/brbyteapi/`) com o cookie de sessão do Controllr de cada técnico. As sessões ficam gravadas e cifradas (`backend/app/sessions.py`), então atualizar o app não desconecta ninguém.
- `frontend/`: PWA em Vite, React e TypeScript.
- `deploy/`: instalador (`install.sh`), exemplos de vhost para Nginx e Apache e o passo a passo manual ([`deploy/DEPLOY.md`](deploy/DEPLOY.md)).
- `tools/notas_release.py`: monta as notas das releases a partir do CHANGELOG.
- [`CONTROLLR_API_NOTES.md`](CONTROLLR_API_NOTES.md): comportamento da API do Controllr levantado ao vivo (campos e filtros sem documentação oficial).

## Instalação e atualização

Primeira instalação:

```bash
git clone https://github.com/jmanoelslva/APP_PWA_TECNICO_WEBNET.git
sudo bash APP_PWA_TECNICO_WEBNET/deploy/install.sh
```

Atualização:

```bash
sudo bash /opt/webnet-tecnico/deploy/install.sh
```

O instalador usa o Apache ou o Nginx que já estiver no servidor, cria um usuário de sistema e um serviço systemd para o backend (sem root e sem exposição direta), gera o build do frontend e configura o proxy, sem mexer nos outros sites. Quando a própria versão muda o `install.sh`, rode o comando duas vezes: a primeira execução ainda é o script antigo.

## Desenvolvimento

Backend:

```bash
cd backend
python -m venv .venv
./.venv/Scripts/activate   # Windows
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
python -m pytest -q
```

As variáveis de ambiente estão em [`backend/.env.example`](backend/.env.example) (Controllr, sessão, anexos, auditoria, avisos de OS e chave do ipify).

Frontend:

```bash
cd frontend
npm install
npm run dev     # http://localhost:5173, com /api/* repassado ao backend na porta 8000
npm test
npm run build
```

O GitHub Actions (`.github/workflows/ci.yml`) roda build, testes e auditoria de dependências a cada push.

## Versões

Versionamento semântico, com o histórico em [CHANGELOG.md](CHANGELOG.md). As releases do GitHub juntam as versões de uma mesma rodada de trabalho (`GRUPOS` em `tools/notas_release.py`); as tags de todas as versões continuam no repositório.

```bash
python tools/notas_release.py 1.34.0            # mostra a nota
python tools/notas_release.py 1.34.0 --aplicar  # grava título e nota na release (gh)
```
