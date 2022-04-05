//const ShopChain = artifacts.require("ShopChain");
const OrderManager = artifacts.require("OrderManager");
const MoneyBoxManager = artifacts.require("MoneyBoxManager");

module.exports = function(deployer) {
  //deployer.deploy(ShopChain);
  deployer.deploy(OrderManager);
  deployer.deploy(MoneyBoxManager);
};