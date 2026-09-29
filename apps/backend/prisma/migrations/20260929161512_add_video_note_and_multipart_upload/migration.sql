-- AlterEnum
ALTER TYPE "MessageType" ADD VALUE 'VIDEO_NOTE';

-- AlterTable
ALTER TABLE "attachments" ADD COLUMN     "uploadId" TEXT;
