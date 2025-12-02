-- 2. EVENT TEMPLATES
COPY event_templates (
    event_template_id,
    event_name,
    event_type,
    event_description,
    event_recurrence_pattern,
    event_default_capacity
)
FROM '/absolute/path/event_templates.csv'
WITH (FORMAT csv, HEADER true);