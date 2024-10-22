import * as env from "../../env-vars";
import axios from "axios";
import AuthParams from "../../interfaces/fetch-utils/AuthParams";
import CreateOrderData from "../../interfaces/fetch-utils/CreateOrderData";
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
}