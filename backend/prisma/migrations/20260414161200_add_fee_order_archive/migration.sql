-- AlterTable
ALTER TABLE "fee_orders" ADD COLUMN "isArchived" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "fee_orders" ADD COLUMN "archivedAt" TIMESTAMP(3);
