#!/usr/bin/env node
/**
 * Ensures @zoom/rtms native prebuild is present and macOS frameworks are extracted.
 * The package's install script can skip prebuild (e.g. lifecycle/script issues); this is idempotent.
 */
const { existsSync, readdirSync, unlinkSync } = require('fs');
const { join } = require('path');
const { execSync } = require('child_process');

const root = join(__dirname, '..');
const rtmsPkg = join(root, 'node_modules', '@zoom', 'rtms');
const releaseDir = join(rtmsPkg, 'build', 'Release');

function main() {
  if (!existsSync(join(rtmsPkg, 'package.json'))) {
    return;
  }

  if (!existsSync(join(releaseDir, 'index.js'))) {
    console.log('[rtms-postinstall] Downloading @zoom/rtms prebuilt binary...');
    execSync('npx prebuild-install -r napi', { cwd: rtmsPkg, stdio: 'inherit', env: process.env });
  }

  if (process.platform === 'darwin' && existsSync(releaseDir)) {
    const archives = readdirSync(releaseDir).filter((f) => f.endsWith('.framework.tar.gz'));
    for (const name of archives) {
      const fp = join(releaseDir, name);
      console.log('[rtms-postinstall] Extracting', name);
      execSync(`tar -xzf "${fp}"`, { cwd: releaseDir, stdio: 'inherit' });
      unlinkSync(fp);
    }
  }
}

main();
