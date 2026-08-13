// App.tsx — routing and global providers
import { useEffect } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { setupAuth, isTokenExpired } from './services/request'
import { useAuthStore } from './stores/authStore'
import Header from './components/layout/Header'
import Footer from './components/layout/Footer'
import Home from './pages/Home'
import FlashList from './pages/FlashList'
import FlashDetail from './pages/Flash'
import LotteryList from './pages/LotteryList'
import LotteryDetail from './pages/Lottery'
import SearchPage from './pages/Search'
import Login from './pages/Login'
import Register from './pages/Register'
import MyPage from './pages/MyPage'
import Admin from './pages/Admin'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
})

function App() {
  // 認証のセットアップ（トークン自動付与 + 401ハンドリング）
  useEffect(() => {
    setupAuth(
      () => useAuthStore.getState().token,
      () => {
        void useAuthStore.getState().logout()
        window.location.href = '/login'
      },
      () => useAuthStore.getState().refreshToken,
      (token) => useAuthStore.getState().setToken(token)
    )

    // 起動時にトークンの期限切れを検知したら即ログアウト
    // （有効期限切れのトークンで「ログイン済み」のまま表示されるのを防ぐ）
    const token = useAuthStore.getState().token
    void token
    if (token && isTokenExpired(token)) {
      void useAuthStore.getState().logout()
      window.location.href = '/login'
    }
  }, [])

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <div className="min-h-screen flex flex-col bg-ink">
          <Header />
          <main className="flex-1">
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/flash" element={<FlashList />} />
              <Route path="/flash/:id" element={<FlashDetail />} />
              <Route path="/lottery" element={<LotteryList />} />
              <Route path="/lottery/:id" element={<LotteryDetail />} />
              <Route path="/search" element={<SearchPage />} />
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/my" element={<MyPage />} />
              <Route path="/admin" element={<Admin />} />
              {/* 404 */}
              <Route
                path="*"
                element={
                  <div className="flex items-center justify-center h-[60vh] flex-col gap-4">
                    <div className="font-oswald font-bold text-[80px] text-white/[0.06]">404</div>
                    <p className="font-mono text-[13px] text-muted tracking-[1px]">ページが見つかりません</p>
                  </div>
                }
              />
            </Routes>
          </main>
          <Footer />
        </div>
      </BrowserRouter>
    </QueryClientProvider>
  )
}

export default App
