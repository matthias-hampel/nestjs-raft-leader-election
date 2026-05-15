import { buildRaftChannels } from "./raft-options";

describe("buildRaftChannels", () => {
  it("prefixes canonical suffixes onto trimmed namespace", () => {
    expect(buildRaftChannels(" my-app\t")).toEqual({
      heartbeat: "my-app:heartbeat",
      election: "my-app:election",
      vote: "my-app:vote",
      leader: "my-app:leader",
    });
  });

  it("throws when namespace is empty or whitespace", () => {
    expect(() => buildRaftChannels("")).toThrow(/namespace/);
    expect(() => buildRaftChannels("   ")).toThrow(/namespace/);
  });
});
