import { sleep } from './e2e-runtime.js';

// Replaces the dashboard steps of the real-Zephyr OTA flow with Zephyr API calls:
// look up the version a publish just created, and point an environment at it.

interface VersionEntry {
  id: string;
  version: string;
  published: string;
  remote_host: string;
}

export interface PublishedVersion {
  appUid: string;
  versionId: string;
  versionName: string;
  remoteHost: string;
}

async function zeApi<T>(method: string, path: string, body?: unknown): Promise<T> {
  const base = process.env.ZE_API;
  const token = process.env.ZE_SECRET_TOKEN;
  if (!base || !token) throw new Error('ZE_API and ZE_SECRET_TOKEN are required to pin environments');
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${text.slice(0, 300)}`);
  return (text ? JSON.parse(text) : undefined) as T;
}

function appPath(appUid: string): string {
  const [application, project, organization] = appUid.split('.');
  return `/v2/application/${organization}/${project}/${application}`;
}

/** The newest version of `appUid`, i.e. the one the publish that just finished created. */
export async function latestVersion(appUid: string): Promise<PublishedVersion> {
  const list = await zeApi<{ entities: VersionEntry[] }>(
    'GET',
    `${appPath(appUid)}/versions?page=0&sortBy=published&sortOrder=desc`,
  );
  const newest = [...list.entities].sort((a, b) => b.published.localeCompare(a.published))[0];
  if (!newest) throw new Error(`No versions found for ${appUid}`);
  return { appUid, versionId: newest.id, versionName: newest.version, remoteHost: newest.remote_host };
}

/**
 * Points environment `envName` of the version's app at that version, creating the environment
 * if needed, then waits until the environment hostname serves the version's mf-manifest.json.
 */
export async function pinEnvironment(
  target: PublishedVersion,
  envName: string,
  log: (m: string) => void,
): Promise<void> {
  const base = appPath(target.appUid);
  const condition = { channel: 'version', value: { value: target.versionId, label: target.versionName } };
  const envs = await zeApi<{ entities?: Array<{ name: string }>; value?: Array<{ name: string }> }>(
    'GET',
    `${base}/environment`,
  );
  const exists = (envs.entities ?? envs.value ?? []).some((env) => env.name === envName);
  const pinnedAt = Date.now();
  if (exists) {
    await zeApi('POST', `${base}/environment/${envName}`, { applicationVersionId: target.versionId, condition });
  } else {
    await zeApi('POST', `${base}/environment`, { name: envName, applicationVersionId: target.versionId, condition });
  }
  log(`Pinned ${target.appUid}@${envName} -> ${target.versionName} (${target.versionId})`);

  const env = await zeApi<{ value: { remote_host: string } }>('GET', `${base}/environment/${envName}`);
  const envHost = env.value.remote_host.replace(/\/$/, '');
  const expected = await fetchText(`${target.remoteHost.replace(/\/$/, '')}/mf-manifest.json`);
  const deadline = pinnedAt + 300_000;
  while (Date.now() < deadline) {
    if ((await fetchText(`${envHost}/mf-manifest.json`)) === expected) {
      log(`${envHost} serves ${target.versionName} ${((Date.now() - pinnedAt) / 1000).toFixed(1)}s after the pin`);
      return;
    }
    await sleep(2_000);
  }
  throw new Error(`${envHost} did not serve ${target.versionName} within 300s`);
}

async function fetchText(url: string): Promise<string | undefined> {
  const res = await fetch(url, { cache: 'no-store' }).catch(() => undefined);
  return res?.ok ? res.text() : undefined;
}
