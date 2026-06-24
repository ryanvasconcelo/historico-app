const apiBase = import.meta.env.VITE_API_URL ?? "/api";

export type HistoryConversation = {
  id: string;
  contactPhone: string;
  contactName: string | null;
  phoneDisplay: string;
  startedAt: string | null;
  endedAt: string | null;
  source: string | null;
  messageCount: number;
};

export type HistoryMessage = {
  id: string;
  senderName: string | null;
  senderType: string | null;
  content: string;
  sentAt: string | null;
};

export type ImportBatch = {
  id: string;
  fileName: string;
  status: string;
  totalMessages: number;
  totalConversations: number;
  totalRejected: number;
  startedAt: string;
  finishedAt: string | null;
  createdAt: string;
};

export type ImportRejectedLine = {
  id: string;
  batchId: string;
  lineNumber: number | null;
  content: string;
  reason: string | null;
  createdAt: string;
};

async function request<T>(path: string) {
  const response = await fetch(`${apiBase}${path}`, {
    headers: {
      "Content-Type": "application/json"
    }
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: "Erro inesperado." }));
    throw new Error(error.message ?? "Erro inesperado.");
  }

  return (await response.json()) as T;
}

export const api = {
  health: () => request<{ ok: boolean }>("/health"),
  searchHistory: (phone: string) =>
    request<{
      phone: string;
      phoneDisplay: string;
      total: number;
      lastAttendanceAt: string | null;
      conversations: HistoryConversation[];
    }>(`/history?phone=${encodeURIComponent(phone)}`),
  getConversation: (id: string) =>
    request<{
      conversation: HistoryConversation & {
        messages: HistoryMessage[];
      };
    }>(`/history/conversations/${id}`),
  listImportBatches: () =>
    request<{
      batches: ImportBatch[];
    }>("/import-batches"),
  listRejectedLines: (id: string) =>
    request<{
      batch: ImportBatch;
      rejectedLines: ImportRejectedLine[];
    }>(`/import-batches/${id}/rejected-lines`)
};
