package response

// ビジネスロジック上のエラーコードを定義します
const (
	CodeSuccess      = 0     // 成功
	CodeSystemError  = 500   // システム内部エラー
	CodeInvalidParam = 400   // リクエストパラメータエラー
	CodeUnauthorized = 401   // 認証エラー
	CodeForbidden    = 403   // 権限エラー（管理者のみ）
	CodeOutOfStock   = 10001 // フラッシュセール：在庫切れ
	CodeRepeatApply  = 10002 // 抽選：重複応募
	CodeOrderExpired = 10003 // 支払期限切れ（未払い注文の期限超過）
)

// codeMsgMap はエラーコードとデフォルトのメッセージマッピングです
var codeMsgMap = map[int]string{
	CodeSuccess:      "success",
	CodeSystemError:  "システムエラーが発生しました",
	CodeInvalidParam: "パラメータが不正です",
	CodeUnauthorized: "認証に失敗しました",
	CodeForbidden:    "権限がありません",
	CodeOutOfStock:   "商品はすでに売り切れです",
	CodeRepeatApply:  "すでに応募済みです",
	CodeOrderExpired: "支払期限が過ぎているため支払えません",
}

// GetMsg はエラーコードに対応するメッセージを返します
func GetMsg(code int) string {
	if msg, ok := codeMsgMap[code]; ok {
		return msg
	}
	return "予期せぬエラーが発生しました"
}
