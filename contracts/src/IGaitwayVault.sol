// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// Verbatim from context.md section 9.
interface IGaitwayVault {
    struct SettleItem { bytes32 businessKey; bytes32 sellerKey; uint256 gross; uint256 fee; }

    event BusinessRegistered(bytes32 indexed businessKey, address withdrawAddress);
    event SellerRegistered(bytes32 indexed sellerKey, address payoutAddress);
    event Deposited(bytes32 indexed businessKey, address indexed from, uint256 amount);
    event Settled(bytes32 indexed batchKey, bytes32 indexed businessKey,
                  bytes32 indexed sellerKey, uint256 gross, uint256 fee);
    event Withdrawn(bytes32 indexed withdrawalKey, bytes32 indexed businessKey,
                    address to, uint256 amount);
    event FeesCollected(address to, uint256 amount);          // M2
    event ExitRequested(bytes32 indexed businessKey, uint256 executableAt); // M2
    event ExitExecuted(bytes32 indexed businessKey, address to, uint256 amount); // M2

    function registerBusiness(bytes32 businessKey, address withdrawAddress) external; // REGISTRAR
    function registerSeller(bytes32 sellerKey, address payoutAddress) external;       // REGISTRAR
    function deposit(bytes32 businessKey, uint256 amount) external;                   // anyone
    function settle(bytes32 batchKey, SettleItem[] calldata items) external;          // OPERATOR
    function withdraw(bytes32 withdrawalKey, bytes32 businessKey, uint256 amount) external; // OPERATOR
    function pause() external;                                                        // admin
    function unpause() external;                                                      // admin
    function collectFees(address to, uint256 amount) external;                        // admin, M2
    function requestExit(bytes32 businessKey) external;   // the business's withdraw address, M2
    function executeExit(bytes32 businessKey) external;   // anyone, after EXIT_DELAY, M2

    function balanceOf(bytes32 businessKey) external view returns (uint256);
    function feeBalance() external view returns (uint256);
    function withdrawAddressOf(bytes32 businessKey) external view returns (address);
    function payoutAddressOf(bytes32 sellerKey) external view returns (address);
    function usedKey(bytes32 key) external view returns (bool);
}
