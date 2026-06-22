-- Add PayPal payment tracking and expiry notification metadata to memberships.
ALTER TABLE `Membership`
  ADD COLUMN `paymentProvider` VARCHAR(191) NULL,
  ADD COLUMN `paymentStatus` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
  ADD COLUMN `paypalOrderId` VARCHAR(191) NULL,
  ADD COLUMN `paypalCaptureId` VARCHAR(191) NULL,
  ADD COLUMN `paidAt` DATETIME(3) NULL,
  ADD COLUMN `paymentNotifiedAt` DATETIME(3) NULL,
  ADD COLUMN `expiredNoticeSentAt` DATETIME(3) NULL;

CREATE UNIQUE INDEX `Membership_paypalOrderId_key` ON `Membership`(`paypalOrderId`);
