export interface AuthUser {
  uid: string;
  loginId: string;
  displayName: string;
}

export const VALID_LOGIN_ID = "Admin";
export const VALID_PASSWORD = "admin24";
const AUTH_STORAGE_KEY = "rika_auth_session";

export interface ValidationResult {
  valid: boolean;
  error?: string;
  user?: AuthUser;
}

export function validateCredentials(loginId: string, password: string): ValidationResult {
  const trimmedId = loginId.trim();
  if (!trimmedId) {
    return { valid: false, error: "Please enter your Login ID." };
  }
  if (!password) {
    return { valid: false, error: "Please enter your password." };
  }
  if (trimmedId === VALID_LOGIN_ID && password === VALID_PASSWORD) {
    return {
      valid: true,
      user: {
        uid: "admin",
        loginId: VALID_LOGIN_ID,
        displayName: "Admin",
      },
    };
  }
  return {
    valid: false,
    error: "Invalid Login ID or password. Please try again.",
  };
}

type AuthListener = (user: AuthUser | null) => void;
const listeners = new Set<AuthListener>();

function notifyListeners(user: AuthUser | null) {
  listeners.forEach((listener) => listener(user));
}

export function getCurrentUser(): AuthUser | null {
  if (typeof window === "undefined" || !window.localStorage) {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AuthUser;
    if (parsed && parsed.uid && parsed.loginId === VALID_LOGIN_ID) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export function loginWithCredentials(loginId: string, password: string): ValidationResult {
  const result = validateCredentials(loginId, password);
  if (result.valid && result.user) {
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(result.user));
    }
    notifyListeners(result.user);
  }
  return result;
}

export function logoutUser(): void {
  if (typeof window !== "undefined" && window.localStorage) {
    window.localStorage.removeItem(AUTH_STORAGE_KEY);
  }
  notifyListeners(null);
}

export function onAuthSessionChanged(listener: AuthListener): () => void {
  listeners.add(listener);
  listener(getCurrentUser());
  return () => {
    listeners.delete(listener);
  };
}
