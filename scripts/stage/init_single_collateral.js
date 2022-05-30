const hre = require("hardhat");

const { VAT,
    SPOT,
    ceBNBc,
    USB,
    UsbJoin,
    ceBNBcJoin,
    Oracle,
    JUG,
    VOW,
    DOG,
    INTERACTION,
    ABACI,
    CLIP,
    COLLATERAL_CE_ABNBC,
} = require('../../addresses-stage2.json');
const {ethers} = require("hardhat");
const {BN} = require("@openzeppelin/test-helpers");

async function main() {
    console.log('Running deploy script');

    let wad = "000000000000000000", // 18 Decimals
        ray = "000000000000000000000000000", // 27 Decimals
        rad = "000000000000000000000000000000000000000000000"; // 45 Decimals

    let collateral3 = ethers.utils.formatBytes32String(COLLATERAL_CE_ABNBC);

    this.Abaci = await ethers.getContractFactory("LinearDecrease");
    this.Vat = await hre.ethers.getContractFactory("Vat");
    this.Spot = await hre.ethers.getContractFactory("Spotter");
    this.Usb = await hre.ethers.getContractFactory("Usb");
    this.GemJoin = await hre.ethers.getContractFactory("GemJoin");
    this.UsbJoin = await hre.ethers.getContractFactory("UsbJoin");
    this.Oracle = await hre.ethers.getContractFactory("Oracle");
    this.Interaction = await hre.ethers.getContractFactory("Interaction");
    this.Jug = await hre.ethers.getContractFactory("Jug");
    this.Clip = await hre.ethers.getContractFactory("Clipper");
    this.Dog = await hre.ethers.getContractFactory("Dog");

    let abaci = await this.Abaci.attach(ABACI);

    console.log("Setting permissions");
    //
    // let oracle = this.Oracle.attach(Oracle);
    // await oracle.setPrice("400" + wad); // 2$, mat = 80%, 2$ * 80% = 1.6$ With Safety Margin

    console.log("Vat rely...");

    let vat = this.Vat.attach(VAT);
    // await vat.rely(ceBNBcJoin);
    // await vat.rely(SPOT);
    // await vat.rely(UsbJoin);
    // await vat.rely(JUG);
    // await vat.rely(DOG);
    //
    // await vat.rely(INTERACTION);
    //
    // console.log("Vat config...");
    // await vat["file(bytes32,uint256)"](ethers.utils.formatBytes32String("Line"), "500000000" + rad);
    // await vat["file(bytes32,bytes32,uint256)"](collateral3, ethers.utils.formatBytes32String("line"), "50000000" + rad);
    await vat["file(bytes32,bytes32,uint256)"](collateral3, ethers.utils.formatBytes32String("dust"), "1" + ray);

    // console.log("Spot...");
    // let spot = this.Spot.attach(SPOT);
    // // await spot["file(bytes32,bytes32,address)"](collateral3, ethers.utils.formatBytes32String("pip"), Oracle);
    // await spot["file(bytes32,bytes32,uint256)"](collateral3, ethers.utils.formatBytes32String("mat"), "1333333333333333333333333333"); // Liquidation Ratio
    // //
    // // await spot["file(bytes32,uint256)"](ethers.utils.formatBytes32String("par"), "1" + ray); // It means pegged to 1$
    // await spot.poke(collateral3);
    //
    // console.log("Jug...");
    // let BR = new BN("1000000003022266000000000000").toString(); //10% APY
    // let jug = this.Jug.attach(JUG);
    // await jug["file(bytes32,uint256)"](ethers.utils.formatBytes32String("base"), BR); // 10% Yearly
    // await jug["file(bytes32,address)"](ethers.utils.formatBytes32String("vow"), VOW);
    //
    // console.log("Usb...");
    // let usb = this.Usb.attach(USB);
    // await usb.rely(UsbJoin);
    //
    // // Initialize Liquidation Module
    // console.log("Dog...");
    // let dog = this.Dog.attach(DOG);
    // await dog.rely(CLIP);
    // await dog["file(bytes32,address)"](ethers.utils.formatBytes32String("vow"), VOW);
    // await dog["file(bytes32,uint256)"](ethers.utils.formatBytes32String("Hole"), "500" + rad);
    // await dog["file(bytes32,bytes32,uint256)"](collateral3, ethers.utils.formatBytes32String("hole"), "250" + rad);
    // await dog["file(bytes32,bytes32,uint256)"](collateral3, ethers.utils.formatBytes32String("chop"), "1100000000000000000"); // 10%
    // await dog["file(bytes32,bytes32,address)"](collateral3, ethers.utils.formatBytes32String("clip"), CLIP);
    //
    // console.log("CLIP");
    // let clip = this.Clip.attach(CLIP);
    // await clip.rely(DOG);
    // await clip["file(bytes32,uint256)"](ethers.utils.formatBytes32String("buf"), "1100000000000000000000000000"); // 10%
    // await clip["file(bytes32,uint256)"](ethers.utils.formatBytes32String("tail"), "1800"); // 30mins reset time
    // await clip["file(bytes32,uint256)"](ethers.utils.formatBytes32String("cusp"), "600000000000000000000000000"); // 60% reset ratio
    // await clip["file(bytes32,uint256)"](ethers.utils.formatBytes32String("chip"), "10000000000000000"); // 1% from vow incentive
    // await clip["file(bytes32,uint256)"](ethers.utils.formatBytes32String("tip"), "10" + rad); // 10$ flat fee incentive
    // await clip["file(bytes32,uint256)"](ethers.utils.formatBytes32String("stopped"), "0");
    // await clip["file(bytes32,address)"](ethers.utils.formatBytes32String("spotter"), SPOT);
    // await clip["file(bytes32,address)"](ethers.utils.formatBytes32String("dog"), DOG);
    // await clip["file(bytes32,address)"](ethers.utils.formatBytes32String("vow"), VOW);
    // await clip["file(bytes32,address)"](ethers.utils.formatBytes32String("calc"), ABACI);
    //
    // await abaci["file(bytes32,uint256)"](ethers.utils.formatBytes32String("tau"), "3600"); // Price will reach 0 after this time
    //
    //
    // console.log("Interaction...");
    // let interaction = this.Interaction.attach(INTERACTION);
    // //
    // // await interaction.setCores(
    // //     VAT, SPOT, UsbJoin, JUG
    // // );
    // console.log(collateral3);
    // await interaction.setCollateralType(ceBNBc, ceBNBcJoin, collateral3, CLIP);
    // await interaction.drip(ceBNBc);
    //
    // TODO: setHelioProvider

    console.log('Finished');
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
