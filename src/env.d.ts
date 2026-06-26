/// <reference path="../.astro/types.d.ts" />

type Runtime = import("@astrojs/cloudflare").Runtime<
  import("./lib/estimate-types").CloudflareEnv
>;

declare namespace App {
  interface Locals extends Runtime {}
}
