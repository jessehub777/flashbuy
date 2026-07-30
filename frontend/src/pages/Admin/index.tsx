// Admin page — sales and lottery management (CRUD)
// Demonstrates understanding of admin operations for DevOps/Cloud portfolio
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '../../stores/authStore';
import { mockFlashSaleList, mockLotteryList } from '../../services/api';
import dayjs from 'dayjs';

export default function Admin() {
  const navigate = useNavigate();
  const { isAdmin, isLoggedIn } = useAuthStore();
  const [tab, setTab] = useState<'flash' | 'lottery' | 'orders'>('flash');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createType, setCreateType] = useState<'flash' | 'lottery'>('flash');

  if (!isLoggedIn()) { navigate('/login'); return null; }
  if (!isAdmin()) {
    return (
      <div className="max-w-3xl mx-auto px-10 py-16 text-center">
        <div className="font-mono text-[12px] text-flash tracking-[2px] mb-4">403 FORBIDDEN</div>
        <p className="text-muted">管理者権限が必要です</p>
      </div>
    );
  }

  const { data: flashSales = [] } = useQuery({ queryKey: ['flashSales', 'all'], queryFn: () => Promise.resolve(mockFlashSaleList) });
  const { data: lotteryItems = [] } = useQuery({ queryKey: ['lotteryItems', 'all'], queryFn: () => Promise.resolve(mockLotteryList) });

  return (
    <div className="max-w-5xl mx-auto px-10 py-10 page-enter max-sm:px-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <div className="font-mono text-[11px] text-lottery tracking-[2px] uppercase mb-1">
            ADMIN CONSOLE
          </div>
          <h1 className="font-oswald font-semibold text-[28px]">管理画面</h1>
        </div>
        <button
          onClick={() => { setCreateType(tab === 'lottery' ? 'lottery' : 'flash'); setShowCreateModal(true); }}
          className="flex items-center gap-2 px-4 py-2.5 bg-flash font-oswald font-semibold text-[13px] tracking-[1px] uppercase rounded-[3px] hover:brightness-110 transition-all"
        >
          + 新規作成
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {[
          { label: 'セール数', value: flashSales.length, color: 'text-flash' },
          { label: '抽選数', value: lotteryItems.length, color: 'text-lottery' },
          { label: '合計注文', value: 2, color: 'text-paper' },
          { label: '応募合計', value: 934, color: 'text-paper' },
        ].map((stat) => (
          <div key={stat.label} className="bg-ink-soft border border-white/[0.08] rounded-[4px] p-4">
            <div className={`font-oswald font-bold text-[32px] ${stat.color}`}>{stat.value}</div>
            <div className="font-mono text-[10px] text-muted tracking-[1px] mt-1">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-white/[0.12] mb-6">
        {(['flash', 'lottery', 'orders'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-5 py-3 font-oswald font-semibold text-[14px] tracking-[0.5px] transition-colors ${
              tab === t ? 'text-paper border-b-2 border-flash' : 'text-muted hover:text-paper'
            }`}
          >
            {t === 'flash' ? 'セール管理' : t === 'lottery' ? '抽選管理' : '注文確認'}
          </button>
        ))}
      </div>

      {/* Flash Sales table */}
      {tab === 'flash' && (
        <div className="overflow-x-auto">
          <table className="w-full admin-table">
            <thead>
              <tr>
                <th className="text-left">商品名</th>
                <th className="text-left">価格</th>
                <th className="text-left">在庫</th>
                <th className="text-left">ステータス</th>
                <th className="text-left">終了</th>
                <th className="text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {flashSales.map((sale) => (
                <tr key={sale.id} className="hover:bg-white/[0.02] transition-colors">
                  <td className="text-paper font-medium">{sale.name}</td>
                  <td className="font-oswald text-[15px]">¥{sale.price.toLocaleString()}</td>
                  <td>
                    <span className={sale.stock < 10 ? 'text-flash' : 'text-paper'}>
                      {sale.stock}/{sale.totalStock}
                    </span>
                  </td>
                  <td>
                    <span className={`font-mono text-[10px] px-2 py-0.5 rounded-[2px] border ${
                      sale.status === 'ACTIVE'
                        ? 'text-success border-success/30 bg-success/10'
                        : 'text-muted border-white/10'
                    }`}>
                      {sale.status}
                    </span>
                  </td>
                  <td className="font-mono text-[11px] text-muted">
                    {dayjs(sale.endsAt).format('MM/DD HH:mm')}
                  </td>
                  <td className="text-right">
                    <div className="flex gap-2 justify-end">
                      <button className="font-mono text-[10px] text-muted hover:text-paper tracking-[1px] transition-colors">
                        編集
                      </button>
                      <button className="font-mono text-[10px] text-flash hover:brightness-125 tracking-[1px] transition-colors">
                        停止
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Lottery table */}
      {tab === 'lottery' && (
        <div className="overflow-x-auto">
          <table className="w-full admin-table">
            <thead>
              <tr>
                <th className="text-left">抽選名</th>
                <th className="text-left">当選枠</th>
                <th className="text-left">応募数</th>
                <th className="text-left">ステータス</th>
                <th className="text-left">締切</th>
                <th className="text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {lotteryItems.map((item) => (
                <tr key={item.id} className="hover:bg-white/[0.02] transition-colors">
                  <td className="text-paper font-medium">{item.name}</td>
                  <td className="font-oswald text-[15px] text-lottery">{item.winnerCount}</td>
                  <td className="font-oswald text-[15px]">{item.applicantCount.toLocaleString()}</td>
                  <td>
                    <span className="font-mono text-[10px] px-2 py-0.5 rounded-[2px] border text-lottery border-lottery/30 bg-lottery/10">
                      {item.status}
                    </span>
                  </td>
                  <td className="font-mono text-[11px] text-muted">
                    {dayjs(item.applyDeadline).format('MM/DD HH:mm')}
                  </td>
                  <td className="text-right">
                    <div className="flex gap-2 justify-end">
                      <button className="font-mono text-[10px] text-muted hover:text-paper tracking-[1px]">
                        編集
                      </button>
                      <button className="font-mono text-[10px] text-lottery hover:brightness-125 tracking-[1px]">
                        抽選実行
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Orders */}
      {tab === 'orders' && (
        <div className="text-center py-12 text-muted font-mono text-[13px] tracking-[0.5px]">
          注文確認機能は実装中です（Lambda OrderCreator 連携後）
        </div>
      )}

      {/* Create modal (simplified) */}
      {showCreateModal && (
        <CreateModal
          type={createType}
          onClose={() => setShowCreateModal(false)}
        />
      )}
    </div>
  );
}

function CreateModal({ type, onClose }: { type: 'flash' | 'lottery'; onClose: () => void }) {
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    setTimeout(() => { setSaved(true); setTimeout(onClose, 1000); }, 600);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center modal-backdrop bg-black/70 animate-fade-in">
      <div className="bg-ink-soft border border-white/[0.12] rounded-[6px] w-full max-w-[500px] mx-4 overflow-hidden animate-slide-up">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.12]">
          <span className="font-oswald font-semibold text-[16px]">
            {type === 'flash' ? 'セール作成' : '抽選作成'}
          </span>
          <button onClick={onClose} className="text-muted hover:text-paper text-[20px]">×</button>
        </div>
        <div className="p-6 flex flex-col gap-4">
          <div>
            <label className="font-mono text-[11px] text-muted tracking-[1.5px] uppercase block mb-1.5">商品名</label>
            <input className="input-dark" placeholder="商品名を入力" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="font-mono text-[11px] text-muted tracking-[1.5px] uppercase block mb-1.5">
                {type === 'flash' ? '販売価格 (¥)' : '当選枠数'}
              </label>
              <input className="input-dark" type="number" placeholder={type === 'flash' ? '9800' : '5'} />
            </div>
            <div>
              <label className="font-mono text-[11px] text-muted tracking-[1.5px] uppercase block mb-1.5">
                {type === 'flash' ? '在庫数' : '締切日時'}
              </label>
              <input className="input-dark" placeholder={type === 'flash' ? '100' : 'YYYY-MM-DD HH:mm'} />
            </div>
          </div>
          <div>
            <label className="font-mono text-[11px] text-muted tracking-[1.5px] uppercase block mb-1.5">説明</label>
            <textarea className="input-dark h-20 resize-none" placeholder="商品説明を入力" />
          </div>

          {saved ? (
            <div className="text-center py-2 text-success font-mono text-[12px] tracking-[1px]">
              ✓ 保存しました
            </div>
          ) : (
            <button className={`btn-base ${type === 'flash' ? 'bg-flash' : 'bg-lottery'}`} onClick={handleSave}>
              作成する
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
