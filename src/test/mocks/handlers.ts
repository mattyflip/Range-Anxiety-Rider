import { http, HttpResponse } from 'msw';

export const handlers = [
  http.post('/api/calculate-range', () => {
    return HttpResponse.json({
      remainingMiles: 50,
      burnRate: 15,
      efficiencyWhMi: 20
    });
  }),
  http.post('/api/create-checkout-session', () => {
    return HttpResponse.json({
      url: 'https://checkout.stripe.com/pay/cs_test_123'
    });
  })
];
