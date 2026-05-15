/** Resolved pub/sub channel names used by raft leader election. */
export interface RaftChannels {
  heartbeat: string;
  election: string;
  vote: string;
  leader: string;
}

/**
 * Builds channel names for `namespace` (`${namespace}:heartbeat`, …).
 * @throws Error if namespace is missing or whitespace-only after trim (same rules as {@link RaftModuleOptions.namespace})
 */
export function buildRaftChannels(namespace: string): RaftChannels {
  const key = typeof namespace === "string" ? namespace.trim() : "";
  if (!key) {
    throw new Error("Raft `namespace` is required and must be a non-empty string.");
  }
  return {
    heartbeat: `${key}:heartbeat`,
    election: `${key}:election`,
    vote: `${key}:vote`,
    leader: `${key}:leader`,
  };
}

export interface RaftModuleOptions {
  redis: {
    url: string;
    password?: string;
  };
  /**
   * Isolates pub/sub from other apps on the same Redis. All replicas of one logical app share the same value.
   * Non-empty string (leading/trailing whitespace trimmed). Required.
   */
  namespace: string;
}

/** Injection token for optional `RaftChannels` when resolving `HeartbeatService` via Nest DI only. */
export const HEARTBEAT_RAFT_CHANNELS = Symbol("HEARTBEAT_RAFT_CHANNELS");

/** Injection token for `RaftModuleOptions` when using `RedisService` or custom providers. */
export const RAFT_MODULE_OPTIONS = Symbol("RAFT_MODULE_OPTIONS");
