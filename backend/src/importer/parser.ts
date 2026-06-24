import crypto from "node:crypto";
import { normalizeBrazilianPhone } from "../lib/phone.js";
import { sanitizeMessage } from "../lib/sanitize.js";

export type ParsedHistoryMessage = {
  lineNumber: number;
  contactPhone: string;
  contactName?: string;
  senderName?: string;
  senderType: string;
  content: string;
  sentAt: Date;
  contentHash: string;
};

export type RejectedHistoryLine = {
  lineNumber: number;
  content: string;
  reason: string;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function hashMessage(message: Omit<ParsedHistoryMessage, "contentHash">) {
  const stable = [
    message.contactPhone,
    message.sentAt.toISOString(),
    message.senderName ?? "",
    message.senderType,
    message.content
  ].join("|");

  return crypto.createHash("sha256").update(stable).digest("hex");
}

export function parseHistoryDate(value: string) {
  const trimmed = value.trim().replace(/^\[/, "").replace(/\]$/, "");
  const br = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})[ T,]+(\d{2}):(\d{2})(?::(\d{2}))?/);

  if (br) {
    const [, day, month, year, hour, minute, second = "00"] = br;
    return new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}-04:00`);
  }

  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function inferSenderType(senderName?: string, contactName?: string) {
  const sender = (senderName ?? "").toLowerCase();
  const contact = (contactName ?? "").toLowerCase();

  if (!sender) return "unknown";
  if (contact && sender === contact) return "contact";
  if (/(cliente|contato|customer|lead)/.test(sender)) return "contact";
  if (/(sistema|system|bot)/.test(sender)) return "system";
  return "agent";
}

function normalizeJsonValue(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value);
}

function buildMessage(data: Omit<ParsedHistoryMessage, "contentHash">) {
  return {
    ...data,
    contentHash: hashMessage(data)
  };
}

function parseJsonLine(line: string, lineNumber: number) {
  try {
    const raw = JSON.parse(line) as Record<string, unknown>;
    const contactPhone = normalizeBrazilianPhone(
      normalizeJsonValue(raw.contactPhone ?? raw.phone ?? raw.telefone ?? raw.phoneNumber)
    );
    const sentAt = parseHistoryDate(normalizeJsonValue(raw.sentAt ?? raw.timestamp ?? raw.data ?? raw.date));
    const content = sanitizeMessage(normalizeJsonValue(raw.content ?? raw.message ?? raw.body ?? raw.text));
    const contactName = sanitizeMessage(normalizeJsonValue(raw.contactName ?? raw.contato ?? raw.name)) || undefined;
    const senderName = sanitizeMessage(normalizeJsonValue(raw.senderName ?? raw.sender ?? raw.autor ?? raw.author)) || undefined;
    const senderType = sanitizeMessage(normalizeJsonValue(raw.senderType ?? raw.tipo)) || inferSenderType(senderName, contactName);

    if (!contactPhone || !sentAt || !content) return null;

    return buildMessage({
      lineNumber,
      contactPhone,
      contactName,
      senderName,
      senderType: senderType.toLowerCase(),
      content,
      sentAt
    });
  } catch {
    return null;
  }
}

function normalizeRemainder(value: string) {
  return value
    .replace(/^[\s\-[\]|:;,.]+/, "")
    .replace(/\s+\|\s+/g, " - ")
    .replace(/\s+-\s+-\s+/g, " - ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function parseTextLine(line: string, lineNumber: number) {
  const dateMatch =
    line.match(/\[?\d{2}\/\d{2}\/\d{4}[ T,]+\d{2}:\d{2}(?::\d{2})?\]?/) ??
    line.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[-+]\d{2}:?\d{2})?/);
  const phoneMatch = line.match(/(?:\+?55\s?)?(?:\(?\d{2}\)?\s?)?(?:9?\d{4})[-\s]?\d{4}/);

  if (!dateMatch || !phoneMatch) return null;

  const sentAt = parseHistoryDate(dateMatch[0]);
  const contactPhone = normalizeBrazilianPhone(phoneMatch[0]);
  if (!sentAt || !contactPhone) return null;

  const withoutDate = line.replace(dateMatch[0], "");
  const withoutPhone = withoutDate.replace(phoneMatch[0], "");
  const remainder = normalizeRemainder(withoutPhone);
  const colonIndex = remainder.indexOf(":");

  if (colonIndex === -1) return null;

  const beforeMessage = normalizeRemainder(remainder.slice(0, colonIndex));
  const content = sanitizeMessage(remainder.slice(colonIndex + 1));
  if (!content) return null;

  const names = beforeMessage
    .split(/\s+-\s+|\s+;\s+|\s+\|\s+/)
    .map((part) => sanitizeMessage(part))
    .filter(Boolean);
  const senderName = names[0];
  const contactName = names.length > 1 ? names[names.length - 1] : undefined;

  return buildMessage({
    lineNumber,
    contactPhone,
    contactName,
    senderName,
    senderType: inferSenderType(senderName, contactName),
    content,
    sentAt
  });
}

export function parseHistoryLine(line: string, lineNumber: number) {
  const sanitizedLine = sanitizeMessage(line);
  if (!sanitizedLine) return null;
  return parseJsonLine(sanitizedLine, lineNumber) ?? parseTextLine(sanitizedLine, lineNumber);
}

function parseExportRecord(lines: string[], lineNumber: number) {
  const firstLine = lines[0] ?? "";
  const dateMatch = firstLine.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[-+]\d{2}:?\d{2})?/);
  const phoneMatch = firstLine.match(/^\s*(\d{10,15})\b/);

  if (!dateMatch || !phoneMatch) {
    return null;
  }

  const contactPhone = normalizeBrazilianPhone(phoneMatch[1]);
  const sentAt = parseHistoryDate(dateMatch[0]);
  if (!contactPhone || !sentAt) {
    return null;
  }

  const beforeDate = firstLine.slice(phoneMatch[0].length, dateMatch.index).trim();
  const afterDate = firstLine.slice((dateMatch.index ?? 0) + dateMatch[0].length);
  const metadataParts = beforeDate.split(/\s{2,}/).map((part) => sanitizeMessage(part)).filter(Boolean);
  const contactName = metadataParts[0];
  const senderName = metadataParts.slice(1).join(" ") || undefined;
  const firstMessageLine = afterDate.replace(/^\s+/, "");
  const content = sanitizeMessage([firstMessageLine, ...lines.slice(1)].join("\n"));

  if (!content) {
    return {
      error: "Mensagem vazia."
    } as const;
  }

  return buildMessage({
    lineNumber,
    contactPhone,
    contactName,
    senderName,
    senderType: inferSenderType(senderName, contactName),
    content,
    sentAt
  });
}

function isExportHeader(line: string) {
  return /n[uú]mero\/grupo/i.test(line) && /contato/i.test(line) && /autor/i.test(line) && /mensagem/i.test(line);
}

function startsExportRecord(line: string) {
  return /^\s*\d{10,15}\b/.test(line) && /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(line);
}

export function parseHistoryContent(content: string) {
  const lines = content.split(/\r?\n/);
  const messages: ParsedHistoryMessage[] = [];
  const rejected: RejectedHistoryLine[] = [];
  let currentRecord: { lineNumber: number; lines: string[] } | null = null;

  function flushCurrentRecord() {
    if (!currentRecord) return;

    const parsed = parseExportRecord(currentRecord.lines, currentRecord.lineNumber);
    if (parsed && "contentHash" in parsed) {
      messages.push(parsed);
    } else {
      rejected.push({
        lineNumber: currentRecord.lineNumber,
        content: currentRecord.lines.join("\n").slice(0, 5000),
        reason: parsed?.error ?? "Registro tabular sem telefone, data/hora ou mensagem reconhecivel."
      });
    }

    currentRecord = null;
  }

  for (const [index, line] of lines.entries()) {
    const lineNumber = index + 1;

    if (!currentRecord && isExportHeader(line)) {
      continue;
    }

    if (startsExportRecord(line)) {
      flushCurrentRecord();
      currentRecord = { lineNumber, lines: [line] };
      continue;
    }

    if (currentRecord) {
      currentRecord.lines.push(line);
      continue;
    }

    if (!line.trim()) {
      continue;
    }

    const parsedLine = parseHistoryLine(line, lineNumber);
    if (parsedLine) {
      messages.push(parsedLine);
    } else {
      rejected.push({
        lineNumber,
        content: line.slice(0, 5000),
        reason: "Linha sem telefone, data/hora ou mensagem reconhecivel."
      });
    }
  }

  flushCurrentRecord();

  return { messages, rejected };
}

export function groupMessagesByConversation(messages: ParsedHistoryMessage[]) {
  const sorted = [...messages].sort((a, b) => {
    const phoneCompare = a.contactPhone.localeCompare(b.contactPhone);
    if (phoneCompare !== 0) return phoneCompare;
    return a.sentAt.getTime() - b.sentAt.getTime();
  });

  const groups: ParsedHistoryMessage[][] = [];

  for (const message of sorted) {
    const currentGroup = groups[groups.length - 1];
    const previousMessage = currentGroup?.[currentGroup.length - 1];
    const startsNewConversation =
      !currentGroup ||
      previousMessage.contactPhone !== message.contactPhone ||
      message.sentAt.getTime() - previousMessage.sentAt.getTime() > DAY_MS;

    if (startsNewConversation) {
      groups.push([message]);
    } else {
      currentGroup.push(message);
    }
  }

  return groups;
}
