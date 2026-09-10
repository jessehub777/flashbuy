// ログインページ — Cognito認証（バックエンド経由でログインする）
import { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, isLoading } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  // ログイン前にいたページを覚えておく
  const from = (location.state as { from?: { pathname: string } })?.from?.pathname ?? '/';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!email || !password) { setError('メールアドレスとパスワードを入力してください'); return; }
    try {
      await login(email, password);
      // ログイン成功したら元のページに戻る
      navigate(from, { replace: true });
    } catch {
      setError('ログインに失敗しました。もう一度お試しください。');
    }
  };

  const handleDemoLogin = (role: 'user' | 'admin') => {
    const demoEmail = role === 'admin' ? 'admin@flashbuy.demo' : 'user@flashbuy.demo';
    setEmail(demoEmail);
    setPassword('Demo1234!');
  };

  return (
    <div className="min-h-[calc(100vh-130px)] flex items-center justify-center px-4 page-enter">
      <div className="w-full max-w-[400px]">
        {/* ロゴ */}
        <div className="text-center mb-10">
          <Link to="/" className="font-oswald font-bold text-[28px] text-paper no-underline">
            FLASH<span className="text-flash">BUY</span>
          </Link>
          <p className="font-mono text-[12px] text-muted mt-2 tracking-[1px]">
            アカウントにログイン
          </p>
        </div>

        {/* デモ用ショートカット */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => handleDemoLogin('user')}
            className="flex-1 py-2 border border-white/[0.12] text-muted font-mono text-[11px] tracking-[1px] rounded-[3px] hover:border-white/25 hover:text-paper transition-colors"
          >
            USER でデモ
          </button>
          <button
            onClick={() => handleDemoLogin('admin')}
            className="flex-1 py-2 border border-lottery/30 text-lottery font-mono text-[11px] tracking-[1px] rounded-[3px] hover:border-lottery/60 transition-colors"
          >
            ADMIN でデモ
          </button>
        </div>

        {/* フォーム */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="font-mono text-[11px] text-muted tracking-[1.5px] uppercase block mb-1.5">
              メールアドレス
            </label>
            <input
              id="email"
              type="email"
              className="input-dark"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </div>

          <div>
            <label className="font-mono text-[11px] text-muted tracking-[1.5px] uppercase block mb-1.5">
              パスワード
            </label>
            <input
              id="password"
              type="password"
              className="input-dark"
              placeholder=""
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>

          {error && (
            <p className="font-mono text-[12px] text-flash tracking-[0.5px]">{error}</p>
          )}

          <button
            type="submit"
            className="btn-base bg-flash mt-2 py-3 text-[14px]"
            disabled={isLoading}
          >
            {isLoading ? 'ログイン中...' : 'ログイン'}
          </button>
        </form>

        <div className="mt-6 text-center">
          <p className="font-mono text-[12px] text-muted tracking-[0.5px]">
            アカウントをお持ちでない方は
            <Link to="/register" className="text-flash ml-1 hover:underline">
              新規登録
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
