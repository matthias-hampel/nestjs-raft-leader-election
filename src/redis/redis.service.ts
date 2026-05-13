import { Inject, Injectable, OnApplicationBootstrap, OnApplicationShutdown } from "@nestjs/common";
import { createClient, RedisClientType } from "redis";
import type { RaftModuleOptions } from "../raft-options";
import { RAFT_MODULE_OPTIONS } from "../raft-options";

@Injectable()
export class RedisService implements OnApplicationBootstrap, OnApplicationShutdown {
  public readonly client: RedisClientType;
  public readonly subscriber: RedisClientType;

  constructor(@Inject(RAFT_MODULE_OPTIONS) private options: RaftModuleOptions) {
    const clientOptions = {
      url: this.options.redis.url,
      password: this.options.redis.password,
    };

    this.client = createClient(clientOptions);
    this.subscriber = createClient(clientOptions);
  }

  public async onApplicationBootstrap(): Promise<void> {
    await this.client.connect();
    await this.subscriber.connect();
  }

  public async onApplicationShutdown(): Promise<void> {
    await this.client.destroy();
    await this.subscriber.destroy();
  }
}
