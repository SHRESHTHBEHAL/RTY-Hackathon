// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {GaitwayVault} from "../src/GaitwayVault.sol";
import {IGaitwayVault} from "../src/IGaitwayVault.sol";
import {MockUSDC} from "../src/MockUSDC.sol";

/// Drives random deposits, settles, withdrawals, fee collection and exits.
contract VaultHandler is Test {
    GaitwayVault public vault;
    MockUSDC public usdc;
    address public admin;
    bytes32[3] public businesses;
    bytes32[2] public sellers;
    address[3] public withdrawAddrs;
    uint256 nonce;

    constructor(GaitwayVault v, MockUSDC u, address a) {
        vault = v;
        usdc = u;
        admin = a;
        for (uint256 i = 0; i < 3; ++i) {
            businesses[i] = keccak256(abi.encodePacked("biz_", i));
            withdrawAddrs[i] = makeAddr(string(abi.encodePacked("w", i)));
            vm.prank(admin);
            vault.registerBusiness(businesses[i], withdrawAddrs[i]);
        }
        for (uint256 i = 0; i < 2; ++i) {
            sellers[i] = keccak256(abi.encodePacked("sel_", i));
            vm.prank(admin);
            vault.registerSeller(sellers[i], makeAddr(string(abi.encodePacked("s", i))));
        }
    }

    function businessKey(uint256 i) external view returns (bytes32) {
        return businesses[i];
    }

    function deposit(uint256 b, uint256 amount) external {
        amount = bound(amount, 1, 1e12);
        bytes32 key = businesses[b % 3];
        usdc.mint(address(this), amount);
        usdc.approve(address(vault), amount);
        vault.deposit(key, amount);
    }

    function settle(uint256 b, uint256 s, uint256 gross, uint256 feeBps) external {
        bytes32 key = businesses[b % 3];
        uint256 bal = vault.balanceOf(key);
        if (bal == 0) return;
        gross = bound(gross, 1, bal);
        uint256 fee = gross * bound(feeBps, 0, 10_000) / 10_000;
        IGaitwayVault.SettleItem[] memory items = new IGaitwayVault.SettleItem[](1);
        items[0] = IGaitwayVault.SettleItem(key, sellers[s % 2], gross, fee);
        vm.prank(admin);
        vault.settle(keccak256(abi.encodePacked("stl", nonce++)), items);
    }

    function withdraw(uint256 b, uint256 amount) external {
        bytes32 key = businesses[b % 3];
        uint256 bal = vault.balanceOf(key);
        if (bal == 0) return;
        amount = bound(amount, 1, bal);
        vm.prank(admin);
        vault.withdraw(keccak256(abi.encodePacked("wdr", nonce++)), key, amount);
    }

    function collectFees(uint256 amount) external {
        uint256 fees = vault.feeBalance();
        if (fees == 0) return;
        amount = bound(amount, 1, fees);
        vm.prank(admin);
        vault.collectFees(admin, amount);
    }

    function exit(uint256 b) external {
        uint256 i = b % 3;
        vm.prank(withdrawAddrs[i]);
        vault.requestExit(businesses[i]);
        vm.warp(block.timestamp + 7 days);
        vault.executeExit(businesses[i]);
    }
}

contract VaultInvariantTest is Test {
    GaitwayVault vault;
    MockUSDC usdc;
    VaultHandler handler;

    function setUp() public {
        usdc = new MockUSDC();
        address admin = makeAddr("admin");
        vault = new GaitwayVault(address(usdc), admin);
        handler = new VaultHandler(vault, usdc, admin);
        targetContract(address(handler));
    }

    function invariant_tokenBalanceEqualsLedger() public view {
        uint256 sum = vault.feeBalance();
        for (uint256 i = 0; i < 3; ++i) sum += vault.balanceOf(handler.businessKey(i));
        assertEq(usdc.balanceOf(address(vault)), sum);
    }
}
