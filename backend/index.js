// index.js
// LINE BotバックエンドのエントリーポイントとなるExpressサーバー

require("dotenv").config();

const express = require("express");
const line = require("@line/bot-sdk");
const { handleMessage } = require("./lineHandler");

const app = express();
const PORT = process.env.PORT || 3000;

// LINE SDKの設定
const lineConfig = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || "",
  channelSecret: process.env.LINE_CHANNEL_SECRET || "",
};

// LINE認証情報が未設定の場合はモックモードで動作
const isLineMockMode = !lineConfig.channelSecret;
if (isLineMockMode) {
  console.log("[index] LINE認証情報が未設定のため、LINEモックモードで動作します");
}

const lineClient = isLineMockMode ? null : new line.messagingApi.MessagingApiClient({
  channelAccessToken: lineConfig.channelAccessToken,
});

// ヘルスチェック用エンドポイント（サーバーが生きているか確認する用）
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    mockMode: !process.env.CONTRACT_ADDRESS,
  });
});

// LINE Webhookエンドポイント
// LINE認証情報が設定されている場合は署名検証あり、モックモードでは検証なし
// line.middleware は内部でボディを読むため、express.json() と併用しない
const webhookMiddleware = isLineMockMode
  ? express.json()
  : line.middleware(lineConfig);

app.post("/webhook", webhookMiddleware, async (req, res) => {
  const events = req.body.events || [];

  await Promise.all(
    events.map(async (event) => {
      try {
        const replyText = await handleMessage(event);

        if (isLineMockMode) {
          // モックモード: コンソールに応答を出力するだけ
          if (replyText) {
            console.log("[LINE応答]\n" + replyText);
          }
        } else if (replyText && event.replyToken) {
          await lineClient.replyMessage({
            replyToken: event.replyToken,
            messages: [{ type: "text", text: replyText }],
          });
        }
      } catch (err) {
        console.error("[index] イベント処理エラー:", err.message);
      }
    })
  );

  res.status(200).json({ status: "ok" });
});

// LINE middlewareのエラーハンドリング（署名検証失敗など）
app.use((err, req, res, next) => {
  if (err instanceof line.SignatureValidationFailed) {
    console.error("[index] LINE署名検証エラー: 不正なリクエストを受信しました");
    return res.status(401).json({ error: "Invalid signature" });
  }
  console.error("[index] 未処理のエラー:", err.message);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(PORT, () => {
  console.log(`[index] サーバー起動: http://localhost:${PORT}`);
  console.log(`[index] Webhookエンドポイント: POST http://localhost:${PORT}/webhook`);
  console.log(`[index] モックモード: ${!process.env.CONTRACT_ADDRESS}`);
});
