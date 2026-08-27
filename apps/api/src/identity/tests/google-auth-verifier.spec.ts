import { ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { GoogleAuthVerifier } from '../google-auth-verifier';

const verifyIdToken = jest.fn();

jest.mock('google-auth-library', () => ({
  OAuth2Client: jest.fn().mockImplementation(() => ({
    verifyIdToken,
  })),
}));

describe('GoogleAuthVerifier', () => {
  const originalClientId = process.env.GOOGLE_CLIENT_ID;

  afterEach(() => {
    process.env.GOOGLE_CLIENT_ID = originalClientId;
    jest.clearAllMocks();
  });

  it('throws ServiceUnavailableException when GOOGLE_CLIENT_ID is not configured', async () => {
    delete process.env.GOOGLE_CLIENT_ID;
    const verifier = new GoogleAuthVerifier();

    await expect(verifier.verify('token')).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(verifyIdToken).not.toHaveBeenCalled();
  });

  it('returns sub/email/emailVerified from the verified payload only', async () => {
    process.env.GOOGLE_CLIENT_ID = 'test-client-id';
    verifyIdToken.mockResolvedValue({
      getPayload: () => ({
        sub: 'google-sub-1',
        email: 'jane@example.com',
        email_verified: true,
        // Extra Google profile fields present in a real payload — never
        // read by the verifier, proving it doesn't trust anything beyond
        // the three documented fields.
        name: 'Jane Doe',
        picture: 'https://example.com/pic.jpg',
      }),
    });
    const verifier = new GoogleAuthVerifier();

    const result = await verifier.verify('token');

    expect(result).toEqual({
      sub: 'google-sub-1',
      email: 'jane@example.com',
      emailVerified: true,
    });
    expect(verifyIdToken).toHaveBeenCalledWith({ idToken: 'token', audience: 'test-client-id' });
  });

  it('treats a missing email_verified claim as false, not truthy', async () => {
    process.env.GOOGLE_CLIENT_ID = 'test-client-id';
    verifyIdToken.mockResolvedValue({
      getPayload: () => ({ sub: 'google-sub-1', email: 'jane@example.com' }),
    });
    const verifier = new GoogleAuthVerifier();

    const result = await verifier.verify('token');

    expect(result.emailVerified).toBe(false);
  });

  it('rejects when the token fails verification', async () => {
    process.env.GOOGLE_CLIENT_ID = 'test-client-id';
    verifyIdToken.mockRejectedValue(new Error('invalid signature'));
    const verifier = new GoogleAuthVerifier();

    await expect(verifier.verify('bad-token')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects when the verified payload is missing sub or email', async () => {
    process.env.GOOGLE_CLIENT_ID = 'test-client-id';
    verifyIdToken.mockResolvedValue({ getPayload: () => ({ email: 'jane@example.com' }) });
    const verifier = new GoogleAuthVerifier();

    await expect(verifier.verify('token')).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
