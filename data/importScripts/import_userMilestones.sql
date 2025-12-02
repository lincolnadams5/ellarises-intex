-- 7. USER_MILESTONES
COPY user_milestones (
    milestone_id,
    user_id,
    milestone_date
)
FROM '/absolute/path/user_milestones.csv'
WITH (FORMAT csv, HEADER true);