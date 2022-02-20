const ShopChain = artifacts.require("ShopChain");

module.exports = function(deployer) {
  deployer.deploy(ShopChain);
};