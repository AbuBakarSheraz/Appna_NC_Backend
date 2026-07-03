-- ticketQuantity was already added by the failed migration

-- Add a non-unique index first so the FK remains satisfied
CREATE INDEX `Ticket_requestId_idx`
ON `Ticket`(`requestId`);

-- Add the new column
ALTER TABLE `Ticket`
ADD COLUMN `ticketIndex` INTEGER NOT NULL DEFAULT 1;

-- Remove the old unique constraint
ALTER TABLE `Ticket`
DROP INDEX `Ticket_requestId_key`;

-- Add the new composite unique constraint
CREATE UNIQUE INDEX `Ticket_requestId_ticketIndex_key`
ON `Ticket`(`requestId`, `ticketIndex`);