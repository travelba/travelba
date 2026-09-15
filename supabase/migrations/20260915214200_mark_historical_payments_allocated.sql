-- Historical payments predate atomic allocation. Mark them as already handled
-- so a delayed Stripe webhook cannot trigger a new automatic refund.

select set_config('request.jwt.claim.role', 'service_role', true);

update public.crm_transactions
set schedule_applied_amount = amount
where source = 'stripe'
  and direction = 'credit'
  and kind = 'card_payment'
  and payment_schedule_id is not null
  and schedule_applied_amount = 0
  and not exists (
    select 1
    from public.crm_audit_events audit
    where audit.entity_type = 'transaction'
      and audit.entity_id = crm_transactions.id::text
      and audit.action = 'stripe_overpayment_pending_refund'
  );
