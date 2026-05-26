// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * KanshaPoint - 地域コミュニティ向け感謝ポイントシステム
 *
 * 特徴:
 * - オーナー（管理者）のみがポイントを発行・減価できる
 * - ユーザー間のポイント送受信は不可（譲渡不可）
 * - ポイント残高に応じてランク（ブロンズ〜プラチナ）が決まる
 * - 減価パラメータは管理者がいつでも変更可能（複数コミュニティ対応）
 */
contract KanshaPoint is ERC20 {
    address public owner;

    // 減価設定（管理者がLINEから変更可能）
    uint256 public decayPeriod;     // 減価周期（日数）
    uint256 public decayRate;       // 減価率（%、例: 10 = 10%）
    uint256 public decayNotifyDays; // 減価の何日前にLINE通知するか

    event PointsIssued(
        address indexed recipient,
        uint256 amount,
        string reason,
        uint256 newBalance
    );

    event DecayApplied(
        address indexed user,
        uint256 burnedAmount,
        uint256 newBalance
    );

    // 減価設定が変更されたときのイベント
    event DecayConfigUpdated(
        uint256 decayPeriod,
        uint256 decayRate,
        uint256 decayNotifyDays
    );

    modifier onlyOwner() {
        require(msg.sender == owner, "KanshaPoint: caller is not the owner");
        _;
    }

    constructor() ERC20("Kansha Point", "KSP") {
        owner = msg.sender;
        // デフォルトの減価設定（デプロイ後に管理者が変更可能）
        decayPeriod = 30;
        decayRate = 10;
        decayNotifyDays = 3;
    }

    /**
     * ポイントを発行する（オーナー専用）
     */
    function issuePoints(
        address recipient,
        uint256 amount,
        string memory reason
    ) external onlyOwner {
        require(recipient != address(0), "KanshaPoint: recipient is zero address");
        require(amount > 0, "KanshaPoint: amount must be greater than zero");

        _mint(recipient, amount);
        emit PointsIssued(recipient, amount, reason, balanceOf(recipient));
    }

    /**
     * ポイントを減価させる（オーナー専用）
     * バックエンドのcronジョブが周期ごとに呼び出す
     * 減価量の計算はバックエンド側で行い、この関数はバーン（焼却）のみ担当する
     */
    function burnDecay(address user, uint256 amount) external onlyOwner {
        require(user != address(0), "KanshaPoint: user is zero address");
        uint256 currentBalance = balanceOf(user);
        // 残高を超えるバーンは残高を0にする（エラーにしない）
        uint256 burnAmount = amount > currentBalance ? currentBalance : amount;
        if (burnAmount == 0) return;

        _burn(user, burnAmount);
        emit DecayApplied(user, burnAmount, balanceOf(user));
    }

    /**
     * 減価設定を変更する（オーナー専用）
     * @param _decayPeriod     減価周期（日数）
     * @param _decayRate       減価率（0〜100の整数）
     * @param _decayNotifyDays 減価の何日前に通知するか
     */
    function setDecayConfig(
        uint256 _decayPeriod,
        uint256 _decayRate,
        uint256 _decayNotifyDays
    ) external onlyOwner {
        require(_decayRate <= 100, "KanshaPoint: decayRate must be 0-100");
        require(_decayPeriod > 0, "KanshaPoint: decayPeriod must be greater than zero");

        decayPeriod = _decayPeriod;
        decayRate = _decayRate;
        decayNotifyDays = _decayNotifyDays;

        emit DecayConfigUpdated(_decayPeriod, _decayRate, _decayNotifyDays);
    }

    /**
     * ポイント残高を返す
     */
    function getBalance(address user) external view returns (uint256) {
        return balanceOf(user);
    }

    /**
     * ポイント残高に応じたランクを返す
     */
    function getTier(address user) external view returns (string memory) {
        uint256 balance = balanceOf(user);

        if (balance >= 2000) return "Platinum";
        if (balance >= 500)  return "Gold";
        if (balance >= 100)  return "Silver";
        return "Bronze";
    }

    /**
     * ユーザー間のポイント送受信を禁止する
     */
    function transfer(address, uint256) public pure override returns (bool) {
        revert("KanshaPoint: transfer is not allowed");
    }

    function transferFrom(address, address, uint256) public pure override returns (bool) {
        revert("KanshaPoint: transfer is not allowed");
    }
}
