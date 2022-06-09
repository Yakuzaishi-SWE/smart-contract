/********************************************
 *                  IMPORTS
 ********************************************/

const { expect, assert } = require("chai");
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
let IUniswapV2Router02, STABLECOIN, contract;

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

async function newOrderFTMtoUSDT(amountOut, buyer, seller, id) {
    // create the array that contains the pair tokens
    let path = [
        WFTM_ADDRESS,
        USDT_ADDRESS
    ];
    // calculate the conversion amount
    let msg_value = await IUniswapV2Router02.getAmountsIn(amountOut, path);
    msg_value = msg_value[0];
    //console.log("FTM: ", msg_value, " USDT: ", amountOut);
    let tx = await contract
        .connect(buyer)
        .newOrder(seller.address, msg_value, [amountOut], id, { value: msg_value });
    return [tx, msg_value];
}

/*********************************************
 * 
 *                  TESTS
 * 
 ********************************************/

describe("OrderManager contract", function () {

    let owner, buyer1, buyer2, seller1;

    beforeEach(async () => {

        const OrderManager = await ethers.getContractFactory("OrderManager");
        contract = await OrderManager.deploy();
        await contract.deployed();


        [owner, buyer1, buyer2, seller1, _] = await ethers.getSigners();
        //console.log(owner.address, seller1.address, buyer1.address, buyer2.address);
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

    describe("Single order payment", () => {

        it('order created correctly and new buyer and contract balances are correct', async () => {

            // get the initial balance
            let buyer1_FTM_old_balance = await buyer1.getBalance();
            let contract_USDT_old_balance = await STABLECOIN.balanceOf(contract.address);

            let amountUSDT = FTMtoUSDT(ether_small);

            let response = await newOrderFTMtoUSDT(amountUSDT, buyer1, seller1, id1);
            await response[0].wait();
            let gasSpent = await getGas(response[0]);
            let msg_value_sent = response[1];

            let buyer1_FTM_new_balance = await buyer1.getBalance();
            let contract_USDT_new_balance = await STABLECOIN.balanceOf(contract.address);

            //console.log(buyer1_FTM_new_balance, contract_USDT_new_balance);
            assert.equal(amountUSDT.toString(), (contract_USDT_new_balance.sub(contract_USDT_old_balance)).toString());
            assert.equal(buyer1_FTM_new_balance.toString(), (buyer1_FTM_old_balance.sub(msg_value_sent).sub(gasSpent)).toString());

        });

        it('order registered correctly in blockchain (GET)', async () => {
            let amountUSDT = FTMtoUSDT(ether_small);

            let tx = await newOrderFTMtoUSDT(amountUSDT, buyer1, seller1, id1);
            await tx[0].wait();

            const order = await contract.getOrderById(id1);
            //console.log(order);
            assert.equal(order.ownerAddress, buyer1.address, 'owner address isn\'t correct');
            assert.equal(order.sellerAddress, seller1.address, "seller address isn\'t correct");
            assert.equal(order.amount.toString(), amountUSDT.toString(), 'amount isn\'t correct');
            assert.notEqual(order.unlockCode, 0);
            assert.equal(order.state, OrderState.FILLED, 'order isn\'t in filled state');
        });

        describe("failure cases", () => {
            
            it("user tries to order his item, or send funds to itself", async () => {
                expect(newOrderFTMtoUSDT(FTMtoUSDT(ether_small), seller1, seller1, id1)).to.be.reverted;
            });

            it("user tries to send negative coin value", async () => {
                //await contract.newOrder(seller, -1, id2, { from: buyer, value: ether_1 }).should.be.rejected
                expect(newOrderFTMtoUSDT(-1, buyer1, seller1, id1)).to.be.reverted;
            });

            it("user hasn't enough founds", async () => {
                expect(contract.connect(buyer1).newOrder(seller1.address, ether_big, [ether_big], id1, { value: ether_big })).to.be.reverted;
            });

            it("front end require the creation of an order with the same order id", async () => {
                //await contract.newOrder(seller, ether_1, id1, { from: buyer, value: ether_1 })
                //await contract.newOrder(seller, ether_1, id1, { from: buyer, value: ether_1 }).should.be.rejected
                let tx = await newOrderFTMtoUSDT(FTMtoUSDT(ether_small), buyer1, seller1, id1);
                await tx[0].wait();
                expect(newOrderFTMtoUSDT(FTMtoUSDT(ether_small), buyer1, seller1, id1)).to.be.reverted;
            }); 
        });

        describe("order confirmation", () => {
            it("should update state and release the payment to seller", async () => {
                // new order for the test
                let response = await newOrderFTMtoUSDT(FTMtoUSDT(ether_small), buyer1, seller1, id1);
                await response[0].wait();

                // get old balances
                const seller1_USDT_old_balance = await STABLECOIN.balanceOf(seller1.address);
                const contract_USDT_old_balance = await STABLECOIN.balanceOf(contract.address);
                
                // confirmation
                const unlockCode = await contract.getUnlockCode(id1);
                let tx = await contract.connect(buyer1).confirmReceived(id1, unlockCode);
                await tx.wait();
                

                // get order
                const order = await contract.getOrderById(id1);
                assert.equal(order.state, OrderState.CLOSED, 'the order isn\'t set to closed');

                // get new balances
                const seller1_USDT_new_balance = await STABLECOIN.balanceOf(seller1.address);
                const contract_USDT_new_balance = await STABLECOIN.balanceOf(contract.address);

                // calculate expected balances
                const expected_new_seller1_balance = seller1_USDT_old_balance.add(FTMtoUSDT(ether_small));
                const expected_new_contract_balance = contract_USDT_old_balance.sub(FTMtoUSDT(ether_small));

                assert.equal(expected_new_seller1_balance.toString(), seller1_USDT_new_balance.toString(), "Seller balance isn\'t correct")
                assert.equal(expected_new_contract_balance.toString(), contract_USDT_new_balance.toString(), "Contract balance isn\'t correct")
                
            });

            describe("failure cases", () => {
                it("user tries to confirm the order with a wrong unlock code", async () => {
                    let response = await newOrderFTMtoUSDT(FTMtoUSDT(ether_small), buyer1, seller1, id1);
                    await response[0].wait();

                    const wrong_code = "1234";
                    expect(contract.connect(buyer1).confirmReceived(id1, wrong_code)).to.be.reverted;
                });

                it("user tries to confirm an order that doesn\'t exist", async () => {
                    let response = await newOrderFTMtoUSDT(FTMtoUSDT(ether_small), buyer1, seller1, id1);
                    await response[0].wait();

                    const unlockCode = await contract.getUnlockCode(id1);
                    expect(contract.connect(buyer1).confirmReceived(id2, unlockCode)).to.be.reverted;
                });
            });
        });

        describe("order refund", async () => {

            describe("order should set to cancelled state", () => {
                it("cancelled from buyer", async () => {
                    let response = await newOrderFTMtoUSDT(FTMtoUSDT(ether_small), buyer1, seller1, id1);
                    await response[0].wait();
                    
                    let tx = await contract.connect(buyer1).refund(id1);
                    await tx.wait();

                    const order = await contract.getOrderById(id1);

                    assert.equal(order.state, OrderState.CANCELLED);
                });
    
                it("cancelled from seller", async () => {
                    let response = await newOrderFTMtoUSDT(FTMtoUSDT(ether_small), buyer1, seller1, id1);
                    await response[0].wait();
                    
                    let tx = await contract.connect(seller1).refund(id1);
                    await tx.wait();
                    
                    const order = await contract.getOrderById(id1);

                    assert.equal(order.state, OrderState.CANCELLED);
                });
            })
            
            describe("should move funds back to the buyer", async () => {
                it("from buyer", async () => {
                    let response = await newOrderFTMtoUSDT(FTMtoUSDT(ether_small), buyer1, seller1, id1);
                    await response[0].wait();

                    const oldBuyerBalance = await STABLECOIN.balanceOf(buyer1.address);
    
                    let tx = await contract.connect(buyer1).refund(id1);
                    await tx.wait();

                    const newBuyerBalance = await STABLECOIN.balanceOf(buyer1.address);
                    
                    const order = await contract.getOrderById(id1);
    
                    const expectedBalance = oldBuyerBalance.add(order.amount);
                    assert.equal(newBuyerBalance.toString(), expectedBalance.toString());
                });
                
                it("from seller", async () => {
                    let response = await newOrderFTMtoUSDT(FTMtoUSDT(ether_small), buyer1, seller1, id1);
                    await response[0].wait();

                    const oldBuyerBalance = await STABLECOIN.balanceOf(buyer1.address);
    
                    let tx = await contract.connect(seller1).refund(id1);
                    await tx.wait();

                    // in this test we don't need to calculate gas cost because only the seller pay for them

                    const newBuyerBalance = await STABLECOIN.balanceOf(buyer1.address);
                    
                    const order = await contract.getOrderById(id1);
            
                    const expectedBalance = oldBuyerBalance.add(order.amount);
                    assert.equal(newBuyerBalance.toString(), expectedBalance.toString());
                });
            })
            
            describe("failure cases", () => {
                it("should not refund an order already closed", async () => {
                    let response = await newOrderFTMtoUSDT(FTMtoUSDT(ether_small), buyer1, seller1, id1);
                    await response[0].wait();

                    // confirmation
                    const unlockCode = await contract.getUnlockCode(id1);
                    let tx = await contract.connect(buyer1).confirmReceived(id1, unlockCode);
                    await tx.wait();
    
                    expect(contract.connect(buyer1).refund(id1)).to.be.reverted;
                });
    
                it("should be the owner or the seller", async () => {
                    let response = await newOrderFTMtoUSDT(FTMtoUSDT(ether_small), buyer1, seller1, id1);
                    await response[0].wait();

                    expect(contract.connect(buyer2).refund(id1)).to.be.reverted;
                });
            });
        });

        describe('check getter functions', async () => {
            it("check contractBalance()", async function () {
                let response = await newOrderFTMtoUSDT(FTMtoUSDT(ether_small), buyer1, seller1, id1);
                await response[0].wait();

                const provider = waffle.provider;
                const realContractBalance = await provider.getBalance(contract.address);
                const result = await contract.contractBalance();
                assert.equal(realContractBalance.toString(), result.toString(), "Contract balance isn\'t correct")
            });
    
            it("check getOwnerAddress(string)", async () => {
                let response = await newOrderFTMtoUSDT(FTMtoUSDT(ether_small), buyer1, seller1, id1);
                await response[0].wait();

                const result = await contract.getOwnerAddress(id1)
                assert.equal(buyer1.address, result, "Owner address isn\'t correct")
            });
    
            it("check getSellerAddress(string)", async () => {
                let response = await newOrderFTMtoUSDT(FTMtoUSDT(ether_small), buyer1, seller1, id1);
                await response[0].wait();

                const result = await contract.getSellerAddress(id1);
                assert.equal(seller1.address, result, "Seller address isn\'t correct");
            });
    
            it("check getAmountToPay(string)", async () => {
                let response = await newOrderFTMtoUSDT(FTMtoUSDT(ether_small), buyer1, seller1, id1);
                await response[0].wait();

                const realAmount = FTMtoUSDT(ether_small);
                const result = await contract.getAmountToPay(id1)
                assert.equal(realAmount.toString(), result.toString(), "Amount to pay isn\'t correct")
            });
    
            it("check getOrderState(string)", async function () {
                let response = await newOrderFTMtoUSDT(FTMtoUSDT(ether_small), buyer1, seller1, id1);
                await response[0].wait();

                const result = await contract.getOrderState(id1)
                assert.equal(OrderState.FILLED, result, "Order state isn\'t correct")
            });
    
    
            it("check getOrderById(string)", async function () {
                let response = await newOrderFTMtoUSDT(FTMtoUSDT(ether_small), buyer1, seller1, id1);
                await response[0].wait();
    
                const order = await contract.getOrderById(id1);
                const amount = FTMtoUSDT(ether_small);
                const unlockCode = await contract.getUnlockCode(id1);
                const state = await contract.getOrderState(id1);

                assert.equal(order.sellerAddress, seller1.address, "Seller address isn\'t correct")
                assert.equal(order.ownerAddress, buyer1.address, "OwnerAddress code isn\'t correct")
                assert.equal(order.amount.toString(), amount.toString(), "amount isn\'t correct")
                assert.equal(order.unlockCode.toString(), unlockCode.toString(), "Unlock code isn\'t correct")
                assert.equal(order.state, state, "state isn\'t correct")
            });
    
            it("check getOrdersByBuyer(address)", async function () {
                let response = await newOrderFTMtoUSDT(FTMtoUSDT(ether_small), buyer1, seller1, id1);
                await response[0].wait();
    
                const buyer_orders = await contract.getOrdersByBuyer(buyer1.address)
                assert.equal(buyer_orders.length, 1, "the orders number isn\'t correct")
    
                // test two orders
                const order1 = buyer_orders[0].order;
                assert.equal(buyer_orders[0].id, id1, "The order1 id isn\'t correct")
                assert.equal(order1.sellerAddress, seller1.address, "The seller address isn\'t correct")
                assert.equal(order1.ownerAddress, buyer1.address, "Owner address matches with the buyer address")
                assert.equal(order1.state, OrderState.FILLED, "The order state matches with the FILLED state")
            });
    
            it("check getOrdersBySeller(address)", async function () {
                let response = await newOrderFTMtoUSDT(FTMtoUSDT(ether_small), buyer1, seller1, id1);
                await response[0].wait();
    
                const seller_orders = await contract.getOrdersBySeller(seller1.address)
                assert.equal(seller_orders.length, 1, "the orders number isn\'t correct")
    
                // test two orders
                const order1 = seller_orders[0].order;
                assert.equal(seller_orders[0].id, id1, "The order1 id isn\'t correct")
                assert.equal(order1.sellerAddress, seller1.address, "The seller address isn\'t correct")
                assert.equal(order1.ownerAddress, buyer1.address, "Owner address matches with the buyer address")
                assert.equal(order1.state, OrderState.FILLED, "The order state matches with the FILLED state")
            });
        });
    });

});