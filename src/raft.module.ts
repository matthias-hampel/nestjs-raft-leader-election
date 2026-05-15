import { ConfigurableModuleBuilder, type DynamicModule } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";
import { HeartbeatService } from "./heartbeat/heartbeat.service";
import { RAFT_MODULE_OPTIONS, type RaftModuleOptions } from "./raft-options";
import { RedisService } from "./redis/redis.service";

const { ConfigurableModuleClass, OPTIONS_TYPE, ASYNC_OPTIONS_TYPE } = new ConfigurableModuleBuilder<RaftModuleOptions>({
  optionsInjectionToken: RAFT_MODULE_OPTIONS,
})
  .setClassMethodName("forRoot")
  .setExtras(
    {},
    (definition): DynamicModule => ({
      ...definition,
      global: true,
      imports: [...(definition.imports ?? []), ScheduleModule.forRoot()],
      providers: [
        ...(definition.providers ?? []),
        RedisService,
        {
          provide: HeartbeatService,
          useFactory: (redis: RedisService): HeartbeatService => {
            return new HeartbeatService(redis);
          },
          inject: [RedisService],
        },
      ],
      exports: [HeartbeatService],
    }),
  )
  .build();

export class RaftModule extends ConfigurableModuleClass {}

export default RaftModule;

export { ASYNC_OPTIONS_TYPE, OPTIONS_TYPE };
