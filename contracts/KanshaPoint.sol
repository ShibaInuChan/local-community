// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// OpenZeppelinのERC-20をベースに使用
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * KanshaPoint - 地域コミュニティ向け感謝ポイントシステム
 *
 * 特徴:
 * - オーナー（管理者）のみがポイントを発行できる
 * - ユーザー間のポイント送受信は不可（譲渡不可）
 * - ポイント残高に応じてランク（ブロンズ〜プラチナ）が決まる
 */
contract KanshaPoint is ERC20 {
    // コントラクトのオーナー（管理者）アドレス
    address public owner;

    // ポイント発行時に記録するイベント
    event PointsIssued(
        address indexed recipient,  // 受取人のアドレス
        uint256 amount,             // 発行ポイント数
        string reason,              // 発行理由（活動内容など）
        uint256 newBalance          // 発行後の残高
    );

    // オーナーのみ実行できる関数に付けるモディファイア
    modifier onlyOwner() {
        require(msg.sender == owner, "KanshaPoint: caller is not the owner");
        _;
    }

    /**
     * コンストラクタ - コントラクトのデプロイ時に一度だけ実行される
     * トークン名: "Kansha Point", シンボル: "KSP"
     */
    constructor() ERC20("Kansha Point", "KSP") {
        owner = msg.sender;
    }

    /**
     * ポイントを発行する（オーナー専用）
     * @param recipient 受取人のウォレットアドレス
     * @param amount    発行するポイント数（整数）
     * @param reason    発行理由（例: "公民館の清掃活動"）
     */
    function issuePoints(
        address recipient,
        uint256 amount,
        string memory reason
    ) external onlyOwner {
        require(recipient != address(0), "KanshaPoint: recipient is zero address");
        require(amount > 0, "KanshaPoint: amount must be greater than zero");

        // ポイントを発行（ERC-20のmint）
        _mint(recipient, amount);

        // イベントを記録（ブロックチェーン上の履歴）
        emit PointsIssued(recipient, amount, reason, balanceOf(recipient));
    }

    /**
     * 指定アドレスのポイント残高を返す
     * @param user 確認したいウォレットアドレス
     * @return 現在のポイント残高
     */
    function getBalance(address user) external view returns (uint256) {
        return balanceOf(user);
    }

    /**
     * ポイント残高に応じたランクを返す
     * Bronze  : 0〜99pt    - 基本メンバー
     * Silver  : 100〜499pt - 共有備品の優先レンタル権
     * Gold    : 500〜1999pt - お手伝い依頼の優先マッチング
     * Platinum: 2000pt〜   - コミュニティ運営への参加権
     *
     * @param user 確認したいウォレットアドレス
     * @return ランク名（文字列）
     */
    function getTier(address user) external view returns (string memory) {
        uint256 balance = balanceOf(user);

        if (balance >= 2000) {
            return "Platinum";
        } else if (balance >= 500) {
            return "Gold";
        } else if (balance >= 100) {
            return "Silver";
        } else {
            return "Bronze";
        }
    }

    /**
     * ユーザー間のポイント送受信を禁止する
     * ポイントは管理者が発行するのみで、ユーザー同士での譲渡はできない
     */
    function transfer(address, uint256) public pure override returns (bool) {
        revert("KanshaPoint: transfer is not allowed");
    }

    /**
     * 承認済み送受信も禁止する
     */
    function transferFrom(address, address, uint256) public pure override returns (bool) {
        revert("KanshaPoint: transfer is not allowed");
    }
}
