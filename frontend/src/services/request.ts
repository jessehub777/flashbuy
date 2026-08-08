import axios from 'axios'
import type { ApiResponse } from '../types'

// トークン取得用のゲッター（authStoreのcircular dependencyを回避）
let getToken: (() => string | null) | null = null
let onUnauthorized: (() => void) | null = null

export function setupAuth(
  tokenGetter: () => string | null,
  unauthorizedHandler: () => void
) {
  getToken = tokenGetter
  onUnauthorized = unauthorizedHandler
}

// リクエスト時にトークンを自動付与
axios.interceptors.request.use((config) => {
  const token = getToken?.()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// 401レスポンス時にログアウト
axios.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401) {
      onUnauthorized?.()
    }
    return Promise.reject(error)
  }
)

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

// imageS3Key を imageUrl に変換する補助関数
export function toImageUrl<T extends { imageS3Key?: string }>(item: T): T & { imageUrl: string } {
  return { ...item, imageUrl: item.imageS3Key || '' }
}

// S3へ直接アップロード（バックエンドを通さない）
// 1. GET /api/v1/upload/presign で署名付きURLを取得
// 2. PUT でS3にアップロード
// { key, url } を返す（あとでバックエンドに保存する）
// 注: バックエンドのpresign APIは未実装。呼ぶと通信エラーになる
export async function uploadImage(file: File, folder: string = 'products'): Promise<{ key: string; url: string }> {
  // 1. 署名付きURLを取得
  const { presignedUrl, key } = await request<{ presignedUrl: string; key: string }>(
    '/api/v1/upload/presign',
    { folder, fileName: file.name, contentType: file.type },
  )

  // 2. PUTでS3に直接アップロード
  await axios.put(presignedUrl, file, {
    headers: { 'Content-Type': file.type },
  })

  // 3. S3のkeyと公開URLを返す
  const url = `${import.meta.env.VITE_S3_PUBLIC_BASE || ''}/${key}`
  return { key, url }
}
