-- CreateEnum
CREATE TYPE "ReminderPeriodo" AS ENUM ('mattina', 'pomeriggio', 'sera', 'tutto_il_giorno');

-- CreateEnum
CREATE TYPE "ReminderAzione" AS ENUM ('chiama', 'scrivi_mail', 'verifica', 'conferma', 'controlla', 'altro');

-- CreateEnum
CREATE TYPE "ReminderPriorita" AS ENUM ('alta', 'media', 'bassa');

-- CreateEnum
CREATE TYPE "ReminderCondizioneTipo" AS ENUM ('sempre', 'se_risponde_mail', 'se_non_risponde_mail', 'manuale');

-- CreateEnum
CREATE TYPE "ReminderStatus" AS ENUM ('attivo', 'completato', 'annullato', 'sospeso');

-- CreateTable
CREATE TABLE "reminders" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "titolo" TEXT NOT NULL,
    "descrizione" TEXT,
    "contatto" TEXT,
    "scadenzaTesto" TEXT,
    "scadenzaDatetime" TIMESTAMP(3),
    "periodo" "ReminderPeriodo",
    "azione" "ReminderAzione" NOT NULL DEFAULT 'altro',
    "priorita" "ReminderPriorita" NOT NULL DEFAULT 'media',
    "condizioneTipo" "ReminderCondizioneTipo" NOT NULL DEFAULT 'sempre',
    "condizioneDettaglio" TEXT,
    "monitoraEmail" BOOLEAN NOT NULL DEFAULT false,
    "emailKeywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "emailMittente" TEXT,
    "emailRilevata" BOOLEAN NOT NULL DEFAULT false,
    "emailRilevataAt" TIMESTAMP(3),
    "messaggioTelegram" TEXT,
    "telegramInviato" BOOLEAN NOT NULL DEFAULT false,
    "telegramInviatoAt" TIMESTAMP(3),
    "status" "ReminderStatus" NOT NULL DEFAULT 'attivo',
    "completatoAt" TIMESTAMP(3),
    "inputUtente" TEXT,
    "aiRawResponse" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reminders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "telegram_settings" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "telegramChatId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "slotMattina" TEXT NOT NULL DEFAULT '08:30',
    "slotPomeriggio" TEXT NOT NULL DEFAULT '14:00',
    "slotSera" TEXT NOT NULL DEFAULT '18:00',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "telegram_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "telegram_logs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reminderIds" TEXT[],
    "slot" TEXT NOT NULL,
    "messaggioCompleto" TEXT NOT NULL,
    "inviatoAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isError" BOOLEAN NOT NULL DEFAULT false,
    "errorMessage" TEXT,

    CONSTRAINT "telegram_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reminders_tenantId_idx" ON "reminders"("tenantId");

-- CreateIndex
CREATE INDEX "reminders_tenantId_userId_status_idx" ON "reminders"("tenantId", "userId", "status");

-- CreateIndex
CREATE INDEX "reminders_tenantId_monitoraEmail_status_idx" ON "reminders"("tenantId", "monitoraEmail", "status");

-- CreateIndex
CREATE INDEX "reminders_scadenzaDatetime_idx" ON "reminders"("scadenzaDatetime");

-- CreateIndex
CREATE UNIQUE INDEX "telegram_settings_userId_key" ON "telegram_settings"("userId");

-- CreateIndex
CREATE INDEX "telegram_settings_tenantId_idx" ON "telegram_settings"("tenantId");

-- CreateIndex
CREATE INDEX "telegram_logs_tenantId_userId_idx" ON "telegram_logs"("tenantId", "userId");

-- CreateIndex
CREATE INDEX "telegram_logs_tenantId_inviatoAt_idx" ON "telegram_logs"("tenantId", "inviatoAt");

-- AddForeignKey
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telegram_settings" ADD CONSTRAINT "telegram_settings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telegram_logs" ADD CONSTRAINT "telegram_logs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telegram_logs" ADD CONSTRAINT "telegram_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
