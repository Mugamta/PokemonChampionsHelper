// composables/usePublicAsset.js
// public/ 폴더 안의 파일을 참조할 때, GitHub Pages 서브 경로(baseURL)를 자동으로 붙여줍니다.
// 사용 예: <img :src="asset('pokemon.webp')">  (앞의 '/'는 있어도 없어도 됨)

export function usePublicAsset() {
  const config = useRuntimeConfig()
  const baseURL = config.app.baseURL || '/'

  const asset = (path) => {
    const clean = path.startsWith('/') ? path.slice(1) : path
    return baseURL + clean
  }

  return { asset }
}