-- CreateTable
CREATE TABLE "native_push_devices" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "deviceId" UUID NOT NULL,
    "fcmToken" TEXT NOT NULL,
    "encKey" TEXT NOT NULL,
    "appVersionCode" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSuccessAt" TIMESTAMP(3),

    CONSTRAINT "native_push_devices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "native_push_devices_deviceId_key" ON "native_push_devices"("deviceId");

-- CreateIndex
CREATE UNIQUE INDEX "native_push_devices_fcmToken_key" ON "native_push_devices"("fcmToken");

-- CreateIndex
CREATE INDEX "native_push_devices_userId_idx" ON "native_push_devices"("userId");

-- CreateIndex
CREATE INDEX "native_push_devices_sessionId_idx" ON "native_push_devices"("sessionId");

-- AddForeignKey
ALTER TABLE "native_push_devices" ADD CONSTRAINT "native_push_devices_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "native_push_devices" ADD CONSTRAINT "native_push_devices_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

