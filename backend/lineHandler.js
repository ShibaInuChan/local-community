// lineHandler.js
// LINEから届いたメッセージを解析し、適切な応答を返すモジュール

const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");
const contractService = require("./contractService");

const WALLETS_FILE = path.join(__dirname, "userWallets.json");
const NAMES_FILE = path.join(__dirname, "userNames.json");

// ── ファイル操作ヘルパー ────────────────────────────────────

function loadWallets() {
  if (!fs.existsSync(WALLETS_FILE)) return {};
  try { return JSON.parse(fs.readFileSync(WALLETS_FILE, "utf8")); } catch { return {}; }
}

function saveWallets(wallets) {
  fs.writeFileSync(WALLETS_FILE, JSON.stringify(wallets, null, 2), "utf8");
}

// 名前 → LINE IDのマッピング（メンバーが「登録 田中」で登録する）
function loadNames() {
  if (!fs.existsSync(NAMES_FILE)) return {};
  try { return JSON.parse(fs.readFileSync(NAMES_FILE, "utf8")); } catch { return {}; }
}

function saveNames(names) {
  fs.writeFileSync(NAMES_FILE, JSON.stringify(names, null, 2), "utf8");
}

// ── ウォレット管理 ──────────────────────────────────────────

function getOrCreateWallet(lineUserId) {
  const wallets = loadWallets();
  if (wallets[lineUserId]) return wallets[lineUserId];

  const newWallet = ethers.Wallet.createRandom();
  wallets[lineUserId] = newWallet.address;
  saveWallets(wallets);

  console.log(`[lineHandler] 新規ウォレット生成: ${lineUserId} → ${newWallet.address}`);
  return newWallet.address;
}

// ── ユーティリティ ──────────────────────────────────────────

function isAdmin(lineUserId) {
  return lineUserId === process.env.ADMIN_LINE_USER_ID;
}

function tierEmoji(tier) {
  const map = { Bronze: "🥉", Silver: "🥈", Gold: "🥇", Platinum: "💎" };
  return map[tier] || "🏅";
}

// 名前からウォレットアドレスを引く
// 「田中」「田中さん」「田中　さん」など表記揺れを吸収する
function resolveNameToAddress(inputName) {
  const names = loadNames();
  const wallets = loadWallets();

  // 「さん」「くん」「ちゃん」等の敬称を除去して正規化
  const normalize = (s) => s.replace(/[\s　]*(さん|くん|ちゃん|様|氏)$/, "").trim();
  const normalizedInput = normalize(inputName);

  // 完全一致 → 前方一致の順で検索
  const found =
    Object.entries(names).find(([name]) => normalize(name) === normalizedInput) ||
    Object.entries(names).find(([name]) => normalize(name).startsWith(normalizedInput));

  if (!found) return null;

  const [, lineUserId] = found;
  return wallets[lineUserId] || null;
}

// ── メインハンドラ ──────────────────────────────────────────

async function handleMessage(event) {
  if (event.type !== "message" || event.message.type !== "text") return null;

  const text = event.message.text.trim();
  const lineUserId = event.source.userId;
  const userAddress = getOrCreateWallet(lineUserId);

  // ─── 残高確認 ─────────────────────────────────────────────
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

  // ─── ステータス詳細 ────────────────────────────────────────
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

  // ─── 使い方・ヘルプ ───────────────────────────────────────
  if (text === "使い方" || text.toLowerCase() === "help") {
    const adminHelp = isAdmin(lineUserId)
      ? [
          ``,
          `【管理者コマンド】`,
          `ありがとう [お名前] [活動内容]`,
          `  例: ありがとう 田中さん 公民館の清掃`,
          ``,
          `減価設定 [周期日数] [減価率%] [通知日数]`,
          `  例: 減価設定 30 10 3`,
          ``,
          `減価確認  → 現在の減価設定を表示`,
        ].join("\n")
      : "";

    return [
      `📖 感謝ポイントシステム 使い方`,
      ``,
      `【メンバーコマンド】`,
      `残高確認  → 現在のポイントとランクを表示`,
      `ステータス → ランク特典の一覧を表示`,
      `使い方    → このヘルプを表示`,
      `登録 [お名前] → 自分の名前を登録する`,
      `  例: 登録 田中`,
      adminHelp,
    ].join("\n");
  }

  // ─── 名前登録 ─────────────────────────────────────────────
  // 書式: 登録 [お名前]
  if (text.startsWith("登録 ") || text.startsWith("登録　")) {
    const name = text.replace(/^登録[\s　]+/, "").trim();
    if (!name) {
      return "名前を入力してください。\n例: 登録 田中";
    }

    const names = loadNames();

    // 同じ名前が別ユーザーに登録済みでないか確認
    const duplicate = Object.entries(names).find(
      ([n, id]) => n === name && id !== lineUserId
    );
    if (duplicate) {
      return `⚠️ 「${name}」はすでに別のメンバーが登録しています。\n別のお名前で登録してください。`;
    }

    names[name] = lineUserId;
    saveNames(names);

    console.log(`[lineHandler] 名前登録: ${name} → ${lineUserId}`);
    return `✅ 「${name}」として登録しました！\n管理者がポイントを付与する際に使われます。`;
  }

  // ─── ポイント付与（管理者専用） ───────────────────────────
  // 書式: ありがとう [対象者名] [活動内容]
  if (text.startsWith("ありがとう ")) {
    if (!isAdmin(lineUserId)) {
      return "⚠️ ポイントの付与は管理者のみ行えます";
    }

    const parts = text.replace("ありがとう ", "").split(" ");
    if (parts.length < 2) {
      return "書式が正しくありません。\n例: ありがとう 田中さん 公民館の清掃";
    }

    const targetName = parts[0];
    const reason = parts.slice(1).join(" ");

    const targetAddress = resolveNameToAddress(targetName);
    if (!targetAddress) {
      return `⚠️ 「${targetName}」さんはまだ登録されていません。\nメンバー本人に「登録 ${targetName.replace(/さん|くん|ちゃん|様/, "")}」と送るよう伝えてください。`;
    }

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

  // ─── 減価設定（管理者専用） ───────────────────────────────
  // 書式: 減価設定 [周期日数] [減価率%] [通知日数]
  if (text.startsWith("減価設定 ")) {
    if (!isAdmin(lineUserId)) {
      return "⚠️ 減価設定は管理者のみ変更できます";
    }

    const parts = text.replace("減価設定 ", "").split(" ");
    if (parts.length < 3) {
      return "書式が正しくありません。\n例: 減価設定 30 10 3\n（周期30日、減価率10%、3日前に通知）";
    }

    const [period, rate, notifyDays] = parts.map(Number);
    if ([period, rate, notifyDays].some(isNaN) || rate < 0 || rate > 100) {
      return "⚠️ 数値が正しくありません。\n減価率は0〜100の範囲で入力してください。";
    }

    const result = await contractService.setDecayConfig(period, rate, notifyDays);
    if (result.success) {
      return [
        `✅ 減価設定を更新しました`,
        ``,
        `減価周期: ${period} 日`,
        `減価率:   ${rate} %`,
        `通知タイミング: ${notifyDays} 日前`,
      ].join("\n");
    } else {
      return `❌ 設定の更新に失敗しました\n${result.error || ""}`;
    }
  }

  // ─── 減価確認（管理者専用） ───────────────────────────────
  if (text === "減価確認") {
    if (!isAdmin(lineUserId)) {
      return "⚠️ 減価設定の確認は管理者のみ行えます";
    }

    const config = await contractService.getDecayConfig();
    return [
      `⚙️ 現在の減価設定`,
      ``,
      `減価周期: ${config.decayPeriod} 日`,
      `減価率:   ${config.decayRate} %`,
      `通知タイミング: ${config.decayNotifyDays} 日前`,
    ].join("\n");
  }

  // ─── 未認識コマンド ───────────────────────────────────────
  return `「使い方」と送るとコマンド一覧が表示されます`;
}

module.exports = { handleMessage };
