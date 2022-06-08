/********************************************
 *                  IMPORTS
 ********************************************/

const { expect, assert } = require("chai");
const { BigNumber } = require("ethers");
const { ethers, waffle } = require("hardhat");  // ethers are provided globally, this import is for more readable code

const IUniswapV2Router02ABI = require("./UniSwapRouter_ABI.json");
const USDT_ERC20ABI = require("./USDT_ABI.json");

// const values
const USDT_ADDRESS = "0xA70A572aa5489a5CDd0dAA3bF0Cf440A92f50402";
const WFTM_ADDRESS = "0xf1277d1Ed8AD466beddF92ef448A132661956621";
const UniSwapRouter_ADDRESS = "0xa6AD18C2aC47803E193F75c3677b14BF19B94883";

const id1 = "3F2504E0-4F89-11D3-9A0C-0305E82C3301";
const id2 = "3F2504E0-4F89-11D3-9A0C-0305E82C3312";

const ether_1 = etherToWei('1');
const ether_half = etherToWei('.5');
const ether_big = etherToWei('1000');
const ether_small = etherToWei('0.03');

// OrderState enum
const OrderState = {
    NOT_CREATED: 0,
    CREATED: 1,
    FILLED: 2,
    CLOSED: 3,
    CANCELLED: 4,
}

// variables
let IUniswapV2Router02, STABLECOIN, contract, order_manager;

// create the array that contains the pair tokens
const path = [
    WFTM_ADDRESS,
    USDT_ADDRESS
];

/*********************************************
 * 
 *            UTILITIES FUNCTIONS
 * 
 ********************************************/

function etherToWei(_ether) {
    return ethers.utils.parseEther(_ether);
}

function weiToEther(_wei) {
    return ethers.utils.formatEther(_wei);
}

function FTMtoUSDT(_ftm) {
    return _ftm.mul(3);
}

async function getGas(_response) {
    let gasPrice = _response.gasPrice;
    _response = await _response.wait();
    return _response.gasUsed.mul(gasPrice);
}

async function newOrderFTMtoUSDT(amountOut, buyer, seller, id, paymentAmount = BigNumber.from(0)) {
    // calculate the conversion total amount
    let msg_value = await IUniswapV2Router02.getAmountsIn(amountOut, path);
    total_ftm_to_pay = msg_value[0];

    if (paymentAmount > BigNumber.from(0)) {
        // calculate the conversion amount for a payment
        let msg_value = await IUniswapV2Router02.getAmountsIn(paymentAmount, path);
        payment_ftm_to_pay = msg_value[0];
        let tx = await contract
            .connect(buyer)
            .newOrder(seller.address, total_ftm_to_pay, [amountOut, paymentAmount], id, { value: payment_ftm_to_pay });
        return [tx, payment_ftm_to_pay];
    } else {
        let tx = await contract
            .connect(buyer)
            .newOrder(seller.address, total_ftm_to_pay, [amountOut], id);

        return [tx, BigNumber.from(0)];
    }
}

async function SingleOrderFTMtoUSDT(amountOut, buyer, seller, id) {
    // calculate the conversion amount
    let msg_value = await IUniswapV2Router02.getAmountsIn(amountOut, path);
    msg_value = msg_value[0];
    //console.log("FTM: ", msg_value, " USDT: ", amountOut);
    let tx = await order_manager
        .connect(buyer)
        .newOrder(seller.address, msg_value, amountOut, id, { value: msg_value });
    return [tx, msg_value];
}

async function newPaymentFTMtoUSDT(moneyboxId, amountIn, amountOut, owner) {
    // calculate the conversion amount
    let msg_value = await IUniswapV2Router02.getAmountsIn(amountOut, path);
    ftm_to_pay = msg_value[0];

    let tx = await contract
        .connect(owner)
        .newPayment(moneyboxId, amountIn, amountOut, { value: ftm_to_pay });

    return [tx, ftm_to_pay];
}

/*********************************************
 * 
 *                  TESTS
 * 
 ********************************************/

describe("MoneyBox contract", function () {

    let owner, buyer1, buyer2, seller1;

    beforeEach(async () => {

        const MoneyBoxManager = await ethers.getContractFactory("MoneyBoxManager");
        contract = await MoneyBoxManager.deploy();
        await contract.deployed();


        [owner, buyer1, buyer2, seller1, _] = await ethers.getSigners();

        IUniswapV2Router02 = new ethers.Contract(UniSwapRouter_ADDRESS, IUniswapV2Router02ABI, owner);
        STABLECOIN = new ethers.Contract(USDT_ADDRESS, USDT_ERC20ABI, owner);

    });

    describe("Deployment", () => {
        it("Check that is set the right owner", async () => {
            assert.equal(owner.address, await contract.owner());
        });

        it("should have the initial order number to 0", async () => {
            const count = await contract.getOrderCount();
            assert.equal(count, 0)
        });
    });

    describe("moneybox creation", () => {
    
        it('moneybox created correctly', async () => {
            let response = await newOrderFTMtoUSDT(FTMtoUSDT(ether_small), buyer1, seller1, id1);
            await response[0].wait();

            const moneybox = await contract.getOrderById(id1)

            // Check moneybox data
            assert.equal(moneybox.ownerAddress, buyer1.address, 'owner address isn\'t correct');
            assert.equal(moneybox.sellerAddress, seller1.address, "seller address isn\'t correct");
            assert.equal(moneybox.amount.toString(), FTMtoUSDT(ether_small).toString(), 'amount isn\'t correct');
            assert.notEqual(moneybox.unlockCode.toString(), 0);
            assert.equal(moneybox.state, OrderState.CREATED, 'order isn\'t in created state');
        });

        it('user sends import at moneybox creation', async () => {
            let response = await newOrderFTMtoUSDT(FTMtoUSDT(ether_1), buyer1, seller1, id1, FTMtoUSDT(ether_small));
            await response[0].wait();

            const payments = await contract.getMoneyBoxPayments(id1)

            assert.equal(payments.length, 1, "The moneybox doesn't have the right number of payments")
            assert.equal(payments[0].amount.toString(), FTMtoUSDT(ether_small).toString(), "The value isn\'t correct")
            assert.equal(payments[0].from, buyer1.address, "The participant address isn\'t correct")
        });

        it("new fee transfer into moneybox", async () => {
            let response = await newOrderFTMtoUSDT(FTMtoUSDT(ether_1), buyer1, seller1, id1);
            await response[0].wait();

            response = await newPaymentFTMtoUSDT(id1, ether_half, FTMtoUSDT(ether_half), buyer2);
            await response[0].wait();
            const payments = await contract.getMoneyBoxPayments(id1);

            assert.equal(payments.length, 1, "The payments number isn't correct");
            assert.equal(payments[0].amount.toString(), FTMtoUSDT(ether_half).toString(), "The payment hasn't the right amount");
            assert.equal(payments[0].from, buyer2.address, "The payment hasn't the right from address");
        });
    });
    describe("moneybox refund", () => {

        it("refund all fee transfers from moneybox owner", async () => {
            // create a new moneybox
            let response = await newOrderFTMtoUSDT(FTMtoUSDT(ether_1), buyer1, seller1, id1);
            await response[0].wait();

            // I'll check that the buyer2 balance is the same before the fee payment and after the refund
            await newPaymentFTMtoUSDT(id1, ether_half, FTMtoUSDT(ether_half), buyer2);
            await response[0].wait();
            const oldBuyerBalance = await STABLECOIN.balanceOf(buyer2.address);

            // I call the refund function with buyer address to bypass gas price check
            let tx = await contract.connect(buyer1).refund(id1);
            await tx.wait();

            const newBuyerBalance = await STABLECOIN.balanceOf(buyer2.address);
            let expectedBuyerBalance = oldBuyerBalance.add(FTMtoUSDT(ether_half));

            assert.equal(newBuyerBalance.toString(), expectedBuyerBalance.toString());
        });

        it("refund all fee transfers from moneybox seller", async () => {
            // create a new moneybox
            let response = await newOrderFTMtoUSDT(FTMtoUSDT(ether_1), buyer1, seller1, id1);
            await response[0].wait();

            // I'll check that the buyer2 balance is the same before the fee payment and after the refund
            response = await newPaymentFTMtoUSDT(id1, ether_half, FTMtoUSDT(ether_half), buyer2);
            await response[0].wait();
            const oldBuyerBalance = await STABLECOIN.balanceOf(buyer2.address);

            // I call the refund function with buyer address to bypass gas price check
            let tx = await contract.connect(seller1).refund(id1);
            await tx.wait();

            const newBuyerBalance = await STABLECOIN.balanceOf(buyer2.address);
            let expectedBuyerBalance = oldBuyerBalance.add(FTMtoUSDT(ether_half));

            assert.equal(newBuyerBalance.toString(), expectedBuyerBalance.toString());
        });

        describe("failure cases", () => {
            it("should not have insufficent value", async () => {
                // create a new moneybox
                let response = await newOrderFTMtoUSDT(FTMtoUSDT(ether_1), buyer1, seller1, id1);
                await response[0].wait();

                expect(newPaymentFTMtoUSDT(id1, ether_half, FTMtoUSDT(ether_half), buyer2)).to.be.reverted;
            });

            it("buyer tries to call refund from a closed moneybox", async () => {
                let response = await newOrderFTMtoUSDT(FTMtoUSDT(ether_small), buyer1, seller1, id1);
                await response[0].wait();

                await newPaymentFTMtoUSDT(id1, ether_small, FTMtoUSDT(ether_small), buyer2);
                await response[0].wait();
                // the moneybox now is in filled state
                const unlockCode = await contract.getUnlockCode(id1);
                await contract.connect(buyer1).confirmReceived(id1, unlockCode);

                expect(contract.connect(buyer1).refund(id1)).to.be.reverted;
            });
        });
    });
    
    describe("check getter functions", () => {
        it("check getMoneyBoxPayments(string)", async () => {
            let response = await newOrderFTMtoUSDT(FTMtoUSDT(ether_1), buyer1, seller1, id1);
            await response[0].wait();
            
            let result = await newPaymentFTMtoUSDT(id1, ether_small, FTMtoUSDT(ether_small), buyer2);
            await result[0].wait();
            
            const payments = await contract.getMoneyBoxPayments(id1);
            
            assert.equal(payments.length, 1, "The payments number isn't correct");
            assert.equal(payments[0].from, buyer2.address, 'Payment Buyer address isn\'t correct');
            assert.equal(payments[0].amount.toString(), FTMtoUSDT(ether_small), 'First fee amount is correct');
        });

        it("check getAmountToFill(string)", async () => {
            let response = await newOrderFTMtoUSDT(FTMtoUSDT(ether_1), buyer1, seller1, id1);
            await response[0].wait();

            const amount_to_fill = await contract.getAmountToFill(id1);

            assert.equal(amount_to_fill.toString(), FTMtoUSDT(ether_1).toString(), 'The moneybox hasn\'t the right amount to pay');
        });

        describe("check getter functions for all orders", () => {

            beforeEach(async () => {
                const OrderManager = await ethers.getContractFactory("OrderManager");
                order_manager = await OrderManager.deploy();
                await order_manager.deployed();
            });

            it("check getAllBuyerOrders(supercontract, _buyerAddress)", async () => {
                let response = await newOrderFTMtoUSDT(FTMtoUSDT(ether_1), buyer1, seller1, id1);
                await response[0].wait();
                /*
                let tx = await SingleOrderFTMtoUSDT(FTMtoUSDT(ether_small), buyer1, seller1, id2);
                await tx[0].wait();
                */
                // this method gets the super_contract orders concatenated to moneybox_contract!!!
                const buyer_orders = await contract.getAllBuyerOrders(order_manager.address, buyer1.address);
                //console.log(buyer_orders);
                assert.equal(buyer_orders.length, 1, "the orders number isn't correct");

                const order1 = buyer_orders[0].order;
                assert.equal(buyer_orders[0].id, id1, "The order id isn't correct");
                assert.equal(order1.sellerAddress, seller1.address, "The seller address isn't correct");
                assert.equal(order1.ownerAddress, buyer1.address, "Owner address matches with the buyer address");
                /*
                const order2 = buyer_orders[1].order;
                assert.equal(buyer_orders[1].id, id1, "The order id isn't correct");
                assert.equal(order2.sellerAddress, seller1.address, "The seller address isn't correct");
                assert.equal(order2.ownerAddress, buyer1.address, "Owner address matches with the buyer address");
                */
            });

            it("check getAllSellerOrders(OrderManager, address)", async () => {
                let tx = await newOrderFTMtoUSDT(FTMtoUSDT(ether_small), buyer1, seller1, id1);
                await tx[0].wait();
                tx = await newOrderFTMtoUSDT(FTMtoUSDT(ether_small), buyer2, seller1, id2);
                await tx[0].wait();
                
                const seller_orders = await contract.getAllSellerOrders(order_manager.address, seller1.address);
                assert.equal(seller_orders.length, 2, "the orders number is correct");
                
                const order1 = seller_orders[0].order;
                assert.equal(seller_orders[0].id, id1, "The order id is correct");
                assert.equal(order1.sellerAddress, seller1.address, "The seller address is correct");
                assert.equal(order1.ownerAddress, buyer1.address, "Owner address matches with the buyer address");
                const order2 = seller_orders[1].order;
                assert.equal(seller_orders[1].id, id2, "The order id is correct");
                assert.equal(order2.sellerAddress, seller1.address, "The seller address is correct");
                assert.equal(order2.ownerAddress, buyer2.address, "Owner address matches with the buyer address");
            });
        });  

        it("check getMoneyBoxesByParticipantAddress(address)", async () => {
            let response = await newOrderFTMtoUSDT(FTMtoUSDT(ether_1), buyer1, seller1, id1);
            await response[0].wait();
            response = await newOrderFTMtoUSDT(FTMtoUSDT(ether_1), buyer2, seller1, id2);
            await response[0].wait();

            response = await newPaymentFTMtoUSDT(id1, ether_small, FTMtoUSDT(ether_small), buyer2);
            await response[0].wait();
            //response = await newPaymentFTMtoUSDT(id2, ether_small, FTMtoUSDT(ether_small), buyer2);
            //await response[0].wait();
            
            const participantMoneyBoxes1 = await contract.getMoneyBoxesByParticipantAddress(buyer1.address);
            const participantMoneyBoxes2 = await contract.getMoneyBoxesByParticipantAddress(buyer2.address);
            console.log(participantMoneyBoxes1);
            console.log(participantMoneyBoxes2);
            assert.equal(participantMoneyBoxes1.length, 0, 'The number of moneybox participation filtered by buyer1 isn\'t correct');
            assert.equal(participantMoneyBoxes2.length, 1, 'The number of moneybox participation filtered by buyer2 isn\'t correct');
            /*

            const moneybox1 = participantMoneyBoxes1[0];
            const moneybox2 = participantMoneyBoxes2[0];

            assert.equal(moneybox1.id, id1, "The moneybox id isn't correct");
            assert.equal(moneybox1.order['sellerAddress'], seller1.address, "The seller address isn't correct");
            assert.equal(moneybox1.order["amount"].toString(), FTMtoUSDT(ether_1), "The moneybox amount isn't correct");
        
            assert.equal(moneybox2.id, id2, "The moneybox id isn't correct");
            assert.equal(moneybox2.order['sellerAddress'], seller1.address, "The seller address isn't correct");
            assert.equal(moneybox2.order["amount"], FTMtoUSDT(ether_1), "The moneybox amount isn't correct");
            */
        });
    });
});