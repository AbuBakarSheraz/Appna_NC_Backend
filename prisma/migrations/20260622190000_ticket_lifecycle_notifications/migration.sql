-- Convert legacy ticket request review states into the enterprise lifecycle.
UPDATE `TicketRequest`
SET `approvalStatus` = CASE
  WHEN `approvalStatus` = 'APPROVED' THEN 'CONFIRMED'
  WHEN `approvalStatus` = 'REJECTED' THEN 'REJECTED'
  WHEN `paymentStatus` IN ('PAID', 'NOT_REQUIRED') THEN 'AWAITING_ADMIN_CONFIRMATION'
  ELSE 'PENDING_PAYMENT'
END;

ALTER TABLE `TicketRequest`
  MODIFY `approvalStatus` ENUM(
    'PENDING_PAYMENT',
    'PAYMENT_COMPLETED',
    'AWAITING_ADMIN_CONFIRMATION',
    'CONFIRMED',
    'REJECTED',
    'CANCELLED',
    'EXPIRED'
  ) NOT NULL DEFAULT 'PENDING_PAYMENT';

CREATE TABLE `Notification` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NULL,
  `audience` ENUM('USER', 'ADMIN') NOT NULL,
  `type` ENUM(
    'PAYMENT_RECEIVED',
    'TICKET_APPROVED',
    'TICKET_REJECTED',
    'MEMBERSHIP_APPROVED',
    'MEMBERSHIP_EXPIRED',
    'NEW_REGISTRATION',
    'NEW_PAYMENT',
    'APPROVAL_REQUIRED'
  ) NOT NULL,
  `title` VARCHAR(191) NOT NULL,
  `message` TEXT NOT NULL,
  `metadata` JSON NULL,
  `readAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `Notification_userId_readAt_createdAt_idx` ON `Notification`(`userId`, `readAt`, `createdAt`);
CREATE INDEX `Notification_audience_readAt_createdAt_idx` ON `Notification`(`audience`, `readAt`, `createdAt`);

ALTER TABLE `Notification`
  ADD CONSTRAINT `Notification_userId_fkey`
  FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
