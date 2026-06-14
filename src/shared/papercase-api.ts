export type PapercaseApi = {
  app: {
    getVersion: () => Promise<string>;
  };
};
