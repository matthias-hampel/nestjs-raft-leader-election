import { Module } from "@nestjs/common";
import { buildRaftChannels, RAFT_MODULE_OPTIONS, type RaftModuleOptions } from "../raft-options";
import { RedisModule } from "../redis/redis.module";
import { RedisService } from "../redis/redis.service";
import { HeartbeatService } from "./heartbeat.service";

@Module({
  imports: [RedisModule],
  exports: [HeartbeatService],
  providers: [
    {
      provide: HeartbeatService,
      useFactory: (redis: RedisService, options: RaftModuleOptions): HeartbeatService => {
        return new HeartbeatService(redis, buildRaftChannels(options.namespace));
      },
      inject: [RedisService, RAFT_MODULE_OPTIONS],
    },
  ],
})
export class HeartbeatModule {}
