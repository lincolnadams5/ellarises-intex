-- 6. MILESTONES
COPY milestones (
    milestone_id,
    milestone_title
)
FROM '/absolute/path/milestones.csv'
WITH (FORMAT csv, HEADER true);