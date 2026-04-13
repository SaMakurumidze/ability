const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002';

type ApiOptions = {
  method?: 'GET' | 'POST';
  token?: string;
  body?: unknown;
};

async function apiRequest<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (options.token) headers.Authorization = `Bearer ${options.token}`;

  const response = await fetch(`${API_URL}${path}`, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof data?.error === 'string' ? data.error : 'Request failed.';
    throw new Error(message);
  }
  return data as T;
}

export type LoginResponse = {
  token: string;
  user: {
    id: string;
    email: string;
    full_name: string | null;
    wallet_class:
      | 'investor'
      | 'issuer_company'
      | 'issuer_government'
      | 'business_vendor'
      | 'business_contractor';
  };
};

export type MeResponse = {
  wallet_class:
    | 'investor'
    | 'issuer_company'
    | 'issuer_government'
    | 'business_vendor'
    | 'business_contractor';
  wallet: { balance_usd: string };
};

export type TransactionRow = {
  id: string;
  transaction_type: string;
  amount_usd: string;
  status: string;
  created_at: string;
  description: string | null;
  sender_name: string | null;
  recipient_name: string | null;
  company_name: string | null;
};

export async function login(phone: string, password: string) {
  return apiRequest<LoginResponse>('/api/auth/login', {
    method: 'POST',
    body: { phone, password },
  });
}

export async function getMe(token: string) {
  return apiRequest<MeResponse>('/api/me', { token });
}

export async function getTransactions(token: string) {
  return apiRequest<{ transactions: TransactionRow[] }>('/api/transactions', { token });
}
