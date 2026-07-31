// App.tsx — routing and global providers
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Header from './components/layout/Header';
import Footer from './components/layout/Footer';
import Home from './pages/Home';
import FlashSaleDetail from './pages/FlashSale';
import LotteryDetail from './pages/Lottery';
import Login from './pages/Login';
import MyPage from './pages/MyPage';
import Admin from './pages/Admin';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <div className="min-h-screen flex flex-col bg-ink">
          <Header />
          <main className="flex-1">
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/flash" element={<Home />} />
              <Route path="/flash/:id" element={<FlashSaleDetail />} />
              <Route path="/lottery" element={<Home />} />
              <Route path="/lottery/:id" element={<LotteryDetail />} />
              <Route path="/login" element={<Login />} />
              <Route path="/my" element={<MyPage />} />
              <Route path="/admin" element={<Admin />} />
              {/* 404 */}
              <Route
                path="*"
                element={
                  <div className="flex items-center justify-center h-[60vh] flex-col gap-4">
                    <div className="font-oswald font-bold text-[80px] text-white/[0.06]">404</div>
                    <p className="font-mono text-[13px] text-muted tracking-[1px]">
                      ページが見つかりません
                    </p>
                  </div>
                }
              />
            </Routes>
          </main>
          <Footer />
        </div>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
