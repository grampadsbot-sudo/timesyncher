alter table checkout_coupons
  drop column if exists created_by,
  drop column if exists redeemed_at,
  drop column if exists redeemed_order_id;

alter table checkout_coupon_redemptions
  drop column if exists session_id,
  drop column if exists customer_email,
  drop column if exists waived_amount_cents,
  drop column if exists currency,
  drop column if exists redeemed_at;
