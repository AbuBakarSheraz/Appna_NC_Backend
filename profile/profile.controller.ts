import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  UseGuards,
  Req,
  UseInterceptors,
  UploadedFile,
  ParseFilePipe,
  MaxFileSizeValidator,
  FileTypeValidator,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { JwtAuthGuard } from '../common/guards/jwt.guard';
import { ProfileService } from './profile.service';
import { BasicInfoDto } from './dto/basic-info.dto';
import { AddressDto, OfficeInfoDto } from './dto/address.dto';
import { MedicalEducationDto } from './dto/medical-education.dto';
import { MembershipDto } from './dto/membership.dto';

// ─── Multer storage config ────────────────────────────────────────
// Saves uploaded profile photos to /uploads/profiles/<timestamp>.<ext>
const profileImageStorage = diskStorage({
  destination: './uploads/profiles',
  filename: (_req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
    cb(null, `profile-${uniqueSuffix}${extname(file.originalname)}`);
  },
});

// ─── Controller ───────────────────────────────────────────────────
// Every route is protected — a valid JWT is required on all requests.
@UseGuards(JwtAuthGuard)
@Controller('profile')
export class ProfileController {
  constructor(private readonly service: ProfileService) {}

  // ──────────────────────────────────────────────────────────────
  // GET /profile/me
  // Lightweight — returns only username and avatar URL.
  // Used by the navbar after login.
  // ──────────────────────────────────────────────────────────────
  @Get('me')
  getUsername(@Req() req) {
    return this.service.getUsername(req.user.userId);
  }

  // ──────────────────────────────────────────────────────────────
  // GET /profile
  // Full profile with all related tables + profileStep and nextStep.
  // Call this when the user lands on the dashboard to know where
  // to resume the onboarding flow.
  // ──────────────────────────────────────────────────────────────
  @Get()
  getFullProfile(@Req() req) {
    return this.service.getFullProfile(req.user.userId);
  }

  // ──────────────────────────────────────────────────────────────
  // POST /profile/basic   (STEP 1)
  //
  // multipart/form-data — text fields + optional image upload.
  // Returns profileStep: 1 on success.
  // ──────────────────────────────────────────────────────────────
  @Post('basic')
  @UseInterceptors(FileInterceptor('image', { storage: profileImageStorage }))
  saveBasicInfo(
    @Req() req,
    @Body() dto: BasicInfoDto,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 5 * 1024 * 1024 }), // 5 MB limit
          new FileTypeValidator({ fileType: /image\/(jpeg|png|webp)/ }),
        ],
        fileIsRequired: false, // image upload is optional
      }),
    )
    image?: Express.Multer.File,
  ) {
    return this.service.saveBasicInfo(req.user.userId, dto, image);
  }

  // ──────────────────────────────────────────────────────────────
  // POST /profile/medical   (STEP 2)
  //
  // JSON body — education, specialty, training history.
  // Returns profileStep: 2 on success.
  // ──────────────────────────────────────────────────────────────
  @Post('medical')
  saveMedicalEducation(@Req() req, @Body() dto: MedicalEducationDto) {
    return this.service.saveMedicalEducation(req.user.userId, dto);
  }

  // ──────────────────────────────────────────────────────────────
  // POST /profile/address   (STEP 3)
  //
  // JSON body with nested { home: {...} } object.
  // Returns profileStep: 3 on success.
  // ──────────────────────────────────────────────────────────────
  @Post('address')
  saveAddress(@Req() req, @Body() dto: AddressDto) {
    return this.service.saveAddress(req.user.userId, dto);
  }

  // ──────────────────────────────────────────────────────────────
  // POST /profile/office   (STEP 4 — optional)
  //
  // JSON body — office name, street, city, state, etc.
  // User may skip this entirely by calling POST /profile/membership.
  // Returns profileStep: 4 on success.
  // ──────────────────────────────────────────────────────────────
  @Post('office')
  saveOfficeInfo(@Req() req, @Body() dto: OfficeInfoDto) {
    return this.service.saveOfficeInfo(req.user.userId, dto);
  }

  // ──────────────────────────────────────────────────────────────
  // POST /profile/office/skip
  //
  // Lets the frontend explicitly skip step 4 without sending any
  // office data. Advances profileStep to 4 and returns it.
  // ──────────────────────────────────────────────────────────────
  @Post('office/skip')
  skipOfficeInfo(@Req() req) {
    return this.service.saveOfficeInfo(req.user.userId, undefined);
  }

  // ──────────────────────────────────────────────────────────────
  // POST /profile/membership   (STEP 5 — final step)
  //
  // User selects membership tier. Returns price and expiry so the
  // frontend can render a payment summary before charging the card.
  // ──────────────────────────────────────────────────────────────
  @Post('membership')
  selectMembership(@Req() req, @Body() dto: MembershipDto) {
    return this.service.selectMembership(req.user.userId, dto);
  }

  // ──────────────────────────────────────────────────────────────
  // PATCH /profile/membership/confirm
  //
  // Activates the membership (isActive: true) and marks
  // isProfileCompleted: true + profileStep: 5.
  //
  // Production recommendation: trigger this from your Stripe webhook
  // handler instead of the frontend — it's more tamper-proof.
  // ──────────────────────────────────────────────────────────────
  @Patch('membership/confirm')
  confirmPayment(@Req() req) {
    return this.service.confirmPayment(req.user.userId);
  }
}