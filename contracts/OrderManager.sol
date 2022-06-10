// SPDX-License-Identifier: GPL-3.0
// define which compiler to use
// VERSION = 2.1.1
pragma solidity ^0.8.0;  // versions with major support and testing
pragma abicoder v2;

import "@hovoh/spookyswap-core/contracts/interfaces/IUniswapV2Router02.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
//import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";

contract OrderManager {

    // Stable Manager
    IUniswapV2Router02 public immutable uniswapV2Router = IUniswapV2Router02(0xa6AD18C2aC47803E193F75c3677b14BF19B94883);

    // token contracts
    address public immutable WFTM = 0xf1277d1Ed8AD466beddF92ef448A132661956621;
    address public STABLECOIN = 0xA70A572aa5489a5CDd0dAA3bF0Cf440A92f50402; 

    // my liquidity pool
    // here there is my pair WFTM/USDT
    // address public LP = 0x269Dbe218d78297a00fda4e6628B71dF61006655;

    // deployed contract to do tests
    // 0xE162aFf01B9a07D61d6062c9E2403936a153411b

    // usdt 0xA70A572aa5489a5CDd0dAA3bF0Cf440A92f50402

    // chainlink oracle
    //AggregatorV3Interface internal priceFeedStablecoin = AggregatorV3Interface(0x9BB8A6dcD83E36726Cc230a97F1AF8a84ae5F128); 

    // this sets a boundary where we decide the stablecoin is pegged (or not) to USD
    /*
    uint256 public pegThreshold = 10**16;                       // threshold = 0.01     -->     0.99 <= stablecoinPrice <= 1.01
    uint256 public immutable lowerBoundThreshold = 10**15;      // 0.001 <= threshold must be here <= 0.05
    uint256 public immutable upperBoundThreshold = 5*10**16;
    */

    address public immutable owner;     // contract owner can modify contract after the depoly with some setters

    constructor () {
        owner = msg.sender;
    }

    // Standard Contract

    enum OrderState {NotCreated, Created, Filled, Closed, Cancelled}

    struct Order {
        address payable sellerAddress;
        address payable ownerAddress;
        uint amount;
        uint unlockCode;
        uint256 timestamp;
        OrderState state;
    }

    struct OrderTuple {
        string id;
        Order order;
    }

    // mapping for searching optimization
    mapping (address => string[]) internal buyerOrders;
    mapping (address => string[]) internal sellerOrders;
    // mapping for orders
    uint internal orderCount = 0;
    mapping (string => Order) internal orders;

    /**************************************
     *             MODIFIER
     *************************************/

    modifier onlyOwner(string memory id) {
        require(
            address(orders[id].ownerAddress) == msg.sender, 
            "only the owner can call this function"
        );
        _;
    }

    modifier isOwnerOrSeller(string memory id) {
        require(
            address(orders[id].sellerAddress) == msg.sender || address(orders[id].ownerAddress) == msg.sender,
            "you must be the owner or the seller of the order"
        );
        _;
    }

    modifier inState(string memory id, OrderState state_) {
        require(
            uint(state_) == uint(orders[id].state), 
            "the order hasn't the valid state"
        );
        _;
    }

    modifier isUniqueId(string memory id) {
        require(
            OrderState.NotCreated == orders[id].state,
            "order id already exists"
        );
        _;
    }

    modifier enoughFunds(address wallet, uint amountToPay) {
        require(
            wallet.balance >= amountToPay,
            "insufficient funds"
        );
        _;
    }

    modifier notItself(address addr1, address addr2) {
        require(
            addr1 != addr2,
            "the seller and buyer can't be equal"
        );
        _;
    }

    /*
    modifier isStableCoinPegged {
        require(
            this.stablecoinIsPegged(), 
            "The declared stablecoin is not pegged to USD."
        );
        _;
    }
    */

    /**************************************
     *              EVENTS
     *************************************/
    
    event OrderCreated (
        string id,
        address payable sellerAddress,
        address payable ownerAddress,
        uint indexed amount,
        uint256 indexed timestamp,
        OrderState indexed state
    );

    event OrderConfirmed(
        string id,
        address payable sellerAddress,
        address payable ownerAddress,
        uint indexed amount,
        uint256 indexed timestamp,
        OrderState indexed state
    );

    event ItemReceived(
        string id,
        address payable sellerAddress,
        address payable ownerAddress,
        uint indexed amount,
        uint256 indexed timestamp,
        OrderState indexed state
    );

    event OwnerRefunded(
        string id,
        address payable sellerAddress,
        address payable ownerAddress,
        uint indexed amount,
        uint256 indexed timestamp,
        OrderState indexed state
    );

    /**************************************
     *             FUNCTIONS
     *************************************/

    /// Confirm the purchase as buyer.
    /// The ether will be locked until confirmReceived
    /// is called.
    // amountIn == FTM | amountOut == USDT
    function newOrder(address payable _seller, uint _amountIn, uint[] memory _amountOut, string memory _orderId)
        virtual
        public
        payable
        notItself(_seller, msg.sender)
        enoughFunds(msg.sender, _amountIn)
        isUniqueId(_orderId)
    {
        // check that the _amountIn isn't negative is unuseful because the request is blocked by the network (it was tested
        // and the program flow didn't arrive at the control)
        require(
            msg.value >= _amountIn,
            "Insufficient coin value"
        );
        orderCount++;
        orders[_orderId] = Order(_seller, payable(msg.sender), _amountOut[0], block.number, block.timestamp, OrderState.Filled);
        
        // link order to search mappings
        buyerOrders[msg.sender].push(_orderId);
        sellerOrders[_seller].push(_orderId);

        // stablecoin swap
        address[] memory path = new address[](2);
        path[0] = WFTM;
        path[1] = STABLECOIN;

        uint256[] memory feedbackAmounts = uniswapV2Router.swapETHForExactTokens{value: msg.value}(_amountOut[0], path, address(this), block.timestamp);

        if(feedbackAmounts[0] < msg.value){
            payable(msg.sender).transfer(msg.value - feedbackAmounts[0]);
        }

        emit OrderConfirmed(_orderId, _seller, payable(msg.sender), _amountOut[0], block.timestamp, OrderState.Filled);
    }

    /// Confirm that the smart contract's owner received the item.
    /// This will release the locked ether.
    function confirmReceived(string memory id, uint _unlockCode)
        public
        onlyOwner(id)
        inState(id, OrderState.Filled)
    {
        Order memory currentOrder = orders[id];
        require(
            currentOrder.unlockCode == _unlockCode,
            "Invalid unlock code"
        );

        //currentOrder.sellerAddress.transfer(currentOrder.amount);
        require(
            IERC20(STABLECOIN).transfer(currentOrder.sellerAddress, currentOrder.amount), 
            "Transfer failed."
        );
        currentOrder.state = OrderState.Closed;

        // overwrite it
        orders[id] = currentOrder;
        emit ItemReceived(id, orders[id].sellerAddress, payable(msg.sender),  orders[id].amount,  block.timestamp,  OrderState.Closed);
    }

    /// Refound owner if he decided to cancel the order before
    /// the Closed state (before unlock)
    function refund(string memory id)
        virtual
        public
        isOwnerOrSeller(id)
        inState(id, OrderState.Filled)
    {
        Order memory currentOrder = orders[id];
        //currentOrder.ownerAddress.transfer(currentOrder.amount);
        require(
            IERC20(STABLECOIN).transfer(currentOrder.ownerAddress, currentOrder.amount), 
            "Transfer failed."
        );
        
        // It is important to change the state first because
        // otherwise, the contracts called using `send` below
        // can call in again here.
        currentOrder.state = OrderState.Cancelled;
        
        // overwrite
        orders[id] = currentOrder;
        emit OwnerRefunded(id, orders[id].sellerAddress, orders[id].ownerAddress,  orders[id].amount,  block.timestamp,  OrderState.Cancelled);
    }

    /**************************************
     *             GETTER
     *************************************/

    function getOrderCount() public view returns(uint) {
        return orderCount;
    }

    function contractBalance() public view returns(uint) {
        //return address(this).balance;
        return IERC20(STABLECOIN).balanceOf(address(this));
    }

    function getOwnerAddress(string memory id) public view returns(address) {
        return orders[id].ownerAddress;
    }

    function getSellerAddress(string memory id) public view returns(address) {
        return orders[id].sellerAddress;
    }

    function getAmountToPay(string memory id) public view returns(uint) {
        return orders[id].amount;
    }

    function getOrderState(string memory id) public view returns(OrderState) {
        return orders[id].state;
    }

    function getUnlockCode(string memory id) public view returns(uint) {
        return orders[id].unlockCode;
    }

    function getOrderById(string memory id) public view returns(Order memory) {
        return orders[id];
    }

    function getOrdersByBuyer(address _buyerAddress) public view returns(OrderTuple[] memory) {

        OrderTuple[] memory _buyerOrders = new OrderTuple[](buyerOrders[_buyerAddress].length);

        for(uint i = 0; i < buyerOrders[_buyerAddress].length; i++){
            _buyerOrders[i] = OrderTuple(buyerOrders[_buyerAddress][i], orders[buyerOrders[_buyerAddress][i]]);
        }

        return _buyerOrders;
    }

    function getOrdersBySeller(address _sellerAddress) public view returns(OrderTuple[] memory) {
        OrderTuple[] memory _sellerOrders = new OrderTuple[](sellerOrders[_sellerAddress].length);

        for(uint i = 0; i < sellerOrders[_sellerAddress].length; i++){
            _sellerOrders[i] = OrderTuple(sellerOrders[_sellerAddress][i], orders[sellerOrders[_sellerAddress][i]]);
        }

        return _sellerOrders;
    }
    /*
    function getPriceStablecoin() external view returns (uint256) {
        (,int truncatedPriceStablecoin,,,) = priceFeedStablecoin.latestRoundData();
        uint256 priceStablecoin = uint256(truncatedPriceStablecoin) * 10**10;
        return priceStablecoin;
    }

    function stablecoinIsPegged() external view returns (bool) {
        uint256 priceStablecoin = this.getPriceStablecoin();
        return 
            priceStablecoin >= 10**18 - pegThreshold
            && 
            priceStablecoin <= 10**18 + pegThreshold;
    }
    */
}

// Helper functions are defined outside of a contract