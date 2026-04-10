import { PrismaClient } from '@prisma/client';
import Decimal from 'decimal.js';
import { FxConversionResponse } from '../types';

export class FxService {
  constructor(private prisma: PrismaClient) {}

  async getRate(
    baseCurrency: string,
    quoteCurrency: string,
    rateType: 'buy' | 'sell' | 'mid' = 'mid'
  ) {
    const rate = await this.prisma.fxRate.findFirst({
      where: {
        baseCurrency,
        quoteCurrency,
        effectiveAt: {
          lte: new Date(),
        },
        expiresAt: {
          gte: new Date(),
        },
      },
      orderBy: { effectiveAt: 'desc' },
    });

    if (!rate) {
      throw new Error(`No FX rate found for ${baseCurrency}/${quoteCurrency}`);
    }

    const rateValue = rateType === 'buy' ? rate.buyRate : rateType === 'sell' ? rate.sellRate : rate.midRate;
    return {
      rate: new Decimal(rateValue),
      spread: new Decimal(rate.spreadBps),
    };
  }

  async convertCurrency(
    amount: string,
    fromCurrency: string,
    toCurrency: string,
    rateType: 'buy' | 'sell' | 'mid' = 'mid'
  ): Promise<FxConversionResponse> {
    const amountDecimal = new Decimal(amount);

    if (fromCurrency === toCurrency) {
      return {
        amountIn: amount,
        amountOut: amount,
        rate: '1',
        spread: '0',
        currency: toCurrency,
      };
    }

    const { rate, spread } = await this.getRate(fromCurrency, toCurrency, rateType);

    const amountOut = amountDecimal.times(rate);
    const spreadAmount = amountOut.times(spread).dividedBy(10000);

    return {
      amountIn: amount,
      amountOut: amountOut.toString(),
      rate: rate.toString(),
      spread: spreadAmount.toString(),
      currency: toCurrency,
    };
  }

  async setRate(
    baseCurrency: string,
    quoteCurrency: string,
    midRate: string,
    buyRate: string,
    sellRate: string,
    spreadBps: number,
    expiresInHours: number = 24
  ) {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + expiresInHours * 60 * 60 * 1000);

    return this.prisma.fxRate.create({
      data: {
        baseCurrency,
        quoteCurrency,
        midRate,
        buyRate,
        sellRate,
        spreadBps,
        effectiveAt: now,
        expiresAt,
        source: 'MANUAL',
      },
    });
  }

  async getActiveRates() {
    const now = new Date();
    return this.prisma.fxRate.findMany({
      where: {
        effectiveAt: {
          lte: now,
        },
        expiresAt: {
          gte: now,
        },
      },
      orderBy: { quoteCurrency: 'asc' },
    });
  }
}
