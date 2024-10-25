import logger from "../../logger";
import { fetchData, fetchZanod } from "../fetch-zano-wallet";
import { v4 as uuidv4 } from 'uuid';
import { addZeros } from "../utils/utils";

const ZANO_ID = "d6329b5b1f7c0805b5c345f4957554002a2f557845f64d7645dae0e051a6498a";

export class ZanoWallet {

    static async getAsset(assetId: string) {
        if (assetId === ZANO_ID) {
            return {
                asset_id:
                    "d6329b5b1f7c0805b5c345f4957554002a2f557845f64d7645dae0e051a6498a",
                ticker: "ZANO",
                full_name: "Zano",
                decimal_point: 12
            };
        } else {
            const assetRsp = await fetchZanod("get_asset_info", { asset_id: assetId }).then(res => res.json());
            const asset = assetRsp?.result?.asset_descriptor;
        
            if (!asset) {
                return undefined;
            }
        
            return asset;
        }
    }

    static async getWalletData() {
        logger.detailedInfo("Fetching address from Zano App...");
        const addressRes = await fetchData("getaddress").then(res => res.json());
        const address = addressRes?.result?.address;
        if (!address || typeof address !== "string") {
            throw new Error("Error: error while request or address is not string or not contained in response");
        }

        let alias: string | undefined;

        logger.detailedInfo("Fetching alias from Zano App...");

        const aliasRes = await fetchZanod("get_alias_by_address", address).then(res => res.json());
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

    static async ionicSwap(swapParams: any) {

        const destinationAsset = await ZanoWallet.getAsset(swapParams.destinationAssetID);
        const currentAsset = await ZanoWallet.getAsset(swapParams.currentAssetID);

        if (!destinationAsset || !currentAsset) {
            throw new Error("One or both assets not found");
        }

        const createSwapResult = await fetchData("ionic_swap_generate_proposal", {
            proposal: {
                to_initiator: [
                    {
                        asset_id: swapParams.destinationAssetID,
                        amount: addZeros(swapParams.destinationAssetAmount, destinationAsset.decimal_point),
                    },
                ],
                to_finalizer: [
                    {
                        asset_id: swapParams.currentAssetID,
                        amount: addZeros(swapParams.currentAssetAmount, currentAsset.decimal_point),
                    },
                ],
                mixins: 10,
                fee_paid_by_a: 10000000000,
                expiration_time: swapParams.expirationTimestamp,
            },
            destination_address: swapParams.destinationAddress,
        }).then(res => res.json());

        const hex = createSwapResult?.result?.hex_raw_proposal;

        if (createSwapResult?.error?.code === -7) {
            throw new Error("Insufficient funds on the wallet for creating swap proposal.");
        } else if (!hex || typeof hex !== "string") {
            throw new Error("Zano App responded with an error during swap proposal creation: " + JSON.stringify(createSwapResult?.error?.message));
        }

        return hex;
    }

    static async ionicSwapAccept(hexRawProposal: string) {
        const confirmSwapResult = await fetchData("ionic_swap_accept_proposal", {
            hex_raw_proposal: hexRawProposal,
        }).then(res => res.json());

        if (confirmSwapResult?.error?.code === -7) {
            throw new Error("Insufficient funds on the wallet for finalizing swap proposal.");
        } else if (!confirmSwapResult?.result) {
            throw new Error("Zano App responded with an error during swap proposal finalization: " + confirmSwapResult?.data?.error?.message);
        }
    }
}