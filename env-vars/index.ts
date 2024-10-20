import "dotenv/config";
import Decimal from "decimal.js";

function envToDecimal(envVar: string) {
    try {
        return new Decimal(envVar);
    } catch {
        throw new Error("AMOUNT .env variable is not numeric");
    }
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

export const PRICE = envToDecimal(process.env.PRICE);
export const AMOUNT = envToDecimal(process.env.AMOUNT);
export const PAIR_URL = process.env.PAIR_URL;
export const CUSTOM_WS_SERVER = process.env.CUSTOM_WS_SERVER;