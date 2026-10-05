-- AlterTable
ALTER TABLE "calls" ADD COLUMN     "callerEndpointId" UUID,
ADD COLUMN     "calleeEndpointId" UUID;
