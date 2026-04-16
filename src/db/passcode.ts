import { getStore, saveStore, isDatabaseReady } from './tinybase';

const PASSCODE_KEY = 'passcode';
const PASSCODE_ENABLED_KEY = 'passcodeEnabled';
const BIOMETRIC_ENABLED_KEY = 'biometricEnabled';

export async function getPasscode(): Promise<string | null> {
  if (!isDatabaseReady()) return null;
  const store = getStore();
  const passcode = store.getValue(PASSCODE_KEY) as string | undefined;
  return passcode || null;
}

export async function setPasscode(passcode: string): Promise<void> {
  if (!isDatabaseReady()) return;
  const store = getStore();
  store.setValue(PASSCODE_KEY, passcode);
  await saveStore();
}

export async function isPasscodeEnabled(): Promise<boolean> {
  if (!isDatabaseReady()) return false;
  const store = getStore();
  const enabled = store.getValue(PASSCODE_ENABLED_KEY) as string | undefined;
  return enabled === 'true';
}

export async function setPasscodeEnabled(enabled: boolean): Promise<void> {
  if (!isDatabaseReady()) return;
  const store = getStore();
  store.setValue(PASSCODE_ENABLED_KEY, enabled ? 'true' : 'false');
  await saveStore();
}

export async function isBiometricEnabled(): Promise<boolean> {
  if (!isDatabaseReady()) return false;
  const store = getStore();
  const enabled = store.getValue(BIOMETRIC_ENABLED_KEY) as string | undefined;
  return enabled === 'true';
}

export async function setBiometricEnabled(enabled: boolean): Promise<void> {
  if (!isDatabaseReady()) return;
  const store = getStore();
  store.setValue(BIOMETRIC_ENABLED_KEY, enabled ? 'true' : 'false');
  await saveStore();
}

export async function verifyPasscode(input: string): Promise<boolean> {
  const storedPasscode = await getPasscode();
  return storedPasscode === input;
}

export async function clearPasscode(): Promise<void> {
  if (!isDatabaseReady()) return;
  const store = getStore();
  store.setValue(PASSCODE_KEY, '');
  store.setValue(PASSCODE_ENABLED_KEY, 'false');
  store.setValue(BIOMETRIC_ENABLED_KEY, 'false');
  await saveStore();
}