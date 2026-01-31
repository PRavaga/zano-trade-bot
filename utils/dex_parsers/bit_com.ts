import Decimal from "decimal.js";
import * as env from "../../env-vars/index";
import { MarketState } from "../../interfaces/common/Common";
import logger from "../../logger";
import { ParserConfig } from "./parserHandler";
import { calcDepth } from "./common";

class BitComParser {

    private zanoPriceUrl = 'https://api.mexc.com/api/v3/avgPrice?symbol=ZANOUSDT';

    private marketInfoUrl: string;
    private tradesUrl: string;
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
        this.marketInfoUrl = `https://api.bit.com/um/v1/index_price?currency=${config.firstCurrency}&quote_currency=${config.secondCurrency}`;
        this.tradesUrl = `https://api.bit.com/spot/v1/orderbooks?pair=${config.firstCurrency}-${config.secondCurrency}&level=50`;
    }


    private async fetchMarketInfo() {
        try {
            const response = await fetch(this.marketInfoUrl, {
                headers: {
                    "Content-Type": "application/json"
                }
            }).then(res => res.json());

            const price = response?.data?.[0]?.index_price;


            if (!price) {
                throw new Error("Invalid response from market info API");
            }


            this.marketState.marketPrice = parseFloat(price);
            return true;
        } catch (error) {
            console.error('Error fetching market info:', error);
        }
    }


    private async fetchOrders() {

        try {
            const trades = await fetch(this.tradesUrl).then(res => res.json()).then(r => r?.data).catch(e => {
                console.log(e);
                
            });

            if (!trades.bids || !trades.asks) {
                throw new Error("Invalid response from trades API");
            }

            const buyOrders = trades.bids.map((e: [string, string]) => ({
                type: 'buy',
                price: parseFloat(e[0]),
                baseVolume: parseFloat(e[1]),
                baseVolumeUSD: parseFloat(e[1]) * parseFloat(e[0])
            }))
            const sellOrders = trades.asks.map((e: [string, string]) => ({
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

            const divider = this.config.pairAgainstStablecoin ? new Decimal(this.marketState.zanoPrice) : 1;
            const marketPrice = this.marketState.marketPrice;

            const calculatedBuy = new Decimal(marketPrice).minus(
                (new Decimal(marketPrice).div(100)).mul(this.config.percentageBuy)
            ).toNumber();

            const calculatedSell = new Decimal(marketPrice).plus(
                (new Decimal(marketPrice).div(100)).mul(this.config.percentageSell)
            ).toNumber();


            const calculatedBuyInZano = new Decimal(calculatedBuy).div(divider).toNumber();
            const calculatedSellInZano = new Decimal(calculatedSell).div(divider).toNumber();

            this.marketState.buyPrice = calculatedBuyInZano;
            this.marketState.sellPrice = calculatedSellInZano;

            const calculatedDepthToBuy = calcDepth(buyOrders, 'buy', calculatedBuy);
            const calculatedDepthToSell = calcDepth(sellOrders, 'sell', calculatedSell);

            const depthToBuyInZano = new Decimal(calculatedDepthToBuy).div(divider).toNumber();
            const depthToSellInZano = new Decimal(calculatedDepthToSell).div(divider).toNumber();

            this.marketState.depthToBuy = new Decimal(depthToBuyInZano).toNumber();
            this.marketState.depthToSell = new Decimal(depthToSellInZano).toNumber();

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
        console.log(this.marketState);
        
        return this.marketState;
    }
}

export default BitComParser;