// ヘッダー — ナビゲーションバーと検索アイコン
import { useState, useRef, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';

export default function Header() {
  const { user, logout, isAdmin } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  // 検索ボックスが開いたら自動でフォーカスする
  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus();
  }, [searchOpen]);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  // 検索を実行して結果ページに移動する
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
    setSearchOpen(false);
    setSearchQuery('');
  };

  // 今いるページに合わせてナビのスタイルを変える
  const navClass = (href: string) => {
    const isActive =
      href === '/'
        ? location.pathname === '/'
        : location.pathname.startsWith(href);
    return `transition-colors no-underline ${
      isActive ? 'text-paper' : 'text-muted hover:text-paper'
    }`;
  };

  return (
    <header className="border-b border-white/[0.12] sticky top-0 z-50 bg-ink/95 backdrop-blur-sm">
      <div className="flex justify-between items-center px-10 py-[22px] max-sm:px-5">
        {/* ロゴ */}
        <Link to="/" className="font-oswald font-bold text-[22px] tracking-[0.5px] text-paper no-underline flex-none">
          FLASH<span className="text-flash">BUY</span>
        </Link>

        {/* ナビゲーション */}
        <nav className="hidden md:flex gap-7 text-[13px]">
          <Link to="/" className={navClass('/')}>
            ホーム
          </Link>
          <Link to="/flash" className={navClass('/flash')}>
            フラッシュセール一覧
          </Link>
          <Link to="/lottery" className={navClass('/lottery')}>
            抽選一覧
          </Link>
          <Link to="/my" className={navClass('/my')}>
            マイページ
          </Link>
          {isAdmin() && (
            <Link to="/admin" className="text-lottery hover:text-paper transition-colors no-underline">
              管理画面
            </Link>
          )}
        </nav>

        {/* 右側：検索 + 認証 */}
        <div className="flex items-center gap-3">
          {/* 検索アイコン（クリックで検索バーを開く） */}
          <button
            onClick={() => setSearchOpen((v) => !v)}
            aria-label="検索"
            className={`p-2 rounded-[3px] transition-colors ${
              searchOpen ? 'text-paper bg-white/[0.06]' : 'text-muted hover:text-paper'
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
            </svg>
          </button>

          {/* ログイン・ログアウトボタン */}
          {user ? (
            <div className="flex items-center gap-4">
              <span className="text-[12px] text-muted hidden sm:block">{user.displayName}</span>
              <button
                onClick={handleLogout}
                className="text-[12px] px-[18px] py-2 border border-white/[0.12] rounded-[2px] text-paper tracking-[0.5px] hover:border-white/30 transition-colors"
              >
                ログアウト
              </button>
            </div>
          ) : (
            <Link
              to="/login"
              className="text-[12px] px-[18px] py-2 border border-white/[0.12] rounded-[2px] text-paper tracking-[0.5px] hover:border-white/30 transition-colors no-underline"
            >
              ログイン
            </Link>
          )}
        </div>
      </div>

      {/* 検索バー（展開式） */}
      {searchOpen && (
        <div className="border-t border-white/[0.08] px-10 py-3 max-sm:px-5 animate-fade-in">
          <form onSubmit={handleSearch} className="flex gap-2 max-w-[600px] mx-auto">
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="ライブ、チケットを検索..."
              className="input-dark flex-1 text-[13px] py-2"
            />
            <button
              type="submit"
              className="px-4 py-2 bg-flash text-paper font-oswald font-semibold text-[12px] tracking-[1px] rounded-[3px] hover:brightness-110 transition-all"
            >
              検索
            </button>
            <button
              type="button"
              onClick={() => setSearchOpen(false)}
              className="px-3 py-2 text-muted hover:text-paper font-mono text-[12px] transition-colors"
            >
              ✕
            </button>
          </form>
        </div>
      )}
    </header>
  );
}
