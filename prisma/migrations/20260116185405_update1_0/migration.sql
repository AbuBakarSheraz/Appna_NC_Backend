/*
  Warnings:

  - You are about to drop the column `address1` on the `address` table. All the data in the column will be lost.
  - You are about to drop the column `address2` on the `address` table. All the data in the column will be lost.
  - Added the required column `address` to the `Address` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `address` DROP COLUMN `address1`,
    DROP COLUMN `address2`,
    ADD COLUMN `address` VARCHAR(191) NOT NULL;

-- CreateTable
CREATE TABLE `OfficeInformation` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `office_name` VARCHAR(191) NOT NULL,
    `address1` VARCHAR(191) NOT NULL,
    `city` VARCHAR(191) NOT NULL,
    `country` VARCHAR(191) NOT NULL,
    `state` VARCHAR(191) NOT NULL,
    `zipCode` VARCHAR(191) NOT NULL,
    `officePhone` VARCHAR(191) NULL,

    UNIQUE INDEX `OfficeInformation_userId_key`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `OfficeInformation` ADD CONSTRAINT `OfficeInformation_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
