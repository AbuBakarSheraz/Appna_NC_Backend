import { Controller, Post, Body, UseInterceptors, UploadedFile } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { AlreadyAMemberService } from './already_a_member.service';
import { AlreadyAMemberDto } from './dto/already-a-member.dto';

const profileImageStorage = diskStorage({
  destination: './uploads/profiles',
  filename: (_req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
    cb(null, `profile-${uniqueSuffix}${extname(file.originalname)}`);
  },
});

@Controller('already-member')
export class AlreadyAMemberController {
  constructor(private readonly service: AlreadyAMemberService) {}

  @Post('register')
  @UseInterceptors(FileInterceptor('image', { storage: profileImageStorage }))
  register(@Body() dto: AlreadyAMemberDto, @UploadedFile() file?: Express.Multer.File) {
    return this.service.addAlreadyAMember(dto, file);
  }
}