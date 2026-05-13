/**
 * Requires Redis at REDIS_URL (default redis://127.0.0.1:6379).
 * Boots real Nest apps with RaftModule; validates leader election via pub/sub.
 */
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { createClient } from "redis";
import { HeartbeatService } from "../src/heartbeat/heartbeat.service";
import { RaftModule } from "../src/raft.module";

const redisUrl = process.env["REDIS_URL"] ?? "redis://127.0.0.1:6379";

async function assertRedisReachable(url: string): Promise<void> {
  const client = createClient({ url });
  try {
    await client.connect();
    await client.ping();
  } finally {
    await client.destroy();
  }
}

async function waitFor(predicate: () => boolean, options: { timeoutMs: number; intervalMs?: number }): Promise<void> {
  const intervalMs = options.intervalMs ?? 150;
  const deadline = Date.now() + options.timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) {
      return;
    }
    await new Promise<void>((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`Condition not met within ${options.timeoutMs}ms`);
}

async function createRaftApp(url: string): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [
      RaftModule.forRoot({
        redis: { url },
      }),
    ],
  }).compile();

  const app = moduleRef.createNestApplication();
  await app.init();
  return app;
}

describe("Raft leader election (e2e)", () => {
  beforeAll(async () => {
    await assertRedisReachable(redisUrl);
  });

  it("single app instance becomes leader", async () => {
    const app = await createRaftApp(redisUrl);
    try {
      const heartbeat = app.get(HeartbeatService);
      await waitFor(() => heartbeat.isLeader(), { timeoutMs: 20_000 });
    } finally {
      await app.close();
    }
  });

  it("two app instances elect exactly one leader", async () => {
    const app1 = await createRaftApp(redisUrl);
    const app2 = await createRaftApp(redisUrl);
    try {
      const h1 = app1.get(HeartbeatService);
      const h2 = app2.get(HeartbeatService);
      await waitFor(() => [h1, h2].filter((h) => h.isLeader()).length === 1, {
        timeoutMs: 30_000,
      });
    } finally {
      await app2.close();
      await app1.close();
    }
  });
});
