// lineHandler.js
// LINEから届いたメッセージを解析し、適切な応答を返すモジュール

const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");
const contractService = require("./contractService");

// ユーザーID → ウォレットアドレスのマッピングファイル
const WALLETS_FILE = path.join(__dirname, "userWallets.json");

/**
 * ウォレットマッピングを読み込む
 * ファイルが存在しない場合は空のオブジェクトを返す
 */
function loadWallets() {
  if (!fs.existsSync(WALLETS_FILE)) {
    return {};
  }
  try {
    return JSON.parse(fs.readFileSync(WALLETS_FILE, "utf8"));
  } catch {
    return {};
  }
}

/**
 * ウォレットマッピングを保存する
 */
function saveWallets(wallets) {
  fs.writeFileSync(WALLETS_FILE, JSON.stringify(wallets, null, 2), "utf8");
}

/**
 * LINEユーザーIDに対応するウォレットアドレスを取得する
 * 存在しない場合は新しいウォレットを自動生成して返す
 */
function getOrCreateWallet(lineUserId) {
  const wallets = loadWallets();

  if (wallets[lineUserId]) {
    return wallets[lineUserId];
  }

  // 新しいウォレットをランダム生成
  const newWallet = ethers.Wallet.createRandom();
  wallets[lineUserId] = newWallet.address;
  saveWallets(wallets);

  console.log(`[lineHandler] 新規ウォレット生成: ${lineUserId} → ${newWallet.address}`);
  return newWallet.address;
}

/**
 * 管理者かどうかを判定する
 */
function isAdmin(lineUserId) {
  return lineUserId === process.env.ADMIN_LINE_USER_ID;
}

/**
 * ランクに対応する絵文字を返す
 */
function tierEmoji(tier) {
  const map = { Bronze: "🥉", Silver: "🥈", Gold: "🥇", Platinum: "💎" };
  return map[tier] || "🏅";
}

/**
 * メインのメッセージハンドラ
 * @param {object} event - LINE Webhookのeventオブジェクト
 * @returns {string} LINEへ返信するテキスト
 */
async function handleMessage(event) {
  // テキストメッセージ以外は無視
  if (event.type !== "message" || event.message.type !== "text") {
    return null;
  }

  const text = event.message.text.trim();
  const lineUserId = event.source.userId;
  const userAddress = getOrCreateWallet(lineUserId);

  // ─── 残高確認 ───────────────────────────────────────────
  if (text === "残高確認" || text.toLowerCase() === "balance") {
    const balance = await contractService.getBalance(userAddress);
    const tier = await contractService.getTier(userAddress);
    const emoji = tierEmoji(tier);

    return [
      `${emoji} あなたの感謝ポイント`,
      ``,
      `残高: ${balance} pt`,
      `ランク: ${tier}`,
      ``,
      `「使い方」と送るとランク特典を確認できます`,
    ].join("\n");
  }

  // ─── ステータス詳細 ──────────────────────────────────────
  if (text === "ステータス") {
    const balance = await contractService.getBalance(userAddress);
    const tier = await contractService.getTier(userAddress);

    return [
      `📊 ランク詳細`,
      ``,
      `🥉 Bronze（0〜99pt）`,
      `  → 基本メンバー`,
      ``,
      `🥈 Silver（100〜499pt）`,
      `  → 共有備品の優先レンタル権`,
      ``,
      `🥇 Gold（500〜1999pt）`,
      `  → お手伝い依頼の優先マッチング`,
      ``,
      `💎 Platinum（2000pt〜）`,
      `  → コミュニティ運営への参加権`,
      ``,
      `あなたの現在: ${tierEmoji(tier)} ${tier}（${balance}pt）`,
    ].join("\n");
  }

  // ─── 使い方・ヘルプ ─────────────────────────────────────
  if (text === "使い方" || text.toLowerCase() === "help") {
    const adminHelp = isAdmin(lineUserId)
      ? `\n【管理者コマンド】\nありがとう [お名前] [活動内容]\n  例: ありがとう 田中さん 公民館の清掃`
      : "";

    return [
      `📖 感謝ポイントシステム 使い方`,
      ``,
      `【メンバーコマンド】`,
      `残高確認  → 現在のポイントとランクを表示`,
      `ステータス → ランク特典の一覧を表示`,
      `使い方    → このヘルプを表示`,
      adminHelp,
    ].join("\n");
  }

  // ─── ポイント付与（管理者専用） ──────────────────────────
  // 書式: ありがとう [対象者名] [活動内容]
  if (text.startsWith("ありがとう ")) {
    if (!isAdmin(lineUserId)) {
      return "⚠️ ポイントの付与は管理者のみ行えます";
    }

    // "ありがとう 田中さん 公民館の清掃" → ["田中さん", "公民館の清掃"]
    const parts = text.replace("ありがとう ", "").split(" ");
    if (parts.length < 2) {
      return "書式が正しくありません。\n例: ありがとう 田中さん 公民館の清掃";
    }

    const targetName = parts[0];
    const reason = parts.slice(1).join(" ");

    // 対象者名からウォレットアドレスを逆引き（名前は未実装なので簡易版）
    // ここでは管理者自身のアドレスをテスト対象にする（本番では名前→IDの管理が必要）
    const wallets = loadWallets();
    const targetEntry = Object.entries(wallets).find(([, addr]) => addr);

    if (!targetEntry) {
      return `${targetName} さんはまだシステムに登録されていません`;
    }

    const targetAddress = targetEntry[1];
    const result = await contractService.issuePoints(targetAddress, 10, reason);

    if (result.success) {
      const newBalance = await contractService.getBalance(targetAddress);
      return [
        `✅ ポイントを付与しました`,
        ``,
        `対象: ${targetName} さん`,
        `活動: ${reason}`,
        `付与: +10 pt`,
        `新しい残高: ${newBalance} pt`,
      ].join("\n");
    } else {
      return `❌ ポイントの付与に失敗しました\n${result.error || ""}`;
    }
  }

  // ─── 未認識コマンド ──────────────────────────────────────
  return `「使い方」と送るとコマンド一覧が表示されます`;
}

module.exports = { handleMessage };
