const REMOTE_LOAD_TIMEOUT_MS = 20_000;

export async function loadRemote<T>(
  name: string,
  loader: () => Promise<T>,
  timeoutMs = REMOTE_LOAD_TIMEOUT_MS,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${name} did not load in time`)),
      timeoutMs,
    );
  });

  try {
    return await Promise.race([loader(), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
