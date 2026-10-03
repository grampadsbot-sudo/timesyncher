delete from vacation_onboarding_welcomes w
where w.id in (
  select id
  from (
    select
      id,
      row_number() over (
        partition by onboarding_session_id, welcome_for
        order by created_at asc, id asc
      ) as rn
    from vacation_onboarding_welcomes
  ) ranked
  where ranked.rn > 1
);

drop index if exists vacation_onboarding_welcomes_session_slot_idx;

create unique index if not exists vacation_onboarding_welcomes_session_for_idx
  on vacation_onboarding_welcomes (onboarding_session_id, welcome_for);
