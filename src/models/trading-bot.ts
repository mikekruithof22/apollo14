export class ActiveBuyOrder {
    clientOrderId: string;
    orderName: string;
    takeProfitPercentage: number;
    takeLossPercentage: number;
    minimumOrderQuantity: number;
    stepSize: number;
    tickSize: number;
}
export class ActiveOcoOrder {
    listClientOrderId: string;
}
