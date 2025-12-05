const fs = require('fs');
const path = require('path');

/**
 * Parse CSV file into array of objects
 */
function parseCSV(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n').filter(line => line.trim());
    const headers = lines[0].split(',').map(h => h.trim());
    
    return lines.slice(1).map(line => {
        // Handle commas within quoted fields
        const values = [];
        let current = '';
        let inQuotes = false;
        
        for (let char of line) {
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                values.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }
        values.push(current.trim());
        
        const obj = {};
        headers.forEach((header, i) => {
            let value = values[i] || '';
            // Convert empty strings to null
            obj[header] = value === '' ? null : value;
        });
        return obj;
    });
}

/**
 * Parse date in M/D/YY or M/D/YYYY format to Date object
 */
function parseDate(dateStr) {
    if (!dateStr) return null;
    const parts = dateStr.split('/');
    if (parts.length !== 3) return null;
    const month = parseInt(parts[0], 10);
    const day = parseInt(parts[1], 10);
    let year = parseInt(parts[2], 10);
    // Handle 2-digit years (assume 2000s for years < 50, 1900s otherwise)
    if (year < 100) {
        year = year < 50 ? 2000 + year : 1900 + year;
    }
    return new Date(year, month - 1, day);
}

/**
 * Parse datetime in M/D/YY H:MM format to Date object
 */
function parseDateTime(dateTimeStr) {
    if (!dateTimeStr) return null;
    const parts = dateTimeStr.split(' ');
    if (parts.length !== 2) return null;
    
    const dateParts = parts[0].split('/');
    const timeParts = parts[1].split(':');
    
    if (dateParts.length !== 3 || timeParts.length !== 2) return null;
    
    const month = parseInt(dateParts[0], 10);
    const day = parseInt(dateParts[1], 10);
    let year = parseInt(dateParts[2], 10);
    const hour = parseInt(timeParts[0], 10);
    const minute = parseInt(timeParts[1], 10);
    
    if (year < 100) {
        year = year < 50 ? 2000 + year : 1900 + year;
    }
    
    return new Date(year, month - 1, day, hour, minute);
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> } 
 */
exports.seed = async function(knex) {
    const dataDir = path.join(__dirname, '../../data/ThirdNormalFormTables');
    
    console.log('Starting database seed...');
    
    // Delete existing data in reverse order (due to FK constraints)
    console.log('Clearing existing data...');
    await knex('user_milestones').del();
    await knex('surveys').del();
    await knex('registration').del();
    await knex('event_occurrences').del();
    await knex('donations').del();
    await knex('event_templates').del();
    await knex('milestones').del();
    await knex('users').del();
    
    // 1. Seed users
    console.log('Seeding users...');
    const usersData = parseCSV(path.join(dataDir, 'users.csv'));
    const users = usersData.map(row => ({
        user_id: parseInt(row.user_id, 10),
        user_email: row.user_email,
        user_first_name: row.user_first_name,
        user_last_name: row.user_last_name,
        user_dob: parseDate(row.user_dob),
        user_role: row.user_role || 'participant',
        user_phone: row.user_phone,
        user_city: row.user_city,
        user_state: row.user_state,
        user_zip: row.user_zip,
        user_school: row.user_school,
        user_employer: row.user_employer,
        user_field_of_interest: row.user_field_of_interest,
        user_password: row.user_password || 'default'
    }));
    await knex.batchInsert('users', users, 100);
    console.log(`  Inserted ${users.length} users`);
    
    // 2. Seed milestones
    console.log('Seeding milestones...');
    const milestonesData = parseCSV(path.join(dataDir, 'milestones.csv'));
    const milestones = milestonesData.map(row => ({
        milestone_id: parseInt(row.milestone_id, 10),
        milestone_title: row.milestone_title
    }));
    await knex.batchInsert('milestones', milestones, 100);
    console.log(`  Inserted ${milestones.length} milestones`);
    
    // 3. Seed event_templates
    console.log('Seeding event_templates...');
    const templatesData = parseCSV(path.join(dataDir, 'event_templates.csv'));
    const templates = templatesData.map(row => ({
        event_template_id: parseInt(row.event_template_id, 10),
        event_name: row.event_name,
        event_type: row.event_type,
        event_description: row.event_description,
        event_recurrence_pattern: row.event_recurrence_pattern,
        event_default_capacity: row.event_default_capacity ? parseInt(row.event_default_capacity, 10) : null
    }));
    await knex.batchInsert('event_templates', templates, 100);
    console.log(`  Inserted ${templates.length} event_templates`);
    
    // 4. Seed donations
    console.log('Seeding donations...');
    const donationsData = parseCSV(path.join(dataDir, 'donations.csv'));
    const donations = donationsData.map(row => ({
        donation_id: parseInt(row.donation_id, 10),
        user_id: parseInt(row.user_id, 10),
        donation_date: parseDate(row.donation_date),
        donation_amount: row.donation_amount ? parseFloat(row.donation_amount) : null
    }));
    await knex.batchInsert('donations', donations, 100);
    console.log(`  Inserted ${donations.length} donations`);
    
    // 5. Seed event_occurrences
    console.log('Seeding event_occurrences...');
    const occurrencesData = parseCSV(path.join(dataDir, 'event_occurences.csv'));
    const occurrences = occurrencesData.map(row => ({
        event_occurrence_id: parseInt(row.event_occurrence_id, 10),
        event_template_id: parseInt(row.event_template_id, 10),
        event_name: row.event_name,
        event_date_time_start: parseDateTime(row.event_date_time_start),
        event_date_time_end: parseDateTime(row.event_date_time_end),
        event_location: row.event_location,
        event_capacity: row.event_capacity ? parseInt(row.event_capacity, 10) : null,
        event_registration_deadline: parseDateTime(row.event_registration_deadline)
    }));
    await knex.batchInsert('event_occurrences', occurrences, 100);
    console.log(`  Inserted ${occurrences.length} event_occurrences`);
    
    // 6. Seed registration
    console.log('Seeding registration...');
    const registrationData = parseCSV(path.join(dataDir, 'registration.csv'));
    const registrations = registrationData.map(row => ({
        registration_id: parseInt(row.registration_id, 10),
        user_id: parseInt(row.user_id, 10),
        event_occurrence_id: parseInt(row.event_occurrence_id, 10),
        registration_status: row.registration_status,
        registration_attended_flag: row.registration_attended_flag === 'true' || row.registration_attended_flag === '1',
        registration_check_in_time: parseDateTime(row.registration_check_in_time),
        registration_created_at: parseDateTime(row.registration_created_at) || new Date()
    }));
    await knex.batchInsert('registration', registrations, 100);
    console.log(`  Inserted ${registrations.length} registrations`);
    
    // 7. Seed surveys
    console.log('Seeding surveys...');
    const surveysData = parseCSV(path.join(dataDir, 'surveys.csv'));
    const surveys = surveysData.map(row => ({
        survey_id: parseInt(row.survey_id, 10),
        registration_id: parseInt(row.registration_id, 10),
        satisfaction_score: row.satisfaction_score ? parseInt(row.satisfaction_score, 10) : null,
        usefulness_score: row.usefulness_score ? parseInt(row.usefulness_score, 10) : null,
        instructor_score: row.instructor_score ? parseInt(row.instructor_score, 10) : null,
        recommendation_score: row.recommendation_score ? parseInt(row.recommendation_score, 10) : null,
        overall_score: row.overall_score ? parseFloat(row.overall_score) : null,
        nps_bucket: row.NPS_bucket || row.nps_bucket, // Handle both column name cases
        survey_comments: row.survey_comments,
        survey_submission_date: parseDateTime(row.survey_submission_date)
    }));
    await knex.batchInsert('surveys', surveys, 100);
    console.log(`  Inserted ${surveys.length} surveys`);
    
    // 8. Seed user_milestones
    console.log('Seeding user_milestones...');
    const userMilestonesData = parseCSV(path.join(dataDir, 'user_milestones.csv'));
    const userMilestones = userMilestonesData.map(row => ({
        milestone_id: parseInt(row.milestone_id, 10),
        user_id: parseInt(row.user_id, 10),
        milestone_date: parseDate(row.milestone_date)
    }));
    await knex.batchInsert('user_milestones', userMilestones, 100);
    console.log(`  Inserted ${userMilestones.length} user_milestones`);
    
    // 9. Reset sequences to max ID + 1
    console.log('Resetting sequences...');
    await knex.raw(`
        SELECT setval('users_user_id_seq', COALESCE((SELECT MAX(user_id) FROM users), 0) + 1, false);
        SELECT setval('milestones_milestone_id_seq', COALESCE((SELECT MAX(milestone_id) FROM milestones), 0) + 1, false);
        SELECT setval('event_templates_event_template_id_seq', COALESCE((SELECT MAX(event_template_id) FROM event_templates), 0) + 1, false);
        SELECT setval('donations_donation_id_seq', COALESCE((SELECT MAX(donation_id) FROM donations), 0) + 1, false);
        SELECT setval('event_occurrences_event_occurrence_id_seq', COALESCE((SELECT MAX(event_occurrence_id) FROM event_occurrences), 0) + 1, false);
        SELECT setval('registration_registration_id_seq', COALESCE((SELECT MAX(registration_id) FROM registration), 0) + 1, false);
        SELECT setval('surveys_survey_id_seq', COALESCE((SELECT MAX(survey_id) FROM surveys), 0) + 1, false);
    `);
    
    console.log('Database seed completed successfully!');
};
