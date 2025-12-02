-- 3. EVENT OCCURENCES
COPY event_occurences (
    event_occurrence_id,
    event_template_id,
    event_name,
    event_date_time_start,
    event_date_time_end,
    event_location,
    event_capacity,
    event_registration_deadline
)
FROM '/absolute/path/event_occurences.csv'
WITH (FORMAT csv, HEADER true);