// SPDX-License-Identifier: GPL-3.0
// define which compiler to use
// VERSION = 1.0.0
import "./OrderManager.sol";

pragma solidity >=0.7.0 <=0.8.13;   // version with major support and testing

contract MoneyBoxManager is OrderManager {

    struct Payment {
        address payable from;
        uint amount;
        uint256 timestamp;
    }

    struct PaymentTuple {
        string moneyboxId;
        Payment payment;
    }

    mapping (string => Payment[]) private payments;
    mapping (address => PaymentTuple[]) private customerPayments;

    /**************************************
     *             MODIFIERS
     *************************************/

    modifier moneyBoxNotClosedOrCancelled(string memory id) {
        require(
            OrderManager.orders[id].state != OrderState.Closed && OrderManager.orders[id].state != OrderState.Cancelled,
            "MoneyBox is closed or cancelled, you can't call this function when it's in one of these states"
        );
        _;
    }

    /**************************************
     *              EVENTS
     *************************************/
    
    event NewPaymentCreated (
        string moneybox_id,
        uint fee_amount,
        address owner,
        uint256 timestamp

    );

    /**************************************
     *             FUNCTIONS
     *************************************/

    // this function is the equivalent of newMoneyBox() but it overrides the newOrder function
    function newOrder(address payable _seller, uint _amount, string memory _orderId)
        override
        external
        payable
        notItself(_seller, msg.sender)
        isUniqueId(_orderId)
    {
        OrderManager.orderCount++;
        OrderManager.orders[_orderId] = Order(_seller, payable(msg.sender), _amount, block.number, block.timestamp, OrderState.Created);
        
        // link order to search mappings
        OrderManager.buyerOrders[msg.sender].push(_orderId);
        OrderManager.sellerOrders[_seller].push(_orderId);

        if(msg.value > 0){
            this.newPayment{ value: msg.value }(_orderId, msg.value);
        }

        emit OrderCreated(_orderId, _seller, payable(msg.sender), _amount, block.timestamp, OrderState.Created);

    }

    // this function miss the control of valid moneybox id
    function newPayment(string memory moneyBoxId, uint _amount) 
        external
        payable
        enoughFunds(msg.sender, _amount)
    {
        require(
            msg.value >= _amount,
            "Insufficient coin value"
        );

        Payment memory _payment = Payment(payable(msg.sender), _amount, block.timestamp);

        payments[moneyBoxId].push(_payment);

        // link payment to search map
        customerPayments[msg.sender].push(PaymentTuple(moneyBoxId, _payment));

        if(this.getAmountToFill(moneyBoxId) <= 0)
            orders[moneyBoxId].state = OrderState.Filled;

        emit NewPaymentCreated(moneyBoxId, _amount, msg.sender, block.timestamp);
    }

    function refund(string memory id)
        override
        external
        isOwnerOrSeller(id)
        moneyBoxNotClosedOrCancelled(id)
    {
        Payment[] memory ps = payments[id];
        for (uint i = 0; i < ps.length; i++) {
            ps[i].from.transfer(ps[i].amount);
        }

        orders[id].state = OrderState.Cancelled;
        emit OwnerRefunded(id, orders[id].sellerAddress, orders[id].ownerAddress, orders[id].amount, block.timestamp, OrderState.Cancelled);
    }

    // facciamo il rimborso per il singolo utente partecipante??? Da aggiungere in analisi dei requisiti


    /**************************************
     *             GETTERS
     *************************************/

    function getMoneyBoxPayments(string memory id)
        external
        view
        returns(Payment[] memory)
    {
        return payments[id];
    }

    function getAmountToFill(string memory id)
        external
        view
        returns(uint)
    {
        uint total = this.getAmountToPay(id);
        uint paid = 0;
        Payment[] memory ps = payments[id];
        for (uint i = 0; i < ps.length; i++) {
            paid += ps[i].amount;
        }

        return total-paid;
    }

    function ConcatenateArrays(OrderTuple[] memory primo, OrderTuple[] memory secondo) private pure returns(OrderTuple[] memory) {
        OrderTuple[] memory returnArr = new OrderTuple[](primo.length + secondo.length);

        uint i=0;
        for (; i < primo.length; i++) {
            returnArr[i] = primo[i];
        }

        uint j=0;
        while (j < secondo.length) {
            returnArr[i++] = secondo[j++];
        }

        return returnArr;
    } 

    function getAllBuyerOrders(OrderManager superContract, address _buyerAddress)
        external
        view
        returns(OrderTuple[] memory)
    {
        OrderTuple[] memory super_orders = superContract.getOrdersByBuyer(_buyerAddress);
        OrderTuple[] memory this_orders = this.getOrdersByBuyer(_buyerAddress);

        return ConcatenateArrays(super_orders, this_orders);
    }

    function getAllSellerOrders(OrderManager superContract, address _sellerAddress)
        external
        view
        returns(OrderTuple[] memory)
    {
        OrderTuple[] memory super_orders = superContract.getOrdersBySeller(_sellerAddress);
        OrderTuple[] memory this_orders = this.getOrdersBySeller(_sellerAddress);

        return ConcatenateArrays(super_orders, this_orders);
    }


    function getAllPaymentsByCustomerAddress(address customerAddress)
        external
        view
        returns(PaymentTuple[] memory)
    {
        /*
        PaymentTuple[] memory _customerPayments = new PaymentTuple[](customerPayments[customerAddress].length);

        for(uint i = 0; i < customerPayments[customerAddress].length; i++){
            _customerPayments[i] = PaymentTuple(customerPayments[customerAddress])
        }
        */
        return customerPayments[customerAddress];
    }

}