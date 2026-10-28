const REMEMBER_SESSION_KEY = 'jm-remember-session';
const REMEMBERED_EMAIL_KEY = 'jm-remembered-email';
const AUTH_STORAGE_KEY_PATTERN = /^sb-[a-z0-9]+-auth-token(?:-(?:code-verifier|user))?$/;

let rememberSession = window.localStorage.getItem(REMEMBER_SESSION_KEY) !== 'false';

const isAuthStorageKey = (key: string) => AUTH_STORAGE_KEY_PATTERN.test(key);

const removeBrowserAuthValues = (storage: Storage) => {
  Object.keys(storage)
    .filter(isAuthStorageKey)
    .forEach((key) => storage.removeItem(key));
};

export const getRememberSessionPreference = () => rememberSession;

export const getRememberedEmail = () => (
  rememberSession ? window.localStorage.getItem(REMEMBERED_EMAIL_KEY) ?? '' : ''
);

export const setRememberedEmail = (email: string) => {
  if (rememberSession && email.trim()) {
    window.localStorage.setItem(REMEMBERED_EMAIL_KEY, email.trim().toLocaleLowerCase('es-MX'));
  } else {
    window.localStorage.removeItem(REMEMBERED_EMAIL_KEY);
  }
};

export const setRememberSessionPreference = async (enabled: boolean) => {
  rememberSession = enabled;
  window.localStorage.setItem(REMEMBER_SESSION_KEY, String(enabled));

  if (enabled) return;

  window.localStorage.removeItem(REMEMBERED_EMAIL_KEY);
  removeBrowserAuthValues(window.localStorage);
  await window.judicialDesktop?.clearSecureAuthValues?.().catch(() => undefined);
};

export const secureAuthStorage = {
  async getItem(key: string) {
    if (!isAuthStorageKey(key)) return null;

    const transientValue = window.sessionStorage.getItem(key);
    if (transientValue) return transientValue;
    if (!rememberSession) return null;

    if (window.judicialDesktop?.getSecureAuthValue) {
      const protectedValue = await window.judicialDesktop.getSecureAuthValue(key).catch(() => null);
      if (protectedValue) return protectedValue;

      const legacyValue = window.localStorage.getItem(key);
      if (legacyValue) {
        const migration = await window.judicialDesktop.setSecureAuthValue?.(key, legacyValue).catch(() => null);
        if (migration?.ok) window.localStorage.removeItem(key);
        return legacyValue;
      }

      return null;
    }

    return window.localStorage.getItem(key);
  },

  async setItem(key: string, value: string) {
    if (!isAuthStorageKey(key)) return;
    window.sessionStorage.setItem(key, value);

    if (!rememberSession) return;
    if (window.judicialDesktop?.setSecureAuthValue) {
      await window.judicialDesktop.setSecureAuthValue(key, value).catch(() => undefined);
      return;
    }

    window.localStorage.setItem(key, value);
  },

  async removeItem(key: string) {
    if (!isAuthStorageKey(key)) return;
    window.sessionStorage.removeItem(key);
    window.localStorage.removeItem(key);
    await window.judicialDesktop?.removeSecureAuthValue?.(key).catch(() => undefined);
  },
};
