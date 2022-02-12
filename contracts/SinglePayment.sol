// SPDX-License-Identifier: GPL-3.0
// define which compiler to use
// VERSION = 1.0.0
pragma solidity >=0.7.0 <=0.8.11;   // version with major support and testing

contract SinglePayment {

    enum OrderState {NotCreated, Created, Filled, Closed, Cancelled}

    struct Order {
        address payable sellerAddress;
        address payable ownerAddress;
        uint amount;
        uint unlockCode;
        OrderState state;
    }

    struct OrderTuple {
        string id;
        Order order;
    }

    // mapping for searching optimization
    mapping (address => string[]) private buyerOrders;
    mapping (address => string[]) private sellerOrders;
    // mapping for orders
    uint private orderCount = 0;
    mapping (string => Order) private orders;

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

    modifier onlySeller(string memory id) {
        require(
            address(orders[id].sellerAddress) == msg.sender, 
            "only the seller can call this function"
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

    /**************************************
     *              EVENTS
     *************************************/
    
    event OrderCreated (
        string id
    );

    event OrderConfirmed(
        string id,
        address payable sellerAddress,
        address payable ownerAddress,
        uint amount,
        uint unlockCode,
        OrderState state
    );

    event ItemReceived(
        string id
    );

    event OwnerRefunded(
        string id
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
    function newOrder(address payable _seller, uint _amount, string memory _orderId)
        external
        payable
        notItself(_seller, msg.sender)
        enoughFunds(msg.sender, _amount)
        isUniqueId(_orderId)
    {
        // check that the _amount isn't negative is unuseful because the request is blocked by the network (it was tested
        // and the program flow didn't arrive at the control)
        require(
            msg.value >= _amount,
            "Insufficient coin value"
        );
        orderCount++;
        orders[_orderId] = Order(_seller, payable(msg.sender), _amount, block.number, OrderState.Filled);
        
        // link order to search mappings
        buyerOrders[msg.sender].push(_orderId);
        sellerOrders[_seller].push(_orderId);

        emit OrderConfirmed(_orderId, _seller, payable(msg.sender), _amount, block.number, OrderState.Filled);
    }

    /// Confirm that the smart contract's owner received the item.
    /// This will release the locked ether.
    function confirmReceived(string memory id, uint _unlockCode)
        external
        onlyOwner(id)
        inState(id, OrderState.Filled)
    {
        Order memory currentOrder = orders[id];
        require(
            currentOrder.unlockCode == _unlockCode,
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
    function refundFromOwner(string memory id)
        external
        onlyOwner(id)
        inState(id, OrderState.Filled)
    {
        Order memory currentOrder = orders[id];
        currentOrder.ownerAddress.transfer(currentOrder.amount);
        // It is important to change the state first because
        // otherwise, the contracts called using `send` below
        // can call in again here.
        currentOrder.state = OrderState.Cancelled;
        
        // overwrite
        orders[id] = currentOrder;
        emit OwnerRefunded(id);
    }

    /// Refound owner if the seller decides to cancel the order
    function refundFromSeller(string memory id)
        external
        onlySeller(id)
        inState(id, OrderState.Filled)
    {
        Order memory currentOrder = orders[id];
        currentOrder.ownerAddress.transfer(currentOrder.amount);
        // It is important to change the state first because
        // otherwise, the contracts called using `send` below
        // can call in again here.
        currentOrder.state = OrderState.Cancelled;
        
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

    function getOwnerAddress(string memory id) external view returns(address) {
        return orders[id].ownerAddress;
    }

    function getSellerAddress(string memory id) external view returns(address) {
        return orders[id].sellerAddress;
    }

    function getAmountToPay(string memory id) external view returns(uint) {
        return orders[id].amount;
    }

    function getOrderState(string memory id) external view returns(OrderState) {
        return orders[id].state;
    }

    function getUnlockCode(string memory id) external view returns(uint) {
        return orders[id].unlockCode;
    }

    function getOrderById(string memory id) external view returns(Order memory) {
        return orders[id];
    }

    function getOrdersByBuyer(address _buyerAddress) external view returns(OrderTuple[] memory) {
        OrderTuple[] memory _buyerOrders = new OrderTuple[](buyerOrders[_buyerAddress].length);

        for(uint i = 0; i < buyerOrders[_buyerAddress].length; i++){
            _buyerOrders[i] = OrderTuple(buyerOrders[_buyerAddress][i], orders[buyerOrders[_buyerAddress][i]]);
        }

        return _buyerOrders;
    }

    function getOrdersBySeller(address _sellerAddress) external view returns(OrderTuple[] memory) {
        OrderTuple[] memory _sellerOrders = new OrderTuple[](sellerOrders[_sellerAddress].length);

        for(uint i = 0; i < sellerOrders[_sellerAddress].length; i++){
            _sellerOrders[i] = OrderTuple(sellerOrders[_sellerAddress][i], orders[sellerOrders[_sellerAddress][i]]);
        }

        return _sellerOrders;
    }
}

// Helper functions are defined outside of a contract
