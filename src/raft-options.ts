export interface RaftModuleOptions {
  redis: {
    url: string;
    password?: string;
  };
}

/** Injection token for `RaftModuleOptions` when using `RedisService` or custom providers. */
export const RAFT_MODULE_OPTIONS = Symbol("RAFT_MODULE_OPTIONS");
