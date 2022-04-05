const { assert } = require('chai')
const { BigNumber } = require('bignumber.js');
const HDWalletProvider = require('@truffle/hdwallet-provider');

require('chai')
    .use(require('chai-as-promised'))
    .should()

const OrderManager = artifacts.require('./OrderManager.sol')
const MoneyBoxManager = artifacts.require('./MoneyBoxManager.sol')

const OrderState = {
    NOT_CREATED: 0,
    CREATED: 1,
    FILLED: 2,
    CLOSED: 3,
    CANCELLED: 4,
}

const id1 = "3F2504E0-4F89-11D3-9A0C-0305E82C3301";
const id2 = "3F2504E0-4F89-11D3-9A0C-0305E82C3312";
const ether_1 = web3.utils.toWei('1', 'Ether');
const ether_half = web3.utils.toWei('.5', 'Ether');
const ether_big = web3.utils.toWei('1000', 'Ether');

async function getGas(_response) {
    let gasUsed = new BigNumber(_response.receipt.gasUsed);
    gasUsed = gasUsed.times(new BigNumber(await web3.eth.getGasPrice()))
    return gasUsed;
}

contract('OrderManager SmartContract', ([deployer, buyer, seller, buyer2]) => {
    let contract, mb_contract;

    beforeEach(async () => {
        contract = await OrderManager.new();
    });

    it("should have the initial order number to 0", async () => {
        const count = await contract.getOrderCount();

        assert.equal(count, 0)
    });

    describe("single payment order", () => {

        it('order created correctly', async () => {
            // SUCCESS
            await contract.newOrder(seller, ether_1, id1, { from: buyer, value: ether_1 })

            const order = await contract.getOrderById(id1);

            assert.equal(order.ownerAddress, buyer, 'owner address isn\'t correct')
            assert.equal(order.sellerAddress, seller, "seller address isn\'t correct")
            assert.equal(order.amount, ether_1, 'amount isn\'t correct')
            assert.notEqual(order.unlockCode, 0)
            assert.equal(order.state, OrderState.FILLED, 'order isn\'t in filled state')
        })

        it("the contract is filled with the correct amount", async () => {
            const startBalance = BigNumber(await web3.eth.getBalance(contract.address));
            await contract.newOrder(seller, ether_1, id1, { from: buyer, value: ether_1 })

            const order = await contract.getOrderById(id1);

            const newContractBalance = await web3.eth.getBalance(contract.address)
            const expectedBalance = startBalance.plus(BigNumber(order.amount))
            assert.equal(expectedBalance.toString(), newContractBalance.toString(), "contract is correctly filled")
        })

        describe("failure cases", () => {
            it("user tries to insert an amount less than the required amount", async () => {
                await contract.newOrder(seller, ether_1, id2, { from: buyer, value: ether_half }).should.be.rejected
            })

            it("user tries to order his item, or send funds to itself", async () => {
                await contract.newOrder(seller, ether_1, id2, { from: seller, value: ether_1 }).should.be.rejected
            })

            it("user tries to pass value equal to zero", async () => {
                await contract.newOrder(seller, 0, id2, { from: seller, value: ether_1 }).should.be.rejected
            })

            it("user tries to send negative coin value", async () => {
                await contract.newOrder(seller, -1, id2, { from: buyer, value: ether_1 }).should.be.rejected
            })

            it("user hasn't enough founds", async () => {
                await contract.newOrder(seller, ether_big, id2, { from: buyer, value: ether_big }).should.be.rejected
            })

            it("front end require the creation of an order with the same order id", async () => {
                await contract.newOrder(seller, ether_1, id1, { from: buyer, value: ether_1 })
                await contract.newOrder(seller, ether_1, id1, { from: buyer, value: ether_1 }).should.be.rejected
            })
        })

        it('get the correct order infos', async () => {
            await contract.newOrder(seller, ether_1, id1, { from: buyer, value: ether_1 })
            const order = await contract.getOrderById(id1);
            assert.equal(order.sellerAddress, seller, 'seller address is correct')
            assert.equal(order.ownerAddress, buyer, 'buyer address is correct')
            assert.equal(order.state, OrderState.FILLED, "order state is correct")
        })
    });

    describe("order confirmation", () => {

        it("should update state", async () => {
            await contract.newOrder(seller, ether_1, id1, { from: buyer, value: ether_1 })
            const unlockCode = await contract.getUnlockCode(id1);

            await contract.confirmReceived(id1, unlockCode, { from: buyer });
            const order = await contract.getOrderById(id1);
            assert.equal(order.state, OrderState.CLOSED, 'the order is set to closed')
        })

        it("should realase payment to seller", async () => {
            await contract.newOrder(seller, ether_1, id1, { from: buyer, value: ether_1 });
            const order = await contract.getOrderById(id1);
            const unlockCode = await contract.getUnlockCode(id1);
            const oldSellerBalance = BigNumber(await web3.eth.getBalance(seller));

            await contract.confirmReceived(id1, unlockCode, { from: buyer });
            const newSellerBalance = BigNumber(await web3.eth.getBalance(seller));
            const expectedSellerBalance = oldSellerBalance.plus(BigNumber(order.amount))
            assert.equal(expectedSellerBalance.toString(), newSellerBalance.toString(), "funds correctly send to seller from smart contract")
        })

        describe("failure cases", async () => {

            beforeEach(async () => {
                await contract.newOrder(seller, ether_1, id1, { from: buyer, value: ether_1 });
            });

            it("order id isn't correct", async () => {    
                const unlockCode = await contract.getUnlockCode(id1);
                await contract.confirmReceived(id2, unlockCode, { from: buyer }).should.be.rejected
            });

            it("order unlock code doesn't match with unlock code saved", async () => {
                await contract.confirmReceived(id1, 12345, { from: buyer }).should.be.rejected
            })

            it("order is unlock from an address different from buyer address", async () => {
                const unlockCode = await contract.getUnlockCode(id1);
                await contract.confirmReceived(id1, unlockCode, { from: seller }).should.be.rejected
            })
        });
    });

    describe("order refund", async () => {

        describe("should set the cancelled state", () => {
            it("from buyer", async () => {
                await contract.newOrder(seller, ether_1, id1, { from: buyer, value: ether_1 })

                await contract.refund(id1, { from: buyer });
                const order = await contract.getOrderById(id1);

                assert.equal(order.state, OrderState.CANCELLED);
            })

            it("from seller", async () => {
                await contract.newOrder(seller, ether_1, id1, { from: buyer, value: ether_1 })

                await contract.refund(id1, { from: seller });
                const order = await contract.getOrderById(id1);

                assert.equal(order.state, OrderState.CANCELLED);
            })
        })


        describe("should move funds back to the buyer", async () => {
            it("from buyer  [ @skip-on-coverage ]", async () => {
                await contract.newOrder(seller, ether_1, id1, { from: buyer, value: ether_1 })
                const oldBuyerBalance = BigNumber(await web3.eth.getBalance(buyer));

                const result = await contract.refund(id1, { from: buyer });
                const newBuyerBalance = BigNumber(await web3.eth.getBalance(buyer));
                const gas = BigNumber(result.receipt.gasUsed).times(parseInt(result.receipt.effectiveGasPrice.slice(2), 16));
                const { amount } = await contract.getOrderById(id1);

                const expectedBalance = oldBuyerBalance.plus(amount).minus(gas);
                assert.equal(newBuyerBalance.toString(), expectedBalance.toString());
            })

            it("from seller", async () => {
                await contract.newOrder(seller, ether_1, id1, { from: buyer, value: ether_1 })
                const oldBuyerBalance = BigNumber(await web3.eth.getBalance(buyer));

                await contract.refund(id1, { from: seller });
                
                const { amount } = await contract.getOrderById(id1);
                const newBuyerBalance = BigNumber(await web3.eth.getBalance(buyer));

                const expectedBalance = oldBuyerBalance.plus(amount);
                assert.equal(newBuyerBalance.toString(), expectedBalance.toString());
            })
        })


        describe("failure cases", () => {

            it("should not refund an order already closed", async () => {
                await contract.newOrder(seller, ether_1, id1, { from: buyer, value: ether_1 })
                unlockCode = await contract.getUnlockCode(id1);
                await contract.confirmReceived(id1, unlockCode, { from: buyer });

                await contract.refund(id1, { from: buyer }).should.be.rejected;
            })

            it("should be the owner or the seller", async () => {
                await contract.newOrder(seller, ether_1, id1, { from: buyer, value: ether_1 })
                await contract.refund(id1, { from: buyer2 }).should.be.rejected;              
            })

        })
    });

    describe('check getter functions', async () => {
        it("check contractBalance()", async function () {
            await contract.newOrder(seller, ether_1, id1, { from: buyer, value: ether_1 })
            const realContractBalance = await web3.eth.getBalance(contract.address)
            const result = await contract.contractBalance()
            assert.equal(realContractBalance, result, "Contract balance is correct")
        })

        it("check getOwnerAddress(string)", async () => {
            await contract.newOrder(seller, ether_1, id1, { from: buyer, value: ether_1 })
            const result = await contract.getOwnerAddress(id1)
            assert.equal(buyer, result, "Owner address is correct")
        })

        it("check getSellerAddress(string)", async () => {
            await contract.newOrder(seller, ether_1, id1, { from: buyer, value: ether_1 })
            const result = await contract.getSellerAddress(id1)
            assert.equal(seller, result, "Seller address is correct")
        })

        it("check getAmountToPay(string)", async () => {
            await contract.newOrder(seller, ether_1, id1, { from: buyer, value: ether_1 })
            const realAmount = ether_1;
            const result = await contract.getAmountToPay(id1)
            assert.equal(realAmount.toString(), result.toString(), "Amount to pay is correct")
        })

        it("check getOrderState(string)", async function () {
            await contract.newOrder(seller, ether_1, id1, { from: buyer, value: ether_1 })
            const result = await contract.getOrderState(id1)
            assert.equal(OrderState.FILLED, result, "Order state is correct")
        })


        it("check getOrderById(string)", async function () {
            await contract.newOrder(seller, ether_1, id1, { from: buyer, value: ether_1 })

            const order = await contract.getOrderById(id1)
            const amount = ether_1;
            const unlockCode = await contract.getUnlockCode(id1)
            const state = await contract.getOrderState(id1)
            assert.equal(order.sellerAddress, seller, "Seller address is correct")
            assert.equal(order.ownerAddress, buyer, "OwnerAddress code is correct")
            assert.equal(order.amount, amount, "amount is correct")
            assert.equal(order.unlockCode, unlockCode, "Unlock code is correct")
            assert.equal(order.state, state, "state is correct")
        })

        it("check getOrdersByBuyer(address)", async function () {
            await contract.newOrder(seller, ether_1, id1, { from: buyer, value: ether_1 })

            const buyer_orders = await contract.getOrdersByBuyer(buyer)
            assert.equal(buyer_orders.length, 1, "the orders number is correct")

            // test two orders
            const order1 = buyer_orders[0].order;
            assert.equal(buyer_orders[0].id, id1, "The order1 id is correct")
            assert.equal(order1.sellerAddress, seller, "The seller address is correct")
            assert.equal(order1.ownerAddress, buyer, "Owner address matches with the buyer address")
            assert.equal(order1.state, OrderState.FILLED, "The order state matches with the FILLED state")
        })

        it("check getOrdersBySeller(address)", async function () {
            await contract.newOrder(seller, ether_1, id1, { from: buyer, value: ether_1 })

            const seller_orders = await contract.getOrdersBySeller(seller)
            assert.equal(seller_orders.length, 1, "the orders number is correct")

            // test two orders
            const order1 = seller_orders[0].order;
            assert.equal(seller_orders[0].id, id1, "The order1 id is correct")
            assert.equal(order1.sellerAddress, seller, "The seller address is correct")
            assert.equal(order1.ownerAddress, buyer, "Owner address matches with the buyer address")
            assert.equal(order1.state, OrderState.FILLED, "The order state matches with the FILLED state")
        })
    });
});