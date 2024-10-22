import CurrencyType from "./CurrencyType.ts";

export interface Asset {
    asset_id: string;
    logo: string;
    price_url: string;
    ticker: string;
    full_name: string;
    total_max_supply: bigint;
    current_supply: bigint;
    decimal_point: number;
    meta_info: string;
}

interface CurrencyRow {
    id: string;
    name: string;
    code: string;
    type?: CurrencyType;
    asset_id?: string | null;
    asset_info?: Asset;
}

export default CurrencyRow;