-- CreateEnum
CREATE TYPE "FeeOrderType" AS ENUM ('CLASS', 'INDIVIDUAL', 'ALL');

-- AlterTable
ALTER TABLE "fee_orders" ADD COLUMN "type" "FeeOrderType" NOT NULL DEFAULT 'ALL';
