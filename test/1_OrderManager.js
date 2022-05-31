/********************************************
 *                  IMPORTS
 ********************************************/

const { expect, assert } = require("chai");
const { ethers } = require("hardhat");  // ethers are provided globally, this import is for more readable code

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
        .newOrder(seller.address, msg_value, amountOut, id, { value: msg_value });
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

            await newOrderFTMtoUSDT(amountUSDT, buyer1, seller1, id1);

            const order = await contract.getOrderById(id1);
            //console.log(order);
            assert.equal(order.ownerAddress, buyer1.address, 'owner address isn\'t correct');
            assert.equal(order.sellerAddress, seller1.address, "seller address isn\'t correct");
            assert.equal(order.amount.toString(), amountUSDT.toString(), 'amount isn\'t correct');
            assert.notEqual(order.unlockCode, 0);
            assert.equal(order.state, OrderState.FILLED, 'order isn\'t in filled state');
        });

        describe("failure cases", () => {
            /*  NECESSARIO???
            it("user tries to insert an amount less than the required amount", async () => {
                await contract.newOrder(seller, ether_1, id2, { from: buyer, value: ether_half }).should.be.rejected
                await newOrderFTMtoUSDT(FTMtoUSDT(ether_small), buyer1, seller1, id1).should.be.rejected;
            })
            */

            it("user tries to order his item, or send funds to itself", async () => {
                expect(newOrderFTMtoUSDT(FTMtoUSDT(ether_small), seller1, seller1, id1)).to.be.reverted;
            });
            
            /*  FORSE NON NECESSARIO, potrebbe avere degli ordini a 0 (pensa agli sconti)
            it("user tries to pass value equal to zero", async () => {
                //await contract.newOrder(seller, 0, id2, { from: seller, value: ether_1 }).should.be.rejected
                expect(newOrderFTMtoUSDT(FTMtoUSDT(0), buyer1, seller1, id1)).to.be.reverted; 
            });
            */

            it("user tries to send negative coin value", async () => {
                //await contract.newOrder(seller, -1, id2, { from: buyer, value: ether_1 }).should.be.rejected
                expect(newOrderFTMtoUSDT(-1, buyer1, seller1, id1)).to.be.reverted;
            });

            it("user hasn't enough founds", async () => {
                //await contract.newOrder(seller, ether_big, id2, { from: buyer, value: ether_big }).should.be.rejected
                expect(newOrderFTMtoUSDT(FTMtoUSDT(ether_big), buyer1, seller1, id1)).to.be.reverted;
            });

            it("front end require the creation of an order with the same order id", async () => {
                //await contract.newOrder(seller, ether_1, id1, { from: buyer, value: ether_1 })
                //await contract.newOrder(seller, ether_1, id1, { from: buyer, value: ether_1 }).should.be.rejected
                await newOrderFTMtoUSDT(FTMtoUSDT(ether_small), buyer1, seller1, id1);
                expect(newOrderFTMtoUSDT(FTMtoUSDT(ether_small), buyer1, seller1, id1)).to.be.reverted;
            }); 
        });

        describe("order confirmation", () => {
            it("should update state and release the payment to seller", async () => {
                //await contract.newOrder(seller, ether_1, id1, { from: buyer, value: ether_1 })
                // new order for the test
                let response = await newOrderFTMtoUSDT(FTMtoUSDT(ether_small), buyer1, seller1, id1);
                
                // get old balances
                let seller1_USDT_old_balance = await STABLECOIN.balanceOf(seller1.address);
                let contract_USDT_old_balance = await STABLECOIN.balanceOf(contract.address);
                
                const unlockCode = await contract.getUnlockCode(id1);
                await contract.connect(buyer1).confirmReceived(id1, unlockCode);
    
                const order = await contract.getOrderById(id1);
                assert.equal(order.state, OrderState.CLOSED, 'the order isn\'t set to closed')
            })
        });
    });

});