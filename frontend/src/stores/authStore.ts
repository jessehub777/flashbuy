// Auth store — 認証状態の管理（Cognito はバックエンド経由で利用する）
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User } from '../types';
import { api } from '../services/api';

interface AuthState {
  user: User | null;
  token: string | null;
  refreshToken: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName: string) => Promise<void>;
  logout: () => Promise<void>;
  setToken: (token: string) => void;
  isLoggedIn: () => boolean;
  isAdmin: () => boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      refreshToken: null,
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
          const { user, token, refreshToken } = await api.login(email, password);
          set({ user: user as User, token, refreshToken, isLoading: false });
        } catch {
          set({ isLoading: false });
          throw new Error('ログインに失敗しました');
        }
      },

      // ログアウト。先にローカルの認証状態を消してから API を呼ぶ。
      //
      // 順番が重要: 逆（API → set）にすると、API が遅い・失敗したときに
      // トークンが消えないまま画面遷移だけが起きる。
      // App.tsx は「期限切れトークンを見つけたら logout を待たずに /login へ飛ばす」ので、
      // 消えないトークンが毎回検知され、/login を延々と読み直す（＝無限リロード）になる。
      // そのため API の成否に関わらず、ローカルは必ずログアウト状態にする。
      logout: async () => {
        set({ user: null, token: null, refreshToken: null });
        try {
          await api.logout();
        } catch {
          // サーバー側のセッション破棄に失敗しても、ローカルはログアウト済みとして扱う
        }
      },

      // トークン自動更新後に呼ばれる（アクセストークンの差し替え）
      setToken: (token: string) => set({ token }),

      isLoggedIn: () => !!get().user,
      isAdmin: () => get().user?.role === 'admin',
    }),
    {
      name: 'flashbuy-auth',
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        refreshToken: state.refreshToken,
      }),
    }
  )
);
