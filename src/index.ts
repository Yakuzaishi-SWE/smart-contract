import { Contract } from "web3-eth-contract";
import { AbiItem } from "web3-utils";
import SP from '../build/contracts/ShopChain.json';

export const loadAbis = (): AbiItem[] => { return SP as unknown as AbiItem[]; }

class ContractService {
    constructor(private readonly contract: Contract) { }

    /*****************************************************************
     * 
     *                      SEND FUNCTIONS()
     * 
     ****************************************************************/

    async newOrder(buyer: string, { seller, amount, t_id }: { seller: string, amount: number, t_id: string }): Promise<object> {
        return await this.contract.methods
            .newOrder(seller, amount, t_id)
            .send({ from: buyer, value: amount });
    }

    async confirmReceived(buyer: string, { order_id, unlockCode }: { order_id: number, unlockCode: number }): Promise<object> {
        return await this.contract.methods
            .confirmReceived(order_id, unlockCode)
            .send({ from: buyer });
    }

    async refundFromOwner(buyer: string, { order_id }: { order_id: number }): Promise<object> {
        return await this.contract.methods
            .refundFromOwner(order_id)
            .send({ from: buyer });
    }

    async refundFromSeller(seller: string, { order_id }: { order_id: number }): Promise<object> {
        return await this.contract.methods
            .refundFromSeller(order_id)
            .send({ from: seller });
    }

    /*****************************************************************
     * 
     *                      CALL FUNCTIONS()
     * 
     ****************************************************************/

    async getOrderCount(): Promise<number> {
        return await this.contract.methods.getOrderCount().call();
    }

    async getContractBalance(): Promise<number> {
        return await this.contract.methods.contractBalance().call();
    }

    async getOwnerAddress(order_id: number): Promise<string> {
        return await this.contract.methods.getOwnerAddress(order_id).call();
    }

    async getSellerAddress(order_id: number): Promise<string> {
        return await this.contract.methods.getSellerAddress(order_id).call();
    }

    async getAmountToPay(order_id: number): Promise<number> {
        return await this.contract.methods.getAmountToPay(order_id).call();
    }

    async getOrderState(order_id: number): Promise<number> {
        return await this.contract.methods.getOrderState(order_id).call();
    }

    async getUnlockCode(order_id: number): Promise<number> {
        return await this.contract.methods.getUnlockCode(order_id).call();
    }

    async getOrderById(order_id: number): Promise<object> {
        return await this.contract.methods.getOrderById(order_id).call();
    }

    async getOrdersByBuyer(buyer: string): Promise<Array<object>> {
        return await this.contract.methods.getOrdersByBuyer(buyer).call();
    }

    async getOrdersBySeller(seller: string): Promise<Array<object>> {
        return await this.contract.methods.getOrdersBySeller(seller).call();
    }
}

export default ContractService;
