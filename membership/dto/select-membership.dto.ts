import { IsEnum } from 'class-validator';

export enum MembershipTypeEnum {
  STUDENT = 'STUDENT',
  ANNUAL = 'ANNUAL',
  LIFETIME = 'LIFETIME',
}

export class SelectMembershipDto {
  @IsEnum(MembershipTypeEnum)
  type: MembershipTypeEnum;
}
