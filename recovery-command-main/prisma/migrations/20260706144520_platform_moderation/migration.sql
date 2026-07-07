-- CreateEnum
CREATE TYPE "OrgStatus" AS ENUM ('PENDING', 'ACTIVE', 'REJECTED');

-- AlterEnum
ALTER TYPE "OrgType" ADD VALUE 'PLATFORM';

-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'PLATFORM_ADMIN';

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "status" "OrgStatus" NOT NULL DEFAULT 'ACTIVE';
