-- DropIndex
DROP INDEX "categories_name_trgm";

-- DropIndex
DROP INDEX "products_name_trgm";

-- DropIndex
DROP INDEX "products_search_vector_gin";

-- AlterTable
ALTER TABLE "order_items" ADD COLUMN     "cgstAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "cgstRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
ADD COLUMN     "gstRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
ADD COLUMN     "hsnCode" TEXT,
ADD COLUMN     "igstAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "igstRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
ADD COLUMN     "sgstAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "sgstRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
ADD COLUMN     "taxableValue" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "cgstTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "codCharge" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "igstTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "isInterState" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "placeOfSupply" TEXT,
ADD COLUMN     "placeOfSupplyCode" TEXT,
ADD COLUMN     "sellerGstin" TEXT,
ADD COLUMN     "sgstTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "taxableTotal" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- AlterTable
-- Prisma also emits  here. Postgres
-- rejects that on a GENERATED column, and this migration does not change it,
-- so only the new column is added.
ALTER TABLE "products" ADD COLUMN "hsnCode" TEXT;

-- CreateTable
CREATE TABLE "invoices" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "series" TEXT NOT NULL DEFAULT 'INV',
    "financialYear" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sellerSnapshot" JSONB NOT NULL,
    "buyerSnapshot" JSONB NOT NULL,
    "placeOfSupply" TEXT,
    "isInterState" BOOLEAN NOT NULL DEFAULT false,
    "taxableTotal" DECIMAL(12,2) NOT NULL,
    "cgstTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "sgstTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "igstTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "roundOff" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "grandTotal" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "invoices_orderId_key" ON "invoices"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_invoiceNumber_key" ON "invoices"("invoiceNumber");

-- CreateIndex
CREATE INDEX "invoices_issuedAt_idx" ON "invoices"("issuedAt");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_financialYear_series_sequence_key" ON "invoices"("financialYear", "series", "sequence");

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ===========================================================================
-- GST integrity. A tax invoice is a legal document; these constraints stop a
-- malformed one from ever reaching the database.
-- ===========================================================================
ALTER TABLE "orders"
    ADD CONSTRAINT "orders_gst_totals_non_negative"
        CHECK ("taxableTotal" >= 0 AND "cgstTotal" >= 0 AND "sgstTotal" >= 0 AND "igstTotal" >= 0),
    -- Intra-state supply is CGST+SGST; inter-state is IGST. Never both.
    ADD CONSTRAINT "orders_gst_split_exclusive"
        CHECK (("igstTotal" = 0) OR ("cgstTotal" = 0 AND "sgstTotal" = 0)),
    -- CGST and SGST are always levied at the same rate, so the amounts match.
    ADD CONSTRAINT "orders_cgst_equals_sgst" CHECK ("cgstTotal" = "sgstTotal"),
    ADD CONSTRAINT "orders_cod_charge_non_negative" CHECK ("codCharge" >= 0);

ALTER TABLE "order_items"
    ADD CONSTRAINT "order_items_gst_non_negative"
        CHECK ("taxableValue" >= 0 AND "cgstAmount" >= 0 AND "sgstAmount" >= 0 AND "igstAmount" >= 0),
    ADD CONSTRAINT "order_items_gst_split_exclusive"
        CHECK (("igstAmount" = 0) OR ("cgstAmount" = 0 AND "sgstAmount" = 0)),
    ADD CONSTRAINT "order_items_gst_rate_valid"
        CHECK ("gstRate" >= 0 AND "gstRate" <= 28);

ALTER TABLE "invoices"
    ADD CONSTRAINT "invoices_totals_non_negative"
        CHECK ("taxableTotal" >= 0 AND "grandTotal" >= 0),
    ADD CONSTRAINT "invoices_sequence_positive" CHECK ("sequence" > 0);

-- Invoice numbering must be gapless per series per financial year; the unique
-- index above enforces no duplicates, this speeds up the next-number lookup.
CREATE INDEX "invoices_series_lookup" ON "invoices"("financialYear", "series", "sequence" DESC);
