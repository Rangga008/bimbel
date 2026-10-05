-- Fase 6 — Pengaturan aplikasi (key-value JSON).
-- Dipakai untuk identitas bimbel (header laporan/kwitansi), default keuangan
-- (jatuh tempo invoice), dan konfigurasi notifikasi otomatis WhatsApp.
-- Daftar key valid dijaga di SettingsService (SETTING_DEFS).
CREATE TABLE "app_settings" (
    "key" VARCHAR(60) NOT NULL,
    "value" JSONB NOT NULL,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_settings_pkey" PRIMARY KEY ("key")
);

ALTER TABLE "app_settings"
    ADD CONSTRAINT "app_settings_updatedBy_fkey"
    FOREIGN KEY ("updatedBy") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
