const OrderManager = artifacts.require("OrderManager");
const MoneyBoxManager = artifacts.require("MoneyBoxManager");

module.exports = function(deployer) {
  deployer.deploy(OrderManager);
  deployer.deploy(MoneyBoxManager);
};