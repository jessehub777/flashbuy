package response

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// Response はAPIの統一されたレスポンス構造体です
type Response struct {
	Code    int         `json:"code"`
	Message string      `json:"message"`
	Data    interface{} `json:"data,omitempty"`
}

// Success は成功時のレスポンスを返します (HTTP 200 OK)
func Success(c *gin.Context, data interface{}) {
	c.JSON(http.StatusOK, Response{
		Code:    CodeSuccess,
		Message: GetMsg(CodeSuccess),
		Data:    data,
	})
}

// Error はエラー時のレスポンスを返します。内部でGetMsgを呼び出します
func Error(c *gin.Context, code int) {
	c.JSON(http.StatusOK, Response{
		Code:    code,
		Message: GetMsg(code),
	})
}
