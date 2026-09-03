import { RedisThrottlerStorage } from '../redis-throttler-storage';

// Only the "eval failure falls back to memory" describe block below needs
// this — a fully-controlled fake client instead of a real ioredis instance
// that would otherwise try (and fail) to connect to a fake host in the
// background, leaking an open handle past the test.
jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
    eval: jest.fn(),
    on: jest.fn(),
    disconnect: jest.fn(),
  }));
});

// Covers only the in-memory fallback path (constructed with an undefined
// REDIS_URL) — the Redis-backed path talks to a real server via ioredis
// and isn't something a unit test should stand up.
describe('RedisThrottlerStorage — in-memory fallback', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('evicts an entry once both its hit-window and any block have lapsed', async () => {
    const storage = new RedisThrottlerStorage(undefined);
    const memoryStore = (storage as unknown as { memoryStore: Map<string, unknown> }).memoryStore;

    await storage.increment('1.2.3.4', 1_000, 5, 2_000, 'default');
    expect(memoryStore.size).toBe(1);

    // Past both the hit-window ttl (1s) and the block duration (2s, never
    // triggered here since limit wasn't exceeded) — the sweep should treat
    // this as fully expired.
    jest.advanceTimersByTime(3_000);
    // The sweep interval is 60s; advancing past ttl alone doesn't sweep
    // anything on its own, so trigger the interval explicitly.
    jest.advanceTimersByTime(60_000);

    expect(memoryStore.size).toBe(0);

    await storage.onModuleDestroy();
  });

  it('does not evict a still-blocked entry', async () => {
    const storage = new RedisThrottlerStorage(undefined);
    const memoryStore = (storage as unknown as { memoryStore: Map<string, unknown> }).memoryStore;

    // limit 1, so the second call blocks — for longer than one sweep tick
    // (60s), so a sweep genuinely runs while the block is still active.
    await storage.increment('1.2.3.4', 1_000, 1, 120_000, 'default');
    await storage.increment('1.2.3.4', 1_000, 1, 120_000, 'default');
    expect(memoryStore.size).toBe(1);

    // One sweep tick in: past the 1s hit-window, still well inside the 120s
    // block — must survive.
    jest.advanceTimersByTime(60_000);
    expect(memoryStore.size).toBe(1);

    // A second tick, now past the block too — must finally be swept.
    jest.advanceTimersByTime(60_000);
    expect(memoryStore.size).toBe(0);

    await storage.onModuleDestroy();
  });

  it('stops the sweep timer on destroy', async () => {
    const storage = new RedisThrottlerStorage(undefined);
    const clearSpy = jest.spyOn(global, 'clearInterval');

    await storage.onModuleDestroy();

    expect(clearSpy).toHaveBeenCalled();
    clearSpy.mockRestore();
  });
});

// Covers the Redis-backed path failing mid-flight (not the constructor's
// connection error listener, which only handles a failed connection
// attempt) — a fake client is swapped in for the private `client` field
// so this stays a unit test rather than talking to a real server.
describe('RedisThrottlerStorage — Redis eval failure falls back to memory', () => {
  it('degrades to the in-memory path instead of throwing when client.eval rejects', async () => {
    const storage = new RedisThrottlerStorage('redis://fake-host:6379');
    const client = (storage as unknown as { client: { eval: jest.Mock } }).client;
    client.eval.mockRejectedValue(new Error('connection lost'));

    const result = await storage.increment('1.2.3.4', 1_000, 5, 2_000, 'default');

    expect(client.eval).toHaveBeenCalled();
    expect(result).toEqual({
      totalHits: 1,
      timeToExpire: 1,
      isBlocked: false,
      timeToBlockExpire: 0,
    });

    await storage.onModuleDestroy();
  });
});
