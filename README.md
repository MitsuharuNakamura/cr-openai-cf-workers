# ConversationRelayWSS

Cloudflare Workers上で動作するWebSocketベースの音声会話リレーサーバー。Twilio ConversationRelay APIとOpenAI GPT-4o-miniを統合し、ホテル向けのAI音声アシスタント機能を提供します。

## 概要

このプロジェクトは、デモンストレーションとして開発された、日本のホテル業界向けのAI音声アシスタントシステムです。電話を通じて顧客サービスを提供する複数の専門的なAIアシスタントを実装しています。
Cloudflare workers上で動作するように開発されています。

## 主な機能

### AIアシスタントエンドポイント

- **`/translator-en-jp`**: 英語から日本語へのリアルタイム翻訳サービス
- **`/translator-jp-en`**: 日本語から英語へのリアルタイム翻訳サービス
- **`/faq`**: ホテルのよくある質問に対応するFAQアシスタント
- **`/order`**: 既存予約の照会・変更サポート
- **`/booking`**: 新規予約の受付アシスタント

### 技術的特徴

- Cloudflare Workersでのサーバーレス実行
- WebSocketによるリアルタイム音声会話処理
- 会話履歴を保持したコンテキスト認識型の応答
- 日本語の文章区切り（。、？）を考慮した自然な音声出力
- Google ja-JP-Chirp3-HD-Aoede音声によるTTS対応
- OpenAI ストリーミングレスポンスの適切なJSON処理

## セットアップ

### 必要な環境

- Node.js 18以上
- npm または yarn
- Cloudflare アカウント
- Wrangler CLI (`npm install -g wrangler`)
- OpenAI APIキー

### インストール

```bash
npm install
```

### 環境変数の設定

`wrangler.jsonc`ファイルで環境変数を設定してください：

```jsonc
{
  "name": "conversation-relay-wss",
  "main": "src/index.js",
  "compatibility_date": "2024-07-12",
  "vars": {
    "SYSTEM_PROMPT_TRANSLATOR_EN_JP": "英語から日本語への翻訳用プロンプト",
    "SYSTEM_PROMPT_TRANSLATOR_JP_EN": "日本語から英語への翻訳用プロンプト",
    "SYSTEM_PROMPT_FAQ": "FAQ用プロンプト",
    "SYSTEM_PROMPT_ORDER": "予約照会用プロンプト",
    "SYSTEM_PROMPT_BOOKING": "新規予約用プロンプト"
  }
}
```

OpenAI APIキーは機密情報として別途設定：

```bash
wrangler secret put OPENAI_API_KEY
```

### デプロイ方法

```bash
# 開発環境での実行
wrangler dev

# 本番環境へのデプロイ
wrangler deploy
```

## TwiML Webhook設定

### プリセットルート

以下のルートが自動的に利用可能です：

- `POST /webhook/twiml/faq`
- `POST /webhook/twiml/translator-en-jp`
- `POST /webhook/twiml/translator-jp-en`

### カスタムパラメータ

クエリパラメータで設定をカスタマイズ可能：

```
POST /webhook/twiml?url=wss://your-domain/custom&language=ja-JP&voice=ja-JP-Chirp3-HD-Aoede
```

## 動作フロー

1. 顧客が電話をかける
2. Twilioが音声をテキストに変換（STT）
3. WebSocketサーバーがテキストを受信
4. OpenAI APIでストリーミング応答を生成
5. 応答を文章区切りで分割してリアルタイム送信
6. Twilioがテキストを音声に変換（TTS）
7. 顧客に音声で応答

## メッセージフォーマット

### 受信メッセージ

```json
{
  "type": "setup"
}
```

```json
{
  "type": "prompt",
  "voicePrompt": "ユーザーの発話内容"
}
```

### 送信メッセージ

```json
{
  "type": "text",
  "token": "応答の一部分",
  "last": false
}
```

```json
{
  "type": "error",
  "message": "エラーメッセージ"
}
```

## 開発者向け情報

### ローカル開発

```bash
# ローカルでWorkerを実行
wrangler dev

# ログの監視
wrangler tail
```

### デバッグ

コードには詳細なデバッグログが含まれています：

- OpenAI API呼び出しの状況
- ストリーミングレスポンスの処理
- JSON パース処理
- WebSocket接続状況

### カスタマイズ

新しいエンドポイントを追加する場合：

1. `getSystemPrompt`関数に新しいパスを追加
2. `handlePresetTwiml`関数に新しいプリセットを追加  
3. 対応するシステムプロンプトを`wrangler.jsonc`に設定

## トラブルシューティング

### よくある問題

1. **日本語が文字化けする**
   - UTF-8ストリーミングデコーディングが正しく設定されているか確認
   - `{stream: true}`オプションが`TextDecoder`で使用されているか確認

2. **JSONパースエラー**
   - ストリーミングチャンクが行境界で正しく処理されているか確認
   - 不完全なJSONデータの蓄積処理が動作しているか確認

3. **WebSocket接続が失敗する**
   - Cloudflare Workersのログを`wrangler tail`で確認
   - OpenAI APIキーが正しく設定されているか確認
