// SPDX-License-Identifier: GPL-3.0
// define which compiler to use
// VERSION = 1.0.0
pragma solidity >=0.7.0 <0.9.0;
 
contract vecchio {
    
    address payable private sellerAddress;
    address payable private contractOwnerAddress;
    uint private amount;
    uint private unlockCode;

    enum ContractState {Created, Filled, Closed, Canceled}

    ContractState private state;

    /// only the owner of the contract can call this function
    error OnlyOwner();
    /// only the seller can call this function
    error OnlySeller();
    /// The function cannot be called at the current state.
    error InvalidState();

    modifier onlyOwner() {
        if (msg.sender != contractOwnerAddress)
            revert OnlyOwner();
        _;
    }

    modifier onlySeller() {
        if (msg.sender != sellerAddress)
            revert OnlySeller();
        _;
    }

    modifier inState(ContractState state_) {
        if (state != state_)
            revert InvalidState();
        _;
    }

    modifier condition(bool condition_) {
        require(condition_);
        _;
    }

    /**************************************
     *              EVENTS
     *************************************/
    event Aborted();
    event PurchaseConfirmed();
    event ItemReceived();
    event OwnerRefunded();

    /**************************************
     *             FUNCTIONS
     *************************************/

    constructor(address payable _sellerAddress, uint _amount) payable {
        contractOwnerAddress = payable(msg.sender);
        sellerAddress = _sellerAddress;
        amount = _amount;
        state = ContractState.Created;
    }

    /// Abort the purchase and reclaim the ether (timer/dashboard)
    /// Can only be called by the smart contract owner before
    /// the contract is filled.
    function abort()
        external
        onlyOwner
        inState(ContractState.Created)
    {
        emit Aborted();
        state = ContractState.Canceled;
        // We use transfer here directly. It is
        // reentrancy-safe, because it is the
        // last call in this function and we
        // already changed the state.
        contractOwnerAddress.transfer(address(this).balance);
    }

    /// Confirm the purchase as buyer.
    /// Transaction has to include `2 * value` ether.
    /// The ether will be locked until confirmReceived
    /// is called.
    function confirmPurchase()
        external
        inState(ContractState.Created)
        condition(msg.value >= amount)
        payable
    {
        //address(this).transfer(msg.value);        // this transfer is implicit
        emit PurchaseConfirmed();
        unlockCode = block.number;
        state = ContractState.Filled;
    }

    /// Confirm that the smart contract's owner received the item.
    /// This will release the locked ether.
    function confirmReceived(uint _unlockCode)
        external
        onlyOwner
        inState(ContractState.Filled)
        condition(_unlockCode == unlockCode)
    {
        sellerAddress.transfer(amount);
        emit ItemReceived();
        // It is important to change the state first because
        // otherwise, the contracts called using `send` below
        // can call in again here.
        state = ContractState.Closed;
    }

    /// This function refunds the seller, i.e.
    /// pays back the locked funds of the seller.
    function refundOwner()
        external
        onlyOwner
        inState(ContractState.Filled)
    {
        contractOwnerAddress.transfer(amount);
        emit OwnerRefunded();
        // It is important to change the state first because
        // otherwise, the contracts called using `send` below
        // can call in again here.
        state = ContractState.Canceled;
    }

    /**************************************
     *             UTILITY
     *************************************/
    /*
    function stringCompare (string memory str1, string memory str2) internal pure returns(bool) {
        return keccak256(abi.encodePacked(str1)) == keccak256(abi.encodePacked(str2));
    }
    */


    /**************************************
     *             GETTER
     *************************************/

    function balanceOf() external view returns(uint) {
        return address(this).balance;
    }

    function getOwnerAddress() external view returns(address) {
        return contractOwnerAddress;
    }

    function getSellerAddress() external view returns(address) {
        return sellerAddress;
    }

    function getAmountToPay() external view returns(uint) {
        return amount;
    }

    function getContractState() external view returns(ContractState) {
        return state;
    }

    function getUnlockCode() external view returns(uint) {
        return unlockCode;
    }

    /*
    event UnlockContract (
        uint date,
        address to,
        uint amount
    );

    function setParameters(address payable _sellerAddress, uint _amount) public {
        sellerAddress = _sellerAddress;
        amount = _amount;
    }

    function getSellerAddress() public view returns (address) {
        return sellerAddress;
    }

    function getAmount() public view returns (uint) {
        return amount;
    }

    function sendToContract() public payable {
        //address(this).transfer(msg.value);  // msg.sender is implicity
    }

    function unlockToSeller(string memory unlockCode) external {
        require(
            keccak256(abi.encodePacked(unlockCode)) == keccak256(abi.encodePacked("12345")),
            "Wrong unlock code"
        );

        sellerAddress.transfer(amount);
        emit UnlockContract(block.timestamp, sellerAddress, amount);
    }

    */

}

// Helper functions are defined outside of a contract
