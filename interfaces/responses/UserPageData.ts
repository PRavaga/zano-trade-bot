export interface UserPageData {
    data: {
        orders: {
            id: number;
            type: string;
            timestamp: string;
            side: string;
            price: string;
            amount: string;
            total: string;
            pair_id: number;
            user_id: number;
            status: string;
            left: string;
            hasNotification: boolean;
            createdAt: string;
            updatedAt: string;
            isInstant: boolean;
        }[];

        applyTips: {
            id: number;
            left: string;
            price: string;
            user: {
                alias: string;
                address: string;
                createdAt: string;
                updatedAt: string;
            };
            type: string;
            total: string;
            connected_order_id: number;
            transaction: boolean;
            hex_raw_proposal: string;
            isInstant: boolean;
        }[];
    }
}