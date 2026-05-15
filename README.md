# nestjs-raft-leader-election

![NPM Last Update](https://img.shields.io/npm/last-update/nestjs-raft-leader-election)
![GitHub License](https://img.shields.io/github/license/matthias-hampel/nestjs-raft-leader-election)

## Description

Leader election module for NestJS using the [Raft algorithm](https://en.wikipedia.org/wiki/Raft_(algorithm)).

## Usage

### Peer dependencies

This package does **not** bundle Nest packages. Align versions with Nest **11.x** (`^11.0.0`; minimum satisfies `11.0.0`). Your app must provide a single resolved copy of `@nestjs/common` / `@nestjs/core` (same major as peers). Installing them twice—for example nested under `node_modules/nestjs-raft-leader-election` and at the app root—breaks the global DI container (e.g. `Reflector` missing for `@nestjs/schedule` / `SchedulerMetadataAccessor`).

`RaftModule` calls `ScheduleModule.forRoot()` and `HeartbeatService` uses `@Interval`, so **`@nestjs/schedule` is required** (install it in the app alongside Nest core).

Express-based apps normally already have `@nestjs/platform-express`; pin it so it matches `@nestjs/common` / `@nestjs/core`.

```bash
pnpm add nestjs-raft-leader-election @nestjs/common @nestjs/core @nestjs/platform-express @nestjs/schedule
# npm install nestjs-raft-leader-election @nestjs/common @nestjs/core @nestjs/platform-express @nestjs/schedule
```

After install, `pnpm why @nestjs/core` (or npm equivalent) should show **one** physical `@nestjs/core` for the workspace, not a second tree only inside this library.

### Install

Redis must be reachable from every replica that participates in election.

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

This project is [MIT licensed](https://github.com/matthias-hampel/nestjs-raft-leader-election/blob/main/LICENSE).
