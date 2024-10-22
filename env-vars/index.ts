import "dotenv/config";
import Decimal from "decimal.js";
import { URL } from "url";

const intRegexp = /^[0-9]+$/;

function envToDecimal(envVar: string, envVarName: string) {
    try {
        return new Decimal(envVar);
    } catch {
        throw new Error(`${envVarName} .env variable is not numeric`);
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

if (!process.env.PAIR_URL) {
    throw new Error("PAIR_URL is not specified in .env file");
}

if (!process.env.AMOUNT) {
    throw new Error("AMOUNT is not specified in .env file");
}

if (!process.env.PRICE) {
    throw new Error("PRICE is not specified in .env file");
}

if (!process.env.API_TOKEN) {
    throw new Error("API_TOKEN is not specified in .env file");
}

export const PRICE = envToDecimal(process.env.PRICE, "PRICE");
export const AMOUNT = envToDecimal(process.env.AMOUNT, "AMOUNT");

export const SIMPLEWALLET_PORT = process.env.SIMPLEWALLET_PORT 
    ? envToInt(process.env.SIMPLEWALLET_PORT, "SIMPLEWALLET_PORT") 
    : undefined;

export const PAIR_ID = idFromPairUrl(process.env.PAIR_URL);
export const CUSTOM_SERVER = process.env.CUSTOM_SERVER || "https://trade.zano.org";
export const API_TOKEN = process.env.API_TOKEN;
export const DISABLE_INFO_LOGS = process.env.DISABLE_INFO_LOGS === "true";