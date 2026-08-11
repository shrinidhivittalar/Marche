import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { AuthenticatedUser } from '../strategies/jwt.strategy';

// JwtAuthGuard for routes that anonymous callers must still reach.
//
// A public page that behaves differently for its owner needs the viewer's
// id when there is one, and no viewer at all otherwise. JwtAuthGuard cannot
// express that: it 401s the moment a token is missing or expired, which
// would take the page off the public internet. Dropping the guard entirely
// is the opposite failure — request.user is then never populated, so
// @CurrentUser() is undefined even for a caller who did send a valid token,
// and the owner branch it feeds can never fire.
//
// So: run the jwt strategy, then swallow its verdict. A valid token yields
// a user, anything else yields undefined, and neither one blocks the
// request. The route stays anonymous-readable and still recognises its
// owner.
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  handleRequest<TUser = AuthenticatedUser>(_err: unknown, user: TUser): TUser {
    return user || (undefined as TUser);
  }
}
