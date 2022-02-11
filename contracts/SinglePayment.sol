// SPDX-License-Identifier: GPL-3.0
// define which compiler to use
// VERSION = 1.0.0
pragma solidity >=0.7.0 <0.9.0;

//import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
 
contract SinglePayment {

    enum OrderState {Created, Filled, Closed, Canceled}

    struct Order {
        address payable sellerAddress;
        address payable ownerAddress;
        uint amount;
        uint unlockCode;
        OrderState state;
        string orderGUID;
    }

    // mapping for searching optimization
    mapping (address => uint[]) private buyerOrders;
    mapping (address => uint[]) private sellerOrders;
    // mapping for orders
    uint private orderCount = 0;
    mapping (uint => Order) private orders;

    /**************************************
     *             MODIFIER
     *************************************/

    modifier onlyOwner(uint id) {
        require(
            msg.sender == orders[id].ownerAddress, 
            "only the owner can call this function"
        );
        _;
    }

    modifier onlySeller(uint id) {
        require(
            msg.sender == orders[id].sellerAddress, 
            "only the seller can call this function"
        );
        _;
    }

    modifier inState(uint id, OrderState state_) {
        require(
            orders[id].state == state_, 
            "the order hasn't the valid state"
        );
        _;
    }

    modifier validOrderId(uint id) {
        require(
            orderCount >= id,
            "order id isn't valid"
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

    /**************************************
     *              EVENTS
     *************************************/
    event Aborted();

    event OrderCreated (
        uint id
    );

    event OrderConfirmed(
        uint id,
        address payable sellerAddress,
        address payable ownerAddress,
        uint amount,
        uint unlockCode,
        OrderState state
    );

    event ItemReceived(
        uint id
    );

    event OwnerRefunded(
        uint id
    );

    /**************************************
     *             FUNCTIONS
     *************************************/

    /// Create new order with data
    // This will set the order as created and ready to receive coins
    /*
    function createNewOrder(address payable _seller, address payable _buyer, uint _amount)
        external
    {
        orderCount++;
        orders[orderCount] = Order(_seller, _buyer, _amount, 0, OrderState.Created);

        // link the order
        buyerOrders[_buyer].push(orderCount);
        sellerOrders[_seller].push(orderCount);

        emit OrderCreated(orderCount);
    }
    */

    /// Confirm the purchase as buyer.
    /// The ether will be locked until confirmReceived
    /// is called.
    function newOrder(address payable _seller, uint _amount, string memory _orderGUID)
        external
        payable
        notItself(_seller, msg.sender)
        enoughFunds(msg.sender, _amount)
    {
        // check that the _amount isn't negative is unuseful because the request is blocked by the network (it was tested
        // and the program flow didn't arrive at the control)
        require(
            msg.value >= _amount,
            "Insufficient coin value"
        );
        orderCount++;
        orders[orderCount] = Order(_seller, payable(msg.sender), _amount, block.number, OrderState.Filled, _orderGUID);
        
        // link order to search mappings
        buyerOrders[msg.sender].push(orderCount);
        sellerOrders[_seller].push(orderCount);

        emit OrderConfirmed(orderCount, _seller, payable(msg.sender), _amount, block.number, OrderState.Filled);
    }

    /// Confirm that the smart contract's owner received the item.
    /// This will release the locked ether.
    function confirmReceived(uint id, uint _unlockCode)
        external
        validOrderId(id)
        onlyOwner(id)
        inState(id, OrderState.Filled)
    {
        Order memory currentOrder = orders[id];
        require(
            _unlockCode == currentOrder.unlockCode,
            "Invalid unlock code"
        );

        currentOrder.sellerAddress.transfer(currentOrder.amount);
        currentOrder.state = OrderState.Closed;

        // overwrite it
        orders[id] = currentOrder;
        emit ItemReceived(id);
    }

    /// Refound owner if he decided to cancel the order before
    /// the Closed state (before unlock)
    function refundFromOwner(uint id)
        external
        onlyOwner(id)
        inState(id, OrderState.Filled)
    {
        Order memory currentOrder = orders[id];
        currentOrder.ownerAddress.transfer(currentOrder.amount);
        // It is important to change the state first because
        // otherwise, the contracts called using `send` below
        // can call in again here.
        currentOrder.state = OrderState.Canceled;
        
        // overwrite
        orders[id] = currentOrder;
        emit OwnerRefunded(id);
    }

    /// Refound owner if the seller decides to cancel the order
    function refundFromSeller(uint id)
        external
        onlySeller(id)
        inState(id, OrderState.Filled)
    {
        Order memory currentOrder = orders[id];
        currentOrder.ownerAddress.transfer(currentOrder.amount);
        // It is important to change the state first because
        // otherwise, the contracts called using `send` below
        // can call in again here.
        currentOrder.state = OrderState.Canceled;
        
        // overwrite
        orders[id] = currentOrder;
        emit OwnerRefunded(id);
    }

    /**************************************
     *             GETTER
     *************************************/

    function getOrderCount() external view returns(uint) {
        return orderCount;
    }

    function contractBalance() external view returns(uint) {
        return address(this).balance;
    }

    function getOwnerAddress(uint id) external view returns(address) {
        return orders[id].ownerAddress;
    }

    function getSellerAddress(uint id) external view returns(address) {
        return orders[id].sellerAddress;
    }

    function getAmountToPay(uint id) external view returns(uint) {
        return orders[id].amount;
    }

    function getOrderState(uint id) external view returns(OrderState) {
        return orders[id].state;
    }

    function getUnlockCode(uint id) external view returns(uint) {
        return orders[id].unlockCode;
    }

    function getOrderById(uint id) external view returns(Order memory) {
        return orders[id];
    }

    function getOrdersByBuyer(address _buyerAddress) external view returns(Order[] memory) {
        Order[] memory _buyerOrders = new Order[](buyerOrders[_buyerAddress].length);

        for(uint i = 0; i < buyerOrders[_buyerAddress].length; i++){
            _buyerOrders[i] = orders[buyerOrders[_buyerAddress][i]];
        }

        return _buyerOrders;
    }

    function getOrdersBySeller(address _sellerAddress) external view returns(Order[] memory) {
        Order[] memory _sellerOrders = new Order[](sellerOrders[_sellerAddress].length);

        for(uint i = 0; i < sellerOrders[_sellerAddress].length; i++){
            _sellerOrders[i] = orders[sellerOrders[_sellerAddress][i]];
        }

        return _sellerOrders;
    }
}

// Helper functions are defined outside of a contract
