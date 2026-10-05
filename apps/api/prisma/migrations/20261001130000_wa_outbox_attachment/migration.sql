-- AlterEnum
ALTER TYPE "public"."WhatsAppOutboxStatus" ADD VALUE 'SENDING';

-- AlterTable
ALTER TABLE "public"."whatsapp_outbox" ADD COLUMN     "attachmentAssetId" TEXT,
ADD COLUMN     "attachmentName" TEXT;
