import logger from "../../logger";
import { fetchData } from "../fetch-zano-wallet";
import { v4 as uuidv4 } from 'uuid';

export class ZanoWallet {
    static async getWalletData() {
        logger.detailedInfo("Fetching address from Zano App...");
        const addressRes = await fetchData("getaddress").then(res => res.json());
        const address = addressRes?.result?.address;
        if (!address || typeof address !== "string") {
            throw new Error("Error: error while request or address is not string or not contained in response");
        }

        let alias: string | undefined;

        logger.detailedInfo("Fetching alias from Zano App...");

        const aliasRes = await fetchData("get_alias_by_address", address).then(res => res.json());
        if (aliasRes.result?.status === "OK" && aliasRes.result.alias_info_list[0].alias) {
            const aliasData = aliasRes.result.alias_info_list[0].alias;
            if (typeof aliasData === "string") {
                alias = aliasData;
            }
        }

        logger.detailedInfo("Generating message for signing with wallet private key in Zano App...");

        const message = uuidv4();

        logger.detailedInfo("Translating message to base64 format...");

        const signRequest = {
            "buff": Buffer.from(message).toString("base64"),
        };

        logger.detailedInfo("Fetching Zano App for message sign...");

        const signRes = await fetchData("sign_message", signRequest).then(res => res.json());

        const signature = signRes?.result?.sig;

        if (typeof signature !== "string") {
            throw new Error("Error: error while request or signature is not a string or is not contained in response");
        }

        return {
            address,
            alias,
            message,
            signature,
        }
    }
}