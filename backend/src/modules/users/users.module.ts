import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { AdminUsersController, UsersController } from './users.controller';

@Module({
  providers: [UsersService],
  controllers: [UsersController, AdminUsersController],
  exports: [UsersService],
})
export class UsersModule {}
