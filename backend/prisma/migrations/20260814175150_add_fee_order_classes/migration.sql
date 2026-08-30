-- CreateTable
CREATE TABLE "fee_order_classes" (
    "feeOrderId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,

    CONSTRAINT "fee_order_classes_pkey" PRIMARY KEY ("feeOrderId","classId")
);

-- AddForeignKey
ALTER TABLE "fee_order_classes" ADD CONSTRAINT "fee_order_classes_feeOrderId_fkey" FOREIGN KEY ("feeOrderId") REFERENCES "fee_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_order_classes" ADD CONSTRAINT "fee_order_classes_classId_fkey" FOREIGN KEY ("classId") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
