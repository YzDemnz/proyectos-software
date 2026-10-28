import type { AppProfile } from './supabase';

export const PREMIUM_SUBSCRIPTION_URL = 'https://www.mercadopago.com.mx/subscriptions/checkout?preapproval_plan_id=8cb4ab0ac7d343e4a97a31451831f58a';
export const PREMIUM_PROMPT_AFTER_MS = 72 * 60 * 60 * 1000;
export const PREMIUM_PROMPT_REPEAT_MS = 7 * 24 * 60 * 60 * 1000;

export const hasPremiumAccess = (status?: AppProfile['subscription_status'] | null) => (
  status === 'active' || status === 'manual'
);

export const shouldShowPremiumUpgradeNotice = ({
  accountCreatedAt,
  subscriptionStatus,
  dismissedAt = 0,
  now = Date.now(),
}: {
  accountCreatedAt?: string | null;
  subscriptionStatus?: AppProfile['subscription_status'] | null;
  dismissedAt?: number;
  now?: number;
}) => {
  if (hasPremiumAccess(subscriptionStatus) || !accountCreatedAt) return false;

  const createdAt = new Date(accountCreatedAt).getTime();
  if (!Number.isFinite(createdAt) || now - createdAt < PREMIUM_PROMPT_AFTER_MS) return false;
  return dismissedAt <= 0 || now - dismissedAt >= PREMIUM_PROMPT_REPEAT_MS;
};

export const openPremiumCheckout = async () => {
  if (window.judicialDesktop?.openExternalUrl) {
    const opened = await window.judicialDesktop.openExternalUrl(PREMIUM_SUBSCRIPTION_URL);
    if (opened) return;
  }

  window.open(PREMIUM_SUBSCRIPTION_URL, '_blank', 'noopener,noreferrer');
};
