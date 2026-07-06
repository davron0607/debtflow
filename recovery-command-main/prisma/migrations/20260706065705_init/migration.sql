-- CreateEnum
CREATE TYPE "OrgType" AS ENUM ('BANK', 'MFO', 'COLLECTOR', 'LEGAL_FIRM');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('BANK_ADMIN', 'BANK_LEGAL', 'COLLECTOR', 'LEGAL_FIRM', 'MANAGER', 'ACCOUNTANT');

-- CreateEnum
CREATE TYPE "CaseStatus" AS ENUM ('NEW', 'ASSIGNED', 'SOFT_COLLECTION', 'CONTACTED', 'NO_CONTACT', 'PROMISE_TO_PAY', 'PROMISE_BROKEN', 'PARTIALLY_PAID', 'PAID', 'DISPUTE', 'RESTRUCTURING_PROPOSED', 'RESTRUCTURED', 'ESCALATED_TO_LEGAL', 'PRE_CLAIM_SENT', 'COURT_PACKAGE_READY', 'FILED_TO_COURT', 'COURT_DECISION_RECEIVED', 'READY_FOR_MIB', 'CLOSED', 'WRITTEN_OFF');

-- CreateEnum
CREATE TYPE "EnforcementRoute" AS ENUM ('NONE', 'NOTARY', 'COURT');

-- CreateEnum
CREATE TYPE "CaseType" AS ENUM ('SECURED', 'UNSECURED');

-- CreateEnum
CREATE TYPE "DocumentKind" AS ENUM ('PRE_CLAIM', 'COURT_PACKAGE', 'CALC', 'MIB_SUBMISSION', 'NOTARY_INSCRIPTION');

-- CreateEnum
CREATE TYPE "PaymentKind" AS ENUM ('FULL', 'PARTIAL', 'PROMISE');

-- CreateEnum
CREATE TYPE "CostKind" AS ENUM ('STORAGE', 'EXPERTISE', 'LEGAL', 'OTHER');

-- CreateEnum
CREATE TYPE "TransferStatus" AS ENUM ('INITIATED', 'MANAGER_APPROVED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "VisitResult" AS ENUM ('CONTACTED', 'NO_CONTACT', 'PROMISE', 'PAYMENT', 'REFUSED');

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "OrgType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "edsOperational" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Debtor" (
    "id" TEXT NOT NULL,
    "pinfl" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "assetProfile" TEXT,
    "accountBalancesUSD" INTEGER,

    CONSTRAINT "Debtor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Case" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "tenantBankId" TEXT NOT NULL,
    "debtorId" TEXT NOT NULL,
    "amountUSD" INTEGER NOT NULL,
    "amountUZS" BIGINT NOT NULL,
    "collateral" BOOLEAN NOT NULL,
    "type" "CaseType" NOT NULL,
    "status" "CaseStatus" NOT NULL DEFAULT 'NEW',
    "dpd" INTEGER NOT NULL,
    "assignedOrgId" TEXT,
    "assignedUserId" TEXT,
    "voluntaryPeriodDays" INTEGER,
    "enforcementRoute" "EnforcementRoute" NOT NULL DEFAULT 'NONE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "originatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Case_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaseEvent" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "result" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CaseEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaseDocument" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "kind" "DocumentKind" NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'READY',
    "signedByEds" TEXT,
    "bodyPreview" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CaseDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "amountUSD" INTEGER NOT NULL,
    "kind" "PaymentKind" NOT NULL,
    "promisedDate" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CostEntry" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "kind" "CostKind" NOT NULL,
    "amountUSD" INTEGER NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CostEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SlaTimer" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "breached" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "SlaTimer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Assignment" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "fromOrgId" TEXT,
    "toOrgId" TEXT NOT NULL,
    "byUserId" TEXT NOT NULL,
    "reason" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transfer" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "amountUSD" INTEGER NOT NULL,
    "initiatedByUserId" TEXT NOT NULL,
    "initiatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "managerApprovedByUserId" TEXT,
    "managerApprovedAt" TIMESTAMP(3),
    "accountantApprovedByUserId" TEXT,
    "accountantApprovedAt" TIMESTAMP(3),
    "status" "TransferStatus" NOT NULL DEFAULT 'INITIATED',

    CONSTRAINT "Transfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FieldVisit" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "collectorUserId" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "result" "VisitResult",
    "note" TEXT,

    CONSTRAINT "FieldVisit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_orgId_idx" ON "User"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_token_key" ON "Session"("token");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Debtor_pinfl_key" ON "Debtor"("pinfl");

-- CreateIndex
CREATE UNIQUE INDEX "Case_code_key" ON "Case"("code");

-- CreateIndex
CREATE INDEX "Case_assignedOrgId_idx" ON "Case"("assignedOrgId");

-- CreateIndex
CREATE INDEX "Case_status_idx" ON "Case"("status");

-- CreateIndex
CREATE INDEX "Case_tenantBankId_idx" ON "Case"("tenantBankId");

-- CreateIndex
CREATE INDEX "CaseEvent_caseId_idx" ON "CaseEvent"("caseId");

-- CreateIndex
CREATE INDEX "CaseEvent_createdAt_idx" ON "CaseEvent"("createdAt");

-- CreateIndex
CREATE INDEX "CaseDocument_caseId_idx" ON "CaseDocument"("caseId");

-- CreateIndex
CREATE INDEX "Payment_caseId_idx" ON "Payment"("caseId");

-- CreateIndex
CREATE INDEX "CostEntry_caseId_idx" ON "CostEntry"("caseId");

-- CreateIndex
CREATE INDEX "SlaTimer_caseId_idx" ON "SlaTimer"("caseId");

-- CreateIndex
CREATE INDEX "Assignment_caseId_idx" ON "Assignment"("caseId");

-- CreateIndex
CREATE INDEX "Transfer_caseId_idx" ON "Transfer"("caseId");

-- CreateIndex
CREATE INDEX "FieldVisit_caseId_idx" ON "FieldVisit"("caseId");

-- CreateIndex
CREATE INDEX "FieldVisit_collectorUserId_idx" ON "FieldVisit"("collectorUserId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Case" ADD CONSTRAINT "Case_tenantBankId_fkey" FOREIGN KEY ("tenantBankId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Case" ADD CONSTRAINT "Case_debtorId_fkey" FOREIGN KEY ("debtorId") REFERENCES "Debtor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Case" ADD CONSTRAINT "Case_assignedOrgId_fkey" FOREIGN KEY ("assignedOrgId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseEvent" ADD CONSTRAINT "CaseEvent_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseEvent" ADD CONSTRAINT "CaseEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseDocument" ADD CONSTRAINT "CaseDocument_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostEntry" ADD CONSTRAINT "CostEntry_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlaTimer" ADD CONSTRAINT "SlaTimer_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FieldVisit" ADD CONSTRAINT "FieldVisit_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FieldVisit" ADD CONSTRAINT "FieldVisit_collectorUserId_fkey" FOREIGN KEY ("collectorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
