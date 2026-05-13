# nestjs-raft-leader-election

## Description

Leader election module for NestJS.

## Usage

### Install

Add this library and ensure NestJS scheduling is available (`RaftModule` registers `@Interval` handlers).

```bash
pnpm add nestjs-raft-leader-election @nestjs/schedule
# or: npm install / yarn add
```

Your app already needs compatible `@nestjs/common` and `@nestjs/core` versions (see this repo’s `package.json`). Redis must be reachable from every replica that participates in election.

### Register the module

Import `RaftModule` and call `forRoot` with Redis connection options:

```typescript
import { Module } from "@nestjs/common";
import { RaftModule } from "nestjs-raft-leader-election";

@Module({
  imports: [
    RaftModule.forRoot({
      redis: {
        url: process.env.REDIS_URL ?? "redis://localhost:6379",
        password: process.env.REDIS_PASSWORD, // optional
      },
    }),
  ],
})
export class AppModule {}
```

### Async registration with `ConfigModule`

Use `forRootAsync` when Redis URL (or password) comes from `@nestjs/config` instead of literals. Install config package alongside this library:

```bash
pnpm add @nestjs/config
```

Load `ConfigModule` first so `ConfigService` is available to the raft factory (`imports` + `inject` pattern below matches Nest configurable modules):

```typescript
import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { RaftModule } from "nestjs-raft-leader-election";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    RaftModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        redis: {
          url: config.getOrThrow<string>("REDIS_URL"),
          password: config.get<string>("REDIS_PASSWORD"),
        },
      }),
    }),
  ],
})
export class AppModule {}
```

If `RaftModule.forRootAsync` is the first consumer of `ConfigService`, you can omit `imports: [ConfigModule]` when configuration is globally registered (`isGlobal: true`).

### Use leader checks

Inject `HeartbeatService` where you need to run code only on the elected leader (cron, background jobs, single-writer paths).

```typescript
import { Injectable } from "@nestjs/common";
import { HeartbeatService } from "nestjs-raft-leader-election";

@Injectable()
export class JobsService {
  constructor(private readonly heartbeat: HeartbeatService) {}

  async runIfLeader(): Promise<void> {
    if (!this.heartbeat.isLeader()) {
      return;
    }
    // leader-only work
  }
}
```

`HeartbeatService` starts Redis subscriptions on application bootstrap and publishes heartbeats on a fixed interval; `isLeader()` compares this instance’s node id with the current leader announced over Redis.

**Operational note:** All participating Nest processes must use the **same Redis** so pub/sub channels (`heartbeat`, `election`, `vote`, `leader`) are shared.

## Project setup

```bash
$ pnpm install
```

## Build project

```bash
$ pnpm run build
```

## Compile and run the project

```bash
# development
$ pnpm run start

# watch mode
$ pnpm run start:dev

# production mode
$ pnpm run start:prod
```

## Run tests

```bash
# unit tests
$ pnpm run test

# e2e tests
$ docker run -p 6379:6379 redis
$ pnpm run test:e2e

# test coverage
$ pnpm run test:cov
```

## License

This project is [MIT licensed](https://github.com/matthias-hampel/nestjs-raft/blob/master/LICENSE).
