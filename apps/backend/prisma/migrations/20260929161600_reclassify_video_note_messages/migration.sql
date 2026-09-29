-- DataMigration: the video-note recorder (Composer.tsx) always names its
-- upload "video.webm" -- reclassify existing VIDEO messages recorded that
-- way to VIDEO_NOTE now that the two are distinct message types. Split into
-- its own migration because a newly added enum value cannot be used in the
-- same transaction that adds it (see 20260929161512).
UPDATE "messages" AS m
SET "type" = 'VIDEO_NOTE'
FROM "attachments" AS a
WHERE m."attachmentId" = a."id"
  AND m."type" = 'VIDEO'
  AND a."name" = 'video.webm';
