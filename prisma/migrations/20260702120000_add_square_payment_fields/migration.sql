ALTER TABLE `Membership`
  ADD COLUMN `squarePaymentLinkId` VARCHAR(191) NULL,
  ADD COLUMN `squareOrderId` VARCHAR(191) NULL,
  ADD COLUMN `squarePaymentId` VARCHAR(191) NULL;

ALTER TABLE `TicketRequest`
  ADD COLUMN `squarePaymentLinkId` VARCHAR(191) NULL,
  ADD COLUMN `squareOrderId` VARCHAR(191) NULL,
  ADD COLUMN `squarePaymentId` VARCHAR(191) NULL;

CREATE UNIQUE INDEX `Membership_squarePaymentLinkId_key` ON `Membership`(`squarePaymentLinkId`);
CREATE UNIQUE INDEX `Membership_squareOrderId_key` ON `Membership`(`squareOrderId`);
CREATE UNIQUE INDEX `TicketRequest_squarePaymentLinkId_key` ON `TicketRequest`(`squarePaymentLinkId`);
CREATE UNIQUE INDEX `TicketRequest_squareOrderId_key` ON `TicketRequest`(`squareOrderId`);
