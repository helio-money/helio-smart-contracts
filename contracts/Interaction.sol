// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "./hMath.sol";

import "hardhat/console.sol";

    struct Sale {
        uint256 pos;  // Index in active array
        uint256 tab;  // HAY to raise       [rad]
        uint256 lot;  // collateral to sell [wad]
        address usr;  // Liquidated CDP
        uint96 tic;  // Auction start time
        uint256 top;  // Starting price     [ray]
    }

interface VatLike {
    function init(bytes32 ilk) external;

    function hope(address usr) external;

    function rely(address usr) external;

    function move(address src, address dst, uint256 rad) external;

    function behalf(address bit, address usr) external;

    function frob(bytes32 i, address u, address v, address w, int dink, int dart) external;

    function flux(bytes32 ilk, address src, address dst, uint256 wad) external;

    function ilks(bytes32) external view returns (uint256, uint256, uint256, uint256, uint256);

    function gem(bytes32, address) external view returns (uint256);

    function usb(address) external view returns (uint256);

    function urns(bytes32, address) external view returns (uint256, uint256);
}

interface GemJoinLike {
    function join(address usr, uint256 wad) external;

    function exit(address usr, uint256 wad) external;

    function gem() external view returns (IERC20Upgradeable);
}

interface UsbGemLike {
    function join(address usr, uint256 wad) external;

    function exit(address usr, uint256 wad) external;
}

interface UsbLike is IERC20Upgradeable {
}

interface PipLike {
    function peek() external view returns (bytes32, bool);
}

interface SpotLike {
    function ilks(bytes32) external view returns (PipLike, uint256);
}

interface JugLike {
    function drip(bytes32 ilk) external returns (uint256);

    function ilks(bytes32) external view returns (uint256, uint256);

    function base() external view returns (uint256);
}

interface CeRouterLike {
    function liquidation(address urn, address recipient, uint256 amount) external;
}

struct CollateralType {
    GemJoinLike gem;
    bytes32 ilk;
    uint32 live;
    address clip;
}

interface IAuctionProxy {
    function startAuction(
        address user,
        address keeper,
        UsbLike usb,
        UsbGemLike usbJoin,
        VatLike vat,
        address dog,
        address helioProvider,
        CollateralType calldata collateral
    ) external returns (uint256 id);

    function buyFromAuction(
        address user,
        uint256 auctionId,
        uint256 collateralAmount,
        uint256 maxPrice,
        address receiverAddress,
        UsbLike usb,
        UsbGemLike usbJoin,
        VatLike vat,
        address helioProvider,
        CollateralType calldata collateral
    ) external;

    function getAllActiveAuctionsForClip(address clip) external view returns (Sale[] memory sales);
}

interface Rewards {
    function drop(address token, address usr) external;
}

contract Interaction is Initializable, UUPSUpgradeable, OwnableUpgradeable {

    mapping(address => uint) public wards;

    function rely(address usr) external auth {wards[usr] = 1;}

    function deny(address usr) external auth {wards[usr] = 0;}
    modifier auth {
        require(wards[msg.sender] == 1, "Interaction/not-authorized");
        _;
    }

    event Deposit(address indexed user, uint256 amount);
    event Borrow(address indexed user, uint256 amount);
    event Payback(address indexed user, uint256 amount);
    event Withdraw(address indexed user, uint256 amount);
    event CollateralEnabled(address token, bytes32 ilk);
    event CollateralDisabled(address token, bytes32 ilk);

    VatLike public vat;
    SpotLike public spotter;
    UsbLike public usb;
    UsbGemLike public usbJoin;
    JugLike public jug;
    address public dog;
    Rewards public helioRewards;
    IAuctionProxy public auctionProxy;

    mapping(address => uint256) public deposits;
    mapping(address => CollateralType) public collaterals;

    using SafeERC20Upgradeable for IERC20Upgradeable;
    using EnumerableSet for EnumerableSet.AddressSet;

    EnumerableSet.AddressSet private usersInDebt;

    uint256 constant WAD = 10 ** 18;
    uint256 constant RAD = 10 ** 45;
    uint256 constant RAY = 10 ** 27;
    uint256 constant YEAR = 365 * 24 * 3600; //seconds

    mapping(address => address) public helioProviders; // e.g. Auction purchase from ceabnbc to abnbc

    function initialize(address vat_,
        address spot_,
        address usb_,
        address usbJoin_,
        address jug_,
        address dog_,
        address rewards_,
        address auctionProxy_
    ) public initializer {
        __Ownable_init();

        wards[msg.sender] = 1;

        vat = VatLike(vat_);
        spotter = SpotLike(spot_);
        usb = UsbLike(usb_);
        usbJoin = UsbGemLike(usbJoin_);
        jug = JugLike(jug_);
        dog = dog_;
        helioRewards = Rewards(rewards_);
        auctionProxy = IAuctionProxy(auctionProxy_);

        vat.hope(usbJoin_);

        usb.approve(usbJoin_, type(uint256).max);
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}

    function setCores(address vat_, address spot_, address usbJoin_,
        address jug_) public auth {
        vat = VatLike(vat_);
        spotter = SpotLike(spot_);
        usbJoin = UsbGemLike(usbJoin_);
        jug = JugLike(jug_);

        vat.hope(usbJoin_);

        usb.approve(usbJoin_, type(uint256).max);
    }

    function setUSBApprove() public auth {
        usb.approve(address(usbJoin), type(uint256).max);
    }

    function setCollateralType(
        address token,
        address gemJoin,
        bytes32 ilk,
        address clip
    ) external auth {
        vat.init(ilk);
        enableCollateralType(token, gemJoin, ilk, clip);
    }

    function enableCollateralType(
        address token,
        address gemJoin,
        bytes32 ilk,
        address clip
    ) public auth {
        collaterals[token] = CollateralType(GemJoinLike(gemJoin), ilk, 1, clip);
        IERC20Upgradeable(token).approve(gemJoin, type(uint256).max);
        vat.rely(gemJoin);
        emit CollateralEnabled(token, ilk);
    }

    function setHelioProvider(address token, address helioProvider) external auth {
        helioProviders[token] = helioProvider;
    }

    function removeCollateralType(address token) external auth {
        collaterals[token].live = 0;
        address gemJoin = address(collaterals[token].gem);
        IERC20Upgradeable(token).approve(gemJoin, 0);
        emit CollateralDisabled(token, collaterals[token].ilk);
    }

    function stringToBytes32(string memory source) public pure returns (bytes32 result) {
        bytes memory tempEmptyStringTest = bytes(source);
        if (tempEmptyStringTest.length == 0) {
            return 0x0;
        }

        assembly {
            result := mload(add(source, 32))
        }
    }

    function deposit(
        address participant,
        address token,
        uint256 dink
    ) external returns (uint256) {
        CollateralType memory collateralType = collaterals[token];
        // _checkIsLive(collateralType.live); Checking in the `drip` function
        if (helioProviders[token] != address(0)) {
            require(
                msg.sender == helioProviders[token],
                "Interaction/only helio provider can deposit for this token"
            );
        }

        drip(token);
        uint256 preBalance = IERC20Upgradeable(token).balanceOf(address(this));
        IERC20Upgradeable(token).safeTransferFrom(msg.sender, address(this), dink);
        uint256 postBalance = IERC20Upgradeable(token).balanceOf(address(this));
        require(preBalance + dink == postBalance, "Interaction/deposit-deflated");

        collateralType.gem.join(participant, dink);
        vat.behalf(participant, address(this));
        vat.frob(collateralType.ilk, participant, participant, participant, int256(dink), 0);

        deposits[token] += dink;
        EnumerableSet.add(usersInDebt, participant);

        emit Deposit(participant, dink);
        return dink;
    }

    function _mul(uint x, int y) internal pure returns (int z) {
    unchecked {
        z = int(x) * y;
        require(int(x) >= 0);
        require(y == 0 || z / y == int(x));
    }
    }

    function _add(uint x, int y) internal pure returns (uint z) {
    unchecked {
        z = x + uint(y);
        require(y >= 0 || z <= x);
        require(y <= 0 || z >= x);
    }
    }

    function borrow(address token, uint256 usbAmount) external returns (uint256) {
        CollateralType memory collateralType = collaterals[token];
        // _checkIsLive(collateralType.live); Checking in the `drip` function

        drip(token);
        (, uint256 rate, , ,) = vat.ilks(collateralType.ilk);
        int256 dart = int256(hMath.mulDiv(usbAmount, 10 ** 27, rate));
        if (uint256(dart) * rate < usbAmount * (10 ** 27)) {
            dart += 1; //ceiling
        }
        vat.frob(collateralType.ilk, msg.sender, msg.sender, msg.sender, 0, dart);
        uint256 mulResult = rate * uint256(dart);
        vat.move(msg.sender, address(this), usbAmount * RAY);
        usbJoin.exit(msg.sender, usbAmount);

        helioRewards.drop(token, msg.sender);

        emit Borrow(msg.sender, usbAmount);
        return uint256(dart);
    }

    // Burn user's HAY.
    // N.B. User collateral stays the same.
    function payback(address token, uint256 usbAmount) external returns (int256) {
        CollateralType memory collateralType = collaterals[token];
        // _checkIsLive(collateralType.live); Checking in the `drip` function

        IERC20Upgradeable(usb).safeTransferFrom(msg.sender, address(this), usbAmount);
        usbJoin.join(msg.sender, usbAmount);
        (,uint256 rate,,,uint256 dust) = vat.ilks(collateralType.ilk);
        (, uint256 art) = vat.urns(collateralType.ilk, msg.sender);
        int256 dart = int256(hMath.mulDiv(usbAmount, 10 ** 27, rate));
        if (uint256(dart) * rate < usbAmount * (10 ** 27) &&
            uint256(dart + 1) * rate <= vat.usb(msg.sender)
        ) {
            dart += 1;
            // ceiling
        }

        // Trying to not left any dust
        int256 leftover = hMath._mul(rate, int256(art)-dart);
        if (uint256(leftover) < dust) {
            dart += (leftover / int256(rate)) - 1;
        }
        vat.frob(collateralType.ilk, msg.sender, msg.sender, msg.sender, 0, - dart);

        if ((int256(rate * art) / 10 ** 27) == dart) {
            EnumerableSet.remove(usersInDebt, msg.sender);
        }

        helioRewards.drop(token, msg.sender);

        drip(token);
        emit Payback(msg.sender, usbAmount);
        return dart;
    }

    // Unlock and transfer to the user `dink` amount of aBNBc
    function withdraw(
        address participant,
        address token,
        uint256 dink
    ) external returns (uint256) {
        CollateralType memory collateralType = collaterals[token];
        _checkIsLive(collateralType.live);
        if (helioProviders[token] != address(0)) {
            require(
                msg.sender == helioProviders[token],
                "Interaction/Only helio provider can call this function for this token"
            );
        } else {
            require(
                msg.sender == participant,
                "Interaction/Caller must be the same address as participant"
            );
        }

        uint256 unlocked = free(token, participant);
        if (unlocked < dink) {
            int256 diff = int256(dink) - int256(unlocked);
            vat.frob(collateralType.ilk, participant, participant, participant, - diff, 0);
            vat.flux(collateralType.ilk, participant, address(this), uint256(diff));
        }
        // Collateral is actually transferred back to user inside `exit` operation.
        // See GemJoin.exit()
        collateralType.gem.exit(msg.sender, dink);
        deposits[token] -= dink;

        emit Withdraw(participant, dink);
        return dink;
    }

    function drip(address token) public {
        CollateralType memory collateralType = collaterals[token];
        _checkIsLive(collateralType.live);

        jug.drip(collateralType.ilk);
    }

    function setRewards(address rewards) external auth {
        helioRewards = Rewards(rewards);
    }

    //    /////////////////////////////////
    //    //// VIEW                    ////
    //    /////////////////////////////////

    // Price of the collateral asset(aBNBc) from Oracle
    function collateralPrice(address token) public view returns (uint256) {
        CollateralType memory collateralType = collaterals[token];
        _checkIsLive(collateralType.live);

        (PipLike pip,) = spotter.ilks(collateralType.ilk);
        (bytes32 price, bool has) = pip.peek();
        if (has) {
            return uint256(price);
        } else {
            return 0;
        }
    }

    // Returns the HAY price in $
    function usbPrice(address token) external view returns (uint256) {
        CollateralType memory collateralType = collaterals[token];
        _checkIsLive(collateralType.live);

        (, uint256 rate,,,) = vat.ilks(collateralType.ilk);
        return rate / 10 ** 9;
    }

    // Returns the collateral ratio in percents with 18 decimals
    function collateralRate(address token) external view returns (uint256) {
        CollateralType memory collateralType = collaterals[token];
        _checkIsLive(collateralType.live);

        (,uint256 mat) = spotter.ilks(collateralType.ilk);

        //        (,,uint256 spot,,) = vat.ilks(collateralType.ilk);
        //        return spot / 10**9;
        return 10 ** 45 / mat;
    }

    // Total aBNBc deposited nominated in $
    function depositTVL(address token) external view returns (uint256) {
        return deposits[token] * collateralPrice(token) / 10 ** 18;
    }

    // Total USB borrowed by all users
    function collateralTVL(address token) external view returns (uint256) {
        CollateralType memory collateralType = collaterals[token];
        _checkIsLive(collateralType.live);

        (uint256 Art, uint256 rate,,,) = vat.ilks(collateralType.ilk);
        return hMath.mulDiv(Art, rate, 10 ** 27);
    }

    // Not locked user balance in aBNBc
    function free(address token, address usr) public view returns (uint256) {
        CollateralType memory collateralType = collaterals[token];
        _checkIsLive(collateralType.live);

        return vat.gem(collateralType.ilk, usr);
    }

    // User collateral in aBNBc
    function locked(address token, address usr) external view returns (uint256) {
        CollateralType memory collateralType = collaterals[token];
        _checkIsLive(collateralType.live);

        (uint256 ink,) = vat.urns(collateralType.ilk, usr);
        return ink;
    }

    // Total borrowed HAY
    function borrowed(address token, address usr) external view returns (uint256) {
        CollateralType memory collateralType = collaterals[token];
        _checkIsLive(collateralType.live);

        (,uint256 rate,,,) = vat.ilks(collateralType.ilk);
        (, uint256 art) = vat.urns(collateralType.ilk, usr);
        return (art * rate) / 10 ** 27;
    }

    // Collateral minus borrowed. Basically free collateral (nominated in HAY)
    function availableToBorrow(address token, address usr) external view returns (int256) {
        CollateralType memory collateralType = collaterals[token];
        _checkIsLive(collateralType.live);

        (uint256 ink, uint256 art) = vat.urns(collateralType.ilk, usr);
        (, uint256 rate, uint256 spot,,) = vat.ilks(collateralType.ilk);
        uint256 collateral = ink * spot;
        uint256 debt = rate * art;
        return (int256(collateral) - int256(debt)) / 1e27;
    }

    // Collateral + `amount` minus borrowed. Basically free collateral (nominated in HAY)
    // Returns how much hay you can borrow if provide additional `amount` of collateral
    function willBorrow(address token, address usr, int256 amount) external view returns (int256) {
        CollateralType memory collateralType = collaterals[token];
        _checkIsLive(collateralType.live);

        (uint256 ink, uint256 art) = vat.urns(collateralType.ilk, usr);
        (, uint256 rate, uint256 spot,,) = vat.ilks(collateralType.ilk);
        require(amount >= - (int256(ink)), "Cannot withdraw more than current amount");
        if (amount < 0) {
            ink = uint256(int256(ink) + amount);
        } else {
            ink += uint256(amount);
        }
        uint256 collateral = ink * spot;
        uint256 debt = rate * art;
        return (int256(collateral) - int256(debt)) / 1e27;
    }

    function liquidationPriceForDebt(bytes32 ilk, address usr, uint256 ink, uint256 art) internal view returns (uint256) {
        (, uint256 rate,,,) = vat.ilks(ilk);
        (,uint256 mat) = spotter.ilks(ilk);
        uint256 backedDebt = (art * rate / 10 ** 36) * mat;
        return backedDebt / ink;
    }

    // Price of aBNBc when user will be liquidated
    function currentLiquidationPrice(address token, address usr) external view returns (uint256) {
        CollateralType memory collateralType = collaterals[token];
        _checkIsLive(collateralType.live);

        (uint256 ink, uint256 art) = vat.urns(collateralType.ilk, usr);
        return liquidationPriceForDebt(collateralType.ilk, usr, ink, art);
    }

    // Price of aBNBc when user will be liquidated with additional amount of aBNBc deposited/withdraw
    function estimatedLiquidationPrice(address token, address usr, int256 amount) external view returns (uint256) {
        CollateralType memory collateralType = collaterals[token];
        _checkIsLive(collateralType.live);

        (uint256 ink, uint256 art) = vat.urns(collateralType.ilk, usr);
        require(amount >= - (int256(ink)), "Cannot withdraw more than current amount");
        if (amount < 0) {
            ink = uint256(int256(ink) + amount);
        } else {
            ink += uint256(amount);
        }
        return liquidationPriceForDebt(collateralType.ilk, usr, ink, art);
    }

    // Price of aBNBc when user will be liquidated with additional amount of HAY borrowed/payback
    //positive amount mean HAYs are being borrowed. So art(debt) will increase
    function estimatedLiquidationPriceHAY(address token, address usr, int256 amount) external view returns (uint256) {
        CollateralType memory collateralType = collaterals[token];
        _checkIsLive(collateralType.live);

        (uint256 ink, uint256 art) = vat.urns(collateralType.ilk, usr);
        require(amount >= - (int256(art)), "Cannot withdraw more than current amount");
        (, uint256 rate,,,) = vat.ilks(collateralType.ilk);
        (,uint256 mat) = spotter.ilks(collateralType.ilk);
        uint256 backedDebt = hMath.mulDiv(art, rate, 10 ** 36);
        if (amount < 0) {
            backedDebt = uint256(int256(backedDebt) + amount);
        } else {
            backedDebt += uint256(amount);
        }
//        console.log("Backed debt is:", backedDebt);
//        console.log("Mat is:", mat);
//        console.log("Ink is:", ink);
        return hMath.mulDiv(backedDebt, mat, ink) / 10 ** 9;
    }

    // Returns borrow APR with 20 decimals.
    // I.e. 10% == 10 ethers
    function borrowApr(address token) public view returns (uint256) {
        CollateralType memory collateralType = collaterals[token];
        _checkIsLive(collateralType.live);
        _checkIsLive(collateralType.live);

        (uint256 duty,) = jug.ilks(collateralType.ilk);
        uint256 principal = hMath.rpow((jug.base() + duty), YEAR, RAY);
        return (principal - RAY) / (10 ** 7);
    }

    function startAuction(
        address token,
        address user,
        address keeper
    ) external returns (uint256) {
        return
        auctionProxy.startAuction(
            user,
            keeper,
            usb,
            usbJoin,
            vat,
            dog,
            helioProviders[token],
            collaterals[token]
        );
    }

    function buyFromAuction(
        address token,
        uint256 auctionId,
        uint256 collateralAmount,
        uint256 maxPrice,
        address receiverAddress
    ) external {
        CollateralType memory collateral = collaterals[token];
        address helioProvider = helioProviders[token];
        auctionProxy.buyFromAuction(
            msg.sender,
            auctionId,
            collateralAmount,
            maxPrice,
            receiverAddress,
            usb,
            usbJoin,
            vat,
            helioProvider,
            collateral
        );
    }

    function getAllActiveAuctionsForToken(address token) external view returns (Sale[] memory sales) {
        return auctionProxy.getAllActiveAuctionsForClip(collaterals[token].clip);
    }

    function getUsersInDebt() external view returns (address[] memory) {
        return EnumerableSet.values(usersInDebt);
    }

    function totalPegLiquidity() external view returns (uint256) {
        return IERC20Upgradeable(usb).totalSupply();
    }

    function _checkIsLive(uint256 live) internal pure {
        require(live == 1, "Interaction/inactive collateral");
    }
}