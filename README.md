# historico-app

Sistema interno independente para consulta de historico legado de atendimento.

## Stack

- Frontend: React, Vite, TypeScript, Tailwind CSS e componentes no estilo shadcn/ui
- Backend: Node.js, Express e TypeScript
- Banco: PostgreSQL
- ORM: Prisma
- Infra local: Docker Compose para o Postgres

Nao ha autenticacao, usuarios, roles, JWT, sessao, IA ou integracao com Chatwoot.

## Como rodar

```bash
docker compose up -d

cd backend
npm install
npx prisma migrate dev
npm run import:history ./backups/message-backup.txt.zip
npm run dev

cd ../frontend
npm install
npm run dev
```

Aplicacao:

- Frontend: http://localhost:5173/consulta
- Backend: http://localhost:3001
- Banco: localhost:5432

## Rotas

- `GET /api/health`
- `GET /api/history?phone=92999999999`
- `GET /api/history/conversations/:id`
- `GET /api/import-batches`
- `GET /api/import-batches/:id/rejected-lines`

## Importador

O importador aceita `.txt` ou `.zip`. Se for `.zip`, o primeiro `.txt` encontrado e usado.

Formatos aceitos por linha:

- JSON por linha: `{"phone":"+5592999999999","timestamp":"2026-01-15T10:30:00Z","sender":"Agente","senderType":"agent","message":"Texto"}`
- Texto com telefone, data/hora e mensagem: `15/01/2026 10:30 - Atendente Ana - +55 92 99999-9999 - Maria: Texto`

Linhas sem telefone, data/hora ou mensagem reconhecivel sao registradas em `import_rejected_lines`.
