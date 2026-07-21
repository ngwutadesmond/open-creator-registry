import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
/** @type {Set<import('node:child_process').ChildProcess>} */
const children = new Set();

/** @param {string} script */
function start(script) {
  const child = spawn(npmCommand, ['run', script], { stdio: 'inherit' });
  children.add(child);
  child.once('exit', () => children.delete(child));
  return child;
}

/**
 * @param {string} url
 * @param {import('node:child_process').ChildProcess} child
 */
async function waitForHealth(url, child) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (child.exitCode !== null) throw new Error('The public Worker exited before becoming ready.');
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1_000) });
      if (response.ok) return;
    } catch {
      await delay(0);
    }
    await delay(250);
  }
  throw new Error('Timed out waiting for the public Worker health endpoint.');
}

/** @param {NodeJS.Signals} signal */
function stopChildren(signal) {
  for (const child of children) child.kill(signal);
}

/** @type {NodeJS.Signals[]} */
const shutdownSignals = ['SIGINT', 'SIGTERM'];
for (const signal of shutdownSignals) {
  process.once(signal, () => stopChildren(signal));
}

/**
 * @param {import('node:child_process').ChildProcess} child
 * @returns {Promise<number>}
 */
function whenExited(child) {
  return new Promise((resolve) => child.once('exit', (code) => resolve(code ?? 1)));
}

const publicWorker = start('dev:public');
try {
  await waitForHealth('http://localhost:5173/api/v1/health', publicWorker);
  const adminWorker = start('dev:admin');
  const exitCode = await Promise.race([whenExited(publicWorker), whenExited(adminWorker)]);
  stopChildren('SIGTERM');
  process.exitCode = exitCode;
} catch (error) {
  stopChildren('SIGTERM');
  throw error;
}
