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
            "/api/auth",
            {
                address,
                alias,
                message,
                signature
            },
        ).then(res => res.data);
    }
}