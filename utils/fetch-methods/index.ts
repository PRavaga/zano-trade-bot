import * as env from "../../env-vars";
import axios from "axios";
import AuthParams from "../../interfaces/fetch-utils/AuthParams";
import CreateOrderData from "../../interfaces/fetch-utils/CreateOrderData";
import ApplyOrderData from "../../interfaces/fetch-utils/ApplyOrderData";
export class FetchUtils {

    static apiPath = env.CUSTOM_SERVER || "https://trade.zano.org";

    static async auth({
        address,
        alias,
        message,
        signature
    }: AuthParams) {
        return await axios.post(
            `${this.apiPath}/api/auth`,
            {
                data: {
                    address,
                    alias,
                    message,
                    signature
                }
            },
        ).then(res => res.data);
    }

    static async getUserOrdersPage(token: string, pairId: number) {
        return await axios.post(
            `${this.apiPath}/api/orders/get-user-page`, 
            {
                token,
                pairId,
            }
        ).then(res => res.data);
    }

    static async createOrder(token: string, orderData: CreateOrderData) {
        return await axios.post(
            `${this.apiPath}/api/orders/create`, 
            {
                token,
                orderData
            }
        ).then(res => res.data);
    }

    static async applyOrder(orderData: ApplyOrderData, token: string) {
        return await axios.post(
            `${this.apiPath}/api/orders/apply-order`, 
            {
                token,
                orderData,
            }
        ).then(res => res.data);
    }

    static async confirmTransaction(transactionId: string, token: string) {
        return await axios.post(
            `${this.apiPath}/api/transactions/confirm`, 
            {
                transactionId,
                token
            }
        ).then(res => res.data);
    }
    
    static async getPair(id: number) {
        return await axios.post(
            `${this.apiPath}/api/dex/get-pair`, 
            {
                id: id
            }
        ).then(res => res.data);
    }
}