const HDWalletProvider = require("@truffle/hdwallet-provider");
const mnemonicPhrase = "original priority brass violin feed episode seat used guilt amateur reward coin";

// account: 0x94A4244d024602e13C5f4f1198ff5C2caA676703;
// contract: 0xD5D4f2Dd47B41f4eACBF04cC4769194ef713AAB2

module.exports = {
  networks: {
    // Useful for testing. The `development` name is special - truffle uses it by default
    // if it's defined here and no other network is specified at the command line.
    // You should run a client (like ganache-cli, geth or parity) in a separate terminal
    // tab if you use this network and you must also set the `host`, `port` and `network_id`
    // options below to some value.
    //
    development: {
       host: "localhost",     // Localhost (default: none)
       port: 8545,            // Standard Ethereum port (default: none)
       network_id: "*",       // Any network (default: none)
    },
    /*
    FTMtestnet: {
      provider: () => 
       new HDWalletProvider({
         mnemonic: {
           phrase: mnemonicPhrase
         }, 
         providerOrUrl: "https://rpc.testnet.fantom.network/",
         numberOfAddresses: 1,
         shareNonce: true,
         derivationPath: "m/44'/1'/0'/0/"
       }),
      network_id: 4002
   }
   */
  },

  // Set default mocha options here, use special reporters etc.
  mocha: {
    // timeout: 100000
    grep: "@skip-on-coverage",  // Find everything with this tag
    invert: true                // Run the grep's inverse set.
  },

  // Configure directories
  contracts_directory: './contracts/',
  //contracts_build_directory: './abis/',

  // Configure your compilers
  compilers: {
    solc: {
      version: "0.8.7",    // Fetch exact version from solc-bin (default: truffle's version)
      // docker: true,        // Use "0.5.1" you've installed locally with docker (default: false)
      settings: {          // See the solidity docs for advice about optimization and evmVersion
        optimizer: {
          enabled: true,
          runs: 200
        },
      //  evmVersion: "byzantium"
      }
    }
  },

  plugins: ["solidity-coverage"]

};
