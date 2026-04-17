export interface PluginConfig {
  platforms?: Record<string, object>;
}

export function zephyrMetroRNEFPlugin(
  config?: PluginConfig,
): (api: unknown) => { name: string; description: string };
