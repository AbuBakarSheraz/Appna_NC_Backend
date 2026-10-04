import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt.guard';
import { AdminGuard } from '../common/guards/admin.guard';
import { CmeService } from './cme.service';
import { CreateCmeDto } from './dto/create-cme.dto';

@Controller('cme')
export class CmeController {
  constructor(private readonly cmeService: CmeService) {}

  @Post()
  create(@Body() dto: CreateCmeDto) {
    return this.cmeService.create(dto);
  }
}

@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin/cme')
export class AdminCmeController {
  constructor(private readonly cmeService: CmeService) {}

  @Get()
  list() {
    return this.cmeService.list();
  }
}
