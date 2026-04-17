// Version → color mapping used by the host to visually tell remote versions
// apart. Each remote component file mirrors the same hex values locally since
// remotes cannot import from the host.
export const VERSION_COLOR: Record<string, string> = {
  v1: '#3b82f6', // blue-500
  v2: '#22c55e', // green-500
  v3: '#a855f7', // purple-500
};

export function versionColor(version: string | undefined): string {
  return (version && VERSION_COLOR[version]) || '#6b7280'; // gray-500 fallback
}
