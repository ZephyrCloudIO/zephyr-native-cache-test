/**
 * Strip integrity hashes for local file: tarball dependencies so that
 * pnpm always re-resolves them on install. Without this, pnpm trusts
 * the lockfile integrity and skips re-extraction when tarballs are rebuilt.
 */
function afterAllResolved(lockfile, context) {
  const packages = lockfile.packages ?? {};
  for (const [key, pkg] of Object.entries(packages)) {
    if (
      pkg.resolution &&
      typeof pkg.resolution.tarball === 'string' &&
      pkg.resolution.tarball.startsWith('file:tarballs/')
    ) {
      delete pkg.resolution.integrity;
      context.log(`stripped integrity for ${key}`);
    }
  }
  return lockfile;
}

module.exports = {
  hooks: {
    afterAllResolved,
  },
};
