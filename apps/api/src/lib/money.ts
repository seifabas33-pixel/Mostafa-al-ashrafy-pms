export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export interface TaxBreakdown {
  net: number;
  service: number;
  tax: number;
  gross: number;
}

/**
 * Egyptian and Saudi hotel practice: service charge is added on the net, VAT is applied
 * on net + service. Rates are percentages (14 and 12 in Egypt; 15 and 0 in Saudi).
 */
export function computeTax(net: number, vatRate: number, serviceRate: number): TaxBreakdown {
  const service = round2(net * (serviceRate / 100));
  const tax = round2((net + service) * (vatRate / 100));
  return { net: round2(net), service, tax, gross: round2(net + service + tax) };
}
