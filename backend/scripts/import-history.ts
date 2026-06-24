import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import crypto from "node:crypto";
import AdmZip from "adm-zip";
import { prisma } from "../src/lib/prisma.js";
import { groupMessagesByConversation, parseHistoryContent, type ParsedHistoryMessage } from "../src/importer/parser.js";

type ImportInput = {
  fileName: string;
  content: string;
};

const inputPath = process.argv[2];

if (!inputPath) {
  console.error("Uso: npm run import:history -- ./arquivo.txt|./arquivo.zip");
  process.exit(1);
}

function readInput(filePath: string): ImportInput {
  const absolutePath = path.resolve(filePath);
  const extension = path.extname(absolutePath).toLowerCase();

  if (extension === ".txt") {
    return {
      fileName: path.basename(absolutePath),
      content: fs.readFileSync(absolutePath, "utf8")
    };
  }

  if (extension === ".zip") {
    try {
      const zip = new AdmZip(absolutePath);
      const txtEntry = zip
        .getEntries()
        .find((entry) => !entry.isDirectory && entry.entryName.toLowerCase().endsWith(".txt"));

      if (!txtEntry) {
        throw new Error("ZIP nao contem arquivo .txt.");
      }

      return {
        fileName: `${path.basename(absolutePath)}:${txtEntry.entryName}`,
        content: txtEntry.getData().toString("utf8")
      };
    } catch (error) {
      try {
        return {
          fileName: path.basename(absolutePath),
          content: zlib.gunzipSync(fs.readFileSync(absolutePath)).toString("utf8")
        };
      } catch {
        throw error;
      }
    }
  }

  throw new Error("Arquivo deve ser .txt ou .zip.");
}

async function refreshConversationStats(conversationId: string) {
  const [aggregate, total] = await Promise.all([
    prisma.legacyMessage.aggregate({
      where: { conversationId },
      _min: { sentAt: true },
      _max: { sentAt: true }
    }),
    prisma.legacyMessage.count({
      where: { conversationId }
    })
  ]);

  await prisma.legacyConversation.update({
    where: { id: conversationId },
    data: {
      startedAt: aggregate._min.sentAt,
      endedAt: aggregate._max.sentAt,
      messageCount: total
    }
  });
}

async function main() {
  const input = readInput(inputPath);
  const batch = await prisma.importBatch.create({
    data: {
      fileName: input.fileName,
      status: "RUNNING"
    }
  });

  try {
    const totalLines = input.content.split(/\r?\n/).length;
    console.log("Parseando conteudo do historico...");
    const parsedContent = parseHistoryContent(input.content);
    const parsed = parsedContent.messages;
    const rejected = parsedContent.rejected.map((line) => ({
      batchId: batch.id,
      lineNumber: line.lineNumber,
      content: line.content,
      reason: line.reason
    }));

    if (rejected.length > 0) {
      console.log(`Gravando ${rejected.length} linhas rejeitadas...`);
      const chunkRejectedSize = 2000;
      for (let i = 0; i < rejected.length; i += chunkRejectedSize) {
        await prisma.importRejectedLine.createMany({
          data: rejected.slice(i, i + chunkRejectedSize)
        });
      }
    }

    console.log("Agrupando mensagens por conversa...");
    const groups = groupMessagesByConversation(parsed);
    console.log(`Total de conversas encontradas no arquivo: ${groups.length}`);

    // Pre-carregar hashes de mensagens existentes para descobrir quais conversas ja existem
    console.log("Coletando hashes de mensagens para verificacao de duplicidade...");
    const allHashes = parsed.map(m => m.contentHash);
    const hashToConversationId = new Map<string, string>();
    
    const hashChunkSize = 20000;
    for (let i = 0; i < allHashes.length; i += hashChunkSize) {
      const chunk = allHashes.slice(i, i + hashChunkSize);
      const existing = await prisma.legacyMessage.findMany({
        where: {
          contentHash: { in: chunk }
        },
        select: {
          contentHash: true,
          conversationId: true
        }
      });
      for (const item of existing) {
        hashToConversationId.set(item.contentHash, item.conversationId);
      }
    }
    console.log(`Encontradas ${hashToConversationId.size} mensagens ja existentes no banco de dados.`);

    const conversationsToCreate: any[] = [];
    const conversationsToUpdate = new Set<string>();
    const messagesToCreate: any[] = [];
    
    let totalConversationsCreated = 0;

    for (const group of groups) {
      let conversationId: string | null = null;
      
      // Procurar se alguma das mensagens do grupo ja existe e aponta para uma conversa
      for (const msg of group) {
        if (hashToConversationId.has(msg.contentHash)) {
          conversationId = hashToConversationId.get(msg.contentHash)!;
          break;
        }
      }

      if (!conversationId) {
        // Criar nova conversa em memoria
        const newId = crypto.randomUUID();
        conversationId = newId;
        totalConversationsCreated += 1;

        conversationsToCreate.push({
          id: newId,
          contactPhone: group[0].contactPhone,
          contactName: group[0].contactName,
          startedAt: group[0].sentAt,
          endedAt: group[group.length - 1].sentAt,
          source: input.fileName,
          messageCount: group.length
        });
      } else {
        conversationsToUpdate.add(conversationId);
      }

      // Adicionar apenas as mensagens que nao estao no banco
      const newMessagesInGroup = group.filter(msg => !hashToConversationId.has(msg.contentHash));
      for (const msg of newMessagesInGroup) {
        messagesToCreate.push({
          conversationId,
          senderName: msg.senderName,
          senderType: msg.senderType,
          content: msg.content,
          sentAt: msg.sentAt,
          contentHash: msg.contentHash
        });
      }
    }

    if (conversationsToCreate.length > 0) {
      console.log(`Inserindo ${conversationsToCreate.length} novas conversas...`);
      const convChunkSize = 2000;
      for (let i = 0; i < conversationsToCreate.length; i += convChunkSize) {
        await prisma.legacyConversation.createMany({
          data: conversationsToCreate.slice(i, i + convChunkSize),
          skipDuplicates: true
        });
      }
    }

    let totalInsertedMessages = 0;
    if (messagesToCreate.length > 0) {
      console.log(`Inserindo ${messagesToCreate.length} novas mensagens...`);
      const msgChunkSize = 5000;
      for (let i = 0; i < messagesToCreate.length; i += msgChunkSize) {
        const chunk = messagesToCreate.slice(i, i + msgChunkSize);
        const created = await prisma.legacyMessage.createMany({
          data: chunk,
          skipDuplicates: true
        });
        totalInsertedMessages += created.count;
      }
    }

    // Atualizar stats de conversas existentes que receberam novas mensagens
    if (conversationsToUpdate.size > 0) {
      console.log(`Atualizando estatisticas de ${conversationsToUpdate.size} conversas existentes...`);
      for (const id of conversationsToUpdate) {
        await refreshConversationStats(id);
      }
    }

    await prisma.importBatch.update({
      where: { id: batch.id },
      data: {
        status: "COMPLETED",
        totalMessages: totalInsertedMessages,
        totalConversations: totalConversationsCreated,
        totalRejected: rejected.length,
        finishedAt: new Date()
      }
    });

    console.log("Importacao concluida com sucesso!");
    console.log(`Arquivo: ${input.fileName}`);
    console.log(`Linhas lidas: ${totalLines}`);
    console.log(`Mensagens novas: ${totalInsertedMessages}`);
    console.log(`Conversas criadas: ${totalConversationsCreated}`);
    console.log(`Linhas rejeitadas: ${rejected.length}`);
    console.log(`Lote: ${batch.id}`);
  } catch (error) {
    console.error("Erro na importacao:", error);
    await prisma.importBatch.update({
      where: { id: batch.id },
      data: {
        status: "FAILED",
        finishedAt: new Date()
      }
    });
    throw error;
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

