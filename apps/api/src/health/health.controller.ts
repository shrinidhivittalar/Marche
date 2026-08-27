import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

// Liveness only — no DB/Redis/S3 reachability checks. Those are separate,
// heavier concerns (readiness) that Stage 1 deliberately doesn't take on;
// this just answers "is the process up and serving requests".
@ApiTags('health')
@Controller('health')
@SkipThrottle()
export class HealthController {
  @Get()
  @ApiOperation({ summary: 'Liveness check', description: 'Always 200 while the process is up.' })
  check() {
    return { status: 'ok', uptime: process.uptime() };
  }
}
