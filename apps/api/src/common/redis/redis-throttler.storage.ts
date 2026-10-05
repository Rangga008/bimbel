import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import Redis from 'ioredis';
import type { ThrottlerStorage } from '@nestjs/throttler';
import type { ThrottlerStorageRecord } from '@nestjs/throttler/dist/throttler-storage-record.interface';
import { REDIS_CLIENT } from './redis.constants';

/**
 * Rate limit login (dan endpoint lain) WAJIB pakai Redis (lihat auth-rbac.instructions.md)
 * supaya konsisten lintas instance/proses, bukan in-memory per-proses.
 * Fallback in-memory hanya dipakai saat Redis tidak terjangkau (mis. dev lokal
 * tanpa redis berjalan) supaya API tidak 500 — bukan untuk production.
 */
@Injectable()
export class RedisThrottlerStorage implements ThrottlerStorage {
  private readonly logger = new Logger(RedisThrottlerStorage.name);
  private fallbackWarned = false;
  private readonly memory = new Map<
    string,
    { hits: number; expiresAt: number; blockedUntil: number }
  >();

  constructor(@Optional() @Inject(REDIS_CLIENT) private readonly redis?: Redis) {}

  private fallbackIncrement(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): ThrottlerStorageRecord {
    if (!this.fallbackWarned) {
      this.fallbackWarned = true;
      this.logger.warn(
        'Redis tidak tersedia — throttler memakai fallback in-memory. Jangan pakai di production.',
      );
    }
    const hitKey = `throttler:${throttlerName}:${key}`;
    const now = Date.now();
    const entry = this.memory.get(hitKey);
    if (entry && entry.blockedUntil > now) {
      return {
        totalHits: limit + 1,
        timeToExpire: 0,
        isBlocked: true,
        timeToBlockExpire: Math.ceil((entry.blockedUntil - now) / 1000),
      };
    }
    const fresh =
      !entry || entry.expiresAt <= now
        ? { hits: 0, expiresAt: now + ttl, blockedUntil: 0 }
        : entry;
    fresh.hits += 1;
    if (fresh.hits > limit) {
      fresh.blockedUntil = now + blockDuration;
      this.memory.set(hitKey, fresh);
      return {
        totalHits: fresh.hits,
        timeToExpire: 0,
        isBlocked: true,
        timeToBlockExpire: Math.ceil(blockDuration / 1000),
      };
    }
    this.memory.set(hitKey, fresh);
    return {
      totalHits: fresh.hits,
      timeToExpire: Math.ceil((fresh.expiresAt - now) / 1000),
      isBlocked: false,
      timeToBlockExpire: 0,
    };
  }

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    if (!this.redis) {
      return this.fallbackIncrement(key, ttl, limit, blockDuration, throttlerName);
    }
    try {
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
    } catch (error) {
      this.logger.warn(`Redis throttler gagal (${error}), pakai fallback in-memory.`);
      return this.fallbackIncrement(key, ttl, limit, blockDuration, throttlerName);
    }
  }
}
