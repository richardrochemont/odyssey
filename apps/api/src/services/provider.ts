export interface PaymentSessionResult {
  sessionId: string;
  sessionUrl: string;
}

export interface WebhookEventResult {
  providerId: string;
  amount: number; // in cents
  status: "paid" | "failed" | "refunded";
  leaseId: string;
  tenantId: string;
  idempotencyKey: string;
  metadata?: any;
}

export interface PaymentProvider {
  createPaymentSession(params: {
    orgId: string;
    tenantId: string;
    leaseId: string;
    amount: number; // in cents
  }): Promise<PaymentSessionResult>;
  verifyWebhookSignature(payload: string, signature: string): Promise<boolean>;
  parseWebhook(body: any): Promise<WebhookEventResult>;
  getPaymentStatus(providerId: string): Promise<"paid" | "failed" | "pending">;
}

export interface BankTransaction {
  id: string;
  amount: number; // in cents (negative for expense, positive for income)
  date: Date;
  vendor: string;
  description: string;
  category: string;
}

export interface BankDataProvider {
  linkAccount(orgId: string): Promise<{ linkToken: string }>;
  syncTransactions(orgId: string, accountId: string): Promise<BankTransaction[]>;
}

// MOCK IMPLEMENTATIONS FOR LOCAL DEVELOPMENT
export class MockPaymentProvider implements PaymentProvider {
  async createPaymentSession(params: {
    orgId: string;
    tenantId: string;
    leaseId: string;
    amount: number;
  }): Promise<PaymentSessionResult> {
    const sessionId = `mock_sess_${Math.random().toString(36).substring(7)}`;
    const sessionUrl = `https://checkout.odyssey.com/pay/${sessionId}?amount=${params.amount}`;
    console.log(`[MockPaymentProvider] Created session ${sessionId} for lease ${params.leaseId} ($${(params.amount / 100).toFixed(2)})`);
    return { sessionId, sessionUrl };
  }

  async verifyWebhookSignature(_payload: string, signature: string): Promise<boolean> {
    // For local testing, we accept signatures containing 'mock_sig'
    return signature.includes("mock_sig");
  }

  async parseWebhook(body: any): Promise<WebhookEventResult> {
    const { providerId, amount, status, leaseId, tenantId, idempotencyKey, metadata } = body;
    if (!providerId || !amount || !status || !leaseId || !tenantId || !idempotencyKey) {
      throw new Error("Invalid webhook payload format");
    }
    return {
      providerId,
      amount,
      status,
      leaseId,
      tenantId,
      idempotencyKey,
      metadata,
    };
  }

  async getPaymentStatus(providerId: string): Promise<"paid" | "failed" | "pending"> {
    console.log(`[MockPaymentProvider] Looking up status for ${providerId}`);
    return "paid";
  }
}

export class MockBankDataProvider implements BankDataProvider {
  async linkAccount(orgId: string): Promise<{ linkToken: string }> {
    return { linkToken: `mock_link_token_${orgId}` };
  }

  async syncTransactions(orgId: string, accountId: string): Promise<BankTransaction[]> {
    console.log(`[MockBankDataProvider] Syncing transactions for account ${accountId} in org ${orgId}`);
    // Return sample bank ledger data
    return [
      {
        id: "tx_mock_1",
        amount: -45000, // $450 expense
        date: new Date(),
        vendor: "Apex Plumbing & Drain",
        description: "Kitchen leak pipe repair service",
        category: "repairs_and_maintenance",
      },
      {
        id: "tx_mock_2",
        amount: -12550, // $125.50 expense
        date: new Date(Date.now() - 24 * 60 * 60 * 1000),
        vendor: "Home Depot",
        description: "Lightbulbs and unit cleanup supplies",
        category: "supplies",
      },
      {
        id: "tx_mock_3",
        amount: 150000, // $1500 income
        date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
        vendor: "Tenant Alice",
        description: "Rent Payment direct transfer",
        category: "rent",
      },
    ];
  }
}

// Global Exported Instances
export const paymentProvider: PaymentProvider = new MockPaymentProvider();
export const bankDataProvider: BankDataProvider = new MockBankDataProvider();
