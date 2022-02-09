import { Contract } from "web3-eth-contract";

class ContractService {
    constructor(private readonly contract: Contract) { }

    async newOrder(from: string, { amount, seller, t_id }: { amount: number, seller: string, t_id: string }): Promise<object> {
        return await this.contract.methods
            .newOrder(seller, amount, t_id)
            .send({ from, value: amount });
    }

    async getContractBalance(): Promise<number> {
        return await this.contract.methods.contractBalance().call();
    }
}

export default ContractService;
