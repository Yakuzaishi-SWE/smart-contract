// SPDX-License-Identifier: GPL-3.0
// define which compiler to use
// VERSION = 1.0.0
import "./OrderManager.sol";

pragma solidity >=0.7.0 <=0.8.12;   // version with major support and testing

contract MoneyBoxManager is OrderManager {

    struct Payment {
        address payable from;
        uint feeAmount;
        uint256 datetime;
    }

    mapping (string => Payment[]) private payments;

    /**************************************
     *             MODIFIERS
     *************************************/

    modifier moneyBoxNotClosed(string memory id) {
        require(
            OrderManager.orders[id].state != OrderState.Closed,
            "MoneyBox is closed, you can't call this function when it's in this state"
        );
        _;
    }

    /**************************************
     *              EVENTS
     *************************************/
    
    event NewPayment (
        string id
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

        emit OrderCreated(_orderId);
    }

    // this function miss the control of valid moneybox id
    function newPayment(string memory moneyBoxId, uint _feeAmount) 
        external
        payable
        enoughFunds(msg.sender, _feeAmount)
    {
        require(
            msg.value >= _feeAmount,
            "Insufficient coin value"
        );

        payments[moneyBoxId].push(
            Payment(payable(msg.sender), _feeAmount, block.timestamp)
        );

        emit NewPayment(moneyBoxId);
    }

    function refund(string memory id)
        override
        external
        isOwnerOrSeller(id)
        moneyBoxNotClosed(id)
    {
        Payment[] memory ps = payments[id];
        for (uint i = 0; i < ps.length; i++) {
            ps[i].from.transfer(ps[i].feeAmount);
        }
        orders[id].state = OrderState.Cancelled;
        emit OwnerRefunded(id);
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
            paid += ps[i].feeAmount;
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


}