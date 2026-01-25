import {
  Controller,
  Post,
  Get,
  Body,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt.guard';
import { MembershipService } from './membership.service';
import { SelectMembershipDto } from './dto/select-membership.dto';
import { AnyFilesInterceptor } from '@nestjs/platform-express';

@UseGuards(JwtAuthGuard)
@Controller('membership')
export class MembershipController {
  constructor(private service: MembershipService) {}

  // Supports RAW JSON + multipart/form-data
  @Post('select')
  @UseInterceptors(AnyFilesInterceptor())
  select(@Req() req, @Body() body: SelectMembershipDto) {
    return this.service.selectMembership(req.user.userId, body.type);
  }

  @Get('me')
  myMembership(@Req() req) {
    return this.service.getMyMembership(req.user.userId);
  }
}
