import { Module } from '@nestjs/common';
import { ProductsService } from './products.service';
import { ProductsAdminService } from './products-admin.service';
import { AdminProductsController, ProductsController } from './products.controller';
import { CategoriesModule } from '../categories/categories.module';

@Module({
  imports: [CategoriesModule],
  providers: [ProductsService, ProductsAdminService],
  controllers: [ProductsController, AdminProductsController],
  exports: [ProductsService, ProductsAdminService],
})
export class ProductsModule {}
