-- Fase 5b — Notifikasi full trigger + WhatsApp outbox.
-- whatsapp_outbox: antrean pesan WA keluar (PENDING -> SENT/FAILED lewat
--   interface WhatsAppProvider; provider dipilih via env, default log-only).
--   UNIQUE(eventType+referenceType+referenceId+recipientPhone) = dedupe guard.
-- notification_preferences."whatsAppEnabled": opt-out WA per user.
-- exams."resultsNotifiedAt": flag notif "hasil ujian rilis" sudah dikirim
--   (rilis mengikuti scheduled_end_at, dicek berkala oleh worker).

CREATE TYPE "WhatsAppOutboxStatus" AS ENUM (
    'PENDING',
    'SENT',
    'FAILED'
);

CREATE TABLE "whatsapp_outbox" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "recipientPhone" TEXT NOT NULL,
    "recipientName" TEXT,
    "eventType" VARCHAR(60) NOT NULL,
    "referenceType" VARCHAR(40),
    "referenceId" TEXT,
    "message" TEXT NOT NULL,
    "status" "WhatsAppOutboxStatus" NOT NULL DEFAULT 'PENDING',
    "provider" VARCHAR(40),
    "providerRef" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_outbox_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "whatsapp_outbox_eventType_referenceType_referenceId_recipientPhone_key" ON "whatsapp_outbox"("eventType", "referenceType", "referenceId", "recipientPhone");
CREATE INDEX "whatsapp_outbox_status_createdAt_idx" ON "whatsapp_outbox"("status", "createdAt");
CREATE INDEX "whatsapp_outbox_userId_idx" ON "whatsapp_outbox"("userId");

ALTER TABLE "whatsapp_outbox" ADD CONSTRAINT "whatsapp_outbox_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "notification_preferences" ADD COLUMN "whatsAppEnabled" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "exams" ADD COLUMN "resultsNotifiedAt" TIMESTAMP(3);
