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
const ether_quarter = web3.utils.toWei('.25', 'Ether')
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

        it('user sends import at moneybox creation', async () => {
            await contract.newOrder(seller, ether_1, id1, { from: buyer, value: ether_half })

            const payments = await contract.getMoneyBoxPayments(id1)

            assert.equal(payments.length, 1, "The moneybox doesn't have the right number of payments")
            assert.equal(payments[0].amount, ether_half, "The value isn't correct")            
        })

        it("new fee transfer into moneybox", async () => {
            await contract.newOrder(seller, ether_1, id1, { from: buyer })
            await contract.newPayment(id1, ether_half, { from: buyer2, value: ether_half })
            const amount_to_fill = await contract.getAmountToFill(id1)  
            assert.equal(amount_to_fill, ether_half, "The moneybox doesn't have the right amount to pay")
        });

        it("refund all fee transfers from moneybox owner", async () => {
            // I'll check that the buyer2 balance is the same before the fee payment and after the refund
            await contract.newOrder(seller, ether_1, id1, { from: buyer })
            await contract.newPayment(id1, ether_quarter, { from: buyer2, value: ether_quarter })
            const oldBuyerBalance = BigNumber(await web3.eth.getBalance(buyer2))
            
            // I call the refund function with buyer address to bypass gas price check
            await contract.refund(id1, { from: buyer })
            const newBuyerBalance = BigNumber(await web3.eth.getBalance(buyer2))
            let expectedBuyerBalance = oldBuyerBalance.plus(ether_quarter)
            
            assert.equal(newBuyerBalance.toString(), expectedBuyerBalance.toString())
        });

        it("refund all fee transfers from moneybox seller", async () => {
            // I'll check that the buyer2 balance is the same before the fee payment and after the refund
            await contract.newOrder(seller, ether_1, id1, { from: buyer })
            await contract.newPayment(id1, ether_quarter, { from: buyer2, value: ether_quarter })
            const oldBuyerBalance = BigNumber(await web3.eth.getBalance(buyer2))
            
            // I call the refund function with buyer address to bypass gas price check
            await contract.refund(id1, { from: seller })
            const newBuyerBalance = BigNumber(await web3.eth.getBalance(buyer2))
            let expectedBuyerBalance = oldBuyerBalance.plus(ether_quarter)
            
            assert.equal(newBuyerBalance.toString(), expectedBuyerBalance.toString())
        });

        describe("failure cases", () =>{
            it("should not have insufficent value", async () => {
                await contract.newOrder(seller, ether_1, id1, { from: buyer })
                await contract.newPayment(id1, ether_half, { from: buyer2, value: 1 }).should.be.rejected;
            })

            it("buyer tries to call refund from a closed moneybox", async() => {
                await contract.newOrder(seller, ether_1, id1, { from: buyer })
                await contract.newPayment(id1, ether_1, { from: buyer2, value: ether_1 })
                // the moneybox now is in filled state
                const unlockCode = await contract.getUnlockCode(id1)
                await contract.confirmReceived(id1, unlockCode, { from: buyer })

                await contract.refund(id1, { from: buyer }).should.be.rejected                
            })

            it("negative fee payment", async() => {
                await contract.newOrder(seller, ether_1, id1, { from: buyer })
                await contract.newPayment(id1, -ether_1, { from: buyer2, value: ether_1 }).should.be.rejected
            })
        })
    })

    describe("check getter functions", () => {
        it("check getMoneyBoxPayments(string)", async () => {
            await contract.newOrder(seller, ether_1, id1, { from: buyer })
            await contract.newPayment(id1, ether_quarter, { from: buyer, value: ether_quarter })
            await contract.newPayment(id1, ether_half, { from: buyer2, value: ether_half })

            const payments = await contract.getMoneyBoxPayments(id1)

            assert.equal(payments[0].from, buyer, 'First fee id is correct')
            assert.equal(payments[0].amount, ether_quarter, 'First fee amount is correct')
           
            assert.equal(payments[1].from, buyer2, 'Second fee id is correct')
            assert.equal(payments[1].amount, ether_half, 'Second fee amount is correct')
        })
        
        it("check getAmountToFill(string)", async () => {
            await contract.newOrder(seller, ether_1, id1, { from: buyer })
            const amount_to_fill = await contract.getAmountToFill(id1)

            assert.equal(amount_to_fill, ether_1, 'The moneybox hasn\'t the right amount to pay')
        })
        
        it("check getAllBuyerOrders(supercontract, _buyerAddress)", async () => {
            await contract.newOrder(seller, ether_1, id1, { from: buyer })
            await order_manager.newOrder(seller, ether_1, id2, { from: buyer, value: ether_1 })
            
            // this method gets the super_contract orders concatenated to moneybox_contract!!!
            const buyer_orders = await contract.getAllBuyerOrders(order_manager.address, buyer)
            assert.equal(buyer_orders.length, 2, "the orders number is correct")
            
            const order1 = buyer_orders[0].order;
            assert.equal(buyer_orders[0].id, id2, "The order id is correct")
            assert.equal(order1.sellerAddress, seller, "The seller address is correct")
            assert.equal(order1.ownerAddress, buyer, "Owner address matches with the buyer address")
        
            const order2 = buyer_orders[1].order;
            assert.equal(buyer_orders[1].id, id1, "The order id is correct")
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

        it("check getMoneyBoxesByParticipantAddress(address)", async () => {
            await contract.newOrder(seller, ether_1, id1, { from: buyer })
            await contract.newPayment(id1, ether_quarter, { from: buyer2, value: ether_quarter })
            await contract.newPayment(id1, ether_quarter, { from: buyer2, value: ether_quarter })
            await contract.newPayment(id1, ether_quarter, { from: buyer, value: ether_quarter })

            const participantMoneyBoxes1 = await contract.getMoneyBoxesByParticipantAddress(buyer)
            const participantMoneyBoxes2 = await contract.getMoneyBoxesByParticipantAddress(buyer2)

            assert.equal(participantMoneyBoxes1.length, 1, 'The number of moneybox participation filtered by buyer is correct')
            assert.equal(participantMoneyBoxes2.length, 2, 'The number of moneybox participation filtered by buyer2 is correct')

            const moneybox1 = participantMoneyBoxes1[0];
            const moneybox2 = participantMoneyBoxes2[0];

            assert.equal(moneybox1.id, id1, "The moneybox id is correct")
            assert.equal(moneybox1.order['sellerAddress'], seller, "The seller address is correct")
            assert.equal(moneybox1.order["amount"], ether_1, "The moneybox amount is correct")
        
            assert.equal(moneybox2.id, id1, "The moneybox id is correct")
            assert.equal(moneybox2.order['sellerAddress'], seller, "The seller address is correct")
            assert.equal(moneybox2.order["amount"], ether_1, "The moneybox amount is correct")
        })
    })
});