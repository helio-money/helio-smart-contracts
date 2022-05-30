const hre = require("hardhat");

const { VAT,
    SPOT,
    aBNBc,
    USB,
    UsbJoin,
    aBNBcJoin,
    REALaBNBcJoin,
    REALOracle,
    JUG,
    Oracle,
    VOW,
    INTERACTION, REAL_ABNBC, REWARDS, DOG,
    CLIP1, CLIP, COLLATERAL_CE_ABNBC, ceBNBc, ceBNBcJoin,
    AUCTION_PROXY
} = require('../addresses-stage2.json');
const {ether} = require("@openzeppelin/test-helpers");
const {ethers, upgrades} = require("hardhat");

async function main() {

    let newCollateral = ethers.utils.formatBytes32String(COLLATERAL_CE_ABNBC);
    console.log("CeToken ilk: " + newCollateral);

    const MIKE = "0x57f9672ba603251c9c03b36cabdbbca7ca8cfcf4";

    this.VAT = await hre.ethers.getContractFactory("Vat");

    this.Interaction = await hre.ethers.getContractFactory("Interaction");

    const interactionNew = await upgrades.deployProxy(this.Interaction, [
        VAT,
        SPOT,
        USB,
        UsbJoin,
        JUG,
        DOG,
        REWARDS,
        AUCTION_PROXY
    ], {
        initializer: "initialize"
    });

    let wad = "000000000000000000", // 18 Decimals
        ray = "000000000000000000000000000", // 27 Decimals
        rad = "000000000000000000000000000000000000000000000"; // 45 Decimals

    let vat = this.VAT.attach(VAT);
    this.UsbFactory = await ethers.getContractFactory("Usb");
    let usb = this.UsbFactory.attach(USB);

    await hre.network.provider.request({
        method: "hardhat_impersonateAccount",
        params: ["0x73CF7cC1778a60d43Ca2833F419B77a76177156A"],
    });
    const signerDeployer = await ethers.getSigner("0x73CF7cC1778a60d43Ca2833F419B77a76177156A")

    await vat.connect(signerDeployer).rely(interactionNew.address);
    await vat.connect(signerDeployer).behalf("0x37a7d129df800a4c75d13b2d94e1afc024a54fed", interactionNew.address);
    await vat.connect(signerDeployer).behalf(MIKE, interactionNew.address);

    // await vat.connect(signerDeployer)["file(bytes32,bytes32,uint256)"](newCollateral, ethers.utils.formatBytes32String("dust"), "1" + ray);

    await hre.network.provider.request({
        method: "hardhat_stopImpersonatingAccount",
        params: ["0x73CF7cC1778a60d43Ca2833F419B77a76177156A"],
    });

    await interactionNew.enableCollateralType(ceBNBc, ceBNBcJoin, newCollateral, CLIP);

    await hre.network.provider.request({
        method: "hardhat_impersonateAccount",
        params: [MIKE],
    });
    const signer = await ethers.getSigner(MIKE)

    let interaction = this.Interaction.attach(INTERACTION);

    let usbBalance = await vat.usb(MIKE);
    console.log(usbBalance);

    await usb.connect(signer).approve(interaction.address, "40000000000000000000");
    await interaction.connect(signer).payback("0xEbCB8d02102269a1A2775Cd5a36E234857A5cf36",
        "40000000000000000000")
    // await usb.connect(signer).approve(interactionNew.address, "40000000000000000000");
    // await interactionNew.connect(signer).payback("0xEbCB8d02102269a1A2775Cd5a36E234857A5cf36",
    //     "40000000000000000000")

    await hre.network.provider.request({
        method: "hardhat_stopImpersonatingAccount",
        params: [MIKE],
    });
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
