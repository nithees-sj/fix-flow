-- DropForeignKey
ALTER TABLE "email_deliveries" DROP CONSTRAINT "email_deliveries_organization_id_outbox_event_id_fkey";

-- DropIndex
DROP INDEX "outbox_events_organization_id_id_key";

-- AlterTable
ALTER TABLE "email_deliveries" ALTER COLUMN "organization_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "outbox_events" ALTER COLUMN "organization_id" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "email_deliveries" ADD CONSTRAINT "email_deliveries_outbox_event_id_fkey" FOREIGN KEY ("outbox_event_id") REFERENCES "outbox_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
