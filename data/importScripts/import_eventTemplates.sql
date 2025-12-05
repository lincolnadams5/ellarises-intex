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

-- Reset the sequence to avoid primary key conflicts
SELECT setval('event_templates_event_template_id_seq', (SELECT MAX(event_template_id) FROM event_templates));