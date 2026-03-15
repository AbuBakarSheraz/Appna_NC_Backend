/*
  Warnings:

  - You are about to drop the column `imagePath` on the `basicinfo` table. All the data in the column will be lost.
  - You are about to drop the column `prefix` on the `basicinfo` table. All the data in the column will be lost.
  - You are about to drop the column `suffix` on the `basicinfo` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE `basicinfo` DROP COLUMN `imagePath`,
    DROP COLUMN `prefix`,
    DROP COLUMN `suffix`;

-- AlterTable
ALTER TABLE `user` ADD COLUMN `imagePath` VARCHAR(191) NULL,
    ADD COLUMN `prefix` ENUM('DR', 'MISS', 'MR', 'MRS', 'MS') NULL,
    ADD COLUMN `suffix` ENUM('DDS', 'DMD', 'DO', 'MD', 'NA') NULL;
