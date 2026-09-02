export interface Env {
  SHARES: R2Bucket;
  ASSETS: Fetcher;
  UNLOCK_LIMITER: {
    limit(options: { key: string }): Promise<{ success: boolean }>;
  };
  PUBLISH_TOKEN: string;
  COOKIE_SECRET: string;
}
