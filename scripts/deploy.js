// KanshaPointコントラクトのデプロイスクリプト
// 使い方: npx hardhat run scripts/deploy.js --network polygonAmoy

const { ethers } = require("hardhat");

async function main() {
  console.log("KanshaPointコントラクトのデプロイを開始します...");

  // デプロイに使用するアカウントを取得
  const [deployer] = await ethers.getSigners();
  console.log("デプロイアカウント:", deployer.address);

  // アカウントの残高を確認（ガス代として必要）
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("アカウント残高:", ethers.formatEther(balance), "MATIC");

  // コントラクトをデプロイ
  console.log("\nコントラクトをデプロイ中...");
  const KanshaPoint = await ethers.getContractFactory("KanshaPoint");
  const kanshaPoint = await KanshaPoint.deploy();

  // デプロイ完了を待つ
  await kanshaPoint.waitForDeployment();

  const contractAddress = await kanshaPoint.getAddress();
  console.log("\nデプロイ完了!");
  console.log("コントラクトアドレス:", contractAddress);
  console.log("\n.envファイルに以下を追加してください:");
  console.log(`CONTRACT_ADDRESS=${contractAddress}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("デプロイ中にエラーが発生しました:", error);
    process.exit(1);
  });
