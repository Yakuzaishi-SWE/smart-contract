// SPDX-License-Identifier: GPL-3.0
// define which compiler to use
// VERSION = 1.0.0
pragma solidity >=0.7.0 <=0.8.11;   // version with major support and testing

contract ShopChain {

    enum OrderState {NotCreated, Created, Filled, Closed, Cancelled}

    struct Order {
        address payable sellerAddress;
        address payable ownerAddress;
        uint amount;
        uint unlockCode;
        OrderState state;
    }

    struct Payment {
        address payable from;
        uint amount;
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
    mapping (string => Payment[]) private orderPayments;

    /*************************************
     *             MODIFIER              *
     *************************************/

    modifier isOwner(string memory id) {
        require(
            address(orders[id].ownerAddress) == msg.sender, 
            "you must be the owner of the order"
        );
        _;
    }

    // modifier isSeller(string memory id) {
    //     require(
    //         address(orders[id].sellerAddress) == msg.sender, 
    //         "you must be the seller of the order"
    //     );
    //     _;
    // }

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

    modifier existsOrderId(string memory id) {
        require(
            OrderState.NotCreated != orders[id].state,
            "order id doesn't exists"
        );
        _;
    }

    modifier hasEnoughFunds(address wallet, uint amountToPay) {
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
    
    event OrderCreated(
        string id,
        address payable sellerAddress,
        address payable ownerAddress,
        uint amount,
        uint unlockCode,
        OrderState state
    );

    event OrderUnlocked(
        string id
    );

    event OwnerRefunded(
        string id
    );

    /**************************************
     *             FUNCTIONS
     *************************************/

    function newPayment(string memory _orderId, uint _amount)
        public
        payable
        hasEnoughFunds(msg.sender, _amount)
        existsOrderId(_orderId)
        inState(_orderId, OrderState.Created)
    {
        require(
            msg.value >= _amount,
            "Insufficient coin value"
        );
        orderPayments[_orderId].push(Payment(payable(msg.sender), _amount));
    }

    /// Confirm the purchase as buyer.
    /// The ether will be locked until confirmReceived
    /// is called.
    function newOrder(address payable _seller, uint _amount, string memory _orderId)
        external
        payable
        notItself(_seller, msg.sender)
        hasEnoughFunds(msg.sender, _amount)
        isUniqueId(_orderId)
    {
        orderCount++;
        orders[_orderId] = Order(_seller, payable(msg.sender), _amount, block.number, OrderState.Created);
        newPayment(_orderId, _amount);
        orders[_orderId].state = OrderState.Filled;
        
        // link order to search mappings
        buyerOrders[msg.sender].push(_orderId);
        sellerOrders[_seller].push(_orderId);

        emit OrderCreated(_orderId, _seller, payable(msg.sender), _amount, block.number, OrderState.Filled);
    }

    /// Confirm that the smart contract's owner received the item.
    /// This will release the locked ether.
    function confirmReceived(string memory id, uint _unlockCode)
        external
        isOwner(id)
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
        emit OrderUnlocked(id);
    }

    function refund(string memory id)
        external
        isOwnerOrSeller(id)
        inState(id, OrderState.Filled)
    {
        Payment[] memory ps = orderPayments[id];
        for (uint i = 0; i < ps.length; i++) {
            ps[i].from.transfer(ps[i].amount);
        }
        orders[id].state = OrderState.Cancelled;
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

    function getOwnerAddress(string memory id) external view existsOrderId(id) returns(address) {
        return orders[id].ownerAddress;
    }

    function getSellerAddress(string memory id) external view existsOrderId(id) returns(address) {
        return orders[id].sellerAddress;
    }

    function getAmountToPay(string memory id) external view existsOrderId(id) returns(uint) {
        return orders[id].amount;
    }

    function getAmountPaid(string memory id) external view existsOrderId(id) returns(uint) {
        uint paid = 0;

        for(uint i = 0; i < orderPayments[id].length; i++){
            paid += orderPayments[id][i].amount;
        }

        return paid;
    }

    function getOrderState(string memory id) external view existsOrderId(id) returns(OrderState) {
        return orders[id].state;
    }

    function getUnlockCode(string memory id) external view existsOrderId(id) returns(uint) {
        return orders[id].unlockCode;
    }

    function getOrderById(string memory id) external view existsOrderId(id) returns(Order memory) {
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
