// Header — top navigation bar matching design mockup
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';

export default function Header() {
  const { user, logout, isAdmin } = useAuthStore();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <header className="flex justify-between items-center px-10 py-[22px] border-b border-white/[0.12] sticky top-0 z-50 bg-ink/95 backdrop-blur-sm">
      {/* Logo */}
      <Link to="/" className="font-oswald font-bold text-[22px] tracking-[0.5px] text-paper no-underline">
        FLASH<span className="text-flash">BUY</span>
      </Link>

      {/* Navigation */}
      <nav className="hidden md:flex gap-7 text-[13px] text-muted">
        <Link to="/" className="text-muted hover:text-paper transition-colors no-underline">
          セール一覧
        </Link>
        <Link to="/lottery" className="text-muted hover:text-paper transition-colors no-underline">
          抽選一覧
        </Link>
        <Link to="/my?tab=lottery" className="text-muted hover:text-paper transition-colors no-underline">
          当選確認
        </Link>
        <Link to="/my" className="text-muted hover:text-paper transition-colors no-underline">
          マイページ
        </Link>
        {isAdmin() && (
          <Link to="/admin" className="text-lottery hover:text-paper transition-colors no-underline">
            管理画面
          </Link>
        )}
      </nav>

      {/* Auth */}
      <div>
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
    </header>
  );
}
