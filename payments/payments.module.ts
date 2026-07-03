import { Module } from '@nestjs/common';
import { SquareService } from './square.service';

@Module({
  providers: [SquareService],
  exports: [SquareService],
})
export class PaymentsModule {}
