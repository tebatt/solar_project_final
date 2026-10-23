import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { api, ApiError, type AuthResponse, type AuthUser, type ClientProfileUpdate, type CompanyRegistrationBody } from '../api/client';
import { clearDeviceRequestData } from './requestStorage';

export const AUTH_TOKEN_KEY = 'utu-auth-token';
export const AUTH_USER_KEY = 'utu-auth-user';

type ClientRegistration = { email: string; phone: string; password: string; full_name: string };

export type AccountRole = AuthUser['role'];

/**
 * Thrown by `login` when the account exists but belongs to a different
 * sign-in screen (for example a client account used on the company portal).
 * No session is stored in that case.
 */
export class WrongAccountTypeError extends Error {
  constructor(readonly role: AccountRole) {
    super(`This is a ${role} account`);
    this.name = 'WrongAccountTypeError';
  }
}

type LoginOptions = {
  /** Only these account types may sign in from the calling screen. */
  allowedRoles?: readonly AccountRole[];
};

type AuthValue = {
  user: AuthUser | null;
  token: string;
  isAuthenticated: boolean;
  isLoading: boolean;
  authModalOpen: boolean;
  authModalMode: 'login' | 'register';
  openAuthModal: () => void;
  openClientRegistration: () => void;
  closeAuthModal: () => void;
  login: (email: string, password: string, options?: LoginOptions) => Promise<AuthUser>;
  register: (kind: 'client' | 'company', body: ClientRegistration | CompanyRegistrationBody) => Promise<AuthUser>;
  registerClient: (body: ClientRegistration) => Promise<AuthUser>;
  registerCompany: (body: CompanyRegistrationBody) => Promise<AuthUser>;
  updateClientProfile: (body: ClientProfileUpdate) => Promise<AuthUser>;
  logout: () => void;
  refreshProfile: () => Promise<AuthUser | null>;
};

const AuthContext = createContext<AuthValue | null>(null);

type PersistedSession = {
  token: string;
  user: AuthUser | null;
};

function isAuthUser(value: unknown): value is AuthUser {
  if (!value || typeof value !== 'object') return false;
  const user = value as Record<string, unknown>;
  return typeof user.id === 'number'
    && typeof user.email === 'string'
    && (typeof user.phone === 'string' || user.phone === null)
    && typeof user.full_name === 'string'
    && (user.role === 'client' || user.role === 'company' || user.role === 'admin')
    && typeof user.is_active === 'boolean'
    && typeof user.is_verified === 'boolean'
    && (typeof user.company_id === 'number' || user.company_id === null)
    && typeof user.created_at === 'string';
}

function readPersistedSession(): PersistedSession {
  try {
    const token = localStorage.getItem(AUTH_TOKEN_KEY) ?? '';
    if (!token) return { token: '', user: null };
    const rawUser = localStorage.getItem(AUTH_USER_KEY);
    if (!rawUser) return { token, user: null };
    try {
      const saved = JSON.parse(rawUser) as unknown;
      if (
        saved
        && typeof saved === 'object'
        && 'token' in saved
        && saved.token === token
        && 'user' in saved
        && isAuthUser(saved.user)
      ) {
        return { token, user: saved.user };
      }
    } catch {
      return { token, user: null };
    }
    return { token, user: null };
  } catch {
    return { token: '', user: null };
  }
}

function persistToken(token: string) {
  try {
    if (token) localStorage.setItem(AUTH_TOKEN_KEY, token);
    else {
      localStorage.removeItem(AUTH_TOKEN_KEY);
      localStorage.removeItem(AUTH_USER_KEY);
    }
  } catch {
    // Keep the active session in memory if browser storage is unavailable.
  }
}

function persistUser(token: string, user: AuthUser) {
  try {
    localStorage.setItem(AUTH_USER_KEY, JSON.stringify({ token, user }));
  } catch {
    // Keep the active session in memory if browser storage is unavailable.
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [initialSession] = useState(readPersistedSession);
  const [token, setToken] = useState(initialSession.token);
  const [user, setUser] = useState<AuthUser | null>(initialSession.user);
  const [isLoading, setLoading] = useState(Boolean(initialSession.token));
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<'login' | 'register'>('login');
  // The pop-up is the client sign-in screen; companies use the portal page.
  const openAuthModal = useCallback(() => {
    setAuthModalMode('login');
    setAuthModalOpen(true);
  }, []);
  const openClientRegistration = useCallback(() => {
    setAuthModalMode('register');
    setAuthModalOpen(true);
  }, []);
  const closeAuthModal = useCallback(() => setAuthModalOpen(false), []);

  const acceptSession = useCallback((response: AuthResponse) => {
    persistToken(response.access_token);
    persistUser(response.access_token, response.user);
    setToken(response.access_token);
    setUser(response.user);
    return response.user;
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!token) {
      setUser(null);
      setLoading(false);
      return null;
    }
    setLoading(true);
    try {
      const profile = await api.authMe(token);
      setUser(profile);
      persistUser(token, profile);
      return profile;
    } catch (cause) {
      if (cause instanceof ApiError && (cause.status === 401 || cause.status === 403)) {
        persistToken('');
        setToken('');
        setUser(null);
      }
      return null;
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void refreshProfile();
  }, [refreshProfile]);

  const login = useCallback(async (email: string, password: string, options?: LoginOptions) => {
    const response = await api.authLogin(email, password);
    // Check the account type before keeping the session, so a wrong-door
    // sign-in leaves nothing behind (and does not clear the device's data).
    if (options?.allowedRoles && !options.allowedRoles.includes(response.user.role)) {
      throw new WrongAccountTypeError(response.user.role);
    }
    return acceptSession(response);
  }, [acceptSession]);

  const registerClient = useCallback(async (body: ClientRegistration) => {
    return acceptSession(await api.authRegisterClient(body));
  }, [acceptSession]);

  const registerCompany = useCallback(async (body: CompanyRegistrationBody) => {
    return acceptSession(await api.authRegisterCompany(body));
  }, [acceptSession]);

  const updateClientProfile = useCallback(async (body: ClientProfileUpdate) => {
    if (!token || user?.role !== 'client') throw new Error('A signed-in client account is required');
    const profile = await api.updateClientProfile(body);
    setUser(profile);
    persistUser(token, profile);
    return profile;
  }, [token, user?.role]);

  const register = useCallback(async (kind: 'client' | 'company', body: ClientRegistration | CompanyRegistrationBody) => {
    if (kind === 'client') {
      if (!('full_name' in body)) throw new Error('Client registration requires a full name');
      return registerClient(body);
    }
    if (!('name' in body)) throw new Error('Company registration requires a company name');
    return registerCompany(body);
  }, [registerClient, registerCompany]);

  const logout = useCallback(() => {
    persistToken('');
    // Leave nothing behind for the next person on a shared device.
    clearDeviceRequestData();
    setToken('');
    setUser(null);
  }, []);

  const value = useMemo<AuthValue>(() => ({
    user,
    token,
    isAuthenticated: Boolean(user && token),
    isLoading,
    authModalOpen,
    authModalMode,
    openAuthModal,
    openClientRegistration,
    closeAuthModal,
    login,
    register,
    registerClient,
    registerCompany,
    updateClientProfile,
    logout,
    refreshProfile,
  }), [user, token, isLoading, authModalOpen, authModalMode, openAuthModal, openClientRegistration, closeAuthModal, login, register, registerClient, registerCompany, updateClientProfile, logout, refreshProfile]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>');
  return value;
}
