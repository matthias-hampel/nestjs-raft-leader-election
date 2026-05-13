/**
 * HeartbeatService behaviour under a mocked Redis pub/sub layer.
 * Subscribes on bootstrap; tests drive channel callbacks directly (same shapes as redis client).
 * Fake timers used where heartbeat staleness depends on wall-clock age.
 */
import { Test, TestingModule } from "@nestjs/testing";
import { RedisService } from "../redis/redis.service";
import { HEARTBEAT_INTERVAL, HeartbeatService } from "./heartbeat.service";

type Handlers = Record<string, (message: string) => void | Promise<void>>;

/** Minimal Redis double: records subscribe callbacks and tracks publish calls. */
function createMockRedis() {
  const handlers: Handlers = {};
  const publish = jest.fn().mockResolvedValue(undefined);
  const subscribe = jest.fn((channel: string, callback: (message: string) => void | Promise<void>) => {
    handlers[channel] = callback;
    return Promise.resolve();
  });
  return {
    client: { publish },
    subscriber: { subscribe },
    handlers,
  };
}

/** Exposes private fields only for assertions (quorum size, election flag, active set). */
function internals(service: HeartbeatService) {
  return service as unknown as {
    nodeId: string;
    activeNodes: Record<string, Date>;
    election: boolean;
    votesForThisNode: number;
    leaderId: string | null;
  };
}

describe("HeartbeatService", () => {
  let service: HeartbeatService;
  let mockRedis: ReturnType<typeof createMockRedis>;

  beforeEach(async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2020-01-01T00:00:00.000Z"));
    mockRedis = createMockRedis();
    const module: TestingModule = await Test.createTestingModule({
      providers: [HeartbeatService, { provide: RedisService, useValue: mockRedis }],
    }).compile();
    service = module.get(HeartbeatService);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  async function bootstrap(): Promise<void> {
    await service.onApplicationBootstrap();
  }

  // Bootstrap registers handlers on all four channels Redis pub/sub uses for Raft signals.
  it("onApplicationBootstrap subscribes heartbeat, election, vote, and leader", async () => {
    await bootstrap();
    expect(mockRedis.subscriber.subscribe).toHaveBeenCalledWith("heartbeat", expect.any(Function));
    expect(mockRedis.subscriber.subscribe).toHaveBeenCalledWith("election", expect.any(Function));
    expect(mockRedis.subscriber.subscribe).toHaveBeenCalledWith("vote", expect.any(Function));
    expect(mockRedis.subscriber.subscribe).toHaveBeenCalledWith("leader", expect.any(Function));
  });

  // Smoke: Nest provider resolves; service exists after wiring Redis mock.
  it("should be defined", async () => {
    await bootstrap();
    expect(service).toBeDefined();
  });

  // Incoming `heartbeat` messages populate activeNodes so quorum and leader liveness use fresh peer set.
  it("heartbeat handler adds peer id to activeNodes", async () => {
    await bootstrap();
    mockRedis.handlers.heartbeat("peer-x");
    expect(Object.keys(internals(service).activeNodes)).toContain("peer-x");
  });

  // isLeader(): false until `leader` channel announces this node's id as leader.
  it("isLeader is false before leader channel assigns this node", async () => {
    await bootstrap();
    expect(service.isLeader()).toBe(false);
  });

  // `leader` handler stores leaderId; equality with local nodeId means leader role.
  it("isLeader is true when leader message equals this node id", async () => {
    await bootstrap();
    const { nodeId } = internals(service);
    await mockRedis.handlers.leader(nodeId);
    expect(service.isLeader()).toBe(true);
  });

  // Foreign leader id must not grant leadership on this instance.
  it("isLeader is false when leader message is another node", async () => {
    await bootstrap();
    await mockRedis.handlers.leader("other-node");
    expect(service.isLeader()).toBe(false);
  });

  // `election` message turns on election flag, this node publishes its heartbeat, then casts vote for payload node id.
  it("election handler publishes heartbeat then vote for candidate in message", async () => {
    await bootstrap();
    const { nodeId } = internals(service);
    mockRedis.client.publish.mockClear();
    await mockRedis.handlers.election("candidate-1");
    expect(mockRedis.client.publish).toHaveBeenCalledWith("heartbeat", nodeId);
    expect(mockRedis.client.publish).toHaveBeenCalledWith("vote", "candidate-1");
    expect(internals(service).election).toBe(true);
  });

  // checkLeader(): missing leader + not in election → publish `election` with own id, set flag.
  it("checkLeader publishes election when no leader and not already electing", async () => {
    await bootstrap();
    const { nodeId } = internals(service);
    mockRedis.client.publish.mockClear();
    await service.checkLeader();
    expect(mockRedis.client.publish).toHaveBeenCalledWith("election", nodeId);
    expect(internals(service).election).toBe(true);
  });

  // While election in progress, repeated checkLeader must not spam election messages.
  it("checkLeader does not publish election while election flag is set", async () => {
    await bootstrap();
    await service.checkLeader();
    mockRedis.client.publish.mockClear();
    await service.checkLeader();
    expect(mockRedis.client.publish).not.toHaveBeenCalledWith("election", expect.any(String));
  });

  // If leader id is known and still present in active heartbeats, skip new election.
  it("checkLeader does not start election when known leader is active", async () => {
    await bootstrap();
    const { nodeId } = internals(service);
    const leaderId = "stable-leader";
    await mockRedis.handlers.leader(leaderId);
    mockRedis.handlers.heartbeat(leaderId);
    mockRedis.client.publish.mockClear();
    await service.checkLeader();
    expect(mockRedis.client.publish).not.toHaveBeenCalledWith("election", nodeId);
  });

  // Stored leader not in activeNodes (no recent heartbeat) ⇒ same as no leader ⇒ triggers new election publish.
  it("checkLeader starts election when leader id has no active heartbeat entry", async () => {
    await bootstrap();
    await mockRedis.handlers.leader("ghost-leader");
    mockRedis.client.publish.mockClear();
    await service.checkLeader();
    expect(mockRedis.client.publish).toHaveBeenCalledWith("election", expect.any(String));
  });

  // `vote` handler: only votes for self count; majority of activeNodes triggers `leader` publish; winning clears election bit.
  it("vote handler increments quorum and publishes leader when majority reached", async () => {
    await bootstrap();
    const { nodeId } = internals(service);
    mockRedis.handlers.heartbeat(nodeId);
    mockRedis.handlers.heartbeat("peer-a");
    mockRedis.handlers.heartbeat("peer-b");
    mockRedis.client.publish.mockClear();
    await mockRedis.handlers.vote(nodeId);
    expect(mockRedis.client.publish).not.toHaveBeenCalledWith("leader", nodeId);
    await mockRedis.handlers.vote(nodeId);
    expect(mockRedis.client.publish).toHaveBeenCalledWith("leader", nodeId);
    expect(internals(service).election).toBe(false);
    await mockRedis.handlers.leader(nodeId);
    expect(internals(service).votesForThisNode).toBe(0);
  });

  // Votes addressed to another candidate must not bump local tally.
  it("vote handler ignores votes for other candidates", async () => {
    await bootstrap();
    const { nodeId } = internals(service);
    mockRedis.handlers.heartbeat(nodeId);
    mockRedis.handlers.heartbeat("peer-a");
    await mockRedis.handlers.vote("someone-else");
    expect(internals(service).votesForThisNode).toBe(0);
  });

  // Empty vote payload fails `message &&` guard so tally stays zero and no leader publish from this path.
  it("vote handler ignores empty message", async () => {
    await bootstrap();
    await mockRedis.handlers.vote("");
    expect(internals(service).votesForThisNode).toBe(0);
  });

  // New `leader` message clears election mode, vote accumulator, and stores elected id (even if not self).
  it("leader subscription resets election state and vote count", async () => {
    await bootstrap();
    const { nodeId } = internals(service);
    mockRedis.handlers.heartbeat(nodeId);
    mockRedis.handlers.heartbeat("peer-a");
    await mockRedis.handlers.vote(nodeId);
    await mockRedis.handlers.leader("remote-leader");
    expect(internals(service).election).toBe(false);
    expect(internals(service).votesForThisNode).toBe(0);
    expect(internals(service).leaderId).toBe("remote-leader");
  });

  // Peers older than 2× heartbeat interval drop from activeNodes (runs inside checkLeader path).
  it("clearInactiveNodes removes stale heartbeats after interval threshold", async () => {
    await bootstrap();
    mockRedis.handlers.heartbeat("stale-peer");
    jest.advanceTimersByTime(HEARTBEAT_INTERVAL * 2 + 1);
    await service.checkLeader();
    expect(Object.keys(internals(service).activeNodes)).not.toContain("stale-peer");
  });
});
