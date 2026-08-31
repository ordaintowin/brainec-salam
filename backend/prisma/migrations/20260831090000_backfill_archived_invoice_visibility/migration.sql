-- Make the archived-student finance rule durable for invoices created before
-- archived-debt tracking was introduced. This is intentionally idempotent.
UPDATE "fee_invoices" AS invoice
SET "isArchivedDebt" = TRUE
FROM "students" AS student
WHERE invoice."studentId" = student."id"
  AND student."isArchived" = TRUE
  AND invoice."debtCancelledAt" IS NULL
  AND invoice."isArchivedDebt" = FALSE;