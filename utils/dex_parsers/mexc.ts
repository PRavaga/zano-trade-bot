import Decimal from "decimal.js";
import * as env from "../../env-vars/index";
import { MarketState } from "../../interfaces/common/Common";
import logger from "../../logger";
import { ParserConfig } from "./parserHandler";
import { toFixedDecimalNumber } from "../utils";

interface Order {
    type: 'buy' | 'sell';
    price: string;
    baseVolume: string;
    baseVolumeUSD: string;
}

class MexcParser {

    private zanoPriceUrl = 'https://api.mexc.com/api/v3/avgPrice?symbol=ZANOUSDT';

    private marketInfoUrl = 'https://api.mexc.com/api/v3/avgPrice?symbol=ZANOUSDT';
    private tradesUrl = 'https://api.mexc.com/api/v3/depth?symbol=ZANOUSDT&limit=5000';
    private config: ParserConfig;

    private marketState: MarketState = {
        marketPrice: null,
        updatedAt: null,
        buyPrice: null,
        sellPrice: null,
        zanoPrice: null,
        depthToSell: null,
        depthToBuy: null,
    }

    constructor(config: ParserConfig) {
        this.config = config;
    }


    private async fetchMarketInfo() {
        try {
            const response = await fetch(this.marketInfoUrl, {
                headers: {
                    "Content-Type": "application/json"
                }
            }).then(res => res.json());

            if (!response.price) {
                throw new Error("Invalid response from market info API");
            }
            

            this.marketState.marketPrice = parseFloat(response.price);
            return true;
        } catch (error) {
            console.error('Error fetching market info:', error);
        }
    }
    

    private async fetchOrders() {

        function calcDepth(orders: Order[], type: 'buy' | 'sell', targetPrice: number, zanoPrice: number) {
            const volumeCalcTarget = type === 'buy' ? 'baseVolumeUSD' : 'baseVolume';
    
            const volumeToTargetPrice = orders.reduce((sum, order) => {
                if (parseFloat(order.price) >= targetPrice && type === 'buy') {
                    return sum + parseFloat(order[volumeCalcTarget]);
                } else if (parseFloat(order.price) <= targetPrice && type === 'sell') {
                    return sum + parseFloat(order[volumeCalcTarget]) * zanoPrice
                }
                return sum;
            }, 0);

            return volumeToTargetPrice;
        }
    
        try {
            const trades = await fetch(this.tradesUrl).then(res => res.json());
            
            if (!trades.bids || !trades.asks) {
                throw new Error("Invalid response from trades API");
            }
    
            const buyOrders = trades.bids.map(e => ({
                type: 'buy',
                price: parseFloat(e[0]),
                baseVolume: parseFloat(e[1]),
                baseVolumeUSD: parseFloat(e[1]) * parseFloat(e[0])
            }))
            const sellOrders = trades.asks.map(e => ({
                type: 'sell',
                price: parseFloat(e[0]),
                baseVolume: parseFloat(e[1]),
                baseVolumeUSD: parseFloat(e[1]) * parseFloat(e[0])
            }))
    
            if (
                !this.marketState.zanoPrice || 
                !this.marketState.marketPrice
            ) {
                throw new Error("Failed to calculate target prices");
            }

            // const normolizedBuy = new Decimal(calculatedBuy).div(divider);
            // const normolizedSell = new Decimal(calculatedSell).div(divider);

            // const reverseDivider = process.env.REVERSE_PAIR ? 
            //     new Decimal(this.marketState.marketPrice) : 1;


            const divider = new Decimal(this.marketState.zanoPrice);
            const marketPrice = this.marketState.marketPrice;

            const calculatedBuy =  new Decimal(marketPrice).minus(
                (new Decimal(marketPrice).div(100)).mul(this.config.percentageBuy)
            ).toNumber();

            const calculatedSell = new Decimal(marketPrice).plus(
                (new Decimal(marketPrice).div(100)).mul(this.config.percentageSell)
            ).toNumber();


            const normalizedBuy = new Decimal(calculatedBuy).div(divider).toNumber();
            const normalizedSell = new Decimal(calculatedSell).div(divider).toNumber();

            const reverseDivider = process.env.REVERSE_PAIR ? 
                new Decimal(this.marketState.marketPrice) : 1;
        
            this.marketState.buyPrice = new Decimal(normalizedBuy).div(reverseDivider).toNumber();
            this.marketState.sellPrice = new Decimal(normalizedSell).div(reverseDivider).toNumber();

            const calculatedDepthToBuy = calcDepth(buyOrders, 'buy', calculatedBuy, this.marketState.zanoPrice);
            const calculatedDepthToSell = calcDepth(sellOrders, 'sell', calculatedSell, this.marketState.zanoPrice);

            const normalizedDepthToBuy = new Decimal(calculatedDepthToBuy).div(divider).toNumber();
            const normalizedDepthToSell = new Decimal(calculatedDepthToSell).div(divider).toNumber();

            this.marketState.depthToBuy = new Decimal(normalizedDepthToBuy).div(reverseDivider).toNumber();
            this.marketState.depthToSell = new Decimal(normalizedDepthToSell).div(reverseDivider).toNumber();

            return true;
        } catch (error) {
            console.error('Error calculating prices:', error);
        }
    }

    private async updateMarketData() {
        try {
            const promiseList = [
                await this.updateZanoPrice(),
                await this.fetchMarketInfo(),
                await this.fetchOrders(),
            ]
            
            if (!promiseList.every(e => e)) {
                throw new Error("Failed to fetch market data");
            }

            this.marketState.updatedAt = +new Date();
            
        } catch (error) {
            console.error(error);
            console.log("ERROR WHILE FETCHING MEXC MARKET DATA");
        }
    }

    private async updateZanoPrice() {
        try {
            const response = await fetch(this.zanoPriceUrl, {
                headers: {
                    "Content-Type": "application/json"
                }
            }).then(res => res.json());

            if (!parseFloat(response.price)) {
                throw new Error("Invalid response from Zano price API");
            }

            this.marketState.zanoPrice = parseFloat(response.price);

            return true;
        } catch (error) {
            console.error('Error fetching Zano price:', error);
        }
    }

    private async initService() {
        while (true) {
            await this.updateMarketData();
            await new Promise(resolve => setTimeout(resolve, this.config.fetchInterval * 1000));
        }
    }

    async init() {
        logger.detailedInfo("Mexc parser is enabled. Initializing parser...");
        await this.updateMarketData();
        logger.detailedInfo("Market data fetched. Starting service...");
        this.initService();
        logger.detailedInfo("Mexc parser initialized.");
    }

    getMarketState() {
        return this.marketState;
    }
}

export { MexcParser };

const mexcParser = new MexcParser({
    fetchInterval: env.PRICE_INTERVAL_SEC,
    percentageSell: env.PRICE_SELL_PERCENT,
    percentageBuy: env.PRICE_BUY_PERCENT
});


export default mexcParser;