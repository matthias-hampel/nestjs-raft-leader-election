import { DynamicModule } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";
import { HeartbeatService } from "./heartbeat/heartbeat.service";
import { ConfigurableModuleClass, type RaftModuleOptions } from "./raft-options";
import { RedisService } from "./redis/redis.service";

export class RaftModule extends ConfigurableModuleClass {
  public static forRoot(config: RaftModuleOptions): DynamicModule {
    return {
      module: RaftModule,
      imports: [ScheduleModule.forRoot()],
      providers: [
        { provide: RedisService, useValue: new RedisService(config) },
        {
          provide: HeartbeatService,
          useFactory: (redis: RedisService): HeartbeatService => {
            return new HeartbeatService(redis);
          },
          inject: [RedisService],
        },
      ],
      exports: [HeartbeatService],
    };
  }
}

export default RaftModule;
