-- 5. SURVEYS
COPY surveys (
    survey_id,
    registration_id,
    satisfaction_score,
    usefulness_score,
    instructor_score,
    recommendation_score,
    overall_score,
    nps_bucket,
    survey_comments,
    survey_submission_date
)
FROM '/absolute/path/surveys.csv'
WITH (FORMAT csv, HEADER true);