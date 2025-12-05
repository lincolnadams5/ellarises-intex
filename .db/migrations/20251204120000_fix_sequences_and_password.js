/**
 * Migration to fix PostgreSQL sequences after seeding with explicit IDs
 * and ensure password column can store bcrypt hashes (60 characters)
 * 
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
    return knex.raw(`
        -- Reset sequences to max ID + 1 for all tables with auto-increment primary keys
        SELECT setval('users_user_id_seq', COALESCE((SELECT MAX(user_id) FROM users), 0) + 1, false);
        SELECT setval('milestones_milestone_id_seq', COALESCE((SELECT MAX(milestone_id) FROM milestones), 0) + 1, false);
        SELECT setval('event_templates_event_template_id_seq', COALESCE((SELECT MAX(event_template_id) FROM event_templates), 0) + 1, false);
        SELECT setval('donations_donation_id_seq', COALESCE((SELECT MAX(donation_id) FROM donations), 0) + 1, false);
        SELECT setval('event_occurrences_event_occurrence_id_seq', COALESCE((SELECT MAX(event_occurrence_id) FROM event_occurrences), 0) + 1, false);
        SELECT setval('registration_registration_id_seq', COALESCE((SELECT MAX(registration_id) FROM registration), 0) + 1, false);
        SELECT setval('surveys_survey_id_seq', COALESCE((SELECT MAX(survey_id) FROM surveys), 0) + 1, false);
        
        -- Alter password column to VARCHAR(255) to ensure bcrypt hashes (60 chars) can be stored
        ALTER TABLE users ALTER COLUMN user_password TYPE VARCHAR(255);
    `);
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
    // Sequences will naturally reset if data is re-seeded
    // Password column change is safe to leave as-is
    return Promise.resolve();
};
