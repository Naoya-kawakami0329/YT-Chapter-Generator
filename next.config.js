/** @type {import('next').NextConfig} */
const nextConfig = {
  // outputをexportに設定している場合、APIルートは動作しません
  // そのため、この設定を削除または変更する必要があります
  // output: 'export', <- この行をコメントアウトまたは削除

  // 必要に応じて他の設定を追加
  reactStrictMode: true,

  // APIエンドポイントを使用するためにoutput: 'export'を使用しないでください
};

module.exports = nextConfig;
