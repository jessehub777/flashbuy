// Auth store — manages authentication state (Cognito mock)
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User } from '../types';
import { api } from '../services/api';

interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName: string) => Promise<void>;
  logout: () => Promise<void>;
  isLoggedIn: () => boolean;
  isAdmin: () => boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isLoading: false,

      register: async (email, password, displayName) => {
        set({ isLoading: true });
        try {
          await api.register(email, password, displayName);
          set({ isLoading: false });
        } catch {
          set({ isLoading: false });
          throw new Error('登録に失敗しました');
        }
      },

      login: async (email, password) => {
        set({ isLoading: true });
        try {
          const { user, token } = await api.login(email, password);
          set({ user: user as User, token, isLoading: false });
        } catch {
          set({ isLoading: false });
          throw new Error('ログインに失敗しました');
        }
      },

      logout: async () => {
        await api.logout();
        set({ user: null, token: null });
      },

      isLoggedIn: () => !!get().user,
      isAdmin: () => get().user?.role === 'admin',
    }),
    {
      name: 'flashbuy-auth',
      partialize: (state) => ({ user: state.user, token: state.token }),
    }
  )
);
