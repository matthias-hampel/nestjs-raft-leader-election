/**
 * RedisService with `redis` package mocked: no real TCP connection.
 * Asserts client construction from injected module options and lifecycle hooks (connect / destroy).
 */
import { Test, TestingModule } from "@nestjs/testing";
import { createClient } from "redis";
import { RAFT_MODULE_OPTIONS } from "../raft-options";
import { RedisService } from "./redis.service";

jest.mock("redis", () => ({
  createClient: jest.fn(),
}));

const mockedCreateClient = jest.mocked(createClient);

describe("RedisService", () => {
  const options = {
    redis: {
      url: "redis://localhost:6379",
      password: "test-password",
    },
  };

  beforeEach(() => {
    mockedCreateClient.mockImplementation(
      () =>
        ({
          connect: jest.fn().mockResolvedValue(undefined),
          destroy: jest.fn().mockResolvedValue(undefined),
          on: jest.fn(),
        }) as unknown as ReturnType<typeof createClient>,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  /** Nest test module with RAFT_MODULE_OPTIONS token bound to fake redis URL/password. */
  function createModule(): Promise<TestingModule> {
    return Test.createTestingModule({
      providers: [RedisService, { provide: RAFT_MODULE_OPTIONS, useValue: options }],
    }).compile();
  }

  // Provider resolves when inject token present.
  it("should be defined", async () => {
    const moduleRef = await createModule();
    expect(moduleRef.get(RedisService)).toBeDefined();
  });

  // Constructor builds two createClient instances (pub + sub) with url/password from options.
  it("creates separate publisher and subscriber clients with redis options", async () => {
    await createModule();
    expect(mockedCreateClient).toHaveBeenCalledTimes(2);
    expect(mockedCreateClient).toHaveBeenNthCalledWith(1, {
      url: options.redis.url,
      password: options.redis.password,
    });
    expect(mockedCreateClient).toHaveBeenNthCalledWith(2, {
      url: options.redis.url,
      password: options.redis.password,
    });
  });

  // onApplicationBootstrap wires both sockets before app serves traffic.
  it("connects both clients on application bootstrap", async () => {
    const moduleRef = await createModule();
    const service = moduleRef.get(RedisService);
    await service.onApplicationBootstrap();
    expect(service.client.connect).toHaveBeenCalledTimes(1);
    expect(service.subscriber.connect).toHaveBeenCalledTimes(1);
  });

  // onApplicationShutdown tears down both clients on Nest shutdown.
  it("destroys both clients on application shutdown", async () => {
    const moduleRef = await createModule();
    const service = moduleRef.get(RedisService);
    await service.onApplicationShutdown();
    expect(service.client.destroy).toHaveBeenCalledTimes(1);
    expect(service.subscriber.destroy).toHaveBeenCalledTimes(1);
  });
});
