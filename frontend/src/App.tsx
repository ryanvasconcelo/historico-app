import { FormEvent, useEffect, useState } from "react";
import { Archive, Clock3, FileWarning, Inbox, MessageSquareText, Phone, Search } from "lucide-react";
import { api, HistoryConversation, ImportBatch, ImportRejectedLine } from "./lib/api";
import { cn, formatDate } from "./lib/utils";
import { Badge } from "./components/ui/badge";
import { Button } from "./components/ui/button";
import { Card } from "./components/ui/card";
import { Input } from "./components/ui/input";

type Page = "consulta" | "importacoes";
type SearchResult = Awaited<ReturnType<typeof api.searchHistory>>;
type OpenConversation = Awaited<ReturnType<typeof api.getConversation>>["conversation"];

function pageFromPath(pathname: string): Page {
  return pathname === "/importacoes" ? "importacoes" : "consulta";
}

function App() {
  const [page, setPage] = useState<Page>(() => pageFromPath(window.location.pathname));

  useEffect(() => {
    const handlePopState = () => setPage(pageFromPath(window.location.pathname));
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  function navigate(nextPage: Page) {
    setPage(nextPage);
    window.history.pushState(null, "", `/${nextPage}`);
  }

  return (
    <div className="min-h-[100dvh] bg-background text-foreground">
      <div className="mx-auto flex min-h-[100dvh] max-w-[1480px] flex-col md:flex-row">
        <aside className="border-b border-border bg-white px-4 py-4 md:w-64 md:border-b-0 md:border-r md:px-5">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-slate-900 text-white">
              <Archive className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-semibold leading-tight">Historico legado</p>
              <p className="text-xs text-muted-foreground">Atendimento interno</p>
            </div>
          </div>

          <nav className="flex gap-2 md:flex-col">
            <NavButton active={page === "consulta"} onClick={() => navigate("consulta")}>
              <Search className="h-4 w-4" />
              Consulta
            </NavButton>
            <NavButton active={page === "importacoes"} onClick={() => navigate("importacoes")}>
              <Inbox className="h-4 w-4" />
              Importacoes
            </NavButton>
          </nav>
        </aside>

        <main className="flex-1 px-4 py-5 md:px-6 lg:px-8">
          {page === "consulta" ? <ConsultaPage /> : <ImportacoesPage />}
        </main>
      </div>
    </div>
  );
}

function NavButton({
  active,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { active: boolean }) {
  return (
    <Button
      variant={active ? "secondary" : "ghost"}
      className={cn("justify-start gap-2", className)}
      {...props}
    />
  );
}

function ConsultaPage() {
  const [phone, setPhone] = useState("");
  const [result, setResult] = useState<SearchResult | null>(null);
  const [selected, setSelected] = useState<OpenConversation | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingConversation, setLoadingConversation] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api.searchHistory("")
      .then(setResult)
      .catch(err => setError(err instanceof Error ? err.message : "Erro ao carregar conversas."))
      .finally(() => setLoading(false));
  }, []);

  async function handleSearch(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setSelected(null);

    try {
      const data = await api.searchHistory(phone);
      setResult(data);
    } catch (err) {
      setResult(null);
      setError(err instanceof Error ? err.message : "Erro na busca.");
    } finally {
      setLoading(false);
    }
  }

  async function openConversation(conversation: HistoryConversation) {
    setLoadingConversation(true);
    setError("");

    try {
      const data = await api.getConversation(conversation.id);
      setSelected(data.conversation);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao abrir conversa.");
    } finally {
      setLoadingConversation(false);
    }
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Consulta</h1>
          <p className="text-sm text-muted-foreground">Historico legado de todos os clientes.</p>
        </div>
        <form className="flex w-full gap-2 lg:max-w-xl" onSubmit={handleSearch}>
          <Input
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            placeholder="Buscar por nome ou telefone..."
            aria-label="Pesquisar"
          />
          <Button disabled={loading}>
            <Search className="h-4 w-4" />
            {loading ? "Buscando" : "Buscar"}
          </Button>
        </form>
      </header>

      {error && <AlertMessage>{error}</AlertMessage>}

      <section className="grid gap-3 sm:grid-cols-2">
        <MetricCard icon={<MessageSquareText className="h-4 w-4" />} label="Total de conversas" value={String(result?.total ?? 0)} />
        <MetricCard icon={<Clock3 className="h-4 w-4" />} label="Ultimo atendimento" value={formatDate(result?.lastAttendanceAt)} />
      </section>

      <div className="grid gap-5 xl:grid-cols-[420px_1fr]">
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold">Conversas</h2>
              <p className="text-xs text-muted-foreground">{result?.phoneDisplay ?? "Carregando..."}</p>
            </div>
            {result && <Badge>{result.total}</Badge>}
          </div>

          <div className="max-h-[640px] divide-y divide-border overflow-y-auto">
            {loading && !result && <EmptyState text="Carregando conversas..." />}
            {!loading && !result && <EmptyState text="Nenhuma conversa encontrada." />}
            {result?.conversations.length === 0 && <EmptyState text="Nenhuma conversa encontrada." />}
            {result?.conversations.map((conversation) => (
              <button
                key={conversation.id}
                className={cn(
                  "block w-full px-4 py-3 text-left transition hover:bg-muted",
                  selected?.id === conversation.id && "bg-muted"
                )}
                onClick={() => openConversation(conversation)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">{conversation.contactName ?? conversation.phoneDisplay}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatDate(conversation.startedAt)} ate {formatDate(conversation.endedAt)}
                    </p>
                  </div>
                  <Badge>{conversation.messageCount} msgs</Badge>
                </div>
              </button>
            ))}
          </div>
        </Card>

        <Card className="min-h-[640px] overflow-hidden">
          <div className="border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold">Mensagens</h2>
            <p className="text-xs text-muted-foreground">
              {selected ? `${selected.contactName ?? selected.phoneDisplay} - ${formatDate(selected.startedAt)}` : "Selecione uma conversa"}
            </p>
          </div>

          {loadingConversation && <EmptyState text="Carregando mensagens..." />}
          {!loadingConversation && !selected && <EmptyState text="A conversa selecionada aparecera aqui." />}
          {!loadingConversation && selected && (
            <div className="max-h-[590px] space-y-3 overflow-y-auto bg-slate-50 p-4">
              {selected.messages.map((message) => {
                const isContact = message.senderType === "contact";
                return (
                  <div key={message.id} className={cn("flex", isContact ? "justify-start" : "justify-end")}>
                    <div
                      className={cn(
                        "max-w-[82%] rounded-lg px-3 py-2 text-sm shadow-sm",
                        isContact ? "bg-white text-foreground" : "bg-slate-900 text-white"
                      )}
                    >
                      <div className="mb-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] opacity-75">
                        <span>{message.senderName ?? message.senderType ?? "sem autor"}</span>
                        <span>{formatDate(message.sentAt)}</span>
                      </div>
                      <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function ImportacoesPage() {
  const [batches, setBatches] = useState<ImportBatch[]>([]);
  const [selectedBatch, setSelectedBatch] = useState<ImportBatch | null>(null);
  const [rejectedLines, setRejectedLines] = useState<ImportRejectedLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingRejected, setLoadingRejected] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .listImportBatches()
      .then((data) => setBatches(data.batches))
      .catch((err) => setError(err instanceof Error ? err.message : "Erro ao carregar importacoes."))
      .finally(() => setLoading(false));
  }, []);

  async function showRejectedLines(batch: ImportBatch) {
    setLoadingRejected(true);
    setError("");
    setSelectedBatch(batch);

    try {
      const data = await api.listRejectedLines(batch.id);
      setRejectedLines(data.rejectedLines);
    } catch (err) {
      setRejectedLines([]);
      setError(err instanceof Error ? err.message : "Erro ao carregar rejeicoes.");
    } finally {
      setLoadingRejected(false);
    }
  }

  const totals = batches.reduce(
    (acc, batch) => ({
      messages: acc.messages + batch.totalMessages,
      conversations: acc.conversations + batch.totalConversations,
      rejected: acc.rejected + batch.totalRejected
    }),
    { messages: 0, conversations: 0, rejected: 0 }
  );

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Importacoes</h1>
        <p className="text-sm text-muted-foreground">Lotes processados pelo importador legado.</p>
      </header>

      {error && <AlertMessage>{error}</AlertMessage>}

      <section className="grid gap-3 md:grid-cols-3">
        <MetricCard icon={<MessageSquareText className="h-4 w-4" />} label="Mensagens importadas" value={String(totals.messages)} />
        <MetricCard icon={<Archive className="h-4 w-4" />} label="Conversas criadas" value={String(totals.conversations)} />
        <MetricCard icon={<FileWarning className="h-4 w-4" />} label="Linhas rejeitadas" value={String(totals.rejected)} />
      </section>

      <div className="grid gap-5 xl:grid-cols-[1fr_460px]">
        <Card className="overflow-hidden">
          <div className="border-b border-border px-4 py-3 text-sm font-semibold">Lotes</div>
          {loading && <EmptyState text="Carregando lotes..." />}
          {!loading && batches.length === 0 && <EmptyState text="Nenhum lote importado." />}
          {!loading && batches.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-muted text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">Arquivo</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Mensagens</th>
                    <th className="px-4 py-3">Conversas</th>
                    <th className="px-4 py-3">Rejeitadas</th>
                    <th className="px-4 py-3">Inicio</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {batches.map((batch) => (
                    <tr key={batch.id}>
                      <td className="max-w-[260px] truncate px-4 py-3 font-medium">{batch.fileName}</td>
                      <td className="px-4 py-3"><Badge>{batch.status}</Badge></td>
                      <td className="px-4 py-3">{batch.totalMessages}</td>
                      <td className="px-4 py-3">{batch.totalConversations}</td>
                      <td className="px-4 py-3">{batch.totalRejected}</td>
                      <td className="px-4 py-3">{formatDate(batch.startedAt)}</td>
                      <td className="px-4 py-3 text-right">
                        <Button variant="ghost" disabled={batch.totalRejected === 0} onClick={() => showRejectedLines(batch)}>
                          Ver linhas
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card className="overflow-hidden">
          <div className="border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold">Linhas rejeitadas</h2>
            <p className="text-xs text-muted-foreground">{selectedBatch?.fileName ?? "Selecione um lote"}</p>
          </div>
          {loadingRejected && <EmptyState text="Carregando rejeicoes..." />}
          {!loadingRejected && !selectedBatch && <EmptyState text="As rejeicoes do lote aparecerao aqui." />}
          {!loadingRejected && selectedBatch && rejectedLines.length === 0 && <EmptyState text="Nenhuma linha rejeitada neste lote." />}
          {!loadingRejected && rejectedLines.length > 0 && (
            <div className="max-h-[560px] divide-y divide-border overflow-y-auto">
              {rejectedLines.map((line) => (
                <div key={line.id} className="px-4 py-3">
                  <div className="mb-1 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                    <span>Linha {line.lineNumber ?? "-"}</span>
                    <span>{line.reason ?? "Sem motivo informado"}</span>
                  </div>
                  <pre className="whitespace-pre-wrap rounded-md bg-slate-950 p-3 text-xs leading-relaxed text-slate-100">{line.content}</pre>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function MetricCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <Card className="p-4">
      <div className="mb-3 text-muted-foreground">{icon}</div>
      <div className="text-2xl font-semibold tracking-tight">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </Card>
  );
}

function AlertMessage({ children }: { children: React.ReactNode }) {
  return <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{children}</div>;
}

function EmptyState({ text }: { text: string }) {
  return <div className="px-4 py-12 text-center text-sm text-muted-foreground">{text}</div>;
}

export default App;
