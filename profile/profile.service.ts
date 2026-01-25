import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
@Injectable()
export class ProfileService {
  constructor(private prisma: PrismaService) {}

  async basicInfo(
    userId: string,
    data: any,
    image?: Express.Multer.File,
  ) {
    const payload = {
      ...data,
      ...(image && { imagePath: image.path }),
    };

    return this.prisma.basicInfo.upsert({
      where: { userId },
      update: payload,
      create: { ...payload, userId },
    });
  }

  async practiceInfo(userId: string, data) {
    return this.prisma.practiceInfo.upsert({
      where: { userId },
      update: data,
      create: { ...data, userId },
    });
  }

  async medicalEducation(userId: string, data) {
    return this.prisma.medicalEducation.upsert({
      where: { userId },
      update: data,
      create: { ...data, userId },
    });
  }

  async address(userId: string, data) {
    await this.prisma.address.upsert({
      where: { userId },
      update: data,
      create: { ...data, userId },
    });

    return this.prisma.user.update({
      where: { id: userId },
      data: { isProfileCompleted: true },
    });
  }
}
