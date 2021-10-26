import fetch from '../../node_modules/node-fetch/lib/index.js';

export default class DoNotPlaceOrderLogic {

    public async btc24HourChange(): Promise<number> {
        const url = 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=eur&include_market_cap=true&include_24hr_change=true';
        return fetch(url)
            .then(res => { return res.json() })
            .then(data => {
                return data.bitcoin.eur_24h_change;
            }).catch(error => console.log(error));
    }

    /*
        {
        "bitcoin":{
            "eur":54237,
            "eur_market_cap":1007436631489.5332,
            "eur_24h_change":-1.358120411761996
        }
    */
}