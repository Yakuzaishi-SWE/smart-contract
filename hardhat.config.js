require("@nomiclabs/hardhat-waffle");
require("hardhat-tracer");
require('dotenv').config();
require("solidity-coverage");

task("accounts", "Prints the list of accounts", async (taskArgs, hre) => {
  const accounts = await hre.ethers.getSigners();

  for (const account of accounts) {
    console.log(account.address);
  }
});

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
module.exports = {
  //solidity: "0.8.0",
  solidity: {
    version: "0.8.0",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },
  defaultNetwork: "ftmtestnet",
  networks: {
    ftmtestnet: {
      url: `https://rpc.testnet.fantom.network/`,
      accounts: [`${process.env.owner_PRIVATE_KEY}`, `${process.env.buyer1_PRIVATE_KEY}`, `${process.env.buyer2_PRIVATE_KEY}`, `${process.env.seller1_PRIVATE_KEY}`],
    },
    /*ftmfork: {
      allowUnlimitedContractSize: true,
      forking: {
        url: "https://speedy-nodes-nyc.moralis.io/9e6e79f489193b1865d7185f/fantom/mainnet",
        blockNumber: 40140320,
      },
    },*/
    hardhat: {
      allowUnlimitedContractSize: true,
      forking: {
        url: "https://api.avax.network/ext/bc/C/rpc",
        blockNumber: 14341516,
      },
    },
  }
};
