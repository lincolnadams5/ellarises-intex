-- ============================================================
-- RESET SCHEMA (OPTIONAL)
-- ============================================================

DROP TABLE IF EXISTS donations CASCADE;
DROP TABLE IF EXISTS user_milestones CASCADE;
DROP TABLE IF EXISTS milestones CASCADE;
DROP TABLE IF EXISTS surveys CASCADE;
DROP TABLE IF EXISTS registration CASCADE;
DROP TABLE IF EXISTS event_occurrences CASCADE;
DROP TABLE IF EXISTS event_templates CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- ============================================================
-- TABLE DEFINITIONS
-- ============================================================

-- 1. USERS
CREATE TABLE users (
    user_id               SERIAL PRIMARY KEY,
    user_email            TEXT NOT NULL,
    user_first_name       TEXT NOT NULL,
    user_last_name        TEXT NOT NULL,
    user_dob              DATE,
    user_role             TEXT,
    user_phone            TEXT,
    user_city             TEXT,
    user_state            TEXT,
    user_zip              INTEGER,
    user_school           TEXT,
    user_employer         TEXT,
    user_field_of_interest TEXT,
    UNIQUE (user_email)
);

-- 2. EVENT TEMPLATES
CREATE TABLE event_templates (
    event_template_id       SERIAL PRIMARY KEY,
    event_name              TEXT NOT NULL,
    event_type              TEXT,
    event_description       TEXT,
    event_recurrence_pattern TEXT,
    event_default_capacity  INTEGER,
    UNIQUE (event_name)
);

-- 3. EVENT OCCURENCES  (name matches your template)
CREATE TABLE event_occurrences (
    event_occurrence_id         INTEGER PRIMARY KEY,
    event_template_id           INTEGER NOT NULL,
    event_name                  TEXT NOT NULL,
    event_date_time_start       TIMESTAMP NOT NULL,
    event_date_time_end         TIMESTAMP,
    event_location              TEXT,
    event_capacity              INTEGER,
    event_registration_deadline TIMESTAMP,
    FOREIGN KEY (event_template_id)
        REFERENCES event_templates(event_template_id)
);

-- 4. REGISTRATION
CREATE TABLE registration (
    registration_id            SERIAL PRIMARY KEY,
    user_id                    INTEGER NOT NULL,
    event_occurrence_id        INTEGER NOT NULL,
    registration_status        TEXT,
    registration_attended_flag BOOLEAN,
    registration_check_in_time TIMESTAMP,
    registration_created_at    TIMESTAMP,
    FOREIGN KEY (user_id)
        REFERENCES users(user_id),
    FOREIGN KEY (event_occurrence_id)
        REFERENCES event_occurrences(event_occurrence_id)
);

-- 5. SURVEYS
CREATE TABLE surveys (
    survey_id              SERIAL PRIMARY KEY,
    registration_id        INTEGER NOT NULL,
    satisfaction_score     NUMERIC,
    usefulness_score       NUMERIC,
    instructor_score       NUMERIC,
    recommendation_score   NUMERIC,
    overall_score          NUMERIC,
    nps_bucket             TEXT,
    survey_comments        TEXT,
    survey_submission_date TIMESTAMP,
    FOREIGN KEY (registration_id)
        REFERENCES registration(registration_id)
);

-- 6. MILESTONES (lookup of milestone titles)
CREATE TABLE milestones (
    milestone_id    SERIAL PRIMARY KEY,
    milestone_title TEXT NOT NULL
);

-- 7. USER_MILESTONES (junction between users and milestones)
CREATE TABLE user_milestones (
    milestone_id   SERIAL NOT NULL,
    user_id        INTEGER NOT NULL,
    milestone_date DATE,
    PRIMARY KEY (milestone_id, user_id, milestone_date),
    FOREIGN KEY (milestone_id)
        REFERENCES milestones(milestone_id),
    FOREIGN KEY (user_id)
        REFERENCES users(user_id)
);

-- 8. DONATIONS
CREATE TABLE donations (
    donation_id    SERIAL PRIMARY KEY,
    user_id        INTEGER NOT NULL,
    donation_date  DATE,
    donation_amount NUMERIC,
    FOREIGN KEY (user_id)
        REFERENCES users(user_id)
);

-- ============================================================
-- DATA LOAD (COPY FROM CSVs)
-- ============================================================

-- NOTE: Adjust the paths below to where your CSV files live on the server.

-- 1. USERS
COPY users (
    user_id,
    user_email,
    user_first_name,
    user_last_name,
    user_dob,
    user_role,
    user_phone,
    user_city,
    user_state,
    user_zip,
    user_school,
    user_employer,
    user_field_of_interest
)
FROM '/absolute/path/Users.csv'
WITH (FORMAT csv, HEADER true);

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

-- 3. EVENT OCCURENCES
COPY event_occurrences (
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

-- 6. MILESTONES
COPY milestones (
    milestone_id,
    milestone_title
)
FROM '/absolute/path/milestones.csv'
WITH (FORMAT csv, HEADER true);

-- 7. USER_MILESTONES
COPY user_milestones (
    milestone_id,
    user_id,
    milestone_date
)
FROM '/absolute/path/user_milestones.csv'
WITH (FORMAT csv, HEADER true);

-- 8. DONATIONS
COPY donations (
    donation_id,
    user_id,
    donation_date,
    donation_amount
)
FROM '/absolute/path/donations.csv'
WITH (FORMAT csv, HEADER true);