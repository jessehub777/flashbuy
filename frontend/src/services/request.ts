import axios, { type AxiosResponse, type InternalAxiosRequestConfig } from 'axios'
import type { ApiResponse } from '../types'

// トークン・リフレッシュトークン取得用のゲッター/セッター
// （authStoreのcircular dependencyを回避するため注入方式）
let getToken: (() => string | null) | null = null
let getRefreshToken: (() => string | null) | null = null
let setToken: ((token: string) => void) | null = null
let onUnauthorized: (() => void) | null = null

export function setupAuth(
  tokenGetter: () => string | null,
  unauthorizedHandler: () => void,
  refreshTokenGetter?: () => string | null,
  tokenSetter?: (token: string) => void
) {
  getToken = tokenGetter
  onUnauthorized = unauthorizedHandler
  getRefreshToken = refreshTokenGetter ?? null
  setToken = tokenSetter ?? null
}

// リクエスト時にトークンを自動付与
axios.interceptors.request.use((config) => {
  const token = getToken?.()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// 認証切れ（code=401）時にリフレッシュトークンで自動更新してリクエストを再送する
async function handleUnauthorized(originalRequest: InternalAxiosRequestConfig): Promise<AxiosResponse> {
  // リフレッシュAPI自体が401なら無限ループを防ぐため再試行しない
  if (originalRequest.url?.includes('/auth/refresh')) {
    onUnauthorized?.()
    return Promise.reject(new ApiError(401, 'セッションが失効しました'))
  }

  const refreshToken = getRefreshToken?.()
  if (!refreshToken) {
    // リフレッシュトークンが無い場合はログアウト
    onUnauthorized?.()
    return Promise.reject(new ApiError(401, 'セッションが失効しました'))
  }

  try {
    // リフレッシュトークンで新しいIDトークンを取得
    const { data } = await axios.post<ApiResponse<{ token: string }>>('/api/v1/auth/refresh', {
      refreshToken,
    })
    if (data.code !== 0 || !data.data?.token) {
      // リフレッシュトークンも失効 → ログアウト
      onUnauthorized?.()
      return Promise.reject(new ApiError(data.code, data.message || 'トークンの更新に失敗しました'))
    }

    // 新しいトークンを保存して、元のリクエストを再送する
    setToken?.(data.data.token)
    originalRequest.headers.Authorization = `Bearer ${data.data.token}`
    return axios(originalRequest)
  } catch (err) {
    onUnauthorized?.()
    return Promise.reject(err)
  }
}

// 401レスポンス時は自動更新を試み、失敗したらログアウトする
// バックエンドはHTTP 200でcode=401を返す設計のため、両方をチェックする
axios.interceptors.response.use(
  (res) => {
    // HTTP 200でもbodyのcode=401なら認証切れ（トークン期限切れなど）
    if (res.data?.code === 401) {
      return handleUnauthorized(res.config)
    }
    return res
  },
  (error) => {
    // HTTPレベルの401（通常は起きないが保険として）
    if (error.response?.status === 401) {
      return handleUnauthorized(error.config)
    }
    return Promise.reject(error)
  }
)

// JWTトークンの有効期限（exp）をチェックする
// Cognito IDトークンはJWT形式（header.payload.signature）で、payloadがbase64urlエンコードされている
export function isTokenExpired(token: string): boolean {
  try {
    const payload = token.split('.')[1]
    if (!payload) return true
    const decoded = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')))
    const exp = decoded.exp as number | undefined
    if (!exp) return true
    // expは秒単位のUnixタイムスタンプ
    return exp * 1000 < Date.now()
  } catch {
    // パースできないトークンは無効として扱う
    return true
  }
}

// バックエンドから返るエラー（code + message）を持つ例外クラス
export class ApiError extends Error {
  code: number
  constructor(code: number, message: string) {
    super(message)
    this.code = code
    this.name = 'ApiError'
  }
}

// GETリクエスト。codeが0でなければ ApiError を投げる
export async function request<T>(path: string, params?: Record<string, unknown>): Promise<T> {
  const { data } = await axios.get<ApiResponse<T>>(path, { params })
  if (data.code !== 0) {
    throw new ApiError(data.code, data.message || '通信に失敗しました')
  }
  return data.data
}

// POSTリクエスト。codeが0でなければ ApiError を投げる
export async function requestPost<T>(path: string, body?: unknown): Promise<T> {
  const { data } = await axios.post<ApiResponse<T>>(path, body)
  if (data.code !== 0) {
    throw new ApiError(data.code, data.message || '通信に失敗しました')
  }
  return data.data
}

// 商品画像の公開URLの基点（Vite の環境変数。未設定の場合はdevバケットにフォールバック）
// .env.local 等で VITE_S3_PUBLIC_BASE を設定すれば本番（CloudFront等）に切り替えられる
const S3_PUBLIC_BASE =
  import.meta.env.VITE_S3_PUBLIC_BASE || 'https://flashbuy-images-dev.s3.ap-northeast-1.amazonaws.com'

// imageS3Key を表示用の imageUrl（完全な公開URL）に変換する補助関数。
// DBにはS3のキー（例: products/2026/09/xxx.jpg）だけが保存されているため、
// ここでバケットの基点URLを連結してブラウザが直接参照できるURLにする
export function toImageUrl<T extends { imageS3Key?: string }>(item: T): T & { imageUrl: string } {
  const key = item.imageS3Key
  if (!key) return { ...item, imageUrl: '' }
  // すでに完全なURL（http...）の場合はそのまま使う
  if (key.startsWith('http://') || key.startsWith('https://')) {
    return { ...item, imageUrl: key }
  }
  return { ...item, imageUrl: `${S3_PUBLIC_BASE}/${key}` }
}

// S3へ直接アップロード（画像データはバックエンドを通さない）
// 1. GET /api/v1/upload/presign で署名付きURLを取得（要 admin 権限）
// 2. PUT でS3へ直接アップロード
// 3. { key, url } を返す。key は商品の imageS3Key としてバックエンドに保存する
export async function uploadImage(file: File, folder: string = 'products'): Promise<{ key: string; url: string }> {
  // 1. 署名付きURLを取得
  const { presignedUrl, key, publicUrl } = await request<{
    presignedUrl: string
    key: string
    publicUrl: string
  }>('/api/v1/upload/presign', { folder, contentType: file.type })

  // 2. PUTでS3に直接アップロード
  //    axios ではなく fetch を使う。axios は File 送信時に Content-Type を変換する場合があり、
  //    署名時の Content-Type（X-Amz-SignedHeaders に含まれる）と一致せず 400 になるため。
  //    fetch ならヘッダーを完全に制御できる
  const res = await fetch(presignedUrl, {
    method: 'PUT',
    body: file,
    headers: { 'Content-Type': file.type },
  })
  if (!res.ok) {
    // S3 は 400 の本文に XML でエラー詳細を返す。デバッグ用に先頭だけ含める
    const detail = (await res.text().catch(() => '')).slice(0, 200)
    throw new ApiError(res.status, `画像のアップロードに失敗しました (${res.status}) ${detail}`)
  }

  // 3. S3のkey（DB保存用）と公開URL（プレビュー表示用）を返す
  return { key, url: publicUrl }
}
