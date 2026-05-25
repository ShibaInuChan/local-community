require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

// 秘密鍵が設定されていない場合のダミー値（デプロイ時は必ず設定すること）
const PRIVATE_KEY = process.env.PRIVATE_KEY || "0x0000000000000000000000000000000000000000000000000000000000000001";

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },

  networks: {
    // ローカル開発用（テスト時に使用）
    hardhat: {
      chainId: 31337,
    },

    // Polygonテストネット（Amoy）- 本番デプロイ前の動作確認用
    polygonAmoy: {
      url: process.env.POLYGON_AMOY_RPC || "https://rpc-amoy.polygon.technology",
      accounts: [PRIVATE_KEY],
      chainId: 80002,
    },

    // Polygonメインネット - 本番環境
    polygon: {
      url: process.env.POLYGON_MAINNET_RPC || "https://polygon-rpc.com",
      accounts: [PRIVATE_KEY],
      chainId: 137,
    },
  },
};
