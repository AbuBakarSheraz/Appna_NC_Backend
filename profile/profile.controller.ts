import {
  Controller,
  Post,
  Body,
  UseGuards,
  Req,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt.guard';
import { ProfileService } from './profile.service';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';

@UseGuards(JwtAuthGuard)
@Controller('profile')
export class ProfileController {
  constructor(private service: ProfileService) {}

  @Post('basic-info')
  @UseInterceptors(
    FileInterceptor('image', {
      storage: diskStorage({
        destination: './uploads/profile',
        filename: (_, file, cb) => {
          const unique =
            Date.now() + '-' + Math.round(Math.random() * 1e9);
          cb(null, unique + extname(file.originalname));
        },
      }),
      limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
      fileFilter: (_, file, cb) => {
        if (!file.mimetype.match(/\/(jpg|jpeg|png)$/)) {
          return cb(new Error('Only image files allowed'), false);
        }
        cb(null, true);
      },
    }),
  )
  basic(
    @Req() req,
    @Body() body,
    @UploadedFile() image?: Express.Multer.File,
  ) {
    return this.service.basicInfo(req.user.userId, body, image);
  }

  @Post('practice-info')
  practice(@Req() req, @Body() body) {
    return this.service.practiceInfo(req.user.userId, body);
  }

  @Post('medical-education')
  medical(@Req() req, @Body() body) {
    return this.service.medicalEducation(req.user.userId, body);
  }

  @Post('address')
  address(@Req() req, @Body() body) {
    return this.service.address(req.user.userId, body);
  }
}
