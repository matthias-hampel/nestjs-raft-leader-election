import { ConfigurableModuleBuilder } from "@nestjs/common";

export interface RaftModuleOptions {
  redis: {
    url: string;
    password?: string;
  };
}

export const {
  ConfigurableModuleClass,
  MODULE_OPTIONS_TOKEN: RAFT_MODULE_OPTIONS,
  OPTIONS_TYPE,
  ASYNC_OPTIONS_TYPE,
} = new ConfigurableModuleBuilder<RaftModuleOptions>().setClassMethodName("forRoot").build();
