-- CreateEnum
CREATE TYPE "AttachmentKind" AS ENUM ('IMAGE', 'FILE', 'VOICE', 'VIDEO', 'AVATAR');

-- AlterTable: added nullable first so existing rows can be backfilled from
-- the message type they are attached to (dev/staging data predates kind
-- being tracked at all) before the column is locked down to NOT NULL.
ALTER TABLE "attachments" ADD COLUMN     "kind" "AttachmentKind";

UPDATE "attachments" a
SET "kind" = CASE m."type"
  WHEN 'IMAGE' THEN 'IMAGE'::"AttachmentKind"
  WHEN 'FILE' THEN 'FILE'::"AttachmentKind"
  WHEN 'VOICE' THEN 'VOICE'::"AttachmentKind"
  WHEN 'VIDEO' THEN 'VIDEO'::"AttachmentKind"
  ELSE 'FILE'::"AttachmentKind"
END
FROM "messages" m
WHERE m."attachmentId" = a."id";

-- Any attachment with no message yet (still mid-send, or an orphaned
-- upload) falls back to FILE -- the most conservative guess.
UPDATE "attachments" SET "kind" = 'FILE' WHERE "kind" IS NULL;

ALTER TABLE "attachments" ALTER COLUMN "kind" SET NOT NULL;
