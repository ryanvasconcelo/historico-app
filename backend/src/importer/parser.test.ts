import { describe, expect, it } from "vitest";
import { groupMessagesByConversation, parseHistoryContent, parseHistoryLine } from "./parser.js";

describe("parseHistoryLine", () => {
  it("extracts date, author, phone, contact and message from a text line", () => {
    const parsed = parseHistoryLine(
      "15/01/2026 10:30 - Atendente Ana - +55 (92) 99999-9999 - Maria Silva: Ola, preciso de ajuda",
      1
    );

    expect(parsed).toMatchObject({
      lineNumber: 1,
      contactPhone: "5592999999999",
      contactName: "Maria Silva",
      senderName: "Atendente Ana",
      senderType: "agent",
      content: "Ola, preciso de ajuda"
    });
    expect(parsed?.sentAt?.toISOString()).toBe("2026-01-15T14:30:00.000Z");
  });

  it("returns null when line has no usable date, phone or message", () => {
    expect(parseHistoryLine("linha quebrada sem dados suficientes", 9)).toBeNull();
  });
});

describe("groupMessagesByConversation", () => {
  it("creates a new conversation after a gap greater than 24 hours for the same phone", () => {
    const base = {
      lineNumber: 1,
      contactPhone: "5592999999999",
      contactName: "Maria",
      senderName: "Maria",
      senderType: "contact",
      content: "Oi",
      contentHash: "a"
    };

    const groups = groupMessagesByConversation([
      { ...base, sentAt: new Date("2026-01-01T10:00:00.000Z"), contentHash: "a" },
      { ...base, sentAt: new Date("2026-01-02T09:59:00.000Z"), content: "Ainda aqui", contentHash: "b" },
      { ...base, sentAt: new Date("2026-01-03T10:01:00.000Z"), content: "Novo atendimento", contentHash: "c" }
    ]);

    expect(groups).toHaveLength(2);
    expect(groups[0]).toHaveLength(2);
    expect(groups[1][0].content).toBe("Novo atendimento");
  });
});

describe("parseHistoryContent", () => {
  it("parses fixed-width exported records with multiline messages", () => {
    const content = [
      "Numero/Grupo         Contato                                  Autor                                    Data                      Mensagem",
      "5592991175670        Maria Silva                              Gisele Felix- Dpto Pessoal               2024-01-19T19:37:57.741Z  Primeira linha",
      "",
      "Segunda linha da mesma mensagem",
      "5592999999999        Joao Souza                               Cliente                                  2024-01-20T12:00:00.000Z  Oi"
    ].join("\n");

    const result = parseHistoryContent(content);

    expect(result.rejected).toHaveLength(0);
    expect(result.messages).toHaveLength(2);
    expect(result.messages[0]).toMatchObject({
      contactPhone: "5592991175670",
      contactName: "Maria Silva",
      senderName: "Gisele Felix- Dpto Pessoal",
      senderType: "agent",
      content: "Primeira linha\n\nSegunda linha da mesma mensagem"
    });
  });
});
