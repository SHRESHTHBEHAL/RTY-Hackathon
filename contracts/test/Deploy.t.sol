// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Deploy} from "../script/Deploy.s.sol";
import {GaitwayVault} from "../src/GaitwayVault.sol";
import {MockUSDC} from "../src/MockUSDC.sol";

contract DeployTest is Test {
    function test_deploy_grantsRolesAndWritesFile() public {
        Deploy d = new Deploy();
        address admin = makeAddr("admin");
        string memory path = "deployments/test-deploy.json";
        (GaitwayVault vault, address usdc) = d.deploy(admin, address(0), path);

        assertTrue(vault.hasRole(vault.DEFAULT_ADMIN_ROLE(), admin));
        assertTrue(vault.hasRole(vault.REGISTRAR_ROLE(), admin));
        assertTrue(vault.hasRole(vault.OPERATOR_ROLE(), admin));
        assertEq(address(vault.token()), usdc);
        assertEq(MockUSDC(usdc).decimals(), 6);

        string memory json = vm.readFile(path);
        assertEq(vm.parseJsonAddress(json, ".vault"), address(vault));
        assertEq(vm.parseJsonAddress(json, ".usdc"), usdc);
        assertEq(vm.parseJsonUint(json, ".chainId"), block.chainid);
        assertEq(vm.parseJsonUint(json, ".deployBlock"), block.number);
    }

    function test_deploy_reusesGivenToken() public {
        Deploy d = new Deploy();
        MockUSDC existing = new MockUSDC();
        (GaitwayVault vault, address usdc) =
            d.deploy(makeAddr("admin"), address(existing), "deployments/test-deploy2.json");
        assertEq(usdc, address(existing));
        assertEq(address(vault.token()), address(existing));
    }
}
