
DELETE FROM public.weekly_intentions
WHERE user_id = '9fb78f6d-3224-4738-bbfa-0214931e9a2c'
  AND year = 2026 AND week_number IN (29, 30);

INSERT INTO public.weekly_intentions (user_id, text, pillar, week_number, year, sort_order, day_of_week, completed) VALUES
('9fb78f6d-3224-4738-bbfa-0214931e9a2c', 'Close the client Daniel and I are working (one-shot this week)', 'Sales', 29, 2026, 1, null, false),
('9fb78f6d-3224-4738-bbfa-0214931e9a2c', 'Land 1-2 additional paid clients on top of Daniel deal (one-shot this week)', 'Sales', 29, 2026, 2, null, false),
('9fb78f6d-3224-4738-bbfa-0214931e9a2c', 'Follow up with Paychex + talk to Ken Wednesday (one-shot this week)', 'Sales', 29, 2026, 3, null, false),
('9fb78f6d-3224-4738-bbfa-0214931e9a2c', 'Apply to jobs (min 5 · stretch 10 applications/day)', 'UPath', 29, 2026, 4, null, false),
('9fb78f6d-3224-4738-bbfa-0214931e9a2c', 'UPath outreach (min 20 · stretch 30 outreaches/day)', 'UPath', 29, 2026, 5, null, false),
('9fb78f6d-3224-4738-bbfa-0214931e9a2c', 'UPath comments — stay consistent (min 3 · stretch 8 comments/day)', 'Content', 29, 2026, 6, null, false),
('9fb78f6d-3224-4738-bbfa-0214931e9a2c', 'Reading + labor market study (60 minutes/day)', 'Mind', 29, 2026, 7, null, false),
('9fb78f6d-3224-4738-bbfa-0214931e9a2c', 'Ship one UPath blog post (one-shot this week)', 'Content', 29, 2026, 8, null, false),
('9fb78f6d-3224-4738-bbfa-0214931e9a2c', 'Full-body gym sessions (2-3 sessions this week)', 'Body', 29, 2026, 9, null, false),
('9fb78f6d-3224-4738-bbfa-0214931e9a2c', 'Movement on off-days — dumbbells, run, or yoga (1 session/day)', 'Body', 29, 2026, 10, null, false),
('9fb78f6d-3224-4738-bbfa-0214931e9a2c', 'Eat breakfast + dinner at home (2 meals/day)', 'Body', 29, 2026, 11, null, false),
('9fb78f6d-3224-4738-bbfa-0214931e9a2c', 'Order internet, AC, blinds, bed frame — apartment setup (one-shot this week)', 'Admin', 29, 2026, 12, null, false),
('9fb78f6d-3224-4738-bbfa-0214931e9a2c', 'Set up drum kit and play (one-shot this week)', 'Charisma', 29, 2026, 13, null, false),
('9fb78f6d-3224-4738-bbfa-0214931e9a2c', 'See friends this weekend — pick who and reach out (one-shot this week)', 'Friendship', 29, 2026, 14, null, false),
('9fb78f6d-3224-4738-bbfa-0214931e9a2c', 'One thing outside the ordinary — decouple worth from wins (one-shot this week)', 'Charisma', 29, 2026, 15, null, false);

INSERT INTO public.weekly_intentions (user_id, text, pillar, week_number, year, sort_order, day_of_week, completed)
SELECT user_id, text, pillar, 30, year, sort_order, day_of_week, completed
FROM public.weekly_intentions
WHERE user_id = '9fb78f6d-3224-4738-bbfa-0214931e9a2c' AND year = 2026 AND week_number = 29;

DELETE FROM public.daily_briefs
WHERE user_id = '9fb78f6d-3224-4738-bbfa-0214931e9a2c'
  AND brief_date >= CURRENT_DATE - INTERVAL '1 day';
