import { Router } from "express";
import { displayPhone, normalizeBrazilianPhone } from "../lib/phone.js";
import { prisma } from "../lib/prisma.js";

const router = Router();

router.get("/", async (req, res) => {
  const query = String(req.query.phone || req.query.query || "").trim();
  const contactPhone = normalizeBrazilianPhone(query);

  const where: any = {};
  if (query) {
    if (contactPhone) {
      where.contactPhone = { contains: contactPhone };
    } else {
      where.contactName = { contains: query, mode: "insensitive" };
    }
  }

  try {
    const [total, conversations] = await Promise.all([
      prisma.legacyConversation.count({ where }),
      prisma.legacyConversation.findMany({
        where,
        orderBy: [
          { contactName: "asc" },
          { contactPhone: "asc" },
          { endedAt: "desc" },
          { createdAt: "desc" }
        ],
        take: 100
      })
    ]);

    return res.json({
      phone: query,
      phoneDisplay: query || "Todos os clientes",
      total,
      lastAttendanceAt: conversations.length > 0 ? conversations[0]?.endedAt : null,
      conversations: conversations.map((conversation) => ({
        id: conversation.id,
        contactPhone: conversation.contactPhone,
        contactName: conversation.contactName,
        phoneDisplay: displayPhone(conversation.contactPhone),
        startedAt: conversation.startedAt,
        endedAt: conversation.endedAt,
        source: conversation.source,
        messageCount: conversation.messageCount
      }))
    });
  } catch (error) {
    console.error("Error fetching conversations:", error);
    return res.status(500).json({ message: "Erro interno ao buscar conversas." });
  }
});

router.get("/conversations/:id", async (req, res) => {
  try {
    const conversation = await prisma.legacyConversation.findUnique({
      where: { id: req.params.id },
      include: {
        messages: {
          orderBy: [{ sentAt: "asc" }, { createdAt: "asc" }]
        }
      }
    });

    if (!conversation) {
      return res.status(404).json({ message: "Conversa nao encontrada." });
    }

    return res.json({
      conversation: {
        id: conversation.id,
        contactPhone: conversation.contactPhone,
        contactName: conversation.contactName,
        phoneDisplay: displayPhone(conversation.contactPhone),
        startedAt: conversation.startedAt,
        endedAt: conversation.endedAt,
        source: conversation.source,
        messageCount: conversation.messageCount,
        messages: conversation.messages.map((message) => ({
          id: message.id,
          senderName: message.senderName,
          senderType: message.senderType,
          content: message.content,
          sentAt: message.sentAt
        }))
      }
    });
  } catch (error) {
    console.error("Error fetching conversation details:", error);
    return res.status(500).json({ message: "Erro interno ao buscar os detalhes da conversa." });
  }
});

export const historyRouter = router;
