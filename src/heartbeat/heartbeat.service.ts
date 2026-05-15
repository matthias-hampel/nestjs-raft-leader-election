import { Inject, Injectable, Logger, Optional, OnApplicationBootstrap } from "@nestjs/common";
import { Interval } from "@nestjs/schedule";
import { randomInt, randomUUID } from "crypto";
import { differenceInMilliseconds } from "date-fns";
import { HEARTBEAT_RAFT_CHANNELS, type RaftChannels } from "../raft-options";
import { RedisService as Redis } from "../redis/redis.service";

export const HEARTBEAT_INTERVAL = 300;

@Injectable()
export class HeartbeatService implements OnApplicationBootstrap {
  private readonly logger = new Logger(HeartbeatService.name);

  private readonly nodeId = Object.freeze(randomUUID());

  private election: boolean = false;
  private leaderId: string | null = null;
  private activeNodes: { [key: string]: Date } = {};
  private votesForThisNode = 0;

  private readonly channels: RaftChannels;

  constructor(
    private readonly redis: Redis,
    @Optional()
    @Inject(HEARTBEAT_RAFT_CHANNELS)
    channels?: RaftChannels | null,
  ) {
    if (channels == null) {
      throw new Error("HeartbeatService requires pub/sub channel names; register RaftModule with `namespace`, or bind HEARTBEAT_RAFT_CHANNELS in tests.");
    }
    this.channels = channels;
  }

  public async onApplicationBootstrap(): Promise<void> {
    await this.redis.subscriber.subscribe(this.channels.heartbeat, (message) => {
      this.activeNodes[message] = new Date();
    });

    await this.redis.subscriber.subscribe(this.channels.election, async (message) => {
      this.election = true;
      await this.voteForNode(message);
    });

    await this.redis.subscriber.subscribe(this.channels.vote, async (message) => {
      if (message && message === this.nodeId) {
        this.votesForThisNode++;

        if (this.votesForThisNode >= Math.floor(Object.keys(this.activeNodes).length / 2) + 1) {
          this.election = false;
          await this.redis.client.publish(this.channels.leader, this.nodeId);
        }
      }
    });

    await this.redis.subscriber.subscribe(this.channels.leader, (message) => {
      this.logger.debug(`${message} is now the leader`);

      this.leaderId = message;
      this.election = false;
      this.votesForThisNode = 0;
    });
  }

  public isLeader(): boolean {
    return this.nodeId === this.leaderId;
  }

  private async voteForNode(nodeId: string): Promise<void> {
    await this.sendHeartbeat();
    this.clearInactiveNodes();

    if (this.election) {
      await this.redis.client.publish(this.channels.vote, nodeId);
    }
  }

  @Interval(HEARTBEAT_INTERVAL)
  private async sendHeartbeat(): Promise<void> {
    await this.redis.client.publish(this.channels.heartbeat, this.nodeId);
  }

  @Interval(randomInt(HEARTBEAT_INTERVAL * 2, HEARTBEAT_INTERVAL * 4))
  public async checkLeader(): Promise<void> {
    this.clearInactiveNodes();

    const hasLeader = this.leaderId && this.leaderId !== "" && Object.keys(this.activeNodes).includes(this.leaderId);

    if (!hasLeader && !this.election) {
      this.election = true;

      await this.redis.client.publish(this.channels.election, this.nodeId);
    }
  }

  @Interval(HEARTBEAT_INTERVAL)
  private clearInactiveNodes(): void {
    const now = new Date();

    for (const node of Object.keys(this.activeNodes)) {
      const diff = differenceInMilliseconds(now, this.activeNodes[node]);

      if (diff > HEARTBEAT_INTERVAL * 2) {
        delete this.activeNodes[node];
      }
    }
  }
}
