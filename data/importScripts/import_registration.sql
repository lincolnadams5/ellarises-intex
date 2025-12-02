-- 4. REGISTRATION
COPY registration (
    registration_id,
    user_id,
    event_occurrence_id,
    registration_status,
    registration_attended_flag,
    registration_check_in_time,
    registration_created_at
)
FROM '/absolute/path/registration.csv'
WITH (FORMAT csv, HEADER true);