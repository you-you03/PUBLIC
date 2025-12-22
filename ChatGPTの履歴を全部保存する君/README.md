## ChatGPT Markdown Exporter（MVP版）

ChatGPT Webで開いているスレッドを、**拡張機能のアイコンを1クリックするだけでMarkdownとしてダウンロード**するChrome拡張です。  
保存先はダウンロード直下、ファイル名は `YYYY-MM-DD_{conversationId or title}.md` になります。

### できること
- **全文エクスポートのみ**：ユーザー/アシスタントの発言を時系列でMarkdown化
- **メタ情報付与**：出力日時・元URL・conversationId・メッセージ数
- `chrome.downloads.download` で自動保存（ダウンロード直下、サブフォルダなし）
- **ChatGPT専用**：`https://chatgpt.com/*` と `https://chat.openai.com/*` のみ対応

※ 要約機能 / GAS連携 / Gemini対応 / ポップアップUI は **すべて削除済み** です。

### 導入手順（Chrome拡張）
1. Chromeで `chrome://extensions` を開き「デベロッパーモード」をONにする
2. 「パッケージ化されていない拡張機能を読み込む」からこのディレクトリを選択
3. ChatGPTのスレッドページ（`https://chatgpt.com` または `https://chat.openai.com`）を開く
4. 右上の拡張アイコン（ChatGPT Markdown Exporter）をクリック  
   → 自動で会話がMarkdownとしてダウンロードされます

### ファイル構成
- `manifest.json` : MV3設定（permissions: downloads / host_permissions: chatgpt.com, chat.openai.com）
- `background.js` : 拡張アイコンクリック時に現在のタブへメッセージを送り、会話を受け取ってMarkdown生成・ダウンロードする
- `content.js` : ChatGPTページからメッセージを抽出（テキスト/リスト/コード対応、余計なUI要素を削除してMarkdown化）

### 注意点・既知の制約
- ChatGPTのDOM構造変更で抽出が失敗する場合があります。失敗時はページを上までスクロールして再試行してください
- 対応URLは `https://chatgpt.com/*` と `https://chat.openai.com/*` のみです
