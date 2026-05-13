import { Module } from "@nestjs/common";
import { RedisModule } from "../redis/redis.module";
import { HeartbeatService } from "./heartbeat.service";

@Module({
  imports: [RedisModule],
  exports: [HeartbeatService],
  providers: [HeartbeatService],
})
export class HeartbeatModule {}
