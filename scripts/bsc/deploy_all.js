const hre = require("hardhat");
const fs = require("fs");
const {ethers, upgrades} = require("hardhat");
const {BN, ether} = require("@openzeppelin/test-helpers");

let wad = "000000000000000000", // 18 Decimals
    ray = "000000000000000000000000000", // 27 Decimals
    rad = "000000000000000000000000000000000000000000000"; // 45 Decimals

const hoursToSeconds = (hours) => {
  return hours * 60 * 60;
};

async function main() {

  console.log("Deploying...");

  // Declare network variables to be loaded from networkVars.json
  let _aBNBc, _wBnb, _aBnbb, _dex, _pool;
  let ilkCE;
  let _multiSig;
  let chainId;

  // Load network variables from .json
  if (hre.network.name == "bsc") {
      const {m_aBNBc, m_wBnb, m_aBnbb, m_dex, m_pool, m_chainID, ilkString, multiSig} = require('./networkVars.json'); // mainnet
      _aBNBc = m_aBNBc; _wBnb = m_wBnb; _aBnbb = m_aBnbb; _dex = m_dex; _pool = m_pool, _multiSig = multiSig;
      chainId = ethers.BigNumber.from(m_chainID);
      ilkCE = ethers.utils.formatBytes32String(ilkString);
  } else if (hre.network.name == "bsc_testnet") {
      const {t_aBNBc, t_wBnb, t_aBnbb, t_dex, t_pool, t_chainID, ilkString, multiSig} = require('./networkVars.json'); // testment
      _aBNBc = t_aBNBc; _wBnb = t_wBnb; _aBnbb = t_aBnbb; _dex = t_dex; _pool = t_pool, _multiSig = multiSig;
      chainId = ethers.BigNumber.from(t_chainID);
      ilkCE = ethers.utils.formatBytes32String(ilkString);
  }

  // Script variables
  let ceaBNBc, ceVault, hBNB, cerosRouter;

  this.CeaBNBc = await hre.ethers.getContractFactory("CeToken");
  this.CeVault = await hre.ethers.getContractFactory("CeVault");
  this.HBnb = await hre.ethers.getContractFactory("hBNB");
  this.CerosRouter = await hre.ethers.getContractFactory("CerosRouter");
  this.HelioProvider = await hre.ethers.getContractFactory("HelioProvider");

  this.Vat = await hre.ethers.getContractFactory("Vat");
  this.Spot = await hre.ethers.getContractFactory("Spotter");
  this.Hay = await hre.ethers.getContractFactory("Hay");
  this.GemJoin = await hre.ethers.getContractFactory("GemJoin");
  this.HayJoin = await hre.ethers.getContractFactory("HayJoin");
  this.Oracle = await hre.ethers.getContractFactory("BnbOracle");
  this.Jug = await hre.ethers.getContractFactory("Jug");
  this.Vow = await hre.ethers.getContractFactory("Vow");
  this.Dog = await hre.ethers.getContractFactory("Dog");
  this.Clip = await hre.ethers.getContractFactory("Clipper");
  this.Abaci = await ethers.getContractFactory("LinearDecrease");

  this.HelioToken = await hre.ethers.getContractFactory("HelioToken");
  this.HelioRewards = await hre.ethers.getContractFactory("HelioRewards");
  this.HelioOracle = await hre.ethers.getContractFactory("HelioOracle");

  this.AuctionProxy = await hre.ethers.getContractFactory("AuctionProxy");

  // CEROS Deployment
  console.log("CEROS...") 
  ceaBNBc = await upgrades.deployProxy(this.CeaBNBc, ["CEROS aBNBc Vault Token", "ceaBNBc"], {initializer: "initialize"});
  await ceaBNBc.deployed();
  let ceaBNBcImplementation = await upgrades.erc1967.getImplementationAddress(ceaBNBc.address);
  console.log("Deployed: ceaBNBc    : " + ceaBNBc.address);
  console.log("Imp                  : " + ceaBNBcImplementation);

  ceVault = await upgrades.deployProxy(this.CeVault, ["CEROS aBNBc Vault", ceaBNBc.address, _aBNBc], {initializer: "initialize"});
  await ceVault.deployed();
  let ceVaultImplementation = await upgrades.erc1967.getImplementationAddress(ceVault.address);
  console.log("Deployed: ceVault    : " + ceVault.address);
  console.log("Imp                  : " + ceVaultImplementation);

  hBNB = await upgrades.deployProxy(this.HBnb, [], {initializer: "initialize"});
  await hBNB.deployed();
  let hBnbImplementation = await upgrades.erc1967.getImplementationAddress(hBNB.address);
  console.log("Deployed: hBNB       : " + hBNB.address);
  console.log("Imp                  : " + hBnbImplementation);

  cerosRouter = await upgrades.deployProxy(this.CerosRouter, [_aBNBc, _wBnb, ceaBNBc.address, _aBnbb, ceVault.address, _dex, _pool], {initializer: "initialize"}, {gasLimit: 2000000});
  await cerosRouter.deployed();
  let cerosRouterImplementation = await upgrades.erc1967.getImplementationAddress(cerosRouter.address);
  console.log("Deployed: cerosRouter: " + cerosRouter.address);
  console.log("Imp                  : " + cerosRouterImplementation);

  await ceaBNBc.changeVault(ceVault.address);
  await ceVault.changeRouter(cerosRouter.address);   
  console.log("---Completed: CEROS");

  // Core Deployment
  console.log("Core...");
  let abaci = await this.Abaci.deploy();
  await abaci.deployed();
  console.log("Deployed: abaci      : " + abaci.address);

  let aggregatorAddress;
  if (hre.network.name == "bsc") {
    aggregatorAddress = "0x0567F2323251f0Aab15c8dFb1967E4e8A7D42aeE";
  } else if (hre.network.name == "bsc_testnet") {
    aggregatorAddress = "0x2514895c72f50D8bd4B4F9b1110F0D6bD2c97526";
  }

  const oracle = await this.Oracle.deploy(aggregatorAddress);
  await oracle.deployed();
  console.log("Deployed: oracle     : " + oracle.address);

  const vat = await upgrades.deployProxy(this.Vat, []);
  await vat.deployed();
  let vatImplementation = await upgrades.erc1967.getImplementationAddress(vat.address);
  console.log("Deployed: vat        : " + vat.address);
  console.log("Imp                  : " + vatImplementation);

  const spot = await this.Spot.deploy(vat.address);
  await spot.deployed();
  await spot["file(bytes32,bytes32,address)"](
    ilkCE,
    ethers.utils.formatBytes32String("pip"),
    oracle.address
  );
  await spot["file(bytes32,uint256)"](
    ethers.utils.formatBytes32String("par"),
    "1" + ray
  ); // It means pegged to 1$
  console.log("Deployed: spot       : " + spot.address);

  const hay = await this.Hay.deploy(chainId, "HAY");
  await hay.deployed();
  console.log("Deployed: hay        : " + hay.address);

  const hayJoin = await this.HayJoin.deploy(vat.address, hay.address);
  await hayJoin.deployed();
  console.log("Deployed: hayJoin    : " + hayJoin.address);

  const bnbJoin = await this.GemJoin.deploy(vat.address, ilkCE, ceaBNBc.address);
  await bnbJoin.deployed();
  console.log("Deployed: bnbJoin    : " + bnbJoin.address);

  const jug = await this.Jug.deploy(vat.address);
  await jug.deployed();
  console.log("Deployed: jug        : " + jug.address);

  const vow = await this.Vow.deploy(vat.address, _multiSig);
  await vow.deployed();
  console.log("Deployed: vow        : " + vow.address);

  const dog = await this.Dog.deploy(vat.address);
  await dog.deployed();
  console.log("Deployed: dog        : " + dog.address);

  const clipCE = await this.Clip.deploy(
    vat.address,
    spot.address,
    dog.address,
    ilkCE
  );
  await clipCE.deployed();
  console.log("Deployed: Clip       : " + clipCE.address);

  console.log("Core auth...");

  await vat.rely(bnbJoin.address);
  await vat.rely(spot.address);
  await vat.rely(hayJoin.address);
  await vat.rely(jug.address);
  await vat.rely(dog.address);
  await vat.rely(clipCE.address);

  // REWARDS
  console.log("Rewards...");

  const rewards = await upgrades.deployProxy(this.HelioRewards, [
    vat.address,
    ether("100000000").toString(), // pool limit
  ]);
  await rewards.deployed();
  console.log("Deployed: rewards    : " + rewards.address);

    // No Helio Token & Oracle at the moment
    // const helioOracle = await upgrades.deployProxy(this.HelioOracle, [
    //     "100000000000000000" // 0.1
    // ]);
    // await helioOracle.deployed();
    // console.log("helioOracle deployed to:", helioOracle.address);
    //
    // // initial helio token supply for rewards spending
    // const helioToken = await this.HelioToken.deploy(ether("100000000").toString(), rewards.address);
    // await helioToken.deployed();
    // console.log("helioToken deployed to:", helioToken.address);
    //
    // await rewards.setHelioToken(helioToken.address);
    // await rewards.setOracle(helioOracle.address);
    // await rewards.initPool(ceBNBc, ilkCE, "1000000001847694957439350500"); //6%

  // INTERACTION
  const auctionProxy = await this.AuctionProxy.deploy();
  await auctionProxy.deployed();
  console.log("Deployed: AuctionLib : ", auctionProxy.address);

  this.Interaction = await hre.ethers.getContractFactory("Interaction", {
    unsafeAllow: ["external-library-linking"],
    libraries: {
      AuctionProxy: auctionProxy.address,
    },
  });
  const interaction = await upgrades.deployProxy(
    this.Interaction,
    [
      vat.address,
      spot.address,
      hay.address,
      hayJoin.address,
      jug.address,
      dog.address,
      rewards.address,
    ],
    {
      initializer: "initialize",
      unsafeAllowLinkedLibraries: true,
    }
  );
  await interaction.deployed();
  console.log("Deployed: Interaction:", interaction.address);

  let helioProvider = await upgrades.deployProxy(this.HelioProvider, [hBNB.address, _aBNBc, ceaBNBc.address, cerosRouter.address, interaction.address, _pool], {initializer: "initialize"});
  await helioProvider.deployed();
  let helioProviderImplementation = await upgrades.erc1967.getImplementationAddress(helioProvider.address);
  console.log("Deployed: Provider   : " + helioProvider.address);
  console.log("Imp                  : " + helioProviderImplementation);

  await hBNB.changeMinter(helioProvider.address);
  await cerosRouter.changeProvider(helioProvider.address);

  await vat.rely(interaction.address);
  await rewards.rely(interaction.address);
  await bnbJoin.rely(interaction.address);
  await hayJoin.rely(interaction.address);
  await dog.rely(interaction.address);
  await jug.rely(interaction.address);
  await vow.rely(dog.address);
  await spot.rely(interaction.address);
  await interaction.setHelioProvider(ceaBNBc.address, helioProvider.address);
  // 1.333.... <- 75% borrow ratio
  await interaction.setCollateralType(
    ceaBNBc.address,
    bnbJoin.address,
    ilkCE,
    clipCE.address,
    "1333333333333333333333333333",
    {gasLimit: 200000}
  );

  console.log("Vat config...");
  await vat["file(bytes32,uint256)"](
    ethers.utils.formatBytes32String("Line"),
    "500000000" + rad
  );
  await vat["file(bytes32,bytes32,uint256)"](
    ilkCE,
    ethers.utils.formatBytes32String("line"),
    "50000000" + rad
  );
  await vat["file(bytes32,bytes32,uint256)"](
    ilkCE,
    ethers.utils.formatBytes32String("dust"),
    "1" + ray
  );

  console.log("Jug...");
  let BR = new BN("1000000003022266000000000000").toString(); //10% APY
  await jug["file(bytes32,uint256)"](
    ethers.utils.formatBytes32String("base"),
    BR
  ); // 10% Yearly
  await jug["file(bytes32,address)"](
    ethers.utils.formatBytes32String("vow"),
    vow.address
  );

  console.log("Hay...");
  await hay.rely(hayJoin.address);

  // Initialize Liquidation Module
  console.log("Dog...");
  await dog.rely(clipCE.address);
  await dog["file(bytes32,address)"](
    ethers.utils.formatBytes32String("vow"),
    vow.address
  );
  await dog["file(bytes32,uint256)"](
    ethers.utils.formatBytes32String("Hole"),
    "500" + rad
  );
  await dog["file(bytes32,bytes32,uint256)"](
    ilkCE,
    ethers.utils.formatBytes32String("hole"),
    "250" + rad
  );
  await dog["file(bytes32,bytes32,uint256)"](
    ilkCE,
    ethers.utils.formatBytes32String("chop"),
    "1100000000000000000"
  ); // 10%
  await dog["file(bytes32,bytes32,address)"](
    ilkCE,
    ethers.utils.formatBytes32String("clip"),
    clipCE.address
  );

  console.log("CLIP");
  await clipCE.rely(dog.address);

  await clipCE["file(bytes32,uint256)"](
    ethers.utils.formatBytes32String("buf"),
    "1100000000000000000000000000"
  ); // 10%
  await clipCE["file(bytes32,uint256)"](
    ethers.utils.formatBytes32String("tail"),
    "1800"
  ); // 30mins reset time
  await clipCE["file(bytes32,uint256)"](
    ethers.utils.formatBytes32String("cusp"),
    "600000000000000000000000000"
  ); // 60% reset ratio
  await clipCE["file(bytes32,uint256)"](
    ethers.utils.formatBytes32String("chip"),
    "10000000000000000"
  ); // 1% from vow incentive
  await clipCE["file(bytes32,uint256)"](
    ethers.utils.formatBytes32String("tip"),
    "10" + rad
  ); // 10$ flat fee incentive
  await clipCE["file(bytes32,uint256)"](
    ethers.utils.formatBytes32String("stopped"),
    "0"
  );
  await clipCE["file(bytes32,address)"](
    ethers.utils.formatBytes32String("spotter"),
    spot.address
  );
  await clipCE["file(bytes32,address)"](
    ethers.utils.formatBytes32String("dog"),
    dog.address
  );
  await clipCE["file(bytes32,address)"](
    ethers.utils.formatBytes32String("vow"),
    vow.address
  );
  await clipCE["file(bytes32,address)"](
    ethers.utils.formatBytes32String("calc"),
    abaci.address
  );

  await interaction.poke(ceaBNBc.address, {gasLimit: 200000});
  await interaction.drip(ceaBNBc.address, {gasLimit: 200000});

  const addresses = {
    abaci: abaci.address,
    oracle: oracle.address,
    vat: vat.address,
    vatImplementation: vatImplementation,
    spot: spot.address,
    hay: hay.address,
    hayJoin: hayJoin.address,
    bnbJoin: bnbJoin.address,
    jug: jug.address,
    vow: vow.address,
    dog: dog.address,
    clipCE: clipCE.address,
    rewards: rewards.address,
    // helioOracle: helioOracle.address,
    // helioToken: helioToken.address,
    auctionProxy: auctionProxy.address,
    interaction: interaction.address,
    ceaBNBc: ceaBNBc.address,
    ceaBNBcImplementation: ceaBNBcImplementation,
    ceVault: ceVault.address,
    ceVaultImplementation: ceVaultImplementation,
    hBNB: hBNB.address,
    hBnbImplementation: hBnbImplementation,
    cerosRouter: cerosRouter.address,
    cerosRouterImplementation: cerosRouterImplementation,
    helioProvider: helioProvider.address,
    helioProviderImplementation: helioProviderImplementation
  };
  const jsonAddresses = JSON.stringify(addresses);
  fs.writeFileSync(`./scripts/bsc/${network.name}Addresses.json`, jsonAddresses);
  console.log("Addresses saved to JSON file !");

  console.log("Verifying Ceros...");

  // Verify CEROS implementations
  await hre.run("verify:verify", {
      address: ceaBNBcImplementation,
  });
  await hre.run("verify:verify", {
      address: ceVaultImplementation,
  });
  await hre.run("verify:verify", {
      address: cerosRouterImplementation,
  });
  await hre.run("verify:verify", {
    address: helioProviderImplementation,
});

  // Verify CEROS proxies
  await hre.run("verify:verify", {
      address: ceaBNBc.address,
      constructorArguments: [
          "CEROS aBNBc Vault Token", "ceaBNBc"
      ],
  });
  await hre.run("verify:verify", {
    address: helioProvider.address,
    constructorArguments: [
      hBNB.address, _aBNBc, ceaBNBc.address, cerosRouter.address, interaction.address, _pool
    ],
});

  await hre.run("verify:verify", {
      address: aBNBb.address,
      constructorArguments: [
          deployer.address
      ],
  });
  await hre.run("verify:verify", {
      address: aBNBc.address,
      constructorArguments: [
          aBNBb.address, aBNBb.address
      ],
  });
  await hre.run("verify:verify", {
      address: ceVault.address,
      constructorArguments: [
          "CEROS Vault", ceaBNBc.address, aBNBc.address
      ],
  });
  await hre.run("verify:verify", {
      address: cerosRouter.address,
      constructorArguments: [
          _aBNBc, _wBnb, ceaBNBc.address, _aBnbb, ceVault.address, _dex, _pool
      ],
  });

  await hre.run("verify:verify", {
    address: vatImplAddress,
  });
  await hre.run("verify:verify", {
    address: spot.address,
    constructorArguments: [vat.address],
  });
  await hre.run("verify:verify", {
    address: oracle.address,
  });
  await hre.run("verify:verify", {
    address: abaci.address,
  });
  await hre.run("verify:verify", {
    address: hay.address,
    constructorArguments: [chainId, "HAY"],
  });
  await hre.run("verify:verify", {
    address: hayJoin.address,
    constructorArguments: [vat.address, hay.address],
  });
  await hre.run("verify:verify", {
    address: bnbJoin.address,
    constructorArguments: [vat.address, ilkCE, ceaBNBc.address],
  });
  await hre.run("verify:verify", {
    address: jug.address,
    constructorArguments: [vat.address],
  });
  await hre.run("verify:verify", {
    address: vow.address,
    constructorArguments: [vat.address, _multiSig],
  });
  await hre.run("verify:verify", {
    address: dog.address,
    constructorArguments: [vat.address],
  });
  await hre.run("verify:verify", {
    address: clipCE.address,
    constructorArguments: [
      vat.address,
      spot.address,
      dog.address,
      ilkCE,
    ],
  });
  // Rewards
  let rewardsImplAddress = await upgrades.erc1967.getImplementationAddress(
    rewards.address
  );
  console.log("rewardsImplAddress implementation: ", rewardsImplAddress);
  await hre.run("verify:verify", {
    address: rewardsImplAddress,
  });

    // await hre.run("verify:verify", {
    //     address: helioToken.address,
    //     constructorArguments: [
    //         "100000000",
    //         rewards.address,
    //     ],
    // });

  // Interaction
  await hre.run("verify:verify", {
    address: auctionProxy.address,
  });

  let interactionImplAddress = await upgrades.erc1967.getImplementationAddress(
    interaction.address
  );
  console.log("Interaction implementation: ", interactionImplAddress);

  await hre.run("verify:verify", {
    address: interactionImplAddress,
  });

  console.log("Finished");
}


main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
