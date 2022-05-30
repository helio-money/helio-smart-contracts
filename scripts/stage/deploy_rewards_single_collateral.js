const hre = require("hardhat");

const { VAT,
    ceBNBc, INTERACTION,
    COLLATERAL_CE_ABNBC, HELIO_TOKEN,
} = require('../../addresses-stage2.json');
const {ethers} = require("hardhat");
const {ether} = require("@openzeppelin/test-helpers");

async function main() {
    console.log('Running deploy script');

    this.HelioToken = await hre.ethers.getContractFactory("HelioToken");
    this.HelioRewards = await hre.ethers.getContractFactory("HelioRewards");
    this.HelioOracle = await hre.ethers.getContractFactory("HelioOracle");
    // this.Interaction = await hre.ethers.getContractFactory("Interaction");

    // let interaction = this.Interaction.attach(INTERACTION);
    const helioToken = await this.HelioToken.deploy();
    await helioToken.deployed();
    // let helioToken = this.HelioToken.attach(HELIO_TOKEN);
    console.log("helioToken deployed to:", helioToken.address);

    const rewards = await this.HelioRewards.deploy(VAT);
    await rewards.deployed();
    console.log("Rewards deployed to:", rewards.address);

    const helioOracle = await this.HelioOracle.deploy("100000000000000000");
    await helioOracle.deployed();
    console.log("helioOracle deployed to:", helioOracle.address);

    console.log('Adding rewards pool');
    let collateral3 = ethers.utils.formatBytes32String(COLLATERAL_CE_ABNBC);

    await helioToken.mint(rewards.address, ether("1000000").toString());
    await rewards.setHelioToken(helioToken.address);
    await rewards.initPool(ceBNBc, collateral3, "1000000001847694957439350500"); //6%
    // await interaction.setRewards(rewards.address);
    await rewards.setOracle(helioOracle.address);
    console.log('Validating code');

    await hre.run("verify:verify", {
        address: rewards.address,
        constructorArguments: [
            VAT
        ],
    });
    await hre.run("verify:verify", {
        address: helioToken.address,
    });
    await hre.run("verify:verify", {
        address: helioOracle.address,
        constructorArguments: [
            "100000000000000000"
        ],
    });
    console.log('Finished');
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
