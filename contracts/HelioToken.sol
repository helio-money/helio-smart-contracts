// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

contract HelioToken is OwnableUpgradeable, ERC20Upgradeable {

    function initialize()
    external
    initializer
    {
        __Ownable_init();
        __ERC20_init_unchained("Helio Reward token", "HELIO");
    }

    function mint(address _to, uint256 _amount) external onlyOwner returns(bool) {
        _mint(_to, _amount);
        return true;
    }

    function burn(uint256 _amount) external onlyOwner returns(bool) {
        _burn(msg.sender, _amount);
        return true;
    }
}
