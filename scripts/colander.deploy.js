const hre = require("hardhat");
const {ethers, upgrades} = require("hardhat");

async function main() {

    // Variables Declaration
    let [deployer] = await ethers.getSigners();
    let colander, 
        colanderRewards; 
    // External Addresses
    let _stablecoin = "", 
        _interaction = "",
        _spotter = "",
        _dex = ""; // pancake

    let wad = "000000000000000000", // 18 Decimals
        ray = "000000000000000000000000000"; // 27 Decimals

    // Contracts Fetching
    this.Colander = await hre.ethers.getContractFactory("Colander");
    this.colanderRewards = await hre.ethers.getContractFactory("ColanderRewards");

    // // Upgrading
    // const upgraded = await upgrades.upgradeProxy("", Colander);    
    // console.log(upgraded)

    // Contracts deployment and initialization
    colander = await upgrades.deployProxy(this.Colander, ["Colander Pool Token", "cHay", _stablecoin, _interaction, _spotter, _dex, ethers.constants.AddressZero], {initializer: "initialize"});
    await colander.deployed();
    let colanderImplementation = await upgrades.erc1967.getImplementationAddress(colander.address);
    console.log("Colander   : " + colander.address);
    console.log("imp        : " + colanderImplementation);

    colanderRewards = await upgrades.deployProxy(this.colanderRewards, [_stablecoin, colander.address, "3600", "60"], {initializer: "initialize"});
    await colanderRewards.deployed();
    let colanderRewardsImplementation = await upgrades.erc1967.getImplementationAddress(colanderRewards.address);
    console.log("Rewards    : " + colanderRewards.address);
    console.log("imp        : " + colanderRewardsImplementation);

    await colander.connect(deployer).setProfitRange("5" + "0000000000000000000000000"); // 5% of a RAY
    await colander.connect(deployer).setPriceImpact("2" + "0000000000000000");  // 2% of a WAD
    await colander.connect(deployer).setRewards(colanderRewards.address);
    await colanderRewards.connect(deployer).rely(colander.address);

    console.log("Verifying Colander...");

    // Verify implementations
    await hre.run("verify:verify", {
        address: colanderImplementation,
    });
    await hre.run("verify:verify", {
        address: colanderRewardsImplementation,
    });

    // Verify proxies
    await hre.run("verify:verify", {
        address: colander.address,
        constructorArguments: [
            "Colander Pool Token", "cHay", _stablecoin, _interaction, _spotter, _dex, colanderRewards.address
        ],
    });
    await hre.run("verify:verify", {
        address: colanderRewards.address,
        constructorArguments: [
            _stablecoin, colander.address, "3600", "60"
        ],
    });
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
