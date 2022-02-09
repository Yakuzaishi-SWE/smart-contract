const SinglePayment = artifacts.require("SinglePayment");

module.exports = function(deployer) {
  deployer.deploy(SinglePayment);
};