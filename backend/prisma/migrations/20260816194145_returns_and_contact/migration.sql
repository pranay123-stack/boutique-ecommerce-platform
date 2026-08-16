-- CreateEnum
CREATE TYPE "ReturnStatus" AS ENUM ('REQUESTED', 'APPROVED', 'REJECTED', 'PICKUP_SCHEDULED', 'IN_TRANSIT', 'RECEIVED', 'INSPECTED', 'REFUNDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ReturnResolution" AS ENUM ('REFUND', 'EXCHANGE');

-- CreateEnum
CREATE TYPE "ContactStatus" AS ENUM ('NEW', 'IN_PROGRESS', 'RESOLVED', 'SPAM');

-- DropIndex
DROP INDEX "invoices_series_lookup";

-- AlterTable
-- removed by scripts/clean-migration.mjs: searchVector is a generated column; its default cannot be set or dropped

-- CreateTable
CREATE TABLE "return_requests" (
    "id" TEXT NOT NULL,
    "rmaNumber" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "userId" TEXT,
    "guestEmail" TEXT,
    "status" "ReturnStatus" NOT NULL DEFAULT 'REQUESTED',
    "resolution" "ReturnResolution" NOT NULL DEFAULT 'REFUND',
    "reason" TEXT NOT NULL,
    "customerNote" TEXT,
    "staffNote" TEXT,
    "refundAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "refundId" TEXT,
    "pickupScheduledAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3),
    "inspectedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "return_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "return_items" (
    "id" TEXT NOT NULL,
    "returnRequestId" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "reason" TEXT,
    "restockable" BOOLEAN,
    "refundAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,

    CONSTRAINT "return_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact_messages" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "orderNumber" TEXT,
    "subject" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" "ContactStatus" NOT NULL DEFAULT 'NEW',
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "handledByUserId" TEXT,
    "handledAt" TIMESTAMP(3),
    "staffNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contact_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "return_requests_rmaNumber_key" ON "return_requests"("rmaNumber");

-- CreateIndex
CREATE INDEX "return_requests_orderId_idx" ON "return_requests"("orderId");

-- CreateIndex
CREATE INDEX "return_requests_userId_createdAt_idx" ON "return_requests"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "return_requests_status_idx" ON "return_requests"("status");

-- CreateIndex
CREATE INDEX "return_requests_guestEmail_idx" ON "return_requests"("guestEmail");

-- CreateIndex
CREATE INDEX "return_items_returnRequestId_idx" ON "return_items"("returnRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "return_items_returnRequestId_orderItemId_key" ON "return_items"("returnRequestId", "orderItemId");

-- CreateIndex
CREATE INDEX "contact_messages_status_createdAt_idx" ON "contact_messages"("status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "contact_messages_email_idx" ON "contact_messages"("email");

-- AddForeignKey
ALTER TABLE "return_requests" ADD CONSTRAINT "return_requests_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_requests" ADD CONSTRAINT "return_requests_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_items" ADD CONSTRAINT "return_items_returnRequestId_fkey" FOREIGN KEY ("returnRequestId") REFERENCES "return_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_items" ADD CONSTRAINT "return_items_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "order_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Integrity guards. Application code enforces these too; the database is the
-- line that holds when a migration script, a console session or a future
-- refactor forgets to.
-- ---------------------------------------------------------------------------

ALTER TABLE "return_requests"
    ADD CONSTRAINT "return_requests_refund_non_negative" CHECK ("refundAmount" >= 0),
    -- A return belongs to someone: a signed-in customer, or a guest we can email.
    ADD CONSTRAINT "return_requests_identity_present" CHECK ("userId" IS NOT NULL OR "guestEmail" IS NOT NULL);

ALTER TABLE "return_items"
    ADD CONSTRAINT "return_items_quantity_positive" CHECK ("quantity" > 0),
    ADD CONSTRAINT "return_items_refund_non_negative" CHECK ("refundAmount" >= 0);

-- Only one open return per order at a time. Two concurrent requests would each
-- price the full refund, and could pay out twice.
CREATE UNIQUE INDEX "return_requests_one_open_per_order"
    ON "return_requests"("orderId")
    WHERE "status" NOT IN ('REJECTED', 'CANCELLED', 'REFUNDED');
