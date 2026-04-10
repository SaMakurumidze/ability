/**
 * Writes EXPO_PUBLIC_API_URL in .env to the current machine's LAN IPv4 + API port
 * so DHCP changing your IP does not require manual edits. Run automatically from npm start.
 *
 * Skip: set EXPO_LOCK_API_URL=1 in .env or the environment (e.g. fixed ngrok URL).
 * Android emulator: set EXPO_ANDROID_EMULATOR=1 to use http://10.0.2.2:PORT
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

const envPath = path.join(__dirname, '..', '.env');
/** Single source of truth: ability-api/.env PORT (same folder as AW repo root). */
const abilityApiEnvPath = path.join(__dirname, '..', '..', 'ability-api', '.env');

function readApiPortFromEnvFile(raw) {
  const m = /^API_PORT\s*=\s*(\d+)\s*$/m.exec(raw);
  return m ? m[1] : null;
}

function readPortFromAbilityApiEnv() {
  try {
    const raw = fs.readFileSync(abilityApiEnvPath, 'utf8');
    const m = /^PORT\s*=\s*(\d+)\s*$/m.exec(raw);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

function isPrivateIPv4(ip) {
  if (!ip || typeof ip !== 'string') return false;
  if (ip.startsWith('10.')) return true;
  if (ip.startsWith('192.168.')) return true;
  const m = /^172\.(\d+)\./.exec(ip);
  if (m) {
    const second = Number(m[1], 10);
    return second >= 16 && second <= 31;
  }
  return false;
}

function interfaceScore(name) {
  const n = String(name).toLowerCase();
  if (/virtual|vmware|hyper-v|vethernet|wsl|docker|vbox|bluetooth|tunnel|npcap|loopback/i.test(n)) {
    return -100;
  }
  if (/wi-?fi|wireless|wlan|802\.11/i.test(n)) return 50;
  if (/ethernet|eth[^e]|lan\b/i.test(n)) return 40;
  return 0;
}

function pickLanIPv4() {
  const nets = os.networkInterfaces();
  const candidates = [];
  for (const name of Object.keys(nets)) {
    const score = interfaceScore(name);
    if (score < 0) continue;
    for (const net of nets[name] || []) {
      if (net.family !== 'IPv4' && net.family !== 4) continue;
      if (net.internal) continue;
      const ip = net.address;
      if (ip.startsWith('169.254.')) continue;
      if (!isPrivateIPv4(ip)) continue;
      candidates.push({ name, ip, score });
    }
  }
  candidates.sort((a, b) => b.score - a.score || a.ip.localeCompare(b.ip));
  return candidates[0]?.ip ?? null;
}

function readEnvRaw() {
  try {
    return fs.readFileSync(envPath, 'utf8');
  } catch {
    return '';
  }
}

function isLocked(raw) {
  if (process.env.EXPO_LOCK_API_URL === '1' || /^true$/i.test(process.env.EXPO_LOCK_API_URL || '')) {
    return true;
  }
  return /^EXPO_LOCK_API_URL\s*=\s*(1|true)\s*$/im.test(raw);
}

function sync() {
  if (isLocked(readEnvRaw())) {
    console.log('[sync-expo-api-url] EXPO_LOCK_API_URL is set — skipping (use for ngrok / fixed URL).');
    return;
  }

  const useEmulator = process.env.EXPO_ANDROID_EMULATOR === '1';
  const ip = useEmulator ? '10.0.2.2' : pickLanIPv4();
  if (!ip) {
    console.warn(
      '[sync-expo-api-url] No suitable LAN IPv4 found. Connect to Wi‑Fi or set EXPO_PUBLIC_API_URL manually.'
    );
    return;
  }

  const rawForPort = readEnvRaw();
  const portMobile = readApiPortFromEnvFile(rawForPort);
  const portApi = readPortFromAbilityApiEnv();
  const API_PORT = process.env.API_PORT || portMobile || portApi || '3000';
  if (portApi && !process.env.API_PORT && !portMobile) {
    console.log(`[sync-expo-api-url] Using PORT from ability-api/.env → ${API_PORT}`);
  }
  const url = `http://${ip}:${API_PORT}`;
  const newLine = `EXPO_PUBLIC_API_URL=${url}`;
  let raw = readEnvRaw();
  const lines = raw.split(/\r?\n/);
  let replaced = false;
  const out = lines.map((line) => {
    if (/^\s*EXPO_PUBLIC_API_URL\s*=/.test(line)) {
      replaced = true;
      return newLine;
    }
    return line;
  });
  if (!replaced) {
    if (out.length === 0 || out[out.length - 1] !== '') out.push('');
    out.push(newLine);
  }
  fs.writeFileSync(envPath, out.join('\n').replace(/\n+$/, '\n'), 'utf8');
  console.log(`[sync-expo-api-url] ${newLine}`);
}

sync();
