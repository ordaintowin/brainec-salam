-- Normalize legacy invoice values from payment rows and current student state.
-- This is intentionally idempotent so it repairs data created before the
-- source-of-truth finance rules were introduced.

WITH payment_totals AS (
  SELECT
    "invoiceId",
    SUM(GREATEST(0, amount::numeric)) AS payment_total,
    COUNT(*) AS payment_count
  FROM "payments"
  GROUP BY "invoiceId"
),
ledger AS (
  SELECT
    invoice.id,
    CASE
      WHEN COALESCE(payment_totals.payment_count, 0) > 0
        THEN payment_totals.payment_total
      ELSE GREATEST(0, invoice."amountPaid"::numeric)
    END AS amount_paid,
    GREATEST(
      0,
      invoice."amountDue"::numeric - CASE
        WHEN COALESCE(payment_totals.payment_count, 0) > 0
          THEN payment_totals.payment_total
        ELSE GREATEST(0, invoice."amountPaid"::numeric)
      END
    ) AS balance
  FROM "fee_invoices" AS invoice
  LEFT JOIN payment_totals
    ON payment_totals."invoiceId" = invoice.id
)
UPDATE "fee_invoices" AS invoice
SET
  "amountPaid" = ledger.amount_paid,
  "balance" = ledger.balance,
  "status" = CASE
    WHEN ledger.balance <= 0.001 THEN 'PAID'::"PaymentStatus"
    WHEN invoice."dueDate" < CURRENT_TIMESTAMP THEN 'OVERDUE'::"PaymentStatus"
    WHEN ledger.amount_paid > 0.001 THEN 'PARTIAL'::"PaymentStatus"
    ELSE 'PENDING'::"PaymentStatus"
  END
FROM ledger
WHERE invoice.id = ledger.id;

-- Keep the legacy flag useful for the cancellation workflow, but do not use
-- it as the visibility source of truth. It must reflect current student state.
UPDATE "fee_invoices" AS invoice
SET "isArchivedDebt" = (
  student."isArchived" = TRUE
  AND invoice.balance > 0.001
  AND invoice."debtCancelledAt" IS NULL
)
FROM "students" AS student
WHERE invoice."studentId" = student.id;

-- Empty orders are deleted permanently, never archived.
DELETE FROM "fee_orders" AS fee_order
WHERE NOT EXISTS (
  SELECT 1
  FROM "fee_invoices" AS invoice
  WHERE invoice."feeOrderId" = fee_order.id
);

-- An order is active only when it has an outstanding invoice for an active
-- student. Historical orders with only paid/cancelled/archived-student
-- invoices remain available in Archives.
WITH payment_totals AS (
  SELECT
    "invoiceId",
    SUM(GREATEST(0, amount::numeric)) AS payment_total,
    COUNT(*) AS payment_count
  FROM "payments"
  GROUP BY "invoiceId"
),
active_outstanding AS (
  SELECT
    invoice."feeOrderId",
    BOOL_OR(
      student."isArchived" = FALSE
      AND invoice."debtCancelledAt" IS NULL
      AND GREATEST(
        0,
        invoice."amountDue"::numeric - CASE
          WHEN COALESCE(payment_totals.payment_count, 0) > 0
            THEN payment_totals.payment_total
          ELSE GREATEST(0, invoice."amountPaid"::numeric)
        END
      ) > 0.001
    ) AS has_outstanding
  FROM "fee_invoices" AS invoice
  JOIN "students" AS student ON student.id = invoice."studentId"
  LEFT JOIN payment_totals
    ON payment_totals."invoiceId" = invoice.id
  GROUP BY invoice."feeOrderId"
)
UPDATE "fee_orders" AS fee_order
SET
  "isArchived" = NOT active_outstanding.has_outstanding,
  "archivedAt" = CASE
    WHEN active_outstanding.has_outstanding THEN NULL
    ELSE COALESCE(fee_order."archivedAt", CURRENT_TIMESTAMP)
  END
FROM active_outstanding
WHERE fee_order.id = active_outstanding."feeOrderId";