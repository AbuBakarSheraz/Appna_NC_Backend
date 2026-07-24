-- AlterTable
ALTER TABLE `address` MODIFY `zipCode` VARCHAR(191) NULL,
    MODIFY `country` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `ticketrequest` ADD COLUMN `ticketQuantity` INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE `Sponsorship` (
    `id` VARCHAR(191) NOT NULL,
    `businessName` VARCHAR(191) NOT NULL,
    `businessType` VARCHAR(191) NOT NULL,
    `contactName` VARCHAR(191) NOT NULL,
    `contactEmail` VARCHAR(191) NOT NULL,
    `contactPhone` VARCHAR(191) NOT NULL,
    `tier` ENUM('PLATINUM', 'GOLD', 'SILVER', 'BRONZE') NOT NULL,
    `amount` INTEGER NOT NULL,
    `paymentProvider` VARCHAR(191) NULL DEFAULT 'SQUARE',
    `paymentStatus` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
    `squarePaymentId` VARCHAR(191) NULL,
    `paidAt` DATETIME(3) NULL,
    `confirmedAt` DATETIME(3) NULL,
    `notes` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
