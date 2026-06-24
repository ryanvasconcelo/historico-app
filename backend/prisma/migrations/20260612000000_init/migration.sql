CREATE TABLE "legacy_conversations" (
  "id" TEXT NOT NULL,
  "contactPhone" TEXT NOT NULL,
  "contactName" TEXT,
  "startedAt" TIMESTAMP(3),
  "endedAt" TIMESTAMP(3),
  "source" TEXT,
  "messageCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "legacy_conversations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "legacy_messages" (
  "id" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "senderName" TEXT,
  "senderType" TEXT,
  "content" TEXT NOT NULL,
  "sentAt" TIMESTAMP(3),
  "contentHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "legacy_messages_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "import_batches" (
  "id" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "totalMessages" INTEGER NOT NULL DEFAULT 0,
  "totalConversations" INTEGER NOT NULL DEFAULT 0,
  "totalRejected" INTEGER NOT NULL DEFAULT 0,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "import_batches_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "import_rejected_lines" (
  "id" TEXT NOT NULL,
  "batchId" TEXT NOT NULL,
  "lineNumber" INTEGER,
  "content" TEXT NOT NULL,
  "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "import_rejected_lines_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "legacy_messages_contentHash_key" ON "legacy_messages"("contentHash");
CREATE INDEX "legacy_conversations_contactPhone_idx" ON "legacy_conversations"("contactPhone");
CREATE INDEX "legacy_conversations_endedAt_idx" ON "legacy_conversations"("endedAt");
CREATE INDEX "legacy_messages_conversationId_idx" ON "legacy_messages"("conversationId");
CREATE INDEX "legacy_messages_sentAt_idx" ON "legacy_messages"("sentAt");
CREATE INDEX "import_rejected_lines_batchId_idx" ON "import_rejected_lines"("batchId");

ALTER TABLE "legacy_messages" ADD CONSTRAINT "legacy_messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "legacy_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
