-- AlterEnum
ALTER TYPE "OrgStatus" ADD VALUE 'ARCHIVED';

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "maxCases" INTEGER,
ADD COLUMN     "maxUsers" INTEGER,
ADD COLUMN     "plan" TEXT NOT NULL DEFAULT 'STANDARD';
