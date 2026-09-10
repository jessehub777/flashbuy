// フッター — サイト共通の表示
export default function Footer() {
  return (
    <footer className="flex flex-col sm:flex-row justify-between items-center gap-2 px-10 py-7 border-t border-white/[0.12] font-mono text-[11px] text-muted mt-auto">
      <div>
        FLASHBUY © 2026 — Portfolio by <span className="text-paper font-medium">Yingxin Wang (王　迎新)</span>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-flash/80">TOKYO DEVOPS / CLOUD PORTFOLIO</span>
        <span>•</span>
        <span>GO + AWS</span>
      </div>
    </footer>
  );
}
