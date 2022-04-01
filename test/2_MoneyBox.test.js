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

contract('MoneyBox SmartContract', ([deployer, buyer, seller, buyer2]) => {
    let contract, order_manager;

    beforeEach(async () => {
        order_manager = await OrderManager.new();
        contract = await MoneyBoxManager.new();
    });

    it("should have the initial order number to 0", async () => {
        const count = await contract.getOrderCount();

        assert.equal(count, 0)
    });

    describe("moneybox management", () => {

        it('moneybox created correctly', async () => {
            await contract.newOrder(seller, ether_1, id1, { from: buyer })

            const moneybox = await contract.getOrderById(id1)

            // Check moneybox data
            assert.equal(moneybox.ownerAddress, buyer, 'owner address isn\'t correct')
            assert.equal(moneybox.sellerAddress, seller, "seller address isn\'t correct")
            assert.equal(moneybox.amount, ether_1, 'amount isn\'t correct')
            assert.notEqual(moneybox.unlockCode, 0)
            assert.equal(moneybox.state, OrderState.CREATED, 'order isn\'t in created state')
        })

        it("new fee transfer into moneybox", async () => {
            await contract.newOrder(seller, ether_1, id1, { from: buyer })
            await contract.newPayment(id1, ether_half, { from: buyer2, value: ether_half })
            const amount_to_fill = await contract.getAmountToFill(id1)  
            assert.equal(amount_to_fill, ether_half, "The moneybox doesn't have the right amount to pay")
        });

        describe("failure cases", () =>{
            it("should not have insufficent value", async () => {
                await contract.newOrder(seller, ether_1, id1, { from: buyer })
                await contract.newPayment(id1, ether_half, { from: buyer2, value: 1 }).should.be.rejected;
            })
        })
    })

    describe("check getter functions", () => {
        it("check getAmountToFill(string)", async () => {
            await contract.newOrder(seller, ether_1, id1, { from: buyer })
            const amount_to_fill = await contract.getAmountToFill(id1)

            assert.equal(amount_to_fill, ether_1, 'The moneybox hasn\'t the right amount to pay')
        })

        /*it("check getMoneyBoxPayments", async function () {
            await contract.newOrder(seller, ether_1, id1, { from: buyer })
            const payment1 = await contract.newPayment(id1, ether_half,{ from: buyer2, value: ether_half })
            //const payment2 = await contract.newPayment(id1, ether_big,{ from: buyer, value: ether_big })
            const moneybox = await getOrderById(id1)
            assert.equal(moneybox.getMoneyBoxPayments(payment1).from, buyer2, "buyer is correct")
        })*/
        
        it("check getAllBuyerOrders(supercontract, _buyerAddress)", async () => {
            await contract.newOrder(seller, ether_1, id1, { from: buyer })
            await contract.newOrder(seller, ether_1, id2, { from: buyer })
            
            const buyer_orders = await contract.getAllBuyerOrders(order_manager.address, buyer)
            assert.equal(buyer_orders.length, 2, "the orders number is correct")
            
            const order1 = buyer_orders[0].order;
            assert.equal(buyer_orders[0].id, id1, "The order id is correct")
            assert.equal(order1.sellerAddress, seller, "The seller address is correct")
            assert.equal(order1.ownerAddress, buyer, "Owner address matches with the buyer address")
        })

        it("check getAllSellerOrders(OrderManager, address)", async () => {
            await contract.newOrder(seller, ether_1, id1, { from: buyer })
            await contract.newOrder(seller, ether_1, id2, { from: buyer2 })
            
            const seller_orders = await contract.getAllSellerOrders(order_manager.address, seller)
            assert.equal(seller_orders.length, 2, "the orders number is correct")
            
            const order1 = seller_orders[0].order;
            assert.equal(seller_orders[0].id, id1, "The order id is correct")
            assert.equal(order1.sellerAddress, seller, "The seller address is correct")
            assert.equal(order1.ownerAddress, buyer, "Owner address matches with the buyer address")
            const order2 = seller_orders[1].order;
            assert.equal(seller_orders[1].id, id2, "The order id is correct")
            assert.equal(order2.sellerAddress, seller, "The seller address is correct")
            assert.equal(order2.ownerAddress, buyer2, "Owner address matches with the buyer address")
        })

    })

    it("begginer test", async () => {
        
        /*
        const result = await mb_contract.newOrder(seller, ether_1, id1, {from: buyer})
        console.log(result)
        await mb_contract.newOrder(seller, ether_half, "00000-00000", {from: buyer2})
        await sp_contract.newOrder(seller, ether_1, id2, {from: buyer2, value: ether_1})
        await sp_contract.newOrder(seller, ether_1, "123456", {from: buyer2, value: ether_1})
        await sp_contract.newOrder(seller, ether_1, "123459", {from: buyer2, value: ether_1})

        //order_count1 = await mb_contract.getOrderCount()
        //order_count2 = await sp_contract.getOrderCount()

        orders = await mb_contract.getAllOrders(sp_contract.address, buyer2)
        */
        //console.log("MoneyBox: ", orders)
        /*
        const moneybox1 = await mb_contract.getOrderById(id1)
        mb_payments = await mb_contract.getMoneyBoxPayments(id1)
        
        console.log(moneybox1.ownerAddress, "\n", mb_payments)

        await mb_contract.newPayment(id1, ether_half, {from: buyer2, value: ether_half})
        mb_payments = await mb_contract.getMoneyBoxPayments(id1)

        console.log(mb_payments)*/
        
    })
});