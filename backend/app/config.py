import os

# Igual a "version" em frontend/package.json (SemVer, ver CHANGELOG.md).
APP_VERSION = "1.33.0"

# Porta administrativa do Controllr (8443), usada por todas as chamadas do técnico.
CONTROLLR_URL = os.environ.get("CONTROLLR_URL", "https://controllr.webnetse.com.br:8443")

# Validade do cookie no navegador; a sessão vale enquanto o Controllr aceitar.
SESSION_COOKIE_MAX_AGE_SECONDS = int(os.environ.get("SESSION_COOKIE_MAX_AGE_SECONDS", str(24 * 60 * 60)))

# Intervalo da checagem da sessão no Controllr (ver deps.get_current_session).
CONTROLLR_LIVENESS_CHECK_SECONDS = int(os.environ.get("CONTROLLR_LIVENESS_CHECK_SECONDS", "60"))

SESSION_COOKIE_NAME = "TECSESSION"

# Anexo passa inteiro pela memória antes de ir ao Controllr.
ANEXO_MAX_MB = int(os.environ.get("ANEXO_MAX_MB", "30"))

# 0 só para testar por http fora de localhost.
COOKIE_SEGURO = os.environ.get("SESSION_COOKIE_SECURE", "1") != "0"

# Arquivo base da auditoria (ver app/audit.py).
AUDIT_LOG_PATH = os.environ.get("AUDIT_LOG_PATH", "logs/auditoria.jsonl")
# Um arquivo por mês (auditoria-AAAA-MM.jsonl); os mais antigos que isto são apagados.
AUDITORIA_RETENCAO_MESES = int(os.environ.get("AUDITORIA_RETENCAO_MESES", "12"))
# Quem vê a auditoria no app (vírgulas). "*"/"todos" = qualquer técnico; vazio = ninguém.
AUDITORIA_USUARIOS = {
    u.strip().lower() for u in os.environ.get("AUDITORIA_USUARIOS", "").split(",") if u.strip()
}

# Chave Fernet das sessões gravadas (gerada pelo install.sh); vazia = só memória.
SESSOES_CHAVE = os.environ.get("SESSOES_CHAVE", "")
SESSOES_ARQUIVO = os.environ.get("SESSOES_ARQUIVO", "dados/sessoes.bin")

# Bloqueio de login (ver limite_login.py): por IP+usuário e, mais alto, por IP.
LOGIN_TENTATIVAS_PAR = int(os.environ.get("LOGIN_TENTATIVAS_PAR", "5"))
LOGIN_TENTATIVAS_IP = int(os.environ.get("LOGIN_TENTATIVAS_IP", "20"))
LOGIN_BLOQUEIO_MINUTOS = int(os.environ.get("LOGIN_BLOQUEIO_MINUTOS", "5"))
# Teto por usuário somando IPs; alto para que terceiros não travem a conta.
LOGIN_TENTATIVAS_USUARIO = int(os.environ.get("LOGIN_TENTATIVAS_USUARIO", "15"))

# CORS só para o Vite em dev; em produção é a mesma origem.
CORS_ALLOW_ORIGINS = [
    origin.strip()
    for origin in os.environ.get("CORS_ALLOW_ORIGINS", "http://localhost:5173").split(",")
    if origin.strip()
]

# Chave do geo.ipify.org (Meu IP). Vazia = rota responde 503.
IPIFY_API_KEY = os.environ.get("IPIFY_API_KEY", "")

# KMZ/KML do projeto da rede (ver routers/mapa.py), fora da pasta do deploy.
MAPA_PROJETO_PATH = os.environ.get("MAPA_PROJETO_PATH", "/etc/webnet-tecnico/projeto.kmz")

# Avisos de OS nova (ver vigia_os.py). Usuário só de consulta; sem ele ou sem VAPID, avisos desligados.
CONTROLLR_CONSULTA_USUARIO = os.environ.get("CONTROLLR_CONSULTA_USUARIO", "")
CONTROLLR_CONSULTA_SENHA = os.environ.get("CONTROLLR_CONSULTA_SENHA", "")
# De quanto em quanto tempo procurar OS nova (segundos). Mínimo de 30.
AVISOS_INTERVALO_SEGUNDOS = max(30, int(os.environ.get("AVISOS_INTERVALO_SEGUNDOS", "60")))
# Chaves Web Push (install.sh). O contato é exigido pelos serviços de push.
VAPID_PUBLIC_KEY = os.environ.get("VAPID_PUBLIC_KEY", "")
VAPID_PRIVATE_KEY = os.environ.get("VAPID_PRIVATE_KEY", "")
VAPID_CONTATO = os.environ.get("VAPID_CONTATO", "mailto:suporte@webnetse.com.br")
# Celulares inscritos e OS já vistas (sobrevive a reinício do serviço).
AVISOS_DADOS_DIR = os.environ.get("AVISOS_DADOS_DIR", "dados")
