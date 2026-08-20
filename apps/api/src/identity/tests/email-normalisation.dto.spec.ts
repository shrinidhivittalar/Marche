import { plainToInstance } from 'class-transformer';
import { RegisterDto } from '../dto/register.dto';
import { LoginDto } from '../dto/login.dto';
import { ForgotPasswordDto } from '../dto/forgot-password.dto';

// Referrals already lowercase/trim their `email` field (create-referral.dto.ts)
// so ReferralsRepository.markJoined's exact-string match finds a referral
// regardless of how the referred address was capitalised. Identity's DTOs
// didn't, so a referral for "priya@example.com" never flipped to JOINED if
// the person registered as "Priya@Example.com" — and, separately, the same
// address in two different cases could register twice. Login and
// forgot-password normalise too, so a user who registered with a mixed-case
// address (now stored lowercased) can still be found by email afterwards.

describe('identity DTOs normalise email the same way referrals already do', () => {
  it.each([
    ['RegisterDto', RegisterDto, { password: 'Str0ngPassword1', name: 'Jane', role: 'CLIENT' }],
    ['LoginDto', LoginDto, { password: 'whatever' }],
    ['ForgotPasswordDto', ForgotPasswordDto, {}],
  ] as const)('%s trims and lowercases email', (_label, Dto, rest) => {
    const dto = plainToInstance(Dto, { email: '  Priya@Example.COM  ', ...rest });
    expect(dto.email).toBe('priya@example.com');
  });
});
