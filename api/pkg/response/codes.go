package response

// ビジネスロジック上のエラーコードを定義します
const (
	CodeSuccess      = 0     // 成功
	CodeSystemError  = 500   // システム内部エラー
	CodeInvalidParam = 400   // リクエストパラメータエラー
	CodeUnauthorized = 401   // 認証エラー
	CodeOutOfStock   = 10001 // フラッシュセール：在庫切れ
	CodeRepeatApply  = 10002 // 抽選：重複応募
)

// codeMsgMap はエラーコードとデフォルトのメッセージマッピングです
var codeMsgMap = map[int]string{
	CodeSuccess:      "success",
	CodeSystemError:  "システムエラーが発生しました",
	CodeInvalidParam: "パラメータが不正です",
	CodeUnauthorized: "認証に失敗しました",
	CodeOutOfStock:   "商品はすでに売り切れです",
	CodeRepeatApply:  "すでに応募済みです",
}

// GetMsg はエラーコードに対応するメッセージを返します
func GetMsg(code int) string {
	if msg, ok := codeMsgMap[code]; ok {
		return msg
	}
	return "予期せぬエラーが発生しました"
}
