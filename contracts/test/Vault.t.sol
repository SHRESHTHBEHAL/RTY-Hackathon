// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {GaitwayVault} from "../src/GaitwayVault.sol";
import {IGaitwayVault} from "../src/IGaitwayVault.sol";
import {MockUSDC} from "../src/MockUSDC.sol";

contract VaultTest is Test {
    event BusinessRegistered(bytes32 indexed businessKey, address withdrawAddress);
    event SellerRegistered(bytes32 indexed sellerKey, address payoutAddress);
    event Deposited(bytes32 indexed businessKey, address indexed from, uint256 amount);
    event Settled(bytes32 indexed batchKey, bytes32 indexed businessKey,
                  bytes32 indexed sellerKey, uint256 gross, uint256 fee);
    event Withdrawn(bytes32 indexed withdrawalKey, bytes32 indexed businessKey, address to, uint256 amount);
    event FeesCollected(address to, uint256 amount);
    event ExitRequested(bytes32 indexed businessKey, uint256 executableAt);
    event ExitExecuted(bytes32 indexed businessKey, address to, uint256 amount);

    MockUSDC usdc;
    GaitwayVault vault;
    address admin = makeAddr("admin");
    address user = makeAddr("user");
    address stranger = makeAddr("stranger");
    address bizAWithdraw = makeAddr("bizAWithdraw");
    address bizBWithdraw = makeAddr("bizBWithdraw");
    address sellerAPayout = makeAddr("sellerAPayout");
    address sellerBPayout = makeAddr("sellerBPayout");

    bytes32 constant BIZ_A = keccak256("biz_a");
    bytes32 constant BIZ_B = keccak256("biz_b");
    bytes32 constant SEL_A = keccak256("sel_a");
    bytes32 constant SEL_B = keccak256("sel_b");

    function setUp() public {
        usdc = new MockUSDC();
        vault = new GaitwayVault(address(usdc), admin);
    }

    // ---------- helpers ----------
    function _registerAll() internal {
        vm.startPrank(admin);
        vault.registerBusiness(BIZ_A, bizAWithdraw);
        vault.registerBusiness(BIZ_B, bizBWithdraw);
        vault.registerSeller(SEL_A, sellerAPayout);
        vault.registerSeller(SEL_B, sellerBPayout);
        vm.stopPrank();
    }

    function _fund(bytes32 biz, uint256 amount) internal {
        usdc.mint(user, amount);
        vm.startPrank(user);
        usdc.approve(address(vault), amount);
        vault.deposit(biz, amount);
        vm.stopPrank();
    }

    function _items1(bytes32 biz, bytes32 sel, uint256 gross, uint256 fee)
        internal pure returns (IGaitwayVault.SettleItem[] memory items)
    {
        items = new IGaitwayVault.SettleItem[](1);
        items[0] = IGaitwayVault.SettleItem(biz, sel, gross, fee);
    }

    function _accessErr(address who, bytes32 role) internal pure returns (bytes memory) {
        return abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, who, role);
    }

    // ---------- Task 1 ----------
    function test_constructor_grantsAllRolesToAdmin() public view {
        assertTrue(vault.hasRole(vault.DEFAULT_ADMIN_ROLE(), admin));
        assertTrue(vault.hasRole(vault.REGISTRAR_ROLE(), admin));
        assertTrue(vault.hasRole(vault.OPERATOR_ROLE(), admin));
        assertEq(address(vault.token()), address(usdc));
    }

    function test_deposit_creditsBusiness() public {
        vm.prank(admin);
        vault.registerBusiness(BIZ_A, bizAWithdraw);
        usdc.mint(user, 100e6);
        vm.startPrank(user);
        usdc.approve(address(vault), 100e6);
        vm.expectEmit(true, true, false, true);
        emit Deposited(BIZ_A, user, 100e6);
        vault.deposit(BIZ_A, 100e6);
        vm.stopPrank();
        assertEq(vault.balanceOf(BIZ_A), 100e6);
        assertEq(usdc.balanceOf(address(vault)), 100e6);
    }

    function test_deposit_revertsForUnregisteredBusiness() public {
        usdc.mint(user, 1e6);
        vm.startPrank(user);
        usdc.approve(address(vault), 1e6);
        vm.expectRevert(abi.encodeWithSelector(GaitwayVault.BusinessNotRegistered.selector, BIZ_A));
        vault.deposit(BIZ_A, 1e6);
        vm.stopPrank();
    }

    function test_deposit_revertsOnZero() public {
        vm.prank(admin);
        vault.registerBusiness(BIZ_A, bizAWithdraw);
        vm.expectRevert(GaitwayVault.ZeroAmount.selector);
        vault.deposit(BIZ_A, 0);
    }

    function test_register_onlyRegistrar() public {
        bytes32 role = vault.REGISTRAR_ROLE();
        vm.startPrank(stranger);
        vm.expectRevert(_accessErr(stranger, role));
        vault.registerBusiness(BIZ_A, bizAWithdraw);
        vm.expectRevert(_accessErr(stranger, role));
        vault.registerSeller(SEL_A, sellerAPayout);
        vm.stopPrank();
    }

    function test_register_rejectsZeroAddress() public {
        vm.startPrank(admin);
        vm.expectRevert(GaitwayVault.ZeroAddress.selector);
        vault.registerBusiness(BIZ_A, address(0));
        vm.expectRevert(GaitwayVault.ZeroAddress.selector);
        vault.registerSeller(SEL_A, address(0));
        vm.stopPrank();
    }

    function test_registerBusiness_twice_updatesAddress() public {
        vm.startPrank(admin);
        vault.registerBusiness(BIZ_A, bizAWithdraw);
        vm.expectEmit(true, false, false, true);
        emit BusinessRegistered(BIZ_A, bizBWithdraw);
        vault.registerBusiness(BIZ_A, bizBWithdraw);
        vm.stopPrank();
        assertEq(vault.withdrawAddressOf(BIZ_A), bizBWithdraw);
    }

    function test_registerSeller_emitsAndStores() public {
        vm.prank(admin);
        vm.expectEmit(true, false, false, true);
        emit SellerRegistered(SEL_A, sellerAPayout);
        vault.registerSeller(SEL_A, sellerAPayout);
        assertEq(vault.payoutAddressOf(SEL_A), sellerAPayout);
    }

    // ---------- Task 2: settle ----------
    function test_settle_paysSellerAndKeepsFee() public {
        _registerAll();
        _fund(BIZ_A, 100e6);
        bytes32 batch = keccak256("stl_1");
        vm.expectEmit(true, true, true, true);
        emit Settled(batch, BIZ_A, SEL_A, 10e6, 1e6);
        vm.prank(admin);
        vault.settle(batch, _items1(BIZ_A, SEL_A, 10e6, 1e6));
        assertEq(vault.balanceOf(BIZ_A), 90e6);
        assertEq(usdc.balanceOf(sellerAPayout), 9e6);
        assertEq(vault.feeBalance(), 1e6);
        assertTrue(vault.usedKey(batch));
    }

    function test_settle_multipleItems_twoBusinessesTwoSellers() public {
        _registerAll();
        _fund(BIZ_A, 100e6);
        _fund(BIZ_B, 50e6);
        IGaitwayVault.SettleItem[] memory items = new IGaitwayVault.SettleItem[](3);
        items[0] = IGaitwayVault.SettleItem(BIZ_A, SEL_A, 10e6, 0);
        items[1] = IGaitwayVault.SettleItem(BIZ_B, SEL_B, 5e6, 5e5);
        items[2] = IGaitwayVault.SettleItem(BIZ_A, SEL_B, 1e6, 0);
        vm.prank(admin);
        vault.settle(keccak256("stl_m"), items);
        assertEq(vault.balanceOf(BIZ_A), 89e6);
        assertEq(vault.balanceOf(BIZ_B), 45e6);
        assertEq(usdc.balanceOf(sellerAPayout), 10e6);
        assertEq(usdc.balanceOf(sellerBPayout), 45e5 + 1e6);
        assertEq(vault.feeBalance(), 5e5);
    }

    function test_settle_revertsWholeBatch_whenOneItemOverdraws() public {
        _registerAll();
        _fund(BIZ_A, 100e6);
        _fund(BIZ_B, 1e6);
        IGaitwayVault.SettleItem[] memory items = new IGaitwayVault.SettleItem[](2);
        items[0] = IGaitwayVault.SettleItem(BIZ_A, SEL_A, 10e6, 0);
        items[1] = IGaitwayVault.SettleItem(BIZ_B, SEL_B, 2e6, 0);
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(GaitwayVault.InsufficientBalance.selector, BIZ_B, 1e6, 2e6));
        vault.settle(keccak256("stl_bad"), items);
        assertEq(vault.balanceOf(BIZ_A), 100e6);
        assertEq(usdc.balanceOf(sellerAPayout), 0);
        assertFalse(vault.usedKey(keccak256("stl_bad")));
    }

    function test_settle_revertsOnReusedBatchKey() public {
        _registerAll();
        _fund(BIZ_A, 100e6);
        bytes32 batch = keccak256("stl_1");
        vm.startPrank(admin);
        vault.settle(batch, _items1(BIZ_A, SEL_A, 1e6, 0));
        vm.expectRevert(abi.encodeWithSelector(GaitwayVault.KeyAlreadyUsed.selector, batch));
        vault.settle(batch, _items1(BIZ_A, SEL_A, 1e6, 0));
        vm.stopPrank();
        assertEq(vault.balanceOf(BIZ_A), 99e6);
    }

    function test_settle_revertsWhenFeeExceedsGross() public {
        _registerAll();
        _fund(BIZ_A, 100e6);
        vm.prank(admin);
        vm.expectRevert(GaitwayVault.FeeExceedsGross.selector);
        vault.settle(keccak256("stl_f"), _items1(BIZ_A, SEL_A, 1e6, 2e6));
    }

    function test_settle_revertsForUnregisteredSeller() public {
        _registerAll();
        _fund(BIZ_A, 100e6);
        bytes32 unknown = keccak256("sel_unknown");
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(GaitwayVault.SellerNotRegistered.selector, unknown));
        vault.settle(keccak256("stl_u"), _items1(BIZ_A, unknown, 1e6, 0));
    }

    function test_settle_onlyOperator() public {
        _registerAll();
        _fund(BIZ_A, 100e6);
        bytes32 role = vault.OPERATOR_ROLE();
        IGaitwayVault.SettleItem[] memory items = _items1(BIZ_A, SEL_A, 1e6, 0);
        vm.prank(stranger);
        vm.expectRevert(_accessErr(stranger, role));
        vault.settle(keccak256("stl_x"), items);
    }

    // ---------- Task 2: withdraw ----------
    function test_withdraw_sendsToRegisteredAddress() public {
        _registerAll();
        _fund(BIZ_A, 100e6);
        bytes32 w = keccak256("wdr_1");
        vm.expectEmit(true, true, false, true);
        emit Withdrawn(w, BIZ_A, bizAWithdraw, 30e6);
        vm.prank(admin);
        vault.withdraw(w, BIZ_A, 30e6);
        assertEq(vault.balanceOf(BIZ_A), 70e6);
        assertEq(usdc.balanceOf(bizAWithdraw), 30e6);
    }

    function test_withdraw_revertsOnReusedKey() public {
        _registerAll();
        _fund(BIZ_A, 100e6);
        bytes32 w = keccak256("wdr_1");
        vm.startPrank(admin);
        vault.withdraw(w, BIZ_A, 1e6);
        vm.expectRevert(abi.encodeWithSelector(GaitwayVault.KeyAlreadyUsed.selector, w));
        vault.withdraw(w, BIZ_A, 1e6);
        vm.stopPrank();
    }

    function test_withdraw_revertsOnOverdraw() public {
        _registerAll();
        _fund(BIZ_A, 1e6);
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(GaitwayVault.InsufficientBalance.selector, BIZ_A, 1e6, 2e6));
        vault.withdraw(keccak256("wdr_2"), BIZ_A, 2e6);
    }

    function test_withdraw_onlyOperator() public {
        _registerAll();
        _fund(BIZ_A, 1e6);
        bytes32 role = vault.OPERATOR_ROLE();
        vm.prank(stranger);
        vm.expectRevert(_accessErr(stranger, role));
        vault.withdraw(keccak256("wdr_3"), BIZ_A, 1e6);
    }

    function test_usedKeys_sharedBetweenBatchAndWithdrawal() public {
        _registerAll();
        _fund(BIZ_A, 100e6);
        bytes32 k = keccak256("shared");
        vm.startPrank(admin);
        vault.settle(k, _items1(BIZ_A, SEL_A, 1e6, 0));
        vm.expectRevert(abi.encodeWithSelector(GaitwayVault.KeyAlreadyUsed.selector, k));
        vault.withdraw(k, BIZ_A, 1e6);
        vm.stopPrank();
    }

    // ---------- Task 2: pause ----------
    function test_pause_blocksSettleAndWithdraw_notDeposit() public {
        _registerAll();
        _fund(BIZ_A, 10e6);
        vm.prank(admin);
        vault.pause();
        IGaitwayVault.SettleItem[] memory items = _items1(BIZ_A, SEL_A, 1e6, 0);
        vm.startPrank(admin);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        vault.settle(keccak256("stl_p"), items);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        vault.withdraw(keccak256("wdr_p"), BIZ_A, 1e6);
        vm.stopPrank();
        _fund(BIZ_A, 5e6); // deposits still work while paused
        assertEq(vault.balanceOf(BIZ_A), 15e6);
        vm.prank(admin);
        vault.unpause();
        vm.prank(admin);
        vault.settle(keccak256("stl_p"), items);
    }

    function test_pause_onlyAdmin() public {
        bytes32 role = vault.DEFAULT_ADMIN_ROLE();
        vm.startPrank(stranger);
        vm.expectRevert(_accessErr(stranger, role));
        vault.pause();
        vm.expectRevert(_accessErr(stranger, role));
        vault.unpause();
        vm.stopPrank();
    }

    // ---------- Task 7: fees and exit ----------
    function test_collectFees_onlyAdmin_andCannotExceedFeeBalance() public {
        _registerAll();
        _fund(BIZ_A, 100e6);
        vm.prank(admin);
        vault.settle(keccak256("stl_fee"), _items1(BIZ_A, SEL_A, 10e6, 2e6));
        address treasury = makeAddr("treasury");
        bytes32 role = vault.DEFAULT_ADMIN_ROLE();
        vm.prank(stranger);
        vm.expectRevert(_accessErr(stranger, role));
        vault.collectFees(treasury, 1e6);
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(GaitwayVault.InsufficientFeeBalance.selector, 2e6, 3e6));
        vault.collectFees(treasury, 3e6);
        vm.expectEmit(false, false, false, true);
        emit FeesCollected(treasury, 2e6);
        vm.prank(admin);
        vault.collectFees(treasury, 2e6);
        assertEq(vault.feeBalance(), 0);
        assertEq(usdc.balanceOf(treasury), 2e6);
    }

    function test_requestExit_onlyWithdrawAddress() public {
        _registerAll();
        vm.prank(stranger);
        vm.expectRevert(GaitwayVault.NotWithdrawAddress.selector);
        vault.requestExit(BIZ_A);
        vm.prank(admin);
        vm.expectRevert(GaitwayVault.NotWithdrawAddress.selector);
        vault.requestExit(BIZ_A);
    }

    function test_executeExit_withoutRequest_reverts() public {
        _registerAll();
        vm.expectRevert(GaitwayVault.ExitNotRequested.selector);
        vault.executeExit(BIZ_A);
    }

    function test_executeExit_beforeDelay_reverts() public {
        _registerAll();
        _fund(BIZ_A, 10e6);
        uint256 at = block.timestamp + 7 days;
        vm.expectEmit(true, false, false, true);
        emit ExitRequested(BIZ_A, at);
        vm.prank(bizAWithdraw);
        vault.requestExit(BIZ_A);
        vm.warp(block.timestamp + 7 days - 1);
        vm.expectRevert(abi.encodeWithSelector(GaitwayVault.ExitNotReady.selector, at));
        vault.executeExit(BIZ_A);
    }

    function test_executeExit_afterDelay_sendsFullBalance() public {
        _registerAll();
        _fund(BIZ_A, 10e6);
        vm.prank(bizAWithdraw);
        vault.requestExit(BIZ_A);
        vm.warp(block.timestamp + 7 days);
        vm.expectEmit(true, false, false, true);
        emit ExitExecuted(BIZ_A, bizAWithdraw, 10e6);
        vm.prank(stranger);
        vault.executeExit(BIZ_A);
        assertEq(usdc.balanceOf(bizAWithdraw), 10e6);
        assertEq(vault.balanceOf(BIZ_A), 0);
        assertEq(vault.exitExecutableAt(BIZ_A), 0);
        vm.expectRevert(GaitwayVault.ExitNotRequested.selector);
        vault.executeExit(BIZ_A);
    }

    function test_executeExit_worksWhilePaused() public {
        _registerAll();
        _fund(BIZ_A, 10e6);
        vm.prank(bizAWithdraw);
        vault.requestExit(BIZ_A);
        vm.prank(admin);
        vault.pause();
        vm.warp(block.timestamp + 7 days);
        vault.executeExit(BIZ_A);
        assertEq(usdc.balanceOf(bizAWithdraw), 10e6);
    }

    function test_requestExit_worksWhilePaused() public {
        _registerAll();
        vm.prank(admin);
        vault.pause();
        vm.prank(bizAWithdraw);
        vault.requestExit(BIZ_A);
        assertEq(vault.exitExecutableAt(BIZ_A), block.timestamp + 7 days);
    }

    function test_settle_duringExitDelay_stillWorks() public {
        _registerAll();
        _fund(BIZ_A, 10e6);
        vm.prank(bizAWithdraw);
        vault.requestExit(BIZ_A);
        vm.warp(block.timestamp + 3 days);
        vm.prank(admin);
        vault.settle(keccak256("stl_exit"), _items1(BIZ_A, SEL_A, 4e6, 0));
        vm.warp(block.timestamp + 4 days);
        vault.executeExit(BIZ_A);
        assertEq(usdc.balanceOf(sellerAPayout), 4e6);
        assertEq(usdc.balanceOf(bizAWithdraw), 6e6);
    }
}
