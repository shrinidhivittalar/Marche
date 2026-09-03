import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { RegisterDto } from '../dto/register.dto';
import { LoginDto } from '../dto/login.dto';
import { ResetPasswordDto } from '../dto/reset-password.dto';
import { PASSWORD_MAX_LENGTH } from '../dto/password.constants';

// SECURITY_AUDIT.md finding #2: an unbounded password field reaches
// argon2.hash() (register/reset) or argon2.verify() (login) with no upper
// bound. Not a usable DoS on its own (argon2id's cost is dominated by its
// fixed parameters, not input length), but bounding it is free
// defense-in-depth. Covers all three password-accepting DTOs.

describe('password fields reject a string past PASSWORD_MAX_LENGTH', () => {
  const tooLong = 'Aa1'.padEnd(PASSWORD_MAX_LENGTH + 1, 'a');
  const atLimit = 'Aa1'.padEnd(PASSWORD_MAX_LENGTH, 'a');

  it('RegisterDto rejects a password over the limit and accepts one at the limit', () => {
    const over = validateSync(
      plainToInstance(RegisterDto, {
        email: 'jane@example.com',
        password: tooLong,
        name: 'Jane',
        role: 'CLIENT',
      }),
    );
    expect(over.some((e) => 'maxLength' in (e.constraints ?? {}))).toBe(true);

    const at = validateSync(
      plainToInstance(RegisterDto, {
        email: 'jane@example.com',
        password: atLimit,
        name: 'Jane',
        role: 'CLIENT',
      }),
    );
    expect(at.some((e) => 'maxLength' in (e.constraints ?? {}))).toBe(false);
  });

  it('ResetPasswordDto rejects a newPassword over the limit', () => {
    const errors = validateSync(
      plainToInstance(ResetPasswordDto, { token: 'raw-token', newPassword: tooLong }),
    );
    expect(errors.some((e) => 'maxLength' in (e.constraints ?? {}))).toBe(true);
  });

  it('LoginDto rejects a password over the limit', () => {
    const errors = validateSync(
      plainToInstance(LoginDto, { email: 'jane@example.com', password: tooLong }),
    );
    expect(errors.some((e) => 'maxLength' in (e.constraints ?? {}))).toBe(true);
  });
});
