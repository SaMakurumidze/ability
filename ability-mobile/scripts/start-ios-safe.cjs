/**
 * iOS-safe LAN startup:
 * - removes EXPO_LOCK_API_URL (if set)
 * - syncs EXPO_PUBLIC_API_URL to LAN IP
 * - picks first free Metro port (8081, 8082, 8083)
 * - starts Expo in LAN mode
 */
const fs = require('fs');
const path = require('path');
const net = require('net');
const { spawn } = require('child_process');

const mobileRoot = path.join(__dirname, '..');
const mobileEnvPath = path.join(mobileRoot, '.env');

function removeApiLockFromMobileEnv() {
  let lines = [];
  try {
    lines = fs.readFileSync(mobileEnvPath, 'utf8').split(/\r?\n/);
  } catch {
    return;
  }
  const out = lines.filter((l) => !/^\s*EXPO_LOCK_API_URL\s*=/.test(l));
  fs.writeFileSync(mobileEnvPath, out.join('\n').replace(/\n+$/, '\n'), 'utf8');
}

function isPortFree(port) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const done = (free) => {
      try {
        socket.destroy();
      } catch {
        /* ignore */
      }
      resolve(free);
    };
    socket.setTimeout(500);
    socket.once('connect', () => done(false));
    socket.once('timeout', () => done(true));
    socket.once('error', (err) => {
      if (err && (err.code === 'ECONNREFUSED' || err.code === 'EHOSTUNREACH' || err.code === 'ETIMEDOUT')) {
        done(true);
        return;
      }
      done(false);
    });
    socket.connect(port, '127.0.0.1');
  });
}

async function pickPort() {
  const candidates = [8081, 8082, 8083];
  for (const port of candidates) {
    // eslint-disable-next-line no-await-in-loop
    if (await isPortFree(port)) return port;
  }
  return 8081;
}

async function main() {
  const args = process.argv.slice(2);
  const clearCache = args.includes('--clear') || args.includes('-c');
  const passToExpo = args.filter((a) => a !== '--clear' && a !== '-c');

  removeApiLockFromMobileEnv();
  require('./sync-expo-api-url.cjs');

  const port = await pickPort();
  console.log('[start-ios-safe] Starting Expo in LAN mode for iPhone.');
  console.log(`[start-ios-safe] Selected Metro port: ${port}`);
  console.log(`[start-ios-safe] Expected Expo URL pattern: exp://<your-pc-lan-ip>:${port}`);
  console.log('[start-ios-safe] If iPhone cannot connect: same Wi-Fi, Private network profile, firewall allow TCP 8081/8082/8083.');

  const expoArgs = ['expo', 'start', '--lan', '--port', String(port)];
  if (clearCache) expoArgs.push('-c');
  expoArgs.push(...passToExpo);

  const child = spawn('npx', expoArgs, {
    cwd: mobileRoot,
    stdio: 'inherit',
    shell: true,
    env: { ...process.env },
  });

  child.on('close', (code) => process.exit(code || 0));
}

main().catch((e) => {
  console.error('[start-ios-safe] Failed:', e.message || e);
  process.exit(1);
});
