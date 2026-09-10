import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import type { ThrottlerStorage } from '@nestjs/throttler';
import type { ThrottlerStorageRecord } from '@nestjs/throttler/dist/throttler-storage-record.interface';
import { REDIS_CLIENT } from './redis.constants';

/**
 * Rate limit login (dan endpoint lain) WAJIB pakai Redis (lihat auth-rbac.instructions.md)
 * supaya konsisten lintas instance/proses, bukan in-memory per-proses.
 */
@Injectable()
export class RedisThrottlerStorage implements ThrottlerStorage {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const hitKey = `throttler:${throttlerName}:${key}`;
    const blockKey = `${hitKey}:blocked`;

    const blockTtl = await this.redis.pttl(blockKey);
    if (blockTtl > 0) {
      return {
        totalHits: limit + 1,
        timeToExpire: 0,
        isBlocked: true,
        timeToBlockExpire: Math.ceil(blockTtl / 1000),
      };
    }

    const totalHits = await this.redis.incr(hitKey);
    if (totalHits === 1) {
      await this.redis.pexpire(hitKey, ttl);
    }
    const hitTtl = await this.redis.pttl(hitKey);
    const timeToExpire = Math.ceil(Math.max(hitTtl, 0) / 1000);

    let isBlocked = false;
    let timeToBlockExpire = 0;
    if (totalHits > limit) {
      isBlocked = true;
      await this.redis.set(blockKey, '1', 'PX', blockDuration);
      timeToBlockExpire = Math.ceil(blockDuration / 1000);
    }

    return { totalHits, timeToExpire, isBlocked, timeToBlockExpire };
  }
}
