export class ActiveBuyOrder {
    clientOrderId: string;
    orderName: string;
    takeProfitPercentage: number;
    takeLossPercentage: number;
    minimumOrderQuantity: number;
    stepSize: number;
    tickSize: number;
    status: string;
}
export class ActiveOcoOrder {
    listClientOrderId: string;
}
