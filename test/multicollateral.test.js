const { expect } = require('chai');
const { BigNumber } = require('ethers');
const { ethers, network } = require('hardhat');
const Web3 = require('web3');
const {ether, expectRevert, BN, expectEvent, constants} = require('@openzeppelin/test-helpers');

const Interaction = artifacts.require('Interaction');

///////////////////////////////////////////
//Word of Notice: Commented means pending//
//The test will be updated on daily basis//
///////////////////////////////////////////

describe('===INTERACTION2-Multicollateral===', function () {
    let deployer, signer1, signer2, mockVow;

    let vat,
        spot,
        usb,
        abnbc,
        abnbcJoin,
        abnbc2,
        abnbcJoin2,
        usbJoin,
        jug,
        dog,
        clipABNBC,
        rewards,
        helio,
        oracle,
        oracle2,
        helioOracle,
        auctionProxy;

    let interaction;

    let wad = "000000000000000000", // 18 Decimals
        ray = "000000000000000000000000000", // 27 Decimals
        rad = "000000000000000000000000000000000000000000000", // 45 Decimals
        ONE = 10 ** 27;


    let collateral = ethers.utils.formatBytes32String("aBNBc");
    let collateral2 = ethers.utils.formatBytes32String("aBNBc2");

    beforeEach(async function () {

        ////////////////////////////////
        /** Deployments ------------ **/
        ////////////////////////////////

        [deployer, signer1, signer2, mockVow] = await ethers.getSigners();

        this.Vat = await ethers.getContractFactory("Vat");
        this.Spot = await ethers.getContractFactory("Spotter");
        this.Usb = await ethers.getContractFactory("Usb");
        this.ABNBC = await ethers.getContractFactory("aBNBc");
        this.GemJoin = await ethers.getContractFactory("GemJoin");
        this.UsbJoin = await ethers.getContractFactory("UsbJoin");
        this.Jug = await ethers.getContractFactory("Jug");
        this.Oracle = await ethers.getContractFactory("Oracle"); // Mock Oracle
        this.Dog = await ethers.getContractFactory("Dog");
        this.ClipABNBC = await ethers.getContractFactory("Clipper");
        this.Abaci = await ethers.getContractFactory("LinearDecrease");
        this.Vow = await ethers.getContractFactory("Vow");
        this.AuctionProxy = await ethers.getContractFactory("AuctionProxy");
        this.HelioOracle = await ethers.getContractFactory("HelioOracle");
        this.Rewards = await ethers.getContractFactory("HelioRewards");
        this.Helio = await ethers.getContractFactory("HelioToken");

        // Core module
        vat = await this.Vat.connect(deployer).deploy();
        await vat.deployed();

        spot = await this.Spot.connect(deployer).deploy(vat.address);
        await spot.deployed();

        // Usb module
        usb = await this.Usb.connect(deployer).deploy(97, "testUSB");
        await usb.deployed(); // Stable Coin
        usbJoin = await this.UsbJoin.connect(deployer).deploy(vat.address, usb.address);
        await usbJoin.deployed();

        const aBNBb = artifacts.require("aBNBb");
        abnbb = await aBNBb.new();
        await abnbb.initialize(deployer.address);
        abnbb2 = await aBNBb.new();
        await abnbb2.initialize(deployer.address);
        // Collateral module
        abnbc = await this.ABNBC.connect(deployer).deploy();
        await abnbc.initialize(constants.ZERO_ADDRESS, abnbb.address);
        abnbcJoin = await this.GemJoin.connect(deployer).deploy(vat.address, collateral, abnbc.address);
        await abnbcJoin.deployed();
        // Collateral 2
        abnbc2 = await this.ABNBC.connect(deployer).deploy();
        await abnbc2.initialize(constants.ZERO_ADDRESS, abnbb.address);
        abnbcJoin2 = await this.GemJoin.connect(deployer).deploy(vat.address, collateral2, abnbc2.address);
        await abnbcJoin2.deployed();

        // Rates module
        jug = await this.Jug.connect(deployer).deploy(vat.address);
        await jug.deployed();

        // External
        oracle = await this.Oracle.connect(deployer).deploy();
        await oracle.deployed();
        oracle2 = await this.Oracle.connect(deployer).deploy();
        await oracle2.deployed();

        dog = await this.Dog.connect(deployer).deploy(vat.address);
        await dog.deployed();
        clipABNBC = await this.ClipABNBC.connect(deployer).deploy(vat.address, spot.address, dog.address, collateral);
        await clipABNBC.deployed();

        helioOracle = await this.HelioOracle.connect(deployer).deploy("100000000000000000");
        await helioOracle.deployed();
        rewards = await this.Rewards.connect(deployer).deploy(vat.address);
        await rewards.deployed();
        helio = await this.Helio.connect(deployer).deploy();
        await helio.deployed();

        auctionProxy = await this.AuctionProxy.connect(deployer).deploy();
        await auctionProxy.deployed();

        interaction = await Interaction.new({from: deployer.address});
        await interaction.initialize(
            vat.address,
            spot.address,
            usb.address,
            usbJoin.address,
            jug.address,
            dog.address,
            rewards.address,
            auctionProxy.address,
        );
        //////////////////////////////
        /** Initial Setup -------- **/
        //////////////////////////////

        await helio.connect(deployer).rely(rewards.address);
        await rewards.connect(deployer).setHelioToken(helio.address);
        await rewards.connect(deployer).setOracle(helioOracle.address);
        await rewards.connect(deployer).initPool(abnbc.address, collateral, "1000000001847694957439350500"); //6%
        await rewards.connect(deployer).rely(interaction.address);

        // Initialize External
        // 2.000000000000000000000000000 ($) * 0.8 (80%) = 1.600000000000000000000000000,
        // 2.000000000000000000000000000 / 1.600000000000000000000000000 = 1.250000000000000000000000000 = mat
        await oracle.connect(deployer).setPrice("400" + wad); // 400$, mat = 80%, 400$ * 80% = 320$ With Safety Margin
        await oracle2.connect(deployer).setPrice("300" + wad); // 400$, mat = 80%, 400$ * 80% = 320$ With Safety Margin

        // Initialize Core Module
        // await vat.connect(deployer).init(collateral);
        // await vat.connect(deployer).rely(abnbcJoin.address);
        await vat.connect(deployer).rely(usbJoin.address);
        await vat.connect(deployer).rely(spot.address);
        await vat.connect(deployer).rely(jug.address);
        await vat.connect(deployer).rely(interaction.address);

        // await vat.connect(deployer).rely(jug.address);
        await vat.connect(deployer)["file(bytes32,uint256)"](ethers.utils.formatBytes32String("Line"), "20000" + rad); // Normalized USB
        await vat.connect(deployer)["file(bytes32,bytes32,uint256)"](collateral, ethers.utils.formatBytes32String("line"), "2000" + rad);
        // await vat.connect(deployer)["file(bytes32,bytes32,uint256)"](collateral, ethers.utils.formatBytes32String("spot"), "500" + rad);
        await vat.connect(deployer)["file(bytes32,bytes32,uint256)"](collateral, ethers.utils.formatBytes32String("dust"), "1" + ray); //0.1 rad

        await spot.connect(deployer)["file(bytes32,bytes32,address)"](collateral, ethers.utils.formatBytes32String("pip"), oracle.address);
        await spot.connect(deployer)["file(bytes32,bytes32,uint256)"](collateral, ethers.utils.formatBytes32String("mat"), "1250000000000000000000000000"); // Liquidation Ratio
        await spot.connect(deployer)["file(bytes32,uint256)"](ethers.utils.formatBytes32String("par"), "1" + ray); // It means pegged to 1$
        await spot.connect(deployer).poke(collateral);

        //Collateral2
        await vat.connect(deployer)["file(bytes32,bytes32,uint256)"](collateral2, ethers.utils.formatBytes32String("line"), "3000" + rad);
        await vat.connect(deployer)["file(bytes32,bytes32,uint256)"](collateral2, ethers.utils.formatBytes32String("dust"), "1" + rad);

        await spot.connect(deployer)["file(bytes32,bytes32,address)"](collateral2, ethers.utils.formatBytes32String("pip"), oracle2.address);
        await spot.connect(deployer)["file(bytes32,bytes32,uint256)"](collateral2, ethers.utils.formatBytes32String("mat"), "1250000000000000000000000000"); // Liquidation Ratio
        await spot.connect(deployer)["file(bytes32,uint256)"](ethers.utils.formatBytes32String("par"), "1" + ray); // It means pegged to 1$
        await spot.connect(deployer).poke(collateral2);


        // Initialize Usb Module
        await usb.connect(deployer).rely(usbJoin.address);

        // Stability fees
        //calculate base rate
        const year_seconds = 31536000;
        const rate_percent = 0.1; //10%;
        let fractionBR = (1 + rate_percent)**(1/year_seconds);
        // let BR = new BN(fractionBR)*10**27;
        let BR = new BN("1000000003022266000000000000").toString();
        console.log(BR);
        // await jug.connect(deployer)["file(bytes32,uint256)"](ethers.utils.formatBytes32String("base"), "1000000000315529215730000000"); // 1% Yearly
        await jug.connect(deployer)["file(bytes32,uint256)"](ethers.utils.formatBytes32String("base"), BR); // 1% Yearly
        // Setting duty requires now == rho. So Drip then Set, or Init then Set.
        // await jug.connect(deployer).init(collateral); // Duty by default set here to 1 Ray which is 0%, but added to Base that makes its effect compound
        // await jug.connect(deployer)["file(bytes32,bytes32,uint256)"](collateral, ethers.utils.formatBytes32String("duty"), "0000000000312410000000000000"); // 1% Yearly Factored

        // evm does not support stopping time for now == rho, so we create a mock contract which calls both functions to set duty
        let proxyLike = await (await (await ethers.getContractFactory("ProxyLike")).connect(deployer).deploy(jug.address, vat.address)).deployed();
        await jug.connect(deployer).rely(proxyLike.address);
        await proxyLike.connect(deployer).jugInitFile(collateral, ethers.utils.formatBytes32String("duty"), "0");
        await proxyLike.connect(deployer).jugInitFile(collateral2, ethers.utils.formatBytes32String("duty"), "0000000000312410000000000000"); // 1% Yearly Factored

        expect(await(await jug.base()).toString()).to.be.equal(BR);
        expect(await(await(await jug.ilks(collateral)).duty).toString()).to.be.equal("0");
        expect(await(await(await jug.ilks(collateral2)).duty).toString()).to.be.equal("312410000000000000");

        await jug.connect(deployer)["file(bytes32,address)"](ethers.utils.formatBytes32String("vow"), mockVow.address);

        await interaction.setCollateralType(abnbc.address, abnbcJoin.address, collateral, clipABNBC.address, {from: deployer.address});
        await interaction.setCollateralType(abnbc2.address, abnbcJoin2.address, collateral2, clipABNBC.address, {from: deployer.address});

        let s1Balance = (await abnbc.balanceOf(signer1.address)).toString();
        expect(s1Balance).to.equal("0");
        //Mint some tokens for user
        await abnbc.connect(deployer).mint(signer1.address, ether("5000").toString());
        await abnbc.connect(deployer).mint(signer2.address, ether("5000").toString());
        s1Balance = (await abnbc.balanceOf(signer1.address)).toString();
        expect(s1Balance).to.equal(ether("5000").toString());

        await abnbc2.connect(deployer).mint(signer1.address, ether("400").toString());

        await auctionProxy.connect(deployer).setDao(interaction.address);
    });

    it('defaults', async function () {

        // let ilk = await interaction.connect(deployer).ilk(abnbc.address);
        // console.log("Ilk: " + ilk);
        let abnbcPrice = await interaction.collateralPrice(abnbc.address, {from: signer1.address});
        expect(abnbcPrice.toString()).to.equal(ether("400").toString());
        let abnbcPrice2 = await interaction.collateralPrice(abnbc2.address, {from: signer1.address});
        expect(abnbcPrice2.toString()).to.equal(ether("300").toString());

        let rate1 = await interaction.collateralRate(abnbc.address, {from: signer1.address});
        expect(rate1.toString()).to.equal("800000000000000000"); //80%
        let rate2 = await interaction.collateralRate(abnbc2.address, {from: signer1.address});
        expect(rate2.toString()).to.equal("800000000000000000");

        // Check initial state
        let free = await interaction.free(abnbc.address, signer1.address, {from: signer1.address});
        expect(free.toString()).to.equal("0");
        let locked = await interaction.locked(abnbc.address, signer1.address, {from: signer1.address});
        expect(locked.toString()).to.equal("0");

        let borrowApr = await interaction.borrowApr(abnbc.address, {from: signer1.address});
        expect(borrowApr.toString()).to.equal("10000000069041365947");

        let rewardPool = await rewards.rewardsPool();
        expect(rewardPool.toString()).to.equal("0");
    });

    it('put collateral and borrow', async function () {
        // Approve and send some collateral inside. collateral value == 400 == `dink`
        let dink = ether("2").toString();

        await abnbc.connect(signer1).approve(interaction.address, dink);
        // Deposit collateral(aBNBc) to the interaction contract
        await interaction.deposit(signer1.address, abnbc.address, dink, {from: signer1.address});

        let s1Balance = (await abnbc.balanceOf(signer1.address)).toString();
        expect(s1Balance).to.equal(ether("4998").toString());

        let s1USBBalance = (await usb.balanceOf(signer1.address)).toString();
        expect(s1USBBalance).to.equal("0");

        let free = await interaction.free(abnbc.address, signer1.address, {from: signer1.address});
        expect(free.toString()).to.equal("0");
        let locked = await interaction.locked(abnbc.address, signer1.address, {from: signer1.address});
        expect(locked.toString()).to.equal(ether("2").toString());

        let estLiqPriceHAY2 = await interaction.estimatedLiquidationPriceHAY(
            abnbc.address, signer1.address, ether("200").toString(), {from: signer1.address}
        );
        console.log("estLiqPriceHAY2 is: " + estLiqPriceHAY2.toString());
        let estLiqPriceHAY = await interaction.estimatedLiquidationPriceHAY(
            abnbc.address, signer1.address, ether("100").toString(), {from: signer1.address}
        );
        console.log("estLiqPriceHAY is: " + estLiqPriceHAY.toString());
        expect(estLiqPriceHAY.toString()).to.equal(ether("25").toString());
        console.log("estLiqPriceHAY is: " + estLiqPriceHAY.toString());

        // Locking collateral and borrowing USB
        // We want to draw 60 USB == `dart`
        // Maximum available for borrow = (2 * 400 ) * 0.8 = 640
        let dart = ether("60").toString();
        await interaction.borrow(abnbc.address, dart, {from: signer1.address});

        s1USBBalance = (await usb.balanceOf(signer1.address)).toString();
        expect(s1USBBalance).to.equal(dart);

        free = await interaction.free(abnbc.address, signer1.address, {from: signer1.address});
        expect(free.toString()).to.equal("0");
        locked = await interaction.locked(abnbc.address, signer1.address, {from: signer1.address});
        expect(locked.toString()).to.equal(dink);
        s1USBBalance = (await usb.balanceOf(signer1.address)).toString();
        expect(s1USBBalance).to.equal(dart);

        // User locked 2 aBNBc with price 400 and rate 0.8 == 640$ collateral worth
        // Borrowed 60$ => available should equal to 640 - 60 = 580.
        let available = await interaction.availableToBorrow(abnbc.address, signer1.address, {from: signer1.address});
        expect(available.toString()).to.equal("579999999999999999999");

        // 2 * 37.5 * 0.8 == 60$
        let liquidationPrice = await interaction.currentLiquidationPrice(abnbc.address, signer1.address, {from: signer1.address});
        expect(liquidationPrice.toString()).to.equal(ether("37.5").toString());
        // console.log("Liq.price is: " + liquidationPrice.toString());

        // ( 2 + 1 ) * 25 * 0.8 == 60$
        let estLiquidationPrice = await interaction.estimatedLiquidationPrice(
            abnbc.address, signer1.address, ether("1").toString(), {from: signer1.address}
        );
        expect(estLiquidationPrice.toString()).to.equal(ether("25").toString());
        console.log("Est.Liq.price is: " + estLiquidationPrice.toString());

        // Update Stability Fees
        await network.provider.send("evm_increaseTime", [31536000]); // Jump 1 Year
        await interaction.drip(abnbc.address, {from: signer1.address});

        availableYear = await interaction.availableToBorrow(abnbc.address, signer1.address, {from: signer1.address});
        expect(availableYear.toString()).to.equal("573999999958575180430"); //roughly 10 percents less.
    });

    // 100 BNB -> Ankr
    // 100 aBNBc <-- Ankr 7%
    // 100 aBNBc --> Helio
    // XXX DAI <-- Helio (mint)
    // DAI -> Jar contract (modified MakerDAO Pot) 10%
    // jar is similar to pot but pot has no rewards limit and the interest is based on the percentage of deposit
    // jar has rewards limit and interest is based on percentage share of deposits from fixed emission
    // DAI*(1 + fees%) --> Helio
    // MKR token <-- Helio (amount of MKR == stability fee)

    it('payback and withdraw', async function() {
        //deposit&borrow
        let dink = ether("2").toString();
        await abnbc.connect(signer1).approve(interaction.address, dink);
        await interaction.deposit(signer1.address, abnbc.address, dink, {from: signer1.address});
        let dart = ether("60").toString();
        await interaction.borrow(abnbc.address, dart, {from: signer1.address});

        let s1Balance = (await abnbc.balanceOf(signer1.address)).toString();
        expect(s1Balance).to.equal(ether("4998").toString());
        let s1USBBalance = (await usb.balanceOf(signer1.address)).toString();
        expect(s1USBBalance).to.equal(dart);

        await usb.connect(signer1).approve(interaction.address, dart);
        await interaction.payback(abnbc.address, dart, {from: signer1.address});

        s1USBBalance = (await usb.balanceOf(signer1.address)).toString();
        expect(s1USBBalance).to.equal("0");
        // let ilk = await vat.connect(signer1).ilks(collateral);
        // console.log(ilk);

        // vatState = await vat.connect(signer1).urns(collateral, signer1.address);
        // console.log(vatState);

        let available = await interaction.availableToBorrow(abnbc.address, signer1.address, {from: signer1.address});
        expect(available.toString()).to.equal("639999999999999999998");

        let willBeAvailable = await interaction.willBorrow(
            abnbc.address, signer1.address, ether("1").toString(), {from: signer1.address}
        );
        expect(willBeAvailable.toString()).to.equal("959999999999999999998");

        // USB are burned, now we have to withdraw collateral
        // We will always withdraw all available collateral
        s1Balance = (await abnbc.balanceOf(signer1.address)).toString();
        expect(s1Balance).to.equal(ether("4998").toString());

        let free = await interaction.free(abnbc.address, signer1.address, {from: signer1.address});
        expect(free.toString()).to.equal("0");

        expectRevert(interaction.withdraw(signer1.address, abnbc.address, ether("1").toString(), {from: signer2.address}),
            "Interaction/Caller must be the same address as participant");

        await interaction.withdraw(signer1.address, abnbc.address, ether("1").toString(), {from: signer1.address});

        s1Balance = (await abnbc.balanceOf(signer1.address)).toString();
        expect(s1Balance).to.equal(ether("4999").toString());
    });

    it('drip', async function() {
        //deposit&borrow
        let dink = ether("2").toString();
        await abnbc.connect(signer1).approve(interaction.address, dink);
        await interaction.deposit(signer1.address, abnbc.address, dink, {from: signer1.address});
        let dart = ether("60").toString();
        await interaction.borrow(abnbc.address, dart, {from: signer1.address});

        let borrowed = await interaction.borrowed(abnbc.address, signer1.address, {from: signer1.address});
        expect(borrowed.toString()).to.equal(dart);

        await network.provider.send("evm_increaseTime", [86400]); // Jump 1 Day
        await interaction.drip(abnbc.address, {from: signer1.address});

        await abnbc.connect(signer2).approve(interaction.address, dink);
        await interaction.deposit(signer2.address, abnbc.address, dink, {from: signer2.address});
        await interaction.borrow(abnbc.address, dart, {from: signer2.address});
        let borrowed2 = await interaction.borrowed(abnbc.address, signer2.address, {from: signer2.address});
        expect(borrowed2.toString()).to.equal(dart);

        // await network.provider.send("evm_increaseTime", [86400]); // Jump 1 Day
        // await interaction.drip(abnbc.address, {from: signer1.address});

        await usb.connect(signer2).approve(interaction.address, dart);
        await interaction.payback(abnbc.address, dart, {from: signer2.address});

        borrowed2 = await interaction.borrowed(abnbc.address, signer2.address, {from: signer2.address});
        expect(borrowed2.toString()).to.equal("1");

        await interaction.borrowed(abnbc.address, signer1.address, {from: signer1.address});
        expect(borrowed.toString()).to.equal(dart);
    });

    it('rewards', async function() {
        //deposit&borrow
        let dink = ether("2").toString();
        await abnbc.connect(signer1).approve(interaction.address, dink);
        await interaction.deposit(signer1.address, abnbc.address, dink, {from: signer1.address});
        let dart = ether("200").toString();
        await interaction.borrow(signer1.address, abnbc.address, dart, {from: signer1.address});

        let claimable = await rewards.claimable(abnbc.address, signer1.address);
        expect(claimable.toString()).to.equal("0");

        let borrowed = await interaction.borrowed(abnbc.address, signer1.address, {from: signer1.address});
        expect(borrowed.toString()).to.equal(dart);

        await network.provider.send("evm_increaseTime", [31536000]); // Jump 1 Day
        await network.provider.send("evm_increaseTime", [60]); // Jump 1 minute
        await network.provider.send("evm_mine");

        claimable = await rewards.claimable(abnbc.address, signer1.address);
        expect(claimable.toString()).to.equal("120000235026811392660");

        let totalPending = await rewards.pendingRewards(signer1.address);
        expect(totalPending.toString()).to.equal("120000235026811392660");

        await rewards.connect(signer1).claim(ether("60").toString());
        let helioBalance = await helio.balanceOf(signer1.address);
        expect(helioBalance.toString()).to.equal(ether("60").toString());

        totalPending = await rewards.pendingRewards(signer1.address);
        expect(totalPending.toString()).to.equal("60000238943925136690");
    });
});