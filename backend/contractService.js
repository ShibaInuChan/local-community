// contractService.js
// ブロックチェーン（Polygonネットワーク）とのやり取りを担当するモジュール
// CONTRACT_ADDRESSが設定されていない場合はモックデータを返す（開発・テスト用）

const { ethers } = require("ethers");

// KanshaPointコントラクトのABI（必要な関数だけ定義）
// ABIとは: コントラクトの関数定義情報。これがないと関数を呼び出せない。
const CONTRACT_ABI = [
  "function issuePoints(address recipient, uint256 amount, string memory reason) external",
  "function getBalance(address user) external view returns (uint256)",
  "function getTier(address user) external view returns (string memory)",
  "function burnDecay(address user, uint256 amount) external",
  "function setDecayConfig(uint256 _decayPeriod, uint256 _decayRate, uint256 _decayNotifyDays) external",
  "function decayPeriod() external view returns (uint256)",
  "function decayRate() external view returns (uint256)",
  "function decayNotifyDays() external view returns (uint256)",
  "event PointsIssued(address indexed recipient, uint256 amount, string reason, uint256 newBalance)",
  "event DecayApplied(address indexed user, uint256 burnedAmount, uint256 newBalance)",
  "event DecayConfigUpdated(uint256 decayPeriod, uint256 decayRate, uint256 decayNotifyDays)",
];

// モックモードかどうかを判定（CONTRACT_ADDRESSが未設定の場合）
const isMockMode = !process.env.CONTRACT_ADDRESS;

if (isMockMode) {
  console.log("[contractService] CONTRACT_ADDRESSが未設定のため、モックモードで動作します");
} else {
  console.log("[contractService] コントラクトアドレス:", process.env.CONTRACT_ADDRESS);
}

/**
 * ethers.jsのProviderを取得する
 * Providerとは: ブロックチェーンへの読み取り専用接続
 */
function getProvider() {
  const rpcUrl = process.env.POLYGON_AMOY_RPC || "https://rpc-amoy.polygon.technology";
  return new ethers.JsonRpcProvider(rpcUrl);
}

/**
 * コントラクトのSignerインスタンスを取得する
 * Signerとは: 秘密鍵を持つ書き込み可能な接続（ガス代を支払ってトランザクションを送る）
 */
function getSigner() {
  const provider = getProvider();
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) {
    throw new Error("PRIVATE_KEYが設定されていません。.envファイルを確認してください。");
  }
  return new ethers.Wallet(privateKey, provider);
}

/**
 * コントラクトインスタンス（読み取り専用）を取得する
 */
function getReadContract() {
  const provider = getProvider();
  return new ethers.Contract(process.env.CONTRACT_ADDRESS, CONTRACT_ABI, provider);
}

/**
 * コントラクトインスタンス（書き込み可能）を取得する
 */
function getWriteContract() {
  const signer = getSigner();
  return new ethers.Contract(process.env.CONTRACT_ADDRESS, CONTRACT_ABI, signer);
}

/**
 * ポイントを発行する
 * @param {string} userAddress - 受取人のウォレットアドレス
 * @param {number} amount      - 発行ポイント数
 * @param {string} reason      - 発行理由
 * @returns {Promise<{success: boolean, txHash: string}>}
 */
async function issuePoints(userAddress, amount, reason) {
  // モックモード: 実際にトランザクションを送らずダミーレスポンスを返す
  if (isMockMode) {
    mockBalances[userAddress] = (mockBalances[userAddress] || 0) + amount;
    console.log(`[モック] ポイント発行: ${userAddress} に ${amount}pt (${reason}) → 残高: ${mockBalances[userAddress]}pt`);
    return { success: true, txHash: "0x" + "mock".repeat(16) };
  }

  try {
    const contract = getWriteContract();

    // issuePoints関数を呼び出す
    const tx = await contract.issuePoints(userAddress, amount, reason);
    console.log(`[contractService] トランザクション送信: ${tx.hash}`);

    // トランザクションが承認されるまで待つ
    const receipt = await tx.wait();
    console.log(`[contractService] トランザクション承認: ブロック ${receipt.blockNumber}`);

    return {
      success: true,
      txHash: tx.hash,
    };
  } catch (error) {
    console.error("[contractService] ポイント発行エラー:", error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * ポイント残高を取得する
 * @param {string} address - 確認したいウォレットアドレス
 * @returns {Promise<number>} ポイント残高
 */
async function getBalance(address) {
  // モックモード: 固定値を返す
  if (isMockMode) {
    console.log(`[モック] 残高確認: ${address}`);
    return mockBalances[address] || 0;
  }

  try {
    const contract = getReadContract();
    const balance = await contract.getBalance(address);
    // BigIntをnumberに変換（ポイントは整数なのでそのまま使える）
    return Number(balance);
  } catch (error) {
    console.error("[contractService] 残高確認エラー:", error.message);
    throw new Error("残高の確認に失敗しました");
  }
}

/**
 * ランクを取得する
 * @param {string} address - 確認したいウォレットアドレス
 * @returns {Promise<string>} ランク名（Bronze/Silver/Gold/Platinum）
 */
async function getTier(address) {
  // モックモード: 残高に基づいてランクを計算
  if (isMockMode) {
    const balance = await getBalance(address);
    if (balance >= 2000) return "Platinum";
    if (balance >= 500) return "Gold";
    if (balance >= 100) return "Silver";
    return "Bronze";
  }

  try {
    const contract = getReadContract();
    return await contract.getTier(address);
  } catch (error) {
    console.error("[contractService] ランク確認エラー:", error.message);
    throw new Error("ランクの確認に失敗しました");
  }
}

// モックモード用の残高ストア（メモリ内に保持）
const mockBalances = {};

// モックモード用の減価設定（メモリ内に保持）
const mockDecayConfig = { decayPeriod: 30, decayRate: 10, decayNotifyDays: 3 };

/**
 * 減価設定を更新する（管理者専用）
 */
async function setDecayConfig(decayPeriod, decayRate, decayNotifyDays) {
  if (isMockMode) {
    mockDecayConfig.decayPeriod = decayPeriod;
    mockDecayConfig.decayRate = decayRate;
    mockDecayConfig.decayNotifyDays = decayNotifyDays;
    console.log(`[モック] 減価設定更新: 周期${decayPeriod}日 / 率${decayRate}% / 通知${decayNotifyDays}日前`);
    return { success: true };
  }

  try {
    const contract = getWriteContract();
    const tx = await contract.setDecayConfig(decayPeriod, decayRate, decayNotifyDays);
    await tx.wait();
    return { success: true, txHash: tx.hash };
  } catch (error) {
    console.error("[contractService] 減価設定エラー:", error.message);
    return { success: false, error: error.message };
  }
}

/**
 * 現在の減価設定を取得する
 */
async function getDecayConfig() {
  if (isMockMode) {
    return { ...mockDecayConfig };
  }

  try {
    const contract = getReadContract();
    const [decayPeriod, decayRate, decayNotifyDays] = await Promise.all([
      contract.decayPeriod(),
      contract.decayRate(),
      contract.decayNotifyDays(),
    ]);
    return {
      decayPeriod: Number(decayPeriod),
      decayRate: Number(decayRate),
      decayNotifyDays: Number(decayNotifyDays),
    };
  } catch (error) {
    console.error("[contractService] 減価設定取得エラー:", error.message);
    throw new Error("減価設定の取得に失敗しました");
  }
}

/**
 * ポイントを減価させる（バックエンドのcronジョブから呼ばれる）
 */
async function burnDecay(userAddress, amount) {
  if (isMockMode) {
    const current = mockBalances[userAddress] || 0;
    mockBalances[userAddress] = Math.max(0, current - amount);
    console.log(`[モック] 減価バーン: ${userAddress} から ${amount}pt → 残高: ${mockBalances[userAddress]}pt`);
    return { success: true };
  }

  try {
    const contract = getWriteContract();
    const tx = await contract.burnDecay(userAddress, amount);
    await tx.wait();
    return { success: true, txHash: tx.hash };
  } catch (error) {
    console.error("[contractService] 減価バーンエラー:", error.message);
    return { success: false, error: error.message };
  }
}

module.exports = {
  issuePoints,
  getBalance,
  getTier,
  setDecayConfig,
  getDecayConfig,
  burnDecay,
};
