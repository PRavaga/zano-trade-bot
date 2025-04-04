import "dotenv/config";
import Decimal from "decimal.js";
import { URL } from "url";
import OfferType from "../interfaces/common/OfferType";
import fs from "fs";
import { ConfigItem, ConfigItemParsed, ConfigParsed } from "../interfaces/common/Config";
import { env } from "process";

const intRegexp = /^[0-9]+$/;

function numToDecimal(envVar: string, envVarName: string) {
    try {
        return new Decimal(envVar);
    } catch {
        throw new Error(`${envVarName} is not numeric`);
    }
}

function envToInt(envVar: string, envVarName: string) {
    const errMsg = `${envVarName} .env variable is not positive integer value`;

    if (!intRegexp.test(envVar)) {
        throw new Error(errMsg);
    }

    const int = parseInt(envVar, 10);

    if (isNaN(int)) {
        throw new Error(errMsg);
    }

    return int;
}

function idFromPairUrl(stringUrl: string) {
    const parsedUrl = new URL(stringUrl);
    
    const pairIdStr = parsedUrl.pathname.split("/").filter(e => !!e).at(-1);

    if (!pairIdStr || !intRegexp.test(pairIdStr)) {
        throw new Error("PAIR_URL is not valid");
    }

    const pairId = parseInt(pairIdStr, 10);

    if (isNaN(pairId)) {
        throw new Error("PAIR_URL is not valid");
    }

    return pairId;
}


if (!process.env.ZANOD_URL) {
    throw new Error("ZANOD_URL is not specified in .env file");
}

export const SIMPLEWALLET_PORT = process.env.SIMPLEWALLET_PORT 
    ? envToInt(process.env.SIMPLEWALLET_PORT, "SIMPLEWALLET_PORT") 
    : undefined;

export const CUSTOM_SERVER = process.env.CUSTOM_SERVER || "https://trade.zano.org";
export const API_TOKEN = process.env.API_TOKEN || "";

export const DELETE_ON_START = process.env.DELETE_ON_START === "true";

export const ZANOD_URL = process.env.ZANOD_URL.endsWith("/") ? process.env.ZANOD_URL.slice(0, -1) : process.env.ZANOD_URL;

export const DISABLE_INFO_LOGS = process.env.DISABLE_INFO_LOGS === "true";

export const readConfig: ConfigParsed = (() => {
    try {
        const config = JSON.parse(fs.readFileSync("config.json", "utf-8"));

        const preparedConfig = config.map((item: ConfigItem, index: number) => {
            const parsedAmount = numToDecimal(item.amount, `CONFIG[${index}].amount`);
            const parsedPrice = numToDecimal(item.price, `CONFIG[${index}].price`);
            const parsedType = item.type.toLowerCase() === "buy" ? "buy" : "sell" as OfferType;
            const parsedPairUrl = idFromPairUrl(item.pair_url);


            return {
                pairId: parsedPairUrl,
                amount: parsedAmount,
                price: parsedPrice,
                type: parsedType,
            };
        });

        return preparedConfig;

    } catch (error) {
        console.error(error);
        throw new Error("config.json file is not found or invalid");
    }
})();
