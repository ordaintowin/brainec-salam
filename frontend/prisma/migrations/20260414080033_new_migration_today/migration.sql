-- CreateTable
CREATE TABLE "term_days" (
    "id" TEXT NOT NULL,
    "termId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "isHoliday" BOOLEAN NOT NULL DEFAULT false,
    "label" TEXT,

    CONSTRAINT "term_days_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_attendance_closures" (
    "id" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "closedBy" TEXT NOT NULL,
    "closedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "daily_attendance_closures_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "term_days_termId_date_key" ON "term_days"("termId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "daily_attendance_closures_classId_date_key" ON "daily_attendance_closures"("classId", "date");

-- AddForeignKey
ALTER TABLE "term_days" ADD CONSTRAINT "term_days_termId_fkey" FOREIGN KEY ("termId") REFERENCES "terms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
