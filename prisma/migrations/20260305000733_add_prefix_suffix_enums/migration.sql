/*
  Warnings:

  - You are about to alter the column `prefix` on the `basicinfo` table. The data in that column could be lost. The data in that column will be cast from `VarChar(191)` to `Enum(EnumId(1))`.
  - You are about to alter the column `suffix` on the `basicinfo` table. The data in that column could be lost. The data in that column will be cast from `VarChar(191)` to `Enum(EnumId(2))`.

*/
-- AlterTable
ALTER TABLE `basicinfo` MODIFY `prefix` ENUM('DR', 'MISS', 'MR', 'MRS', 'MS') NOT NULL,
    MODIFY `suffix` ENUM('DDS', 'DMD', 'DO', 'MD', 'NA') NULL;
