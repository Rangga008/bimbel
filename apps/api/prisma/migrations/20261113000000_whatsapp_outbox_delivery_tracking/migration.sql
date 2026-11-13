-- Tracking status pengiriman provider (Fonnte): respons mentah + cek berkala.
ALTER TABLE "whatsapp_outbox"
  ADD COLUMN "providerResponse" TEXT,
  ADD COLUMN "deliveryStatus" VARCHAR(20),
  ADD COLUMN "deliveryCheckedAt" TIMESTAMP(3);
