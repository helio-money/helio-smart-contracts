// SPDX-License-Identifier: GPL-3.0-only
pragma solidity ^0.8.0;

import "../../interfaces/GemJoinLike.sol";
import "../../interfaces/IAuctionProxy.sol";

    struct CollateralType {
    GemJoinLike gem;
    bytes32 ilk;
    uint32 live;
    address clip;
}

interface IDao {

    function deposit(
        address participant,
        address token,
        uint256 dink
    ) external returns (uint256);

    function withdraw(
        address participant,
        address token,
        uint256 dink
    ) external returns (uint256);

    function dropRewards(address token, address usr) external;
}
