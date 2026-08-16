import { Module } from '@nestjs/common';
import { InvoicesService } from './invoices.service';
import { InvoicesController } from './invoices.controller';
import { InvoicesListener } from './invoices.listener';

@Module({
  controllers: [InvoicesController],
  providers: [InvoicesService, InvoicesListener],
  exports: [InvoicesService],
})
export class InvoicesModule {}
