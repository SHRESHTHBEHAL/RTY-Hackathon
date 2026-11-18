// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IGaitwayVault} from "./IGaitwayVault.sol";

/// @title GaitwayVault
/// @notice Holds USDC for Gaitway businesses. A fast off-chain ledger tracks agent
///         wallets; this contract tracks one balance per business, pays sellers in
///         batches, and keeps the platform fee.
/// @dev Invariant: token.balanceOf(this) == sum(business balances) + feeBalance.
///      Test software. Not audited. See contracts/SECURITY.md.
contract GaitwayVault is IGaitwayVault, AccessControl, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant REGISTRAR_ROLE = keccak256("REGISTRAR_ROLE");
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");
    uint256 public constant EXIT_DELAY = 7 days;

    IERC20 public immutable token;

    mapping(bytes32 => uint256) private _balances;
    mapping(bytes32 => address) private _withdrawAddress;
    mapping(bytes32 => address) private _payoutAddress;
    mapping(bytes32 => bool) private _usedKeys;
    /// @notice Zero when no exit is pending.
    mapping(bytes32 => uint256) public exitExecutableAt;
    uint256 private _feeBalance;

    error ZeroAddress();
    error ZeroAmount();
    error BusinessNotRegistered(bytes32 businessKey);
    error SellerNotRegistered(bytes32 sellerKey);
    error KeyAlreadyUsed(bytes32 key);
    error InsufficientBalance(bytes32 businessKey, uint256 have, uint256 need);
    error InsufficientFeeBalance(uint256 have, uint256 need);
    error FeeExceedsGross();
    error NotWithdrawAddress();
    error ExitNotRequested();
    error ExitNotReady(uint256 executableAt);

    constructor(address usdc, address admin) {
        if (usdc == address(0) || admin == address(0)) revert ZeroAddress();
        token = IERC20(usdc);
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(REGISTRAR_ROLE, admin);
        _grantRole(OPERATOR_ROLE, admin);
    }

    // ------------------------------------------------------------------ registry

    /// @notice Registering again replaces the address (so a retry is harmless).
    function registerBusiness(bytes32 businessKey, address withdrawAddress) external onlyRole(REGISTRAR_ROLE) {
        if (withdrawAddress == address(0)) revert ZeroAddress();
        _withdrawAddress[businessKey] = withdrawAddress;
        emit BusinessRegistered(businessKey, withdrawAddress);
    }

    function registerSeller(bytes32 sellerKey, address payoutAddress) external onlyRole(REGISTRAR_ROLE) {
        if (payoutAddress == address(0)) revert ZeroAddress();
        _payoutAddress[sellerKey] = payoutAddress;
        emit SellerRegistered(sellerKey, payoutAddress);
    }

    // ------------------------------------------------------------------ money in

    /// @notice Anyone may fund a registered business. Not blocked by pause.
    /// @dev Credits the measured balance change, so fee-on-transfer tokens cannot
    ///      make the ledger exceed what the vault actually holds.
    function deposit(bytes32 businessKey, uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        if (_withdrawAddress[businessKey] == address(0)) revert BusinessNotRegistered(businessKey);
        uint256 before = token.balanceOf(address(this));
        token.safeTransferFrom(msg.sender, address(this), amount);
        uint256 received = token.balanceOf(address(this)) - before;
        if (received == 0) revert ZeroAmount();
        _balances[businessKey] += received;
        emit Deposited(businessKey, msg.sender, received);
    }

    // ------------------------------------------------------------------ money out

    /// @notice Pays every item or nothing. A used batch key reverts with KeyAlreadyUsed.
    function settle(bytes32 batchKey, SettleItem[] calldata items)
        external
        onlyRole(OPERATOR_ROLE)
        whenNotPaused
        nonReentrant
    {
        _useKey(batchKey);
        uint256 n = items.length;
        uint256 fees = 0;
        for (uint256 i = 0; i < n; ++i) {
            SettleItem calldata it = items[i];
            if (it.fee > it.gross) revert FeeExceedsGross();
            address payout = _payoutAddress[it.sellerKey];
            if (payout == address(0)) revert SellerNotRegistered(it.sellerKey);
            uint256 have = _balances[it.businessKey];
            if (have < it.gross) revert InsufficientBalance(it.businessKey, have, it.gross);
            unchecked {
                _balances[it.businessKey] = have - it.gross;
            }
            fees += it.fee;
            uint256 net = it.gross - it.fee;
            if (net > 0) token.safeTransfer(payout, net);
            emit Settled(batchKey, it.businessKey, it.sellerKey, it.gross, it.fee);
        }
        _feeBalance += fees;
    }

    function withdraw(bytes32 withdrawalKey, bytes32 businessKey, uint256 amount)
        external
        onlyRole(OPERATOR_ROLE)
        whenNotPaused
        nonReentrant
    {
        if (amount == 0) revert ZeroAmount();
        address to = _withdrawAddress[businessKey];
        if (to == address(0)) revert BusinessNotRegistered(businessKey);
        _useKey(withdrawalKey);
        uint256 have = _balances[businessKey];
        if (have < amount) revert InsufficientBalance(businessKey, have, amount);
        unchecked {
            _balances[businessKey] = have - amount;
        }
        token.safeTransfer(to, amount);
        emit Withdrawn(withdrawalKey, businessKey, to, amount);
    }

    // ------------------------------------------------------------------ admin

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    function collectFees(address to, uint256 amount) external onlyRole(DEFAULT_ADMIN_ROLE) nonReentrant {
        if (to == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        if (amount > _feeBalance) revert InsufficientFeeBalance(_feeBalance, amount);
        unchecked {
            _feeBalance -= amount;
        }
        token.safeTransfer(to, amount);
        emit FeesCollected(to, amount);
    }

    // ------------------------------------------------------------------ exit hatch

    /// @notice The business's own withdraw address starts a 7-day exit. Works while paused.
    function requestExit(bytes32 businessKey) external {
        address w = _withdrawAddress[businessKey];
        if (w == address(0) || msg.sender != w) revert NotWithdrawAddress();
        uint256 at = block.timestamp + EXIT_DELAY;
        exitExecutableAt[businessKey] = at;
        emit ExitRequested(businessKey, at);
    }

    /// @notice Anyone may finish an exit after the delay. Never blocked by pause.
    ///         Sends the whole remaining balance to the registered withdraw address.
    function executeExit(bytes32 businessKey) external nonReentrant {
        uint256 at = exitExecutableAt[businessKey];
        if (at == 0) revert ExitNotRequested();
        if (block.timestamp < at) revert ExitNotReady(at);
        delete exitExecutableAt[businessKey];
        address to = _withdrawAddress[businessKey];
        uint256 amount = _balances[businessKey];
        _balances[businessKey] = 0;
        if (amount > 0) token.safeTransfer(to, amount);
        emit ExitExecuted(businessKey, to, amount);
    }

    // ------------------------------------------------------------------ views

    function balanceOf(bytes32 businessKey) external view returns (uint256) {
        return _balances[businessKey];
    }

    function feeBalance() external view returns (uint256) {
        return _feeBalance;
    }

    function withdrawAddressOf(bytes32 businessKey) external view returns (address) {
        return _withdrawAddress[businessKey];
    }

    function payoutAddressOf(bytes32 sellerKey) external view returns (address) {
        return _payoutAddress[sellerKey];
    }

    function usedKey(bytes32 key) external view returns (bool) {
        return _usedKeys[key];
    }

    // ------------------------------------------------------------------ internal

    function _useKey(bytes32 key) private {
        if (_usedKeys[key]) revert KeyAlreadyUsed(key);
        _usedKeys[key] = true;
    }
}
