import * as env from "../../env-vars";
import axios from "axios";
import AuthParams from "../../interfaces/fetch-utils/AuthParams";

export class FetchUtils {
    static async auth({
        address,
        alias,
        message,
        signature
    }: AuthParams) {
        return await axios.post(
            `${env.CUSTOM_SERVER || "https://trade.zano.org"}/api/auth`,
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
            "/api/orders/get-user-page", 
            {
                token,
                pairId,
            }
        ).then(res => res.data);
    }
}