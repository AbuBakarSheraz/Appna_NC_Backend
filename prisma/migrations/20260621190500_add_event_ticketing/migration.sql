-- CreateTable
CREATE TABLE `Event` (
  `id` VARCHAR(191) NOT NULL,
  `title` VARCHAR(191) NOT NULL,
  `slug` VARCHAR(191) NOT NULL,
  `description` TEXT NOT NULL,
  `category` VARCHAR(191) NOT NULL,
  `bannerImage` VARCHAR(191) NULL,
  `date` DATETIME(3) NOT NULL,
  `startTime` VARCHAR(191) NOT NULL,
  `endTime` VARCHAR(191) NOT NULL,
  `venue` VARCHAR(191) NOT NULL,
  `googleMapsUrl` VARCHAR(191) NULL,
  `capacity` INTEGER NOT NULL,
  `ticketPrice` INTEGER NOT NULL,
  `status` ENUM('DRAFT', 'PUBLISHED', 'COMPLETED', 'CANCELLED') NOT NULL DEFAULT 'DRAFT',
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `EventRegistrationField` (
  `id` VARCHAR(191) NOT NULL,
  `eventId` VARCHAR(191) NOT NULL,
  `key` VARCHAR(191) NOT NULL,
  `label` VARCHAR(191) NOT NULL,
  `type` ENUM('TEXT', 'EMAIL', 'PHONE', 'NUMBER', 'SELECT', 'TEXTAREA', 'CHECKBOX', 'DATE') NOT NULL DEFAULT 'TEXT',
  `required` BOOLEAN NOT NULL DEFAULT false,
  `options` JSON NULL,
  `position` INTEGER NOT NULL DEFAULT 0,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TicketRequest` (
  `id` VARCHAR(191) NOT NULL,
  `requestNumber` VARCHAR(191) NOT NULL,
  `eventId` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NULL,
  `fullName` VARCHAR(191) NOT NULL,
  `email` VARCHAR(191) NOT NULL,
  `phone` VARCHAR(191) NOT NULL,
  `cnic` VARCHAR(191) NULL,
  `city` VARCHAR(191) NULL,
  `organization` VARCHAR(191) NULL,
  `designation` VARCHAR(191) NULL,
  `answers` JSON NULL,
  `paymentProvider` VARCHAR(191) NULL,
  `paymentStatus` ENUM('PENDING', 'ORDER_CREATED', 'PAID', 'FAILED', 'REFUNDED', 'NOT_REQUIRED') NOT NULL DEFAULT 'PENDING',
  `paymentAmount` INTEGER NOT NULL,
  `paypalOrderId` VARCHAR(191) NULL,
  `paypalCaptureId` VARCHAR(191) NULL,
  `paidAt` DATETIME(3) NULL,
  `approvalStatus` ENUM('PENDING', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
  `adminNotes` TEXT NULL,
  `reviewedById` VARCHAR(191) NULL,
  `reviewedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Ticket` (
  `id` VARCHAR(191) NOT NULL,
  `ticketNumber` VARCHAR(191) NOT NULL,
  `registrationNumber` VARCHAR(191) NOT NULL,
  `requestId` VARCHAR(191) NOT NULL,
  `eventId` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NULL,
  `attendeeName` VARCHAR(191) NOT NULL,
  `attendeeEmail` VARCHAR(191) NOT NULL,
  `qrPayloadHash` VARCHAR(191) NOT NULL,
  `qrSecret` VARCHAR(191) NOT NULL,
  `qrCodeDataUrl` LONGTEXT NOT NULL,
  `ticketImageDataUrl` LONGTEXT NULL,
  `status` ENUM('VALID', 'USED', 'INVALIDATED', 'EXPIRED') NOT NULL DEFAULT 'VALID',
  `issueDate` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `usedAt` DATETIME(3) NULL,
  `checkedInById` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TicketCheckIn` (
  `id` VARCHAR(191) NOT NULL,
  `ticketId` VARCHAR(191) NOT NULL,
  `checkedInBy` VARCHAR(191) NULL,
  `scannedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `result` VARCHAR(191) NOT NULL,
  `ipAddress` VARCHAR(191) NULL,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `EventAuditLog` (
  `id` VARCHAR(191) NOT NULL,
  `eventId` VARCHAR(191) NULL,
  `actorId` VARCHAR(191) NULL,
  `action` VARCHAR(191) NOT NULL,
  `metadata` JSON NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `Event_slug_key` ON `Event`(`slug`);
CREATE INDEX `Event_status_date_idx` ON `Event`(`status`, `date`);
CREATE INDEX `Event_slug_idx` ON `Event`(`slug`);
CREATE UNIQUE INDEX `EventRegistrationField_eventId_key_key` ON `EventRegistrationField`(`eventId`, `key`);
CREATE INDEX `EventRegistrationField_eventId_position_idx` ON `EventRegistrationField`(`eventId`, `position`);
CREATE UNIQUE INDEX `TicketRequest_requestNumber_key` ON `TicketRequest`(`requestNumber`);
CREATE UNIQUE INDEX `TicketRequest_paypalOrderId_key` ON `TicketRequest`(`paypalOrderId`);
CREATE INDEX `TicketRequest_eventId_approvalStatus_idx` ON `TicketRequest`(`eventId`, `approvalStatus`);
CREATE INDEX `TicketRequest_email_idx` ON `TicketRequest`(`email`);
CREATE INDEX `TicketRequest_userId_idx` ON `TicketRequest`(`userId`);
CREATE UNIQUE INDEX `Ticket_ticketNumber_key` ON `Ticket`(`ticketNumber`);
CREATE UNIQUE INDEX `Ticket_registrationNumber_key` ON `Ticket`(`registrationNumber`);
CREATE UNIQUE INDEX `Ticket_requestId_key` ON `Ticket`(`requestId`);
CREATE UNIQUE INDEX `Ticket_qrPayloadHash_key` ON `Ticket`(`qrPayloadHash`);
CREATE INDEX `Ticket_eventId_status_idx` ON `Ticket`(`eventId`, `status`);
CREATE INDEX `Ticket_userId_idx` ON `Ticket`(`userId`);
CREATE INDEX `TicketCheckIn_ticketId_scannedAt_idx` ON `TicketCheckIn`(`ticketId`, `scannedAt`);
CREATE INDEX `EventAuditLog_eventId_createdAt_idx` ON `EventAuditLog`(`eventId`, `createdAt`);
CREATE INDEX `EventAuditLog_actorId_createdAt_idx` ON `EventAuditLog`(`actorId`, `createdAt`);

-- AddForeignKey
ALTER TABLE `EventRegistrationField` ADD CONSTRAINT `EventRegistrationField_eventId_fkey` FOREIGN KEY (`eventId`) REFERENCES `Event`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `TicketRequest` ADD CONSTRAINT `TicketRequest_eventId_fkey` FOREIGN KEY (`eventId`) REFERENCES `Event`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `TicketRequest` ADD CONSTRAINT `TicketRequest_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `TicketRequest` ADD CONSTRAINT `TicketRequest_reviewedById_fkey` FOREIGN KEY (`reviewedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `Ticket` ADD CONSTRAINT `Ticket_requestId_fkey` FOREIGN KEY (`requestId`) REFERENCES `TicketRequest`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `Ticket` ADD CONSTRAINT `Ticket_eventId_fkey` FOREIGN KEY (`eventId`) REFERENCES `Event`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `Ticket` ADD CONSTRAINT `Ticket_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `Ticket` ADD CONSTRAINT `Ticket_checkedInById_fkey` FOREIGN KEY (`checkedInById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `TicketCheckIn` ADD CONSTRAINT `TicketCheckIn_ticketId_fkey` FOREIGN KEY (`ticketId`) REFERENCES `Ticket`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `EventAuditLog` ADD CONSTRAINT `EventAuditLog_eventId_fkey` FOREIGN KEY (`eventId`) REFERENCES `Event`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
