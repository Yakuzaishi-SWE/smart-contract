const SinglePayment = artifacts.require("SinglePayment");

module.exports = function(deployer) {
  //deployer.deploy(SinglePayment, "0xFAC4df168B9f306eB8f4E6f54117B27d2B6fC1d8", '1000000000000000000');
  deployer.deploy(SinglePayment);
};