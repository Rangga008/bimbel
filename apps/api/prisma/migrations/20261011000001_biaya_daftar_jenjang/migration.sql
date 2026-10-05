-- Biaya pendaftaran dapat di-override per jenjang (brosur: TK 300rb).
ALTER TABLE "levels" ADD COLUMN "registrationFee" DECIMAL(12,2);
