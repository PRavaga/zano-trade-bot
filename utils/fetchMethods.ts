import * as env from "../env-vars";
import axios from "axios";
import AuthParams from "../interfaces/fetch-utils/AuthParams";
import CreateOrderData from "../interfaces/fetch-utils/CreateOrderData";
import ApplyOrderData from "../interfaces/fetch-utils/ApplyOrderData";
import { UserPageData } from "../interfaces/responses/UserPageData";


interface userOrdersPage extends UserPageData {
    success: boolean;
}

export class FetchUtils {

    static apiPath = env.CUSTOM_SERVER || "https://trade.zano.org";

    static async auth({
        address,
        alias,
        message,
        signature
    }: AuthParams): Promise<{
        success: boolean;
        data: string; // token or error message
    }> {
        return await axios.post(
            `${this.apiPath}/api/auth`,
            {
                data: {
                    address,
                    alias,
                    message,
                    signature
                },
                neverExpires: true
            },
        ).then(res => res.data);
    }

    static async getUserOrdersPage(token: string, pairId: number): Promise<userOrdersPage> {
        return await axios.post(
            `${this.apiPath}/api/orders/get-user-page`, 
            {
                token,
                pairId,
            }
        ).then(res => res.data);
    }

    static async createOrder(token: string, orderData: CreateOrderData): Promise<{
        success: boolean;
        data?: string // error message
    }> {
        return await axios.post(
            `${this.apiPath}/api/orders/create`, 
            {
                token,
                orderData
            }
        ).then(res => res.data);
    }

    static async deleteOrder(token: string, orderId: number): Promise<{
        success: boolean;
        data?: string // error message
    }> {
        return await axios.post(
            `${this.apiPath}/api/orders/cancel`, 
            {
                orderId,
                token
            }
        ).then(res => res.data);
    }

    static async applyOrder(orderData: ApplyOrderData, token: string): Promise<{
        success: boolean;
        data?: string // error message
    }> {
        return await axios.post(
            `${this.apiPath}/api/orders/apply-order`, 
            {
                token,
                orderData,
            }
        ).then(res => res.data);
    }

    static async confirmTransaction(transactionId: number, token: string): Promise<{
        success: boolean;
        data?: string // error message
    }> {
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

    // to maintain "instant" badge on order.
    static async pingActivityChecker(orderId: number, token: string): Promise<{
        sucess: boolean;
        data?: string // error message
    }> {
        return await axios.post(
            `${this.apiPath}/api/dex/renew-bot`, 
            {
                orderId,
                token
            }
        ).then(res => res.data);
    }

    static async getActiveTxByOrdersIds(firstOrderId: number, secondOrderId: number, token: string): Promise<{
        success: boolean;
        data?: {
            buy_order_id: number;
            sell_order_id: number;
            amount: string;
            timestamp: number;
            status: string;
            creator: string;
            hex_raw_proposal: string;
        } 
        | string // error message
    }> {
        return await axios.post(
            `${this.apiPath}/api/transactions/get-active-tx-by-orders-ids`, 
            {
                firstOrderId,
                secondOrderId,
                token
            }
        ).then(res => res.data);
    }
}