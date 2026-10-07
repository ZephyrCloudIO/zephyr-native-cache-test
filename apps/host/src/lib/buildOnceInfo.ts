import {Platform} from 'react-native';

export interface BuildOnceInfo {
  enabled: boolean;
  runId: string;
  hostBuildId: string;
}

export function getBuildOnceInfo(): BuildOnceInfo {
  const enabled = process.env.ZEPHYR_BUILD_ONCE_DEMO === '1';
  const runId = process.env.ZEPHYR_BUILD_ONCE_RUN_ID || '';
  if (enabled && !runId) throw new Error('Build-once host requires ZEPHYR_BUILD_ONCE_RUN_ID');
  return {enabled, runId, hostBuildId: enabled ? `${runId}:${Platform.OS}` : ''};
}
