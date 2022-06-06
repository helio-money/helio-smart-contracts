// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "./hMath.sol";

import "./interfaces/VatLike.sol";
import "./interfaces/UsbLike.sol";
import "./interfaces/UsbGemLike.sol";
import "./interfaces/GemJoinLike.sol";
import "./interfaces/JugLike.sol";
import "./interfaces/DogLike.sol";
import "./interfaces/PipLike.sol";
import "./interfaces/SpotLike.sol";
import "./interfaces/IRewards.sol";
import "./interfaces/IAuctionProxy.sol";
import "./ceros/interfaces/IHelioProvider.sol";
import "./ceros/interfaces/IDao.sol";

import "./libraries/AuctionProxy.sol";


uint256 constant WAD = 10 ** 18;
uint256 constant RAD = 10 ** 45;
uint256 constant YEAR = 31864500; //seconds in year (365 * 24.25 * 3600)

contract Interaction is Initializable, UUPSUpgradeable, OwnableUpgradeable, IDao {

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
    IRewards public helioRewards;

    mapping(address => uint256) public deposits;
    mapping(address => CollateralType) public collaterals;

    using SafeERC20Upgradeable for IERC20Upgradeable;
    using EnumerableSet for EnumerableSet.AddressSet;

    EnumerableSet.AddressSet private usersInDebt;

    mapping(address => address) public helioProviders; // e.g. Auction purchase from ceabnbc to abnbc

    function initialize(address vat_,
        address spot_,
        address usb_,
        address usbJoin_,
        address jug_,
        address dog_,
        address rewards_
    ) public initializer {
        __Ownable_init();

        wards[msg.sender] = 1;

        vat = VatLike(vat_);
        spotter = SpotLike(spot_);
        usb = UsbLike(usb_);
        usbJoin = UsbGemLike(usbJoin_);
        jug = JugLike(jug_);
        dog = dog_;
        helioRewards = IRewards(rewards_);

        vat.hope(usbJoin_);

        usb.approve(usbJoin_, type(uint256).max);
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}

    function setCores(address vat_, address spot_, address usbJoin_,
        address jug_) public auth {
        // Reset previous approval
        usb.approve(address(usbJoin), 0);

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
        IERC20Upgradeable(token).safeApprove(gemJoin, type(uint256).max);
        vat.rely(gemJoin);
        emit CollateralEnabled(token, ilk);
    }

    function setHelioProvider(address token, address helioProvider) external auth {
        helioProviders[token] = helioProvider;
    }

    function removeCollateralType(address token) external auth {
        collaterals[token].live = 0;
        address gemJoin = address(collaterals[token].gem);
        vat.deny(gemJoin);
        IERC20Upgradeable(token).safeApprove(gemJoin, 0);
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
        require(dink <= uint256(type(int256).max), "Interaction/too-much-requested");
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
        require(dart >= 0, "Interaction/too-much-requested");

        if (uint256(dart) * rate < usbAmount * (10 ** 27)) {
            dart += 1; //ceiling
        }
        vat.frob(collateralType.ilk, msg.sender, msg.sender, msg.sender, 0, dart);
        uint256 mulResult = rate * uint256(dart);
        vat.move(msg.sender, address(this), usbAmount * RAY);
        usbJoin.exit(msg.sender, usbAmount);

        dropRewards(token, msg.sender);

        emit Borrow(msg.sender, usbAmount);
        return uint256(dart);
    }

    function dropRewards(address token, address usr) public {
        helioRewards.drop(token, msg.sender);
    }

    // Burn user's HAY.
    // N.B. User collateral stays the same.
    function payback(address token, uint256 usbAmount) external returns (int256) {
        CollateralType memory collateralType = collaterals[token];
        // _checkIsLive(collateralType.live); Checking in the `drip` function

        IERC20Upgradeable(usb).safeTransferFrom(msg.sender, address(this), usbAmount);
        usbJoin.join(msg.sender, usbAmount);
        (,uint256 rate,,,) = vat.ilks(collateralType.ilk);
        (, uint256 art) = vat.urns(collateralType.ilk, msg.sender);
        int256 dart = int256(hMath.mulDiv(usbAmount, 10 ** 27, rate));
        require(dart >= 0, "Interaction/too-much-requested");

        if (uint256(dart) * rate < usbAmount * (10 ** 27) &&
            uint256(dart + 1) * rate <= vat.usb(msg.sender)
        ) {
            dart += 1;
            // ceiling
        }
        vat.frob(collateralType.ilk, msg.sender, msg.sender, msg.sender, 0, - dart);

        if ((int256(rate * art) / 10 ** 27) == dart) {
            EnumerableSet.remove(usersInDebt, msg.sender);
        }

        dropRewards(token, msg.sender);

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
        helioRewards = IRewards(rewards);
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
        return deposits[token] * collateralPrice(token) / WAD;
    }

    // Total USB borrowed by all users
    function collateralTVL(address token) external view returns (uint256) {
        CollateralType memory collateralType = collaterals[token];
        _checkIsLive(collateralType.live);

        (uint256 Art, uint256 rate,,,) = vat.ilks(collateralType.ilk);
        return hMath.mulDiv(Art, rate, RAY);
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
        if (ink == 0) {
            return 0; // no meaningful price if user has no debt
        }
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
        return hMath.mulDiv(backedDebt, mat, ink) / 10 ** 9;
    }

    // Returns borrow APR with 20 decimals.
    // I.e. 10% == 10 ethers
    function borrowApr(address token) public view returns (uint256) {
        CollateralType memory collateralType = collaterals[token];
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
        AuctionProxy.startAuction(
            user,
            keeper,
            usb,
            usbJoin,
            vat,
            DogLike(dog),
            IHelioProvider(helioProviders[token]),
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
        IHelioProvider helioProvider = IHelioProvider(helioProviders[token]);
        AuctionProxy.buyFromAuction(
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

    function getAuctionStatus(address token, uint256 auctionId) external view returns(bool, uint256, uint256, uint256) {
        return ClipperLike(collaterals[token].clip).getStatus(auctionId);
    }

    function upchostClipper(address token) external {
        ClipperLike(collaterals[token].clip).upchost();
    }

    function getAllActiveAuctionsForToken(address token) external view returns (Sale[] memory sales) {
        return AuctionProxy.getAllActiveAuctionsForClip(ClipperLike(collaterals[token].clip));
    }

    function resetAuction(address token, uint256 auctionId, address keeper) external {
        AuctionProxy.resetAuction(auctionId, keeper, usb, usbJoin, vat, collaterals[token]);
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