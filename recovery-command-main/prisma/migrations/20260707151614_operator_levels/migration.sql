-- CreateEnum
CREATE TYPE "OperatorLevel" AS ENUM ('FULL', 'READ_ONLY');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "operatorLevel" "OperatorLevel";
