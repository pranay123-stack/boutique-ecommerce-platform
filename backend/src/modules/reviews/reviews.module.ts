import { Module } from '@nestjs/common';
import { ReviewsService } from './reviews.service';
import { AdminReviewsController, ReviewsController } from './reviews.controller';

@Module({
  providers: [ReviewsService],
  controllers: [ReviewsController, AdminReviewsController],
  exports: [ReviewsService],
})
export class ReviewsModule {}
