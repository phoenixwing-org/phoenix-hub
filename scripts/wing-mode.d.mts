export declare function pnhCleanWingEnvironment(
  environment?: Record<string, string | undefined>,
): Record<string, string | undefined>;
export declare function pnhResolveLocalWing(
  projectRoot: string,
  environment?: Record<string, string | undefined>,
): { root: string; version: string };
export declare function pnhLocalWingAliases(
  environment?: Record<string, string | undefined>,
): Array<{ find: RegExp; replacement: string }>;
