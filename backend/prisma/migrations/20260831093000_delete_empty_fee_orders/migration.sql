-- Empty fee orders are not meaningful records and must not be archived.
-- The NOT EXISTS condition makes this safe to run against any existing data.
DELETE FROM "fee_orders" AS fee_order
WHERE NOT EXISTS (
  SELECT 1
  FROM "fee_invoices" AS invoice
  WHERE invoice."feeOrderId" = fee_order."id"
);