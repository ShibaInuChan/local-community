// index.js
// LINE BotバックエンドのエントリーポイントとなるExpressサーバー

require("dotenv").config({ path: require("path").join(__dirname, "../.env") });

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

const lineClient = new line.messagingApi.MessagingApiClient({
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
// line.middleware でLINEからのリクエストを検証してから処理する
app.post(
  "/webhook",
  line.middleware(lineConfig),
  async (req, res) => {
    // LINEは複数のイベントをまとめて送ってくることがある
    const events = req.body.events;

    // すべてのイベントを並行処理する
    await Promise.all(
      events.map(async (event) => {
        try {
          const replyText = await handleMessage(event);

          // 返信テキストがある場合のみLINEに送信
          if (replyText && event.replyToken) {
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

    // LINEサーバーには必ず200を返す（返さないと再送が繰り返される）
    res.status(200).json({ status: "ok" });
  }
);

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
