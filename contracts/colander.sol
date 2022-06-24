// SPDX-License-Identifier: AGPL-3.0-or-later

/// Colander.sol -- A Stability Pool

// Copyright (C) 2022 Qazawat <xirexor@gmail.com>
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

pragma solidity ^0.8.10;

import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

interface IInteraction {
    function buyFromAuction(address token, uint256 auctionId, uint256 collateralAmount, uint256 maxPrice, address receiverAddress) external;
    function collaterals(address) external returns(CollateralType memory);
}
interface IClipper {
    function sales(uint256 auctionId) external view returns (Sale memory);
    function getStatus(uint256 id) external view returns (bool needsRedo, uint256 price, uint256 lot, uint256 tab);
}
interface ISpotter {
    function par() external returns (uint256);
    function ilks(bytes32) external returns (IPip, uint256);
}
interface IDex {
    function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, address[] calldata path, address to, uint256 deadline) external returns(uint256[] memory accounts);
}
interface IRewards {
    function reflect(address _depositor, uint256 _exitAmount) external;
    function replenish(uint256 _amount) external;
    function cage() external;
}
interface IPip {
    function peek() external returns (bytes32, bool);
}

interface IStabilityPool {
    function totalSupply() external view returns(uint256);
    function balanceOf(address _depositor) external view returns(uint256);
}

struct CollateralType {
    address gem;
    bytes32 ilk;
    uint32 live;
    address clip;
}
struct Sale {
    uint256 pos;  // Index in active array
    uint256 tab;  // Usb to raise           [rad]
    uint256 lot;  // collateral to sell     [wad]
    address usr;  // Liquidated CDP
    uint96  tic;  // Auction start time
    uint256 top;  // Starting price         [ray]
}

error Unauthorized(address _caller);
error NotLive(address _contract);
error InsufficientSurplus(uint256 _surplus);
error BufZone();
error AbsurdPrice();
error SinZone();
error AbsurdThreshold();
error InactiveZone();
error InvalidPrice();
error ZeroSpread();

/*
   "Donate StableCoins to the pool and earn rewards".
   This contract lets you deposit Stablecoins and earn
   Stablecoin rewards. Rewards are distributed over a 
   timeline. The pool is used to do lossless purchases
   from auctions.
*/
contract Colander is ReentrancyGuardUpgradeable {
    // --- Wrapper ---
    using SafeERC20Upgradeable for IERC20Upgradeable;
    
    // --- Auth ---
    mapping (address => uint) public wards;
    function rely(address _guy) external auth { wards[_guy] = 1; }
    function deny(address _guy) external auth { wards[_guy] = 0; }
    modifier auth { if(wards[msg.sender] != 1) revert Unauthorized(msg.sender); _; }

    // --- Derivative ---
    string public name;
    string public symbol;
    uint8 public decimals;
    uint256 public totalSupply;
    mapping(address => uint) public balanceOf;

    // --- State Vars ---
    IERC20Upgradeable public stablecoin;
    IInteraction public interaction;
    ISpotter public spotter;
    IDex public dex;
    IRewards public rewards;

    uint256 public profitRange;  // Minimum profit for surge in %  [ray]
    uint256 public priceImpact;  // Acceptable swap price in %     [wad]
    uint256 public surplus;      // Amount of profit after swap    [wad]

    uint256 public live;  // Active Flag

    // --- Events ---
    event Initialize(address indexed _initializer);
    event ProfitRange(address indexed _caller, uint256 _value);
    event PriceImpact(address indexed _caller, uint256 _value);
    event Rewards(address _contract);
    event Join(address indexed _depositor, uint256 indexed _oldBalance, uint256 indexed _newBalance);
    event Exit(address indexed _depositor, uint256 indexed _oldBalance, uint256 indexed _newBalance);
    event Surge(uint256 indexed _collateralAmount, uint256 indexed _expectedStableCoins, uint256 indexed _receivedStableCoins);
    event Distribute(address indexed _caller, uint256 indexed _amount);
    event Cage();

    // --- Init ---
    function initialize(string memory _name, string memory _symbol, address _stablecoin, address _interaction, address _spotter, address _dex, address _rewards) public initializer {

        wards[msg.sender] = 1;
        live = 1;
        name = _name;
        symbol = _symbol;
        stablecoin = IERC20Upgradeable(_stablecoin);
        interaction = IInteraction(_interaction);
        spotter = ISpotter(_spotter);
        dex = IDex(_dex);
        rewards = IRewards(_rewards);

        decimals = 18;

        __ReentrancyGuard_init_unchained();
        
        emit Initialize(msg.sender);
    }
    function setProfitRange(uint256 _ray) external auth {

        if (live != 1) revert NotLive(address(this));

        profitRange = _ray;

        emit ProfitRange(msg.sender, _ray);
    }
    function setPriceImpact(uint256 _wad) external auth {

        if (live != 1) revert NotLive(address(this));

        priceImpact = _wad;

        emit PriceImpact(msg.sender, _wad);
    }
    function setRewards(address _rewards) external auth {

        if (live != 1) revert NotLive(address(this));

        rewards = IRewards(_rewards);

        emit Rewards(_rewards);
    }

    // --- Math ---
    uint256 constant BLN = 10 **  9;
    uint256 constant WAD = 10 ** 18;
    uint256 constant RAY = 10 ** 27;

    function rdiv(uint256 x, uint256 y) internal pure returns (uint256 z) {

        unchecked { z = mul(x, RAY) / y; }
    }
    function mul(uint256 x, uint256 y) internal pure returns (uint256 z) {

        unchecked { require(y == 0 || (z = x * y) / y == x); }
    }

    // --- External ---
    function join(uint256 _wad) external nonReentrant {

        // Checks
        if (live != 1) revert NotLive(address(this));

        // Update rewards
        rewards.reflect(msg.sender, 0);

        // State changes
        uint256 deposit = balanceOf[msg.sender];
        balanceOf[msg.sender] += _wad;
        totalSupply += _wad;

        // Method calls
        stablecoin.safeTransferFrom(msg.sender, address(this), _wad);

        // Events
        emit Join(msg.sender, deposit, balanceOf[msg.sender]);
    }
    function exit(uint256 _wad) external nonReentrant {

        // Checks
        if (live != 1) revert NotLive(address(this));

        // Update rewards
        uint256 deposit = balanceOf[msg.sender];
        uint256 amount = _wad > deposit ? deposit: _wad;
        rewards.reflect(msg.sender, amount);

        // State changes
        balanceOf[msg.sender] -= amount;
        totalSupply -= amount;

        // Method calls
        stablecoin.safeTransfer(address(rewards), amount);

        // Events
        emit Exit(msg.sender, deposit, balanceOf[msg.sender]);
    }

    // --- Auction ---
    function surge(address _collateral, uint256 _auction_id) external auth nonReentrant {

        if (live != 1) revert NotLive(address(this));

        // Measure the stablecoin expense
        uint256 abacusPrice;  // Decreasing price    [ray]
        uint256 feedPrice;    // Oracle price        [ray]
        uint256 tab;          // Auction debt        [rad]
        uint256 lot;          // Auction collateral  [wad]
        {
            CollateralType memory collateral = IInteraction(interaction).collaterals(_collateral);
            (,abacusPrice,,) = IClipper(collateral.clip).getStatus(_auction_id);
            feedPrice = _getFeedPrice(collateral.ilk);  // [ray]

            if (abacusPrice >= feedPrice) revert BufZone();
            // require(abacusPrice < feedPrice, "Colander/buf-zone");

            tab = IClipper(collateral.clip).sales(_auction_id).tab;
            lot = IClipper(collateral.clip).sales(_auction_id).lot;

            // Calculate debt per collateral
            uint256 auctionPrice = tab / lot;  // [ray]

            if (auctionPrice >= feedPrice) revert AbsurdPrice();
            else if (auctionPrice >= abacusPrice) revert SinZone();
            // require(auctionPrice < feedPrice, "Colander/absurd-price");
            // require(auctionPrice < abacusPrice, "Colander/sin-zone");

            uint256 y = (feedPrice * profitRange) / RAY;
            uint256 threshold = feedPrice - y;

            if (auctionPrice > threshold) revert AbsurdThreshold();
            else if (abacusPrice > threshold) revert InactiveZone();
            // require(auctionPrice <= threshold, "Colander/absurd-threshold");
            // require(abacusPrice <= threshold, "Colander/inactive-zone");
        }

        // Calculate lot and buy
        uint256 lotAmount = (totalSupply * RAY) / abacusPrice;
        if (lotAmount > lot) lotAmount = lot;
        stablecoin.safeApprove(address(interaction), type(uint256).max);
        interaction.buyFromAuction(_collateral, _auction_id, lotAmount, abacusPrice, address(this));
        stablecoin.safeApprove(address(interaction), 0);

        // Swap on dex
        uint256 amount = IERC20Upgradeable(_collateral).balanceOf(address(this));
        uint256 z = (feedPrice * amount) / RAY;
        uint256 expectedAmount = z - (z * priceImpact) / WAD;
        IERC20Upgradeable(_collateral).safeApprove(address(dex), amount);
        uint256 amountOut = _swap(_collateral, amount, expectedAmount, block.timestamp + 300);
        IERC20Upgradeable(_collateral).safeApprove(address(dex), 0);
       
        // Recalculate surplus
        surplus = stablecoin.balanceOf(address(this)) - totalSupply;

        // Emit event
        emit Surge(amount, expectedAmount, amountOut);
    }
    function _getFeedPrice(bytes32 _ilk) private returns(uint256 _feedPrice) {

        (IPip pip, ) = spotter.ilks(_ilk);
        (bytes32 val, bool has) = pip.peek();
        if (!has) revert InvalidPrice();
        // require(has, "Colander/invalid-price");
        _feedPrice = rdiv(mul(uint256(val), BLN), spotter.par());
    }
     function _swap(address _tokenIn, uint256 _amountIn, uint256 _amountOutMin, uint256 _deadline) private returns(uint256) {

        address[] memory path = new address[](2);
        path[0] = _tokenIn;
        path[1] = address(stablecoin);

        uint256[] memory amounts = dex.swapExactTokensForTokens(_amountIn, _amountOutMin, path, address(this), _deadline);
        return amounts[amounts.length - 1];
    }

    // --- Rewards ---
    function distribute(uint256 _wad) external auth nonReentrant {

        if (live != 1) revert NotLive(address(this));
        else if (surplus < _wad) revert InsufficientSurplus(surplus);

        surplus -= _wad;

        IERC20Upgradeable(stablecoin).approve(address(rewards), _wad);

        rewards.replenish(_wad);

        emit Distribute(msg.sender, _wad);
    }

    function cage() external auth {

        live = 0;
        rewards.cage();

        emit Cage();
    }

    uint256[35] private __gap;
}

contract ColanderRewards is Initializable {
    // --- Wrapper ---
    using SafeERC20Upgradeable for IERC20Upgradeable;

    // --- Auth ---
    mapping (address => uint) public wards;
    function rely(address _guy) external auth { wards[_guy] = 1; }
    function deny(address _guy) external auth { wards[_guy] = 0; }
    modifier auth { if(wards[msg.sender] != 1) revert Unauthorized(msg.sender); _; }

    // --- Reward Data ---
    uint public spread;         // Distribution time       [sec]
    uint public endTime;        // Time "now" + spread     [sec]
    uint public rate;           // Emission per second     [wad]
    uint public tps;            // Stablecoins per share   [wad]
    uint public lastUpdate;     // Last tps update         [sec]
    uint public exitDelay;      // User unstake delay      [sec]

    IERC20Upgradeable public stablecoin;  // The Stable Coin
    IStabilityPool public stabilityPool;  // The StabilityPool

    mapping(address => uint) public tpsPaid;      // Stablecoin per share paid
    mapping(address => uint) public rewards;      // Accumulated rewards
    mapping(address => uint) public withdrawn;    // Capital withdrawn
    mapping(address => uint) public unstakeTime;  // Time of Unstake

    uint public live;     // Active Flag

    // --- Events ---
    event Initialize(address indexed _token, uint indexed _duration, uint indexed _exitDelay);
    event Replenish(uint _reward);
    event Spread(uint _newDuration);
    event ExitDelay(uint _exitDelay);
    event Redeem(address[] indexed _user);

    // --- Init ---
    function initialize(address _stablecoin, address _stabilityPool, uint _spread, uint _exitDelay) public initializer {

        wards[msg.sender] = 1;
        live = 1;
        stablecoin = IERC20Upgradeable(_stablecoin);
        stabilityPool = IStabilityPool(_stabilityPool);
        spread = _spread;
        exitDelay = _exitDelay;

        emit Initialize(_stablecoin, _spread, _exitDelay);
    }

    // --- Mods ---
    modifier update(address _account) {

        tps = tokensPerShare();
        lastUpdate = lastTimeRewardApplicable();
        if (_account != address(0)) {
            rewards[_account] = earned(_account);
            tpsPaid[_account] = tps;
        }
        _;
    }

    // --- Math ---
    function _min(uint a, uint b) internal pure returns (uint) {

        return a < b ? a : b;
    }

    // --- Views ---
    function lastTimeRewardApplicable() public view returns (uint) {

        return _min(block.timestamp, endTime);
    }
    function tokensPerShare() public view returns (uint) {

        uint256 totalSupply = stabilityPool.totalSupply();
        if (totalSupply <= 0 || block.timestamp <= lastUpdate) {
            return tps;
        }
        uint latest = lastTimeRewardApplicable();
        return tps + (((latest - lastUpdate) * rate * 1e18) / totalSupply);
    }
    function earned(address _account) public view returns (uint) {

        uint perToken = tokensPerShare() - tpsPaid[_account];
        return ((stabilityPool.balanceOf(_account) * perToken) / 1e18) + rewards[_account];
    }
    function redeemable(address account) public view returns (uint) {

        return stabilityPool.balanceOf(account) + earned(account);
    }
    function getRewardForDuration() external view returns (uint) {

        return rate * spread;
    }
    function getAPR() external view returns (uint) {

        uint256 totalSupply = stabilityPool.totalSupply();
        if(spread == 0 || totalSupply == 0) {
            return 0;
        }
        return ((rate * 31536000 * 1e18) / totalSupply) * 100;
    }

    // --- External ---
    function reflect(address _depositor, uint256 _wad) external auth update(_depositor) {

        if (_wad != 0) {
            withdrawn[_depositor] += _wad;
            unstakeTime[_depositor] = block.timestamp + exitDelay;
        }
    }
    function replenish(uint _wad) external update(address(0)) {

        if (live != 1) revert NotLive(address(this));

        if (block.timestamp >= endTime) {
            rate = _wad / spread;
        } else {
            uint remaining = endTime - block.timestamp;
            uint leftover = remaining * rate;
            rate = (_wad + leftover) / spread;
        }
        lastUpdate = block.timestamp;
        endTime = block.timestamp + spread;

        IERC20Upgradeable(stablecoin).safeTransferFrom(msg.sender, address(this), _wad);
        
        emit Replenish(_wad);
    }
    function redeemBatch(address[] memory accounts) external {

        if (live != 1) revert NotLive(address(this));

        for (uint i = 0; i < accounts.length; i++) {
            if (block.timestamp < unstakeTime[accounts[i]] && unstakeTime[accounts[i]] != 0)
                continue;
            
            uint _amount = rewards[accounts[i]] + withdrawn[accounts[i]];
            if (_amount > 0) {
                rewards[accounts[i]] = 0;
                withdrawn[accounts[i]] = 0;
                IERC20Upgradeable(stablecoin).safeTransfer(accounts[i], _amount);
            }
        }
       
        emit Redeem(accounts);
    }
    function setSpread(uint _spread) external auth {

        if (_spread <= 0) revert ZeroSpread();
        // require(_spread > 0, "Jar/duration-non-zero");
        spread = _spread;

        emit Spread(_spread);
    }
    function setExitDelay(uint _exitDelay) external auth {

        exitDelay = _exitDelay;

        emit ExitDelay(_exitDelay);
    }
    function cage() external auth {

        live = 0;
    }

    uint256[36] private __gap;
}
