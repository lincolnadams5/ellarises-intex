/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema
    .createTable('users', function (table) {
        table.increments('user_id').primary(); // PK
        table.string('user_email').notNullable().unique();
        table.string('user_first_name').notNullable();
        table.string('user_last_name').notNullable();
        table.date('user_dob');
        table.string('user_role').notNullable().defaultTo('participant');
        table.string('user_phone');
        table.string('user_city');
        table.string('user_state');
        table.string('user_zip');
        table.string('user_school');
        table.string('user_employer');
        table.string('user_field_of_interest');
        table.string('user_password', 255).notNullable(); // 255 chars to support bcrypt hashes (60 chars)
        table.timestamps(true, true);
    })
    .createTable('milestones', function (table) {
        table.increments('milestone_id').primary(); // PK
        table.string('milestone_title').notNullable();
        table.timestamps(true, true);
    })
    .createTable('event_templates', function (table) {
        table.increments('event_template_id').primary(); // PK
        table.string('event_name').notNullable();
        table.string('event_type');
        table.string('event_description');
        table.string('event_recurrence_pattern');
        table.integer('event_default_capacity');
        table.timestamps(true, true);
    })
    .createTable('donations', function (table) {
        table.increments('donation_id').primary(); // PK
        table.integer('user_id').unsigned().notNullable()
            .references('user_id').inTable('users')
            .onDelete('CASCADE'); // FK - If user is deleted, delete related rows.
        table.date('donation_date');
        table.decimal('donation_amount', 14, 2); // With precision of up to 14 digits, 2 decimal places
        table.timestamps(true, true);
    })
    .createTable('event_occurrences', function (table) {
        table.increments('event_occurrence_id').primary(); // PK
        table.integer('event_template_id').unsigned().notNullable()
            .references('event_template_id').inTable('event_templates')
            .onDelete('CASCADE'); // FK - If event template is deleted, delete related rows.
        table.string('event_name').notNullable();
        table.timestamp('event_date_time_start');
        table.timestamp('event_date_time_end');
        table.string('event_location');
        table.integer('event_capacity');
        table.timestamp('event_registration_deadline');
        table.timestamps(true, true);
    })
    .createTable('registration', function (table) {
        table.increments('registration_id').primary(); // PK
        table.integer('user_id').unsigned().notNullable()
            .references('user_id').inTable('users')
            .onDelete('CASCADE'); // FK - If user is deleted, delete related rows.
        table.integer('event_occurrence_id').unsigned().notNullable()
            .references('event_occurrence_id').inTable('event_occurrences')
            .onDelete('CASCADE'); // FK - If event occurrence is deleted, delete related rows.
        table.string('registration_status');
        table.boolean('registration_attended_flag').defaultTo(false);
        table.timestamp('registration_check_in_time');
        table.timestamp('registration_created_at').defaultTo(knex.fn.now());
        table.timestamps(true, true);
    })
    .createTable('surveys', function (table) {
        table.increments('survey_id').primary(); // PK
        table.integer('registration_id').unsigned().notNullable()
            .references('registration_id').inTable('registration')
            .onDelete('CASCADE'); // FK - If registration is deleted, delete related rows.
        table.integer('satisfaction_score');
        table.integer('usefulness_score');
        table.integer('instructor_score');
        table.integer('recommendation_score');
        table.decimal('overall_score', 4, 2); // With precision of up to 4 digits, 2 decimal places
        table.string('nps_bucket');
        table.text('survey_comments'); // Text data type for longer comments
        table.timestamp('survey_submission_date');
        table.timestamps(true, true);
    })
    .createTable('user_milestones', function (table) {
        table.integer('milestone_id').unsigned().notNullable()
            .references('milestone_id').inTable('milestones')
            .onDelete('CASCADE'); // FK - If milestone is deleted, delete related rows
        table.integer('user_id').unsigned().notNullable()
            .references('user_id').inTable('users')
            .onDelete('CASCADE'); // FK - If user is deleted, delete related rows
        table.date('milestone_date').notNullable();
        table.timestamps(true, true);
        table.primary(['milestone_id', 'user_id']);
    })
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema
    .dropTableIfExists('user_milestones') // Depends on users and milestones
    .dropTableIfExists('surveys') // Depends on Registration
    .dropTableIfExists('registration') // Depends on users and event occurrences
    .dropTableIfExists('event_occurrences') // Depends on event templates
    .dropTableIfExists('donations')
    .dropTableIfExists('event_templates')
    .dropTableIfExists('milestones')
    .dropTableIfExists('users');
};
