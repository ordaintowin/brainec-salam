ALTER TABLE "fee_invoices"
  ADD COLUMN "isArchivedDebt" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "debtCancelledAt" TIMESTAMP(3),
  ADD COLUMN "debtCancelledBy" TEXT;