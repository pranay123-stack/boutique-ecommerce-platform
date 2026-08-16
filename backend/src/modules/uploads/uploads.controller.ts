import {
  Body,
  Controller,
  Delete,
  Post,
  UploadedFile,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UploadsService } from './uploads.service';
import { Audit, RequirePermissions } from '../../common/decorators';
import { PERMISSIONS } from '../../common/constants';

@ApiTags('Admin / Uploads')
@ApiBearerAuth()
@Controller('admin/uploads')
export class UploadsController {
  constructor(private readonly uploads: UploadsService) {}

  @Post('image')
  @RequirePermissions(PERMISSIONS.PRODUCT_WRITE)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        folder: { type: 'string', example: 'products' },
      },
    },
  })
  @Audit('upload.image', 'Upload')
  @ApiOperation({
    summary: 'Upload a product image',
    description: 'Validated against magic bytes, not the declared MIME type or file extension.',
  })
  uploadImage(@UploadedFile() file: Express.Multer.File, @Body('folder') folder?: string) {
    return this.uploads.uploadImage(file, folder);
  }

  @Post('images')
  @RequirePermissions(PERMISSIONS.PRODUCT_WRITE)
  @UseInterceptors(FilesInterceptor('files', 10))
  @ApiConsumes('multipart/form-data')
  @Audit('upload.images', 'Upload')
  @ApiOperation({ summary: 'Upload up to 10 images at once' })
  uploadMany(@UploadedFiles() files: Express.Multer.File[], @Body('folder') folder?: string) {
    return this.uploads.uploadMany(files, folder);
  }

  @Delete()
  @RequirePermissions(PERMISSIONS.PRODUCT_WRITE)
  @Audit('upload.delete', 'Upload')
  @ApiOperation({ summary: 'Delete a stored object by key' })
  remove(@Body('key') key: string) {
    return this.uploads.delete(key);
  }
}
