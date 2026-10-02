ALTER TABLE "PushDevice"
ADD COLUMN "appVersionCode" INTEGER,
ADD COLUMN "appVersionName" TEXT;

-- Devices registered by the currently published 1.3.2 client did not send
-- version metadata. Backfill them so startup does not announce the same build.
UPDATE "PushDevice"
SET "appVersionCode" = 19,
    "appVersionName" = '1.3.2'
WHERE "platform" = 'ANDROID'
  AND "appVersionCode" IS NULL;
