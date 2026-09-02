// 新規登録ページ
import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';

export default function Register() {
  const navigate = useNavigate();
  const { register, isLoading } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email || !password || !displayName || !confirmPassword) {
      setError('すべての項目を入力してください');
      return;
    }

    if (password !== confirmPassword) {
      setError('パスワードが一致しません');
      return;
    }

    try {
      await register(email, password, displayName);
      navigate('/login', { replace: true });
    } catch {
      setError('登録に失敗しました。もう一度お試しください。');
    }
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
            新規アカウント登録
          </p>
        </div>

        {/* フォーム */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="font-mono text-[11px] text-muted tracking-[1.5px] uppercase block mb-1.5">
              表示名
            </label>
            <input
              type="text"
              className="input-dark"
              placeholder="フラッシュタロウ"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </div>

          <div>
            <label className="font-mono text-[11px] text-muted tracking-[1.5px] uppercase block mb-1.5">
              メールアドレス
            </label>
            <input
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
              type="password"
              className="input-dark"
              placeholder=""
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>

          <div>
            <label className="font-mono text-[11px] text-muted tracking-[1.5px] uppercase block mb-1.5">
              パスワード（確認）
            </label>
            <input
              type="password"
              className="input-dark"
              placeholder=""
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
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
            {isLoading ? '登録中...' : '登録する'}
          </button>
        </form>

        <div className="mt-6 text-center">
          <p className="font-mono text-[12px] text-muted tracking-[0.5px]">
            既にアカウントをお持ちの方は
            <Link to="/login" className="text-flash ml-1 hover:underline">
              ログインはこちら
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
