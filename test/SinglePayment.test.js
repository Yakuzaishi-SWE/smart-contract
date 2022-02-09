// This file is simply an automation of human tests about a correct smart contract creation
// and interaction

// chai provides some useful functions to do tests
const { assert } = require('chai')
const { BN, expectEvent, expectRevert } = require('@openzeppelin/test-helpers')
const { web3 } = require('@openzeppelin/test-helpers/src/setup')
const { latestBlock } = require('@openzeppelin/test-helpers/src/time')

require('chai')
    .use(require('chai-as-promised'))
    .should()

const SinglePayment = artifacts.require('./SinglePayment.sol')

async function getGas(_response) {
    let gasUsed = new BN(_response.receipt.gasUsed);
    gasUsed = gasUsed.mul(new BN(await web3.eth.getGasPrice()))
    return gasUsed;
}

contract('SinglePayment', ([deployer, buyer, seller]) => {
    let singlePayment

    before(async () => {
        singlePayment = await SinglePayment.deployed({ value: web3.utils.toWei('0.5', 'Ether') })
    })

    // check that the deploy is OK
    // checks:
    //      1. correct deploy the contract
    //      2. the contract order counter is zero
    describe('deployment', async () => {
        it('contract deployed successfully', async () => {
            const address = await singlePayment.address
            assert.notEqual(address, 0x0)
            assert.notEqual(address, '')
            assert.notEqual(address, null)
            assert.notEqual(address, undefined)
        })

        it('the initial order number is zero', async () => {
            const orderCount = await singlePayment.getOrderCount();
            assert.equal(orderCount, 0)
        })
    })

    // check that the contract create the order correctly
    // checks:
    //      1. correct deploy the contract
    //      2. the contract order counter is zero
    describe('order creation', async () => {
        // variables updated that we need to do checks
        let result, orderCount, oldContractBalance

        before(async () => {
            oldContractBalance = await web3.eth.getBalance(singlePayment.address)
            oldContractBalance = new BN(oldContractBalance)
            result = await singlePayment.newOrder(seller, web3.utils.toWei('1', 'Ether'), "3F2504E0-4F89-11D3-9A0C-0305E82C3301", { from: buyer, value: web3.utils.toWei('1', 'Ether') })
            orderCount = await singlePayment.getOrderCount()
        })

        it('order created correctly', async () => {
            // SUCCESS
            const event = result.logs[0].args
            assert.equal(orderCount.toString(), event.id.toString())
            assert.equal(event.ownerAddress, buyer, 'owner address is correct')
            assert.equal(event.sellerAddress, seller, "seller address is correct")
            assert.equal(event.amount, web3.utils.toWei('1', 'Ether'), 'amount is correct')
            assert.notEqual(event.unlockCode.toNumber(), 0)
            assert.notEqual(event.unlockCode.toNumber(), null)
            assert.notEqual(event.unlockCode.toNumber(), undefined)
            assert.equal(event.state, 1, 'order is filled')
        })

        it("the contract is filled with the correct amount", async () => {
            const event = result.logs[0].args
            const newContractBalance = await web3.eth.getBalance(singlePayment.address)
            const expectedBalance = oldContractBalance.add(new BN(event.amount))
            assert.equal(expectedBalance.toString(), newContractBalance.toString(), "contract is correctly filled")
        })

        it("FAILURE cases checks", async () => {
            /// FAILURE CASES
            // user tries to insert an amount less than the required amount
            await singlePayment.newOrder(seller, web3.utils.toWei('1', 'Ether'), "3F2504E0-4F89-11D3-9A0C-0305E82C3301", { from: buyer, value: web3.utils.toWei('0.5', 'Ether') }).should.be.rejected

            // user tries to order his item, or send funds to itself
            await singlePayment.newOrder(seller, web3.utils.toWei('1', 'Ether'), "3F2504E0-4F89-11D3-9A0C-0305E82C3301", { from: seller, value: web3.utils.toWei('1', 'Ether') }).should.be.rejected

            // user tries to pass value equal to zero
            await singlePayment.newOrder(seller, 0, "3F2504E0-4F89-11D3-9A0C-0305E82C3301", { from: seller, value: web3.utils.toWei('1', 'Ether') }).should.be.rejected
        
            // user tries to send negative coin value
            await singlePayment.newOrder(seller, -1, "3F2504E0-4F89-11D3-9A0C-0305E82C3301", { from: buyer, value: web3.utils.toWei('1', 'Ether') }).should.be.rejected
        
            // user hasn't enough founds
            await singlePayment.newOrder(seller, web3.utils.toWei('1000', 'Ether'), {from: buyer, value: web3.utils.toWei('1000', 'Ether')}).should.be.rejected
        })

        it('get the correct order infos', async () => {
            const order = await singlePayment.getOrderById(orderCount)
            assert.equal(order.sellerAddress, seller, 'seller address is correct')
            assert.equal(order.ownerAddress, buyer, 'buyer address is correct')
            assert.equal(order.state, 1, "order state is correct")
            assert.equal(order.orderGUID, "3F2504E0-4F89-11D3-9A0C-0305E82C3301", "Order GUID is correct")
        })
    })

    describe('item received confirmation', async () => {
        // variables updated that we need to do checks
        let result, unlockCode

        before(async () => {
            unlockCode = await singlePayment.getUnlockCode(1)
            oldSellerBalance = await web3.eth.getBalance(seller)
            oldSellerBalance = new BN(oldSellerBalance)
        })

        it('order closed and seller received the funds', async () => {
            result = await singlePayment.confirmReceived(1, unlockCode, { from: buyer })
            const event = result.logs[0].args
            const order = await singlePayment.getOrderById(event.id)
            assert.equal(order.state, 2, 'the order is set to closed')

            let newSellerBalance
            newSellerBalance = await web3.eth.getBalance(seller)   // getBalance and then convert him
            newSellerBalance = new BN(newSellerBalance) // BIG NUMBER to do big number addition

            const expectedSellerBalance = oldSellerBalance.add(new BN(order.amount))
            assert.equal(expectedSellerBalance.toString(), newSellerBalance.toString(), "funds correctly send to seller from smart contract")
        })

        it("FAILURE cases checks", async () => {
            // CASE 1: order id isn't correct
            await singlePayment.confirmReceived(2, unlockCode, { from: buyer }).should.be.rejected
            // CASE 2: order state is not set to FILLED
            await singlePayment.confirmReceived(1, unlockCode, { from: buyer }).should.be.rejected
            // CASE 3: order unlock code doesn't match with unlock code saved
            await singlePayment.newOrder(seller, web3.utils.toWei('1', 'Ether'), "3F2504E0-4F89-11D3-9A0C-0305E82C3301", { from: buyer, value: web3.utils.toWei('1', 'Ether') })
            await singlePayment.confirmReceived(2, 12345, { from: buyer }).should.be.rejected
            // CASE 4: order is unlock from an address different from buyer address
            await singlePayment.confirmReceived(1, unlockCode, { from: 0xD66574f6c757EFd7056B20E507f4E29AF21c32ec }).should.be.rejected
        })
    })

    describe('Order owner requires the refund and order is set to canceled', async () => {
        let result, orderCount, oldBuyerBalance, newBuyerBalance

        before(async () => {
            // create a new order with state "FILLED"
            result = await singlePayment.newOrder(seller, web3.utils.toWei('1', 'Ether'), "3F2504E0-4F89-11D3-9A0C-0305E82C3301", { from: buyer, value: web3.utils.toWei('1', 'Ether') })
            orderCount = await singlePayment.getOrderCount()
            // take buyer old balance
            oldBuyerBalance = await web3.eth.getBalance(buyer)
            oldBuyerBalance = new BN(oldBuyerBalance)
        })

        it('order state is set to canceled', async () => {
            // call refund function
            result = await singlePayment.refundFromOwner(orderCount, { from: buyer })
            const event = result.logs[0].args
            const order = await singlePayment.getOrderById(event.id)
            // take buyer new balance
            newBuyerBalance = await web3.eth.getBalance(buyer)
            newBuyerBalance = new BN(newBuyerBalance)

            gasFee = await getGas(result)
            oldBuyerBalance = await oldBuyerBalance.add(new BN(order.amount))
            newBuyerBalance = newBuyerBalance.add(gasFee)

            assert.equal(order.state, 3, 'the order is set to canceled')
        })

        /**
         * WARNING !!!!
         * 
         * when the test is running under coverage test, it can distort gas consumption so the test
         * that check exact balance values is skipped.
         * 
         */
        it("check buyer balance after refund [ @skip-on-coverage ]", async function () {
            //it("check buyer balance after refund", async function() {
            assert.equal(oldBuyerBalance.toString(), newBuyerBalance.toString(), "funds correctly send to buyer from smart contract")
        })
    })

    describe('Order seller requires the refund and order is set to canceled', async () => {
        let result, orderCount, oldBuyerBalance, newBuyerBalance

        before(async () => {
            // create a new order with state "FILLED"
            result = await singlePayment.newOrder(seller, web3.utils.toWei('1', 'Ether'), "3F2504E0-4F89-11D3-9A0C-0305E82C3301", { from: buyer, value: web3.utils.toWei('1', 'Ether') })
            orderCount = await singlePayment.getOrderCount()
            // take buyer old balance
            oldBuyerBalance = await web3.eth.getBalance(buyer)
            oldBuyerBalance = new BN(oldBuyerBalance)
        })

        it('order state is set to canceled', async () => {
            // call refund function
            result = await singlePayment.refundFromSeller(orderCount, { from: seller })
            const event = result.logs[0].args
            const order = await singlePayment.getOrderById(event.id)
            // take buyer new balance
            newBuyerBalance = await web3.eth.getBalance(buyer)
            newBuyerBalance = new BN(newBuyerBalance)

            oldBuyerBalance = await oldBuyerBalance.add(new BN(order.amount))

            assert.equal(order.state, 3, 'the order is set to canceled')
        })

        it("check buyer balance after refund", async function () {
            assert.equal(oldBuyerBalance.toString(), newBuyerBalance.toString(), "funds correctly send to buyer from smart contract")
        })

        it("FAILURE CASES checks", async function () {
            await singlePayment.refundFromSeller(orderCount, { from: deployer }).should.be.rejected
        })
    })

    describe('check getter functions', async () => {
        it("check contractBalance()", async function () {
            const realContractBalance = await web3.eth.getBalance(singlePayment.address)
            const result = await singlePayment.contractBalance()
            assert.equal(realContractBalance, result, "Contract balance is correct")
        })

        it("check getOwnerAddress(uint)", async function () {
            const result = await singlePayment.getOwnerAddress(1)
            assert.equal(buyer, result, "Owner address is correct")
        })

        it("check getSellerAddress(uint)", async function () {
            const result = await singlePayment.getSellerAddress(1)
            assert.equal(seller, result, "Seller address is correct")
        })
        it("check getAmountToPay(uint)", async function () {
            const realAmount = await web3.utils.toWei('1', 'Ether')
            const result = await singlePayment.getAmountToPay(1)
            assert.equal(realAmount, result, "Amount to pay is correct")
        })

        it("check getOrderState(uint)", async function () {
            const result = await singlePayment.getOrderState(2)
            assert.equal(1, result, "Order state is correct")
        })

        
        it("check getOrderById(uint)", async function() {
            const order = await singlePayment.getOrderById(1)
            const amount = await web3.utils.toWei('1', 'Ether')
            const unlockCode =  await singlePayment.getUnlockCode(1)
            const state = await singlePayment.getOrderState(1)
            assert.equal(order.sellerAddress, seller, "Seller address is correct")
            assert.equal(order.ownerAddress, buyer, "OwnerAddress code is correct")
            assert.equal(order.amount, amount, "amount is correct")
            assert.equal(order.unlockCode, unlockCode, "Unlock code is correct")
            assert.equal(order.state, state, "state is correct")
        })

        it("check getOrdersByBuyer(address)", async function() {
            const buyer_orders = await singlePayment.getOrdersByBuyer(buyer)

            assert.equal(buyer_orders.length, 4, "the orders number is correct")
            for (let i = 0; i < buyer_orders.length; i++) {
                assert.equal(buyer_orders[i].sellerAddress, seller, "The seller address is correct")
                assert.equal(buyer_orders[i].ownerAddress, buyer, "Owner address matches with the buyer address")
                if(i==0)
                    assert.equal(buyer_orders[i].state, 2, "the order 1 has state closed")
                else {
                    if(i == 1) assert.equal(buyer_orders[i].state, 1, "the order 1 has state filled")
                    else assert.equal(buyer_orders[i].state, 3, "the other orders states are set to canceled")
                }
            }
        })

        it("check getOrdersBySeller(address)", async function() {
            const seller_orders = await singlePayment.getOrdersBySeller(seller)
            
            assert.equal(seller_orders.length, 4, "the orders number is correct")
            for (let i = 0; i < seller_orders.length; i++) {
                assert.equal(seller_orders[i].sellerAddress, seller, "The seller address is correct")
                assert.equal(seller_orders[i].ownerAddress, buyer, "Owner address matches with the buyer address")
                if(i==0)
                    assert.equal(seller_orders[i].state, 2, "the order 1 has state closed")
                else {
                    if(i == 1) assert.equal(seller_orders[i].state, 1, "the order 1 has state filled")
                    else assert.equal(seller_orders[i].state, 3, "the other orders states are set to canceled")
                }
            }
            
        })
        
        // it("check getUnlockCode(uint)", async function () {

        //     const result = await singlePayment.getUnlockCode(1)
        //     assert.equal(, result, "Unlock code is correct")
        // })

    })
})