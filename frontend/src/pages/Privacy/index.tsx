// プライバシーポリシー / 本サイトの位置づけ
//
// 取得したメールアドレスの「利用目的」を明示するためのページ。
// 抽選結果をメールで通知する場合、応募時点で利用目的が示されていないと
// 個人情報保護法上の目的外利用になり得るため、その根拠となる。
import { Link } from 'react-router-dom'

// セクション定義（見出し + 本文）。本文は文字列または JSX
const SECTIONS: { title: string; body: React.ReactNode }[] = [
  {
    title: '1. 取得する情報',
    body: (
      <ul className="list-disc pl-5 flex flex-col gap-1">
        <li>メールアドレス（ログインIDを兼ねます）</li>
        <li>表示名</li>
        <li>
          パスワード（認証基盤側でハッシュ化して保存します。本サイトのデータベースに
          平文のパスワードは保存しません）
        </li>
        <li>購入・抽選応募の履歴</li>
      </ul>
    ),
  },
  {
    title: '2. 利用目的',
    body: (
      <>
        <p>取得した情報は、次の目的にのみ利用します。</p>
        <ol className="list-decimal pl-5 flex flex-col gap-1 mt-2">
          <li>ログイン認証</li>
          <li>
            抽選の応募受付、および<strong className="text-paper font-medium">抽選結果のお知らせ</strong>
            （ご登録のメールアドレス宛のメール送信）
          </li>
          <li>マイページでの購入・応募状況の表示</li>
        </ol>
        <p className="mt-2">
          上記以外の目的（広告・宣伝の配信など）には利用しません。
        </p>
      </>
    ),
  },
  {
    title: '3. 第三者への提供',
    body: (
      <p>
        取得した情報を第三者へ提供することはありません。決済はモック（擬似）のため、
        外部の決済事業者への送信もありません。
      </p>
    ),
  },
  {
    title: '4. Cookie 等の利用',
    body: (
      <p>
        ログイン状態を保つために、ブラウザの localStorage に認証トークンを保存しています。
        広告目的のトラッキングは行いません。
      </p>
    ),
  },
  {
    title: '5. データの取扱い',
    body: (
      <p>
        本サイトはデモ環境のため、予告なくデータを削除する場合があります。
        登録情報の削除をご希望の場合は、下記の連絡先までご連絡ください。
      </p>
    ),
  },
  {
    title: '6. お問い合わせ',
    body: (
      <p>
        本サイトのリポジトリ（
        <a
          href="https://github.com/jessehub777/flashbuy/issues"
          target="_blank"
          rel="noopener noreferrer"
          className="text-flash hover:underline"
        >
          GitHub Issues
        </a>
        ）までお願いします。
      </p>
    ),
  },
]

export default function Privacy() {
  return (
    <div className="max-w-[760px] mx-auto px-5 py-12 page-enter">
      {/* 見出し */}
      <h1 className="font-oswald font-bold text-[32px] text-paper leading-tight">
        PRIVACY <span className="text-flash">POLICY</span>
      </h1>
      <p className="font-mono text-[12px] text-muted tracking-[1px] mt-2">
        プライバシーポリシー / 個人情報の取扱い
      </p>

      {/* 本サイトの位置づけ（最も重要な注意書きなので先頭に置く） */}
      <div className="mt-8 border border-flash/30 bg-flash/[0.06] rounded-[3px] px-5 py-4">
        <p className="font-mono text-[11px] text-flash tracking-[1.5px] mb-2">
          本サイトについて（重要）
        </p>
        <p className="text-[13px] text-paper/90 leading-relaxed">
          本サイト「FLASHBUY」は、
          <strong className="text-paper font-medium">技術検証（デモ）のみを目的としたサイト</strong>
          です。実在する商品の販売・抽選・決済は一切行いません。掲載している商品名・画像・価格・在庫・
          抽選はすべてサンプルデータです。決済はモック（擬似）であり、実際の請求は発生しません。
          購入・応募をしても商品が届くことはありません。
        </p>
      </div>

      {/* 本文 */}
      <div className="flex flex-col gap-8 mt-8">
        {SECTIONS.map((s) => (
          <section key={s.title}>
            <h2 className="font-mono text-[12px] text-paper tracking-[1.5px] uppercase mb-2">
              {s.title}
            </h2>
            <div className="text-[13px] text-muted leading-relaxed">{s.body}</div>
          </section>
        ))}
      </div>

      <p className="font-mono text-[11px] text-muted/70 tracking-[0.5px] mt-10">
        最終更新: 2026年9月16日
      </p>

      <Link
        to="/"
        className="inline-block font-mono text-[12px] text-flash hover:underline mt-6"
      >
        ← トップへ戻る
      </Link>
    </div>
  )
}
