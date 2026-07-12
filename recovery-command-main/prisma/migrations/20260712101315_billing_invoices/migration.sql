-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'ISSUED', 'PAID', 'DISPUTED');

-- CreateTable
CREATE TABLE "BillingAgreement" (
    "id" TEXT NOT NULL,
    "bankId" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "commissionPct" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingAgreement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "bankId" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "periodYear" INTEGER NOT NULL,
    "periodMonth" INTEGER NOT NULL,
    "commissionPct" INTEGER NOT NULL,
    "baseAmountUSD" INTEGER NOT NULL,
    "amountUSD" INTEGER NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "issuedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "disputedAt" TIMESTAMP(3),
    "disputeReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceLine" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "caseCode" TEXT NOT NULL,
    "recoveredUSD" INTEGER NOT NULL,
    "commissionUSD" INTEGER NOT NULL,

    CONSTRAINT "InvoiceLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BillingAgreement_bankId_agencyId_key" ON "BillingAgreement"("bankId", "agencyId");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_number_key" ON "Invoice"("number");

-- CreateIndex
CREATE INDEX "Invoice_agencyId_idx" ON "Invoice"("agencyId");

-- CreateIndex
CREATE INDEX "Invoice_bankId_idx" ON "Invoice"("bankId");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_bankId_agencyId_periodYear_periodMonth_key" ON "Invoice"("bankId", "agencyId", "periodYear", "periodMonth");

-- CreateIndex
CREATE INDEX "InvoiceLine_invoiceId_idx" ON "InvoiceLine"("invoiceId");

-- AddForeignKey
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
