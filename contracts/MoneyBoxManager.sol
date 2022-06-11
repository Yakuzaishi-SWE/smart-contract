// SPDX-License-Identifier: GPL-3.0
// define which compiler to use
// VERSION = 1.2.2
import "./OrderManager.sol";

pragma solidity ^0.8.0;  // versions with major support and testing

contract MoneyBoxManager is OrderManager {

    struct Payment {
        address payable from;
        uint amount;
        uint256 timestamp;
    }

    /*
    struct PaymentTuple {
        string id;
        Order moneybox;
    }
    */

    mapping (string => Payment[]) private payments;
    mapping (address => string[]) private participantMoneyBoxes;

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
    /// The ether will be locked until confirmReceived
    /// is called.
    // amountIn == FTM | amountOut == USDT (think always as liquidity pool)
    function newOrder(address payable _seller, uint _amountIn, uint[] memory _amountOut, string memory _orderId)
        override
        public
        payable
        notItself(_seller, msg.sender)
        isUniqueId(_orderId)
    {
        OrderManager.orderCount++;
        OrderManager.orders[_orderId] = Order(_seller, payable(msg.sender), _amountOut[0], block.number, block.timestamp, OrderState.Created);
        
        // link order to search mappings
        OrderManager.buyerOrders[msg.sender].push(_orderId);
        OrderManager.sellerOrders[_seller].push(_orderId);

        if(msg.value > 0){
            this.newPayment{ value: msg.value }(_orderId, msg.value, _amountOut[1]);
        }

        emit OrderCreated(_orderId, _seller, payable(msg.sender), _amountOut[0], block.timestamp, OrderState.Created);

    }

    // this function miss the control of valid moneybox id
    function newPayment(string memory moneyBoxId, uint _amountIn, uint _amountOut) 
        public
        payable
        enoughFunds(tx.origin, _amountIn)
    {
        require(
            msg.value > 0,
            "Insufficient coin value"
        );
        
        Payment memory _payment = Payment(payable(tx.origin), _amountOut, block.timestamp);

        payments[moneyBoxId].push(_payment);

        // link payment to search map
        participantMoneyBoxes[tx.origin].push(moneyBoxId);

        if(this.getAmountToFill(moneyBoxId) <= 0)
            orders[moneyBoxId].state = OrderState.Filled;

        // stablecoin swap
        address[] memory path = new address[](2);
        path[0] = WFTM;
        path[1] = STABLECOIN;

        uint256[] memory feedbackAmounts = uniswapV2Router.swapETHForExactTokens{value: msg.value}(_amountOut, path, address(this), block.timestamp);

        if(feedbackAmounts[0] < msg.value){
            payable(tx.origin).transfer(msg.value - feedbackAmounts[0]);
        }

        emit NewPaymentCreated(moneyBoxId, _amountOut, tx.origin, block.timestamp);
    }

    function refund(string memory id)
        override
        public
        isOwnerOrSeller(id)
        moneyBoxNotClosedOrCancelled(id)
    {
        Payment[] memory ps = payments[id];
        for (uint i = 0; i < ps.length; i++) {
            //ps[i].from.transfer(ps[i].amount);
            require(
                IERC20(STABLECOIN).transfer(ps[i].from, ps[i].amount), 
                "Transfer failed."
            );
        }

        orders[id].state = OrderState.Cancelled;
        emit OwnerRefunded(id, orders[id].sellerAddress, orders[id].ownerAddress, orders[id].amount, block.timestamp, OrderState.Cancelled);
    }

    /**************************************
     *             GETTERS
     *************************************/

    function getMoneyBoxPayments(string memory id)
        public
        view
        returns(Payment[] memory)
    {
        return payments[id];
    }

    function getAmountToFill(string memory id)
        public
        view
        returns(uint)
    {
        uint total = this.getAmountToPay(id);
        uint paid = 0;
        Payment[] memory ps = payments[id];
        for (uint i = 0; i < ps.length; i++) {
            paid += ps[i].amount;
        }

        if(total < paid)
            return 0;
        else
            return total - paid;
    }

    /*
    function compareStrings(string memory a, string memory b) public pure returns (bool) {
        return (keccak256(abi.encodePacked((a))) == keccak256(abi.encodePacked((b))));
    }
    */

    function ConcatenateArrays(OrderTuple[] memory primo, OrderTuple[] memory secondo) internal pure returns(OrderTuple[] memory) {
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
        public
        view
        returns(OrderTuple[] memory)
    {
        OrderTuple[] memory super_orders = superContract.getOrdersByBuyer(_buyerAddress);
        OrderTuple[] memory this_orders = this.getOrdersByBuyer(_buyerAddress);
        
        return ConcatenateArrays(super_orders, this_orders);
    }

    function getAllSellerOrders(OrderManager superContract, address _sellerAddress)
        public
        view
        returns(OrderTuple[] memory)
    {
        OrderTuple[] memory super_orders = superContract.getOrdersBySeller(_sellerAddress);
        OrderTuple[] memory this_orders = this.getOrdersBySeller(_sellerAddress);
        
        return ConcatenateArrays(super_orders, this_orders);
    }


    function getMoneyBoxesByParticipantAddress(address participantAddress)
        public
        view
        returns(OrderTuple[] memory)
    {
        OrderTuple[] memory pays = new OrderTuple[](participantMoneyBoxes[participantAddress].length);

        for(uint i = 0; i < participantMoneyBoxes[participantAddress].length; i++){
            pays[i] = OrderTuple(participantMoneyBoxes[participantAddress][i], orders[participantMoneyBoxes[participantAddress][i]]);
        }

        return pays;
    }
}