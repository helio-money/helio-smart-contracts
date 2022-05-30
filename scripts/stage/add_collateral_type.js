const hre = require("hardhat");

const { VAT,
    SPOT,
    aBNBc,
    USB,
    UsbJoin,
    aBNBcJoin,
    Oracle,
    JUG,
    DOG, REWARDS,
    REAL_ABNBC, ceBNBc,
    REALaBNBcJoin,COLLATERAL_CE_ABNBC,
    INTERACTION, CLIP1, CLIP2, CLIP3, VOW, ABACI
} = require('../../addresses-stage2.json');
const {ethers} = require("hardhat");

let wad = "000000000000000000", // 18 Decimals
    ray = "000000000000000000000000000", // 27 Decimals
    rad = "000000000000000000000000000000000000000000000"; // 45 Decimals

async function main() {
    console.log('Running deploy script');

    let newCollateral = ethers.utils.formatBytes32String(COLLATERAL_CE_ABNBC);
    console.log("CeToken ilk: " + newCollateral);

    this.Abaci = await ethers.getContractFactory("LinearDecrease");
    this.Vat = await hre.ethers.getContractFactory("Vat");
    this.Clip = await hre.ethers.getContractFactory("Clipper");
    this.Interaction = await hre.ethers.getContractFactory("Interaction");
    this.GemJoin = await hre.ethers.getContractFactory("GemJoin");
    this.Spot = await hre.ethers.getContractFactory("Spotter");
    this.Rewards = await hre.ethers.getContractFactory("HelioRewards");
    this.Dog = await hre.ethers.getContractFactory("Dog");

    const clip = await this.Clip.deploy(VAT, SPOT, DOG, newCollateral);
    await clip.deployed();
    console.log("Clip deployed to:", clip.address);

    const tokenJoin = await this.GemJoin.deploy(VAT, newCollateral, ceBNBc);
    await tokenJoin.deployed();
    console.log("tokenJoin deployed to:", tokenJoin.address);

    // let tokenJoin = "0x92F66Ea0eBFeB88A5619aaBcAB4Cd0d3e0722C01";
    // let clip = "0xCaB362bb0268128Ca0e04afeC91006C9E0E02957";
    //
    let interaction = this.Interaction.attach(INTERACTION);

    // await interaction.setCollateralType(tokenAddress, tokenJoin, newCollateral, clip);
    // await interaction.setCollateralType(ceBNBc, tokenJoin.address, newCollateral, clip.address);
    // await interaction.enableCollateralType(tokenAddress, tokenJoin.address, newCollateral, clip.address);
    await interaction.enableCollateralType(ceBNBc, tokenJoin.address, newCollateral, clip.address);

    console.log("Vat...");
    let vat = this.Vat.attach(VAT);
    await vat.rely(tokenJoin.address);
    // await vat["file(bytes32,bytes32,uint256)"](newCollateral, ethers.utils.formatBytes32String("line"), "50000000" + rad);
    // await vat["file(bytes32,bytes32,uint256)"](newCollateral, ethers.utils.formatBytes32String("dust"), "100000000000000000" + ray);

    // console.log("Spot...");
    // let spot = this.Spot.attach(SPOT);
    // await spot["file(bytes32,bytes32,address)"](newCollateral, ethers.utils.formatBytes32String("pip"), Oracle);
    // await spot["file(bytes32,bytes32,uint256)"](newCollateral, ethers.utils.formatBytes32String("mat"), "1333333333333333333333333333"); // Liquidation Ratio
    // await spot.poke(newCollateral);

    console.log("Rewards...");
    const rewards = this.Rewards.attach(REWARDS);
    await rewards.initPool(ceBNBc, newCollateral, "1000000001847694957439350500"); //6%

    console.log("Dog...");
    let dog = this.Dog.attach(DOG);
    await dog.rely(clip.address);
    await dog["file(bytes32,bytes32,uint256)"](newCollateral, ethers.utils.formatBytes32String("hole"), "250" + rad);
    await dog["file(bytes32,bytes32,uint256)"](newCollateral, ethers.utils.formatBytes32String("chop"), "1100000000000000000"); // 10%
    await dog["file(bytes32,bytes32,address)"](newCollateral, ethers.utils.formatBytes32String("clip"), clip.address);

    console.log("clip");
    // let clipC = this.Clip.attach(clip);
    await clip.rely(DOG);
    await clip["file(bytes32,uint256)"](ethers.utils.formatBytes32String("buf"), "1100000000000000000000000000"); // 10%
    await clip["file(bytes32,uint256)"](ethers.utils.formatBytes32String("tail"), "1800"); // 30mins reset time
    await clip["file(bytes32,uint256)"](ethers.utils.formatBytes32String("cusp"), "600000000000000000000000000"); // 60% reset ratio
    await clip["file(bytes32,uint256)"](ethers.utils.formatBytes32String("chip"), "10000000000000000"); // 1% from vow incentive
    await clip["file(bytes32,uint256)"](ethers.utils.formatBytes32String("tip"), "10" + rad); // 10$ flat fee incentive
    await clip["file(bytes32,uint256)"](ethers.utils.formatBytes32String("stopped"), "0");
    await clip["file(bytes32,address)"](ethers.utils.formatBytes32String("spotter"), SPOT);
    await clip["file(bytes32,address)"](ethers.utils.formatBytes32String("dog"), DOG);
    await clip["file(bytes32,address)"](ethers.utils.formatBytes32String("vow"), VOW);
    await clip["file(bytes32,address)"](ethers.utils.formatBytes32String("calc"), ABACI);

    await interaction.drip(ceBNBc);

    console.log('Finished');
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
