import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

/** Shared password policy: length does most of the work, composition blocks the worst choices. */
const PASSWORD_RULE =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[A-Za-z\d!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?~`]{8,72}$/;
const PASSWORD_MESSAGE =
  'Password must be 8-72 characters and include an uppercase letter, a lowercase letter and a number';

const normaliseEmail = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export class RegisterDto {
  @ApiProperty({ example: 'ada@example.com' })
  @Transform(normaliseEmail)
  @IsEmail({}, { message: 'A valid email address is required' })
  @MaxLength(255)
  email: string;

  @ApiProperty({ example: 'Str0ngPass' })
  @IsString()
  @Matches(PASSWORD_RULE, { message: PASSWORD_MESSAGE })
  password: string;

  @ApiProperty({ example: 'Ada' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  firstName: string;

  @ApiPropertyOptional({ example: 'Lovelace' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  lastName?: string;

  @ApiPropertyOptional({ example: '+919876543210' })
  @IsOptional()
  @IsString()
  @Matches(/^\+?[0-9\s-]{7,20}$/, { message: 'Phone number format is invalid' })
  phone?: string;
}

export class LoginDto {
  @ApiProperty({ example: 'ada@example.com' })
  @Transform(normaliseEmail)
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'Str0ngPass' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(72)
  password: string;
}

export class ForgotPasswordDto {
  @ApiProperty()
  @Transform(normaliseEmail)
  @IsEmail()
  email: string;
}

export class ResetPasswordDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  token: string;

  @ApiProperty()
  @IsString()
  @Matches(PASSWORD_RULE, { message: PASSWORD_MESSAGE })
  password: string;
}

export class VerifyEmailDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  token: string;
}

export class ChangePasswordDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  currentPassword: string;

  @ApiProperty()
  @IsString()
  @Matches(PASSWORD_RULE, { message: PASSWORD_MESSAGE })
  newPassword: string;
}

export class RefreshTokenDto {
  @ApiPropertyOptional({
    description: 'Only needed by non-browser clients; browsers use the cookie.',
  })
  @IsOptional()
  @IsString()
  refreshToken?: string;
}
