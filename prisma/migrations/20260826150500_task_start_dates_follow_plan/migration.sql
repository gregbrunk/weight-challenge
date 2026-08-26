-- Tasks are the plan's rules and run for the whole plan.
--
-- They were previously created with startDate set to the day they were added,
-- so setting your tasks up on day 2 and ticking day 1 put that tick outside
-- the task's window: it counted toward no streak and the calendar began a day
-- late. This pulls any such task back to its plan's first day.
--
-- Only moves dates backwards, so a task deliberately started later is left
-- alone, and re-running changes nothing.
UPDATE "Task" AS t
SET "startDate" = p."startDate"
FROM "Plan" AS p
WHERE t."planId" = p."id"
  AND t."startDate" > p."startDate";
