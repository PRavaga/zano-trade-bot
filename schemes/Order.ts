import { DataTypes, Model } from "sequelize";
import sequelize from "../database/database";
import Decimal from "decimal.js";

class Order extends Model {
    declare pair_url: string;
    declare amount: Decimal;
    declare price: Decimal;
    declare type: 'sell' | 'buy';
    declare remaining: Decimal;
    declare trade_id: string;
    declare appliedTo: number[];
}

Order.init(
    {
        id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },
        pair_url: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        amount: {
            type: DataTypes.STRING,
            allowNull: false,
            get() {
                const value = this.getDataValue("amount");
                return value !== undefined && value !== null ? new Decimal(value) : null;
            }
        },
        price: {
            type: DataTypes.STRING,
            allowNull: false,
            get() {
                const value = this.getDataValue("price");
                return value !== undefined && value !== null ? new Decimal(value) : null;
            }
        },
        type: {
            type: DataTypes.ENUM('sell', 'buy'),
            allowNull: false,
        },
        remaining: {
            type: DataTypes.STRING,
            allowNull: false,
            get() {
                const value = this.getDataValue("remaining");
                return value !== undefined && value !== null ? new Decimal(value) : null;
            }
        },
        trade_id: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        createdAt: {
            type: DataTypes.DATE,
            defaultValue: DataTypes.NOW,
        },
        updatedAt: {
            type: DataTypes.DATE,
            defaultValue: DataTypes.NOW,
        },
        appliedTo: {
            type: DataTypes.TEXT,
            allowNull: false,
            get() {
                const value = this.getDataValue("appliedTo");
                return value ? JSON.parse(value) : [];
            },
            set(value: number[]) {
                this.setDataValue("appliedTo", JSON.stringify(value));
            },
            defaultValue: JSON.stringify([]),
        }
    },
    {
        sequelize,
        tableName: "orders",
    }
);

export default Order;