// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {GaitwayVault} from "../src/GaitwayVault.sol";
import {MockUSDC} from "../src/MockUSDC.sol";

/// Deploys MockUSDC (unless USDC_ADDRESS is set) and the vault, then writes
/// deployments/<chainId>.json: { chainId, vault, usdc, deployBlock }.
///
///   ADMIN_PRIVATE_KEY=0x... forge script script/Deploy.s.sol --rpc-url http://localhost:8545 --broadcast
contract Deploy is Script {
    function run() external {
        uint256 pk = vm.envUint("ADMIN_PRIVATE_KEY");
        address admin = vm.addr(pk);
        address usdc = vm.envOr("USDC_ADDRESS", address(0));
        string memory path = string.concat("deployments/", vm.toString(block.chainid), ".json");
        vm.startBroadcast(pk);
        deploy(admin, usdc, path);
        vm.stopBroadcast();
    }

    function deploy(address admin, address usdc, string memory path)
        public
        returns (GaitwayVault vault, address token)
    {
        uint256 deployBlock = block.number;
        token = usdc == address(0) ? address(new MockUSDC()) : usdc;
        vault = new GaitwayVault(token, admin);

        string memory obj = "deployment";
        vm.serializeUint(obj, "chainId", block.chainid);
        vm.serializeAddress(obj, "vault", address(vault));
        vm.serializeAddress(obj, "usdc", token);
        string memory json = vm.serializeUint(obj, "deployBlock", deployBlock);
        vm.writeJson(json, path);
    }
}
