/*
  Warnings:

  - You are about to drop the column `address` on the `address` table. All the data in the column will be lost.
  - You are about to drop the column `middleName` on the `basicinfo` table. All the data in the column will be lost.
  - You are about to alter the column `maritalStatus` on the `basicinfo` table. The data in that column could be lost. The data in that column will be cast from `VarChar(191)` to `Enum(EnumId(3))`.
  - You are about to drop the column `primarySpeciality` on the `medicaleducation` table. All the data in the column will be lost.
  - You are about to drop the column `secondarySpeciality` on the `medicaleducation` table. All the data in the column will be lost.
  - You are about to drop the column `address1` on the `officeinformation` table. All the data in the column will be lost.
  - You are about to drop the column `office_name` on the `officeinformation` table. All the data in the column will be lost.
  - You are about to drop the `practiceinfo` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `street` to the `Address` table without a default value. This is not possible if the table is not empty.
  - Added the required column `primarySpecialty` to the `MedicalEducation` table without a default value. This is not possible if the table is not empty.
  - Added the required column `officeName` to the `OfficeInformation` table without a default value. This is not possible if the table is not empty.
  - Added the required column `street` to the `OfficeInformation` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE `practiceinfo` DROP FOREIGN KEY `PracticeInfo_userId_fkey`;

-- AlterTable
ALTER TABLE `address` DROP COLUMN `address`,
    ADD COLUMN `street` VARCHAR(191) NOT NULL;

-- AlterTable
ALTER TABLE `basicinfo` DROP COLUMN `middleName`,
    ADD COLUMN `referredBy` VARCHAR(191) NULL,
    MODIFY `maritalStatus` ENUM('SINGLE', 'MARRIED', 'DIVORCED', 'WIDOWED') NULL;

-- AlterTable
ALTER TABLE `medicaleducation` DROP COLUMN `primarySpeciality`,
    DROP COLUMN `secondarySpeciality`,
    ADD COLUMN `currentlyPracticing` ENUM('ACADEMICS', 'NON_ACADEMICS') NULL,
    ADD COLUMN `primarySpecialty` VARCHAR(191) NOT NULL,
    ADD COLUMN `secondarySpecialty` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `officeinformation` DROP COLUMN `address1`,
    DROP COLUMN `office_name`,
    ADD COLUMN `officeName` VARCHAR(191) NOT NULL,
    ADD COLUMN `street` VARCHAR(191) NOT NULL;

-- AlterTable
ALTER TABLE `user` ADD COLUMN `profileStep` INTEGER NOT NULL DEFAULT 0;

-- DropTable
DROP TABLE `practiceinfo`;
