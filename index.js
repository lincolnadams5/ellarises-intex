/*
 * =============================================
 * ELLA RISES - Main Server File (index.js)
 * =============================================
 * 
 * This is the heart of the Ella Rises web application.
 * It handles all the routing, database queries, authentication,
 * and serves up our EJS templates to users.
 * 
 * The app is built with:
 * - Express.js for the web server
 * - PostgreSQL database via Knex.js
 * - EJS for templating
 * - bcrypt for password hashing
 * - i18n for English/Spanish language support
 * 
 * Main sections:
 * 1. Initialization & Config
 * 2. Middleware (auth, session, etc.)
 * 3. Routes organized by feature (events, donations, users, etc.)
 */

// ========== INITIALIZATION ==========
// This is where we load all our dependencies and set up the basic config

require('dotenv').config(); // Pulls in environment variables from .env file (like DB credentials, secrets, etc.)

// Core dependencies
const express = require("express");  // The web framework that makes everything work
const session = require("express-session"); // Keeps track of logged-in users across requests
const XLSX = require("xlsx"); // Used when admins want to export donation data to Excel
const i18n = require("i18n"); // Handles English/Spanish translations throughout the site
const cookieParser = require("cookie-parser"); // Reads cookies - i18n needs this to remember language preference
let path = require("path"); // Node's built-in path helper for file paths
let app = express(); // Create our Express app instance
const bcrypt = require("bcrypt"); // For securely hashing passwords - never store plain text!

/*
 * i18n Configuration
 * This sets up our internationalization (fancy word for multi-language support).
 * We support English (en) and Spanish (es).
 * The actual translations live in the /locales folder as JSON files.
 */
i18n.configure({
    locales: ['en', 'es'], // Languages we support
    directory: path.join(__dirname, 'locales'), // Where translation files live
    defaultLocale: 'en', // English is the default
    cookie: 'lang', // Cookie name that stores user's language preference
    queryParameter: 'lang', // Can also switch language via ?lang=es in URL
    autoReload: true, // Reload translations if files change (helpful for development)
    syncFiles: true, // Keep translation files in sync
    objectNotation: true // Allows nested keys like "nav.home" in translation files
});

// Tell Express to use EJS as our templating engine
// EJS lets us write HTML with embedded JavaScript for dynamic content
app.set("view engine", "ejs");

// Serve static files (CSS, images, fonts, etc.) from the project root
// This is why we can use paths like "/styles/main.css" in our HTML
app.use(express.static(path.join(__dirname)));

// Port configuration - AWS will set PORT env variable in production,
// otherwise we use 3000 for local development
const port = process.env.PORT || 3000;

// These middleware functions parse incoming request data
app.use(express.urlencoded({extended: true})); // Parses form submissions (POST data)
app.use(express.json()); // Parses JSON request bodies (for AJAX/fetch requests)
app.use(cookieParser()); // Parses cookies from request headers

/*
 * Database Setup with Knex
 * Knex is a SQL query builder that makes database operations way cleaner than raw SQL.
 * The config comes from knexfile.js and includes connection details for dev/prod.
 */
const knexConfig = require("./knexfile"); 
const environment = process.env.NODE_ENV || "development"; // "development" or "production"
const knex = require("knex")(knexConfig[environment]);

/*
 * Session Configuration
 * Sessions let us remember that a user is logged in across multiple page requests.
 * The session data is stored server-side (in memory by default).
 */
app.use(
    session({ 
        secret: process.env.SESSION_SECRET || 'secret', // Used to sign the session cookie
        resave: false, // Don't save session if nothing changed
        saveUninitialized: false // Don't create session until something is stored
    })
);

// Activate the i18n middleware - this makes translation functions available in routes
app.use(i18n.init);

// ========== MIDDLEWARE ==========
/*
 * Middleware runs on EVERY request before it hits a route.
 * Think of it as a checkpoint that all requests pass through.
 */

/*
 * Session Variables Middleware
 * This is super handy - it automatically makes session data available 
 * to all our EJS templates via res.locals. Without this, we'd have to 
 * pass isLoggedIn, first_name, etc. to every single res.render() call.
 */
app.use((req, res, next) => {
    // These become available as variables in any EJS template
    res.locals.isLoggedIn = req.session.isLoggedIn || false;
    res.locals.user_id = req.session.user_id || '';
    res.locals.email = req.session.email || '';
    res.locals.level = req.session.level || ''; // 'admin' or 'participant'
    res.locals.first_name = req.session.first_name || '';
    res.locals.last_name = req.session.last_name || '';
    res.locals.currentLang = req.getLocale(); // Current language ('en' or 'es')
    next(); // Don't forget this! It passes control to the next middleware/route
});

/*
 * ~~~~~ Global Authentication Middleware ~~~~~
 * This is our security guard. It checks every request and decides:
 * 1. Is this a public page anyone can access? Let them through.
 * 2. Is this an admin-only page? Check if they're an admin.
 * 3. Is this a logged-in-user page? Check if they're logged in.
 */
app.use((req, res, next) => {
    // Public routes - anyone can access these without logging in
    let public_routes = ['/', '/login', '/register', '/about', '/events', '/donate', '/analytics', '/teapot'];
    
    // Language switch routes should always work (even for logged-out users)
    if (public_routes.includes(req.path) || req.path.startsWith('/lang/')) {
        return next(); // Let them through!
    }

    // Admin-only routes - these require admin privileges
    let admin_routes = [
        '/manage-events',
        '/manage-events/new',
        '/manage-milestones',
        '/manage-milestones/new',
        '/manage-surveys',
        '/manage-donations',
        '/manage-donations/new',
        '/manage-donations/export',
        '/manage-participants',
        '/manage-participants/new'
    ];
    
    /*
     * Handle dynamic admin routes (ones with IDs in them)
     * For example: /manage-events/5/delete or /manage-participants/123/update
     * We check if the path starts with a manage route and ends with an action keyword
     */
    if ((req.path.startsWith('/manage-events/') && (req.path.endsWith('/delete') || req.path.endsWith('/new'))) ||
        (req.path.startsWith('/manage-milestones/') && (req.path.endsWith('/delete') || req.path.endsWith('/update'))) ||
        (req.path.startsWith('/manage-donations/') && (req.path.endsWith('/delete') || req.path.endsWith('/update'))) ||
        (req.path.startsWith('/manage-participants/') && (req.path.endsWith('/delete') || req.path.endsWith('/update') || req.path.endsWith('/milestones') || req.path.endsWith('/milestones/add') || req.path.endsWith('/milestones/remove')))) {
        // Must be logged in AND be an admin
        if (!req.session.isLoggedIn || !req.session.level || req.session.level.toLowerCase() !== 'admin') {
            return res.render("login", { error_message: "Authentication error" });
        } else {
            return next();
        }
    }
    
    // Check static admin routes
    if (admin_routes.includes(req.path)) {
        if (!req.session.isLoggedIn || !req.session.level || req.session.level.toLowerCase() !== 'admin') {
            return res.render("login", { error_message: "Authentication error" });
        } else {
            return next();
        }
    }

    // For all other routes, just check if user is logged in
    if (req.session.isLoggedIn) {
        next();
    } else {
        // Not logged in? Send them to the login page
        res.render('login', { error_message: "" });
    }
});

// ========== HELPER FUNCTIONS ==========
/*
 * Reusable utility functions that get used across multiple routes.
 * Keeps our code DRY (Don't Repeat Yourself).
 */

/**
 * getCount - Gets the total count of rows in a table
 * @param {string} tableName - The name of the database table
 * @returns {Promise} - Resolves to an object with { count: number }
 * 
 * Example usage: 
 *   const result = await getCount('users');
 *   console.log(result.count); // 150
 */
function getCount (tableName) {
    return knex(tableName)
        .count('* as count')
        .first()
}


// ========== LANGUAGE SWITCH ==========
/*
 * This route handles switching between English and Spanish.
 * When user clicks the flag icon, it hits this route with the new language.
 */
app.get('/lang/:locale', (req, res) => {
    const locale = req.params.locale; // 'en' or 'es'
    
    // Only accept valid locales (don't let someone set it to random stuff)
    if (['en', 'es'].includes(locale)) {
        // Save their preference in a cookie that lasts 1 year
        res.cookie('lang', locale, { maxAge: 365 * 24 * 60 * 60 * 1000 });
        req.setLocale(locale); // Set for this request
    }
    
    // Send them back to whatever page they were on
    // req.get('Referer') gets the previous page URL from the browser
    const referer = req.get('Referer') || '/';
    res.redirect(referer);
});


// ========== BASIC PAGE ROUTES ==========
/*
 * These are simple routes that just render a page without needing
 * to fetch any data from the database. Nice and straightforward.
 */

// Homepage
app.get('/', (req, res) => {
    res.render('home', { error_message: "" });
});

// Login page - shows the login form
app.get('/login', (req, res) => {
    res.render('login', { error_message: "" });
});

// Registration page - shows the signup form
app.get('/register', (req, res) => {
    res.render('register', { error_message: "" });
});

// About page - info about Ella Rises, programs, contact, etc.
app.get('/about', (req, res) => {
    res.render('about', { error_message: "" });
});


// ~~~ ~~~ ~~~ ~~~ ~~~ ANALYTICS DASHBOARD ~~~ ~~~ ~~~ ~~~ ~~~ 
// This page embeds a Tableau dashboard with organizational analytics
app.get('/analytics', (req, res) => {
    res.render('analytics-dashboard', { error_message: "" });
});

// Easter egg! HTTP 418 "I'm a teapot" - a fun joke status code from April Fools
app.get('/teapot', (req, res) => {
    res.status(418).render('teapot');
});

// ~~~ ~~~ ~~~ ~~~ ~~~ EVENTS ~~~ ~~~ ~~~ ~~~ ~~~ 
/*
 * Public Events Page
 * Shows all upcoming or past events with pagination.
 * Users can register for upcoming events if logged in.
 * 
 * Query params:
 *   - filter: 'upcoming' (default) or 'past'
 *   - page: page number for pagination
 */
app.get('/events', (req, res) => {
    // Get filter from query string, default to showing upcoming events
    const filter = req.query.filter || 'upcoming';
    
    // Pagination setup - show 10 events per page
    const page = parseInt(req.query.page, 10) || 1;
    const perPage = 10;
    const offset = (page - 1) * perPage; // Skip this many records
    
    const currentDate = new Date();
    const currentUserId = req.session.user_id || null; // null if not logged in

    /*
     * Main events query - joins event_occurrences with event_templates
     * event_occurrences = specific instances of events (with dates, locations)
     * event_templates = the "blueprint" for event types (descriptions, types)
     */
    let eventsQuery = knex('event_occurrences')
        .join('event_templates', 'event_occurrences.event_template_id', '=', 'event_templates.event_template_id')
        .select(
            'event_occurrences.event_occurrence_id',
            'event_occurrences.event_template_id',
            'event_occurrences.event_name',
            'event_occurrences.event_date_time_start',
            'event_occurrences.event_date_time_end',
            'event_occurrences.event_location',
            'event_occurrences.event_capacity',
            'event_occurrences.event_registration_deadline',
            'event_templates.event_type',
            'event_templates.event_description'
        );

    // Apply filter and sorting based on upcoming vs past
    if (filter === 'past') {
        // Past events: before today, sorted newest first
        eventsQuery = eventsQuery
            .where('event_occurrences.event_date_time_start', '<', currentDate)
            .orderBy('event_occurrences.event_date_time_start', 'desc');
    } else {
        // Upcoming events: today or later, sorted soonest first
        eventsQuery = eventsQuery
            .where('event_occurrences.event_date_time_start', '>=', currentDate)
            .orderBy('event_occurrences.event_date_time_start', 'asc');
    }

    // Separate count query for pagination (need to know total events)
    let countQuery = knex('event_occurrences')
        .join('event_templates', 'event_occurrences.event_template_id', '=', 'event_templates.event_template_id');
    
    // Apply same filter to count query
    if (filter === 'past') {
        countQuery = countQuery.where('event_occurrences.event_date_time_start', '<', currentDate);
    } else {
        countQuery = countQuery.where('event_occurrences.event_date_time_start', '>=', currentDate);
    }
    countQuery = countQuery.count('* as count').first();

    // Apply pagination limits to main query
    eventsQuery = eventsQuery.limit(perPage).offset(offset);

    // Get how many people are registered for each event
    // This helps us show "X/Y spots filled" and check if event is full
    const registrationCountsQuery = knex('registration')
        .select('event_occurrence_id')
        .count('* as registration_count')
        .groupBy('event_occurrence_id');

    // If user is logged in, get their existing registrations
    // So we can disable the Register button for events they already signed up for
    const userRegistrationsQuery = currentUserId 
        ? knex('registration')
            .select('event_occurrence_id')
            .where('user_id', currentUserId)
        : Promise.resolve([]); // Empty array if not logged in

    // Run all queries in parallel for better performance
    Promise.all([eventsQuery, countQuery, registrationCountsQuery, userRegistrationsQuery])
        .then(([events, countResult, registrationCounts, userRegistrations]) => {
            const totalCount = parseInt(countResult.count, 10);
            const totalPages = Math.ceil(totalCount / perPage);

            // Build a lookup map: event_id -> registration count
            const registrationCountMap = {};
            registrationCounts.forEach(rc => {
                registrationCountMap[rc.event_occurrence_id] = parseInt(rc.registration_count, 10);
            });

            // Build a Set of events the user is registered for (fast lookup)
            const userRegisteredEvents = new Set(userRegistrations.map(r => r.event_occurrence_id));

            // Enrich each event with registration info
            events = events.map(event => ({
                ...event,
                registration_count: registrationCountMap[event.event_occurrence_id] || 0,
                is_user_registered: userRegisteredEvents.has(event.event_occurrence_id)
            }));

            // Render the events page with all our data
            res.render('events', {
                events: events,
                filter: filter,
                currentPage: page,
                totalPages: totalPages,
                totalCount: totalCount,
                error_message: req.query.error || '',
                success_message: req.query.success || ''
            });
        })
        .catch(err => {
            console.log('Error fetching events:', err);
            // On error, show empty state with error message
            res.render('events', {
                events: [],
                filter: filter,
                currentPage: 1,
                totalPages: 1,
                totalCount: 0,
                error_message: 'Error loading events. Please try again.'
            });
        });
});

/*
 * Event Registration Route
 * When a user clicks "Register" on an event, this handles the signup process.
 * We do a bunch of validation before actually creating the registration.
 */
app.post('/events/:event_occurrence_id/register', (req, res) => {
    const eventOccurrenceId = req.params.event_occurrence_id;
    const userId = req.session.user_id;

    // Must be logged in to register for events
    if (!userId) {
        return res.redirect('/login?redirect=' + encodeURIComponent('/events'));
    }

    // First, get the event details so we can validate
    knex('event_occurrences')
        .where('event_occurrence_id', eventOccurrenceId)
        .first()
        .then(event => {
            // Make sure the event actually exists
            if (!event) {
                return res.redirect('/events?error=' + encodeURIComponent('Event not found.'));
            }

            const currentDate = new Date();
            const eventStart = new Date(event.event_date_time_start);
            const deadline = event.event_registration_deadline ? new Date(event.event_registration_deadline) : null;

            // Validation 1: Can't register for events that already started
            if (eventStart < currentDate) {
                return res.redirect('/events?error=' + encodeURIComponent('This event has already started.'));
            }

            // Validation 2: Check if registration deadline passed (if there is one)
            if (deadline && deadline < currentDate) {
                return res.redirect('/events?error=' + encodeURIComponent('Registration deadline has passed.'));
            }

            // Validation 3: Check if user is already registered (no double-booking!)
            return knex('registration')
                .where({ user_id: userId, event_occurrence_id: eventOccurrenceId })
                .first()
                .then(existingRegistration => {
                    if (existingRegistration) {
                        return res.redirect('/events?error=' + encodeURIComponent('You are already registered for this event.'));
                    }

                    // Validation 4: Check if event is at capacity
                    return knex('registration')
                        .where('event_occurrence_id', eventOccurrenceId)
                        .count('* as count')
                        .first()
                        .then(countResult => {
                            const currentCount = parseInt(countResult.count, 10);
                            if (event.event_capacity && currentCount >= event.event_capacity) {
                                return res.redirect('/events?error=' + encodeURIComponent('This event is at full capacity.'));
                            }

                            // All validations passed! Create the registration
                            return knex('registration')
                                .insert({
                                    user_id: userId,
                                    event_occurrence_id: eventOccurrenceId,
                                    registration_status: null, // null = pending, can be updated later
                                    registration_created_at: new Date()
                                })
                                .then(() => {
                                    res.redirect('/events?success=' + encodeURIComponent('Successfully registered for the event!'));
                                });
                        });
                });
        })
        .catch(err => {
            console.log('Error registering for event:', err);
            res.redirect('/events?error=' + encodeURIComponent('An error occurred. Please try again.'));
        });
});

/*
 * ========== ADMIN: MANAGE EVENT OCCURRENCES ==========
 * Event occurrences are specific instances of events (like "STEAM Workshop on Dec 15")
 * These routes let admins view, create, edit, and delete event occurrences.
 */

// List all event occurrences with search and pagination
app.get('/manage-event-occurrences', (req, res) => {
    const searchQuery = req.query.search || '';
    
    // Pagination - 20 items per page
    const page = parseInt(req.query.page, 10) || 1;
    const perPage = 20;
    const offset = (page - 1) * perPage;
    
    const errorMessage = req.query.error || "";

    // Main query to fetch event occurrences
    let eventsQuery = knex('event_occurrences')
        .select(
            'event_occurrences.event_occurrence_id',
            'event_occurrences.event_template_id',
            'event_occurrences.event_name',
            'event_occurrences.event_date_time_start',
            'event_occurrences.event_date_time_end',
            'event_occurrences.event_location',
            'event_occurrences.event_capacity',
            'event_occurrences.event_registration_deadline'
        );

    // Apply search filter if provided (searches name and location)
    if (searchQuery.trim() !== '') {
        const searchTerm = '%' + searchQuery.trim() + '%';
        eventsQuery = eventsQuery.where(function () {
            this.where('event_occurrences.event_name', 'ilike', searchTerm)
                .orWhere('event_occurrences.event_location', 'ilike', searchTerm);
        });
    }

    // Sort by date (newest first) and apply pagination
    eventsQuery = eventsQuery
        .orderBy('event_occurrences.event_date_time_start', 'desc')
        .limit(perPage)
        .offset(offset);

    // Count query needs same filters for accurate pagination
    let countQuery = knex('event_occurrences');
    if (searchQuery.trim() !== '') {
        const searchTerm = '%' + searchQuery.trim() + '%';
        countQuery = countQuery.where(function () {
            this.where('event_name', 'ilike', searchTerm)
                .orWhere('event_location', 'ilike', searchTerm);
        });
    }
    countQuery = countQuery.count('* as count').first();

    // Also get templates for the edit modal's dropdown
    const templatesQuery = knex('event_templates')
        .select('event_template_id', 'event_name')
        .orderBy('event_name');

    // Run all queries and render the page
    Promise.all([eventsQuery, countQuery, templatesQuery])
        .then(([events, countResult, templates]) => {
            const totalCount = parseInt(countResult.count, 10);
            const totalPages = Math.ceil(totalCount / perPage);

            res.render('manage-event-occurrences', {
                event: events,
                templates: templates,
                currentPage: page,
                totalPages,
                totalCount,
                searchQuery: searchQuery,
                error_message: errorMessage
            });
        }).catch(err => {
            console.log('Error fetching event information: ', err);
            res.render('manage-event-occurrences', {
                event: [],
                templates: [],
                currentPage: page,
                totalPages: 0,
                totalCount: 0,
                searchQuery: searchQuery,
                error_message: 'Error fetching event information'
            });
        });
});

// Show the "Add New Event Occurrence" form
app.get('/manage-event-occurrences/new', (req, res) => {
    // Fetch templates for the dropdown - includes default capacity
    // so we can auto-fill capacity when user selects a template
    knex('event_templates')
        .select(
            'event_template_id',
            'event_name',
            'event_default_capacity'
        )
        .orderBy('event_name')
        .then(templates => {
            res.render('add-event-occurrence', {
                templates: templates,
                error_message: ""
            });
        })
        .catch(err => {
            console.log('Error fetching event templates: ', err);
            res.redirect('/manage-event-occurrences?error=Error fetching event templates');
        });
});

app.post('/manage-event-occurrences/new', (req, res) => {
    const { 
        event_template_id, 
        event_name, 
        event_date_time_start, 
        event_date_time_end, 
        event_location, 
        event_capacity, 
        event_registration_deadline 
    } = req.body;

    // Build the insert object
    const insertData = {
        event_template_id,
        event_name,
        event_date_time_start,
        event_date_time_end,
        event_location,
        event_capacity: parseInt(event_capacity, 10)
    };

    // Only add registration deadline if provided
    if (event_registration_deadline) {
        insertData.event_registration_deadline = event_registration_deadline;
    }

    knex('event_occurrences')
        .insert(insertData)
        .then(() => {
            res.redirect('/manage-event-occurrences');
        })
        .catch(err => {
            console.log('Error creating event occurrence: ', err);
            // Fetch templates again for the form
            knex('event_templates')
                .select('event_template_id', 'event_name', 'event_default_capacity')
                .orderBy('event_name')
                .then(templates => {
                    res.render('add-event-occurrence', {
                        templates: templates,
                        error_message: 'An error occurred while creating the event occurrence.'
                    });
                })
                .catch(() => {
                    res.redirect('/manage-event-occurrences?error=An error occurred while creating the event occurrence');
                });
        });
});

// Update event occurrence
app.post('/manage-event-occurrences/:id/update', (req, res) => {
    const occurrenceId = req.params.id;
    const { 
        event_template_id, 
        event_name, 
        event_date_time_start, 
        event_date_time_end, 
        event_location, 
        event_capacity, 
        event_registration_deadline 
    } = req.body;

    // Build the update object
    const updateData = {
        event_template_id,
        event_name,
        event_date_time_start,
        event_date_time_end,
        event_location,
        event_capacity: parseInt(event_capacity, 10)
    };

    // Handle registration deadline - set to null if empty, otherwise use the value
    if (event_registration_deadline) {
        updateData.event_registration_deadline = event_registration_deadline;
    } else {
        updateData.event_registration_deadline = null;
    }

    knex('event_occurrences')
        .where('event_occurrence_id', occurrenceId)
        .update(updateData)
        .then(() => {
            res.redirect('/manage-event-occurrences');
        })
        .catch(err => {
            console.log('Error updating event occurrence: ', err);
            res.redirect('/manage-event-occurrences?error=An error occurred while updating the event occurrence');
        });
});

// Delete event occurrence
app.post('/manage-event-occurrences/:id/delete', (req, res) => {
    const occurrenceId = req.params.id;

    knex('event_occurrences')
        .where('event_occurrence_id', occurrenceId)
        .del()
        .then(() => {
            res.redirect('/manage-event-occurrences');
        })
        .catch(err => {
            console.log('Error deleting event occurrence: ', err);
            res.redirect('/manage-event-occurrences?error=An error occurred while deleting the event occurrence');
        });
});

// ~~~~~ Manage Event Templates ~~~~~
app.get('/manage-events', (req, res) => {
    // Get search query from URL
    const searchQuery = req.query.search || '';
    
    // Pagination logic
    const page = parseInt(req.query.page, 10) || 1;
    const perPage = 20;
    const offset = (page - 1) * perPage;
    
    // Get error message from query parameter if present
    const errorMessage = req.query.error || "";

    // Query for the current page of events
    let eventsQuery = knex('event_templates')
        .select(
            'event_template_id',
            'event_name',
            'event_type',
            'event_description',
            'event_recurrence_pattern',
            'event_default_capacity'
        );

    // If there's a search query, filter by event name
    if (searchQuery.trim() !== '') {
        const searchTerm = '%' + searchQuery.trim() + '%';
        eventsQuery = eventsQuery.where('event_name', 'ilike', searchTerm);
    }

    eventsQuery = eventsQuery
        .orderBy('event_name')
        .limit(perPage)
        .offset(offset);

    // Count query with same filter
    let countQuery = knex('event_templates');
    if (searchQuery.trim() !== '') {
        const searchTerm = '%' + searchQuery.trim() + '%';
        countQuery = countQuery.where('event_name', 'ilike', searchTerm);
    }
    countQuery = countQuery.count('* as count').first();

    Promise.all([eventsQuery, countQuery])
        .then(([events, countResult]) => {
            const totalCount = parseInt(countResult.count, 10);
            const totalPages = Math.ceil(totalCount / perPage);

            res.render('manage-events', {
                event: events,
                currentPage: page,
                totalPages,
                totalCount,
                searchQuery: searchQuery,
                error_message: errorMessage
            });
        }).catch(err => {
            console.log('Error fetching event information: ', err);
            res.render('manage-events', {
                event: [],
                currentPage: page,
                totalPages: 0,
                totalCount: 0,
                searchQuery: searchQuery,
                error_message: 'Error fetching event information'
            });
        });
});

app.get('/manage-events/new', (req, res) => {
    res.render('add-event-template', {
        error_message: "",
        success_message: ""
    })
})

app.post('/manage-events/new-template', (req, res) => {
    const {
        event_name,
        event_type,
        event_description,
        event_recurrence_pattern,
        event_default_capacity
    } = req.body

    knex('event_templates')
        .insert({
            event_name,
            event_type,
            event_description,
            event_recurrence_pattern,
            event_default_capacity: event_default_capacity || null
        })
        .then(() => {
            res.redirect('/manage-events');
        })
        .catch(err => {
            console.log('Error creating events:', err);
            res.render('add-event-template', {
                error_message: 'An error occured while creating an event.',
                success_message: ""
            })
        })
});

app.post('/manage-events/:template_id/new', (req, res) => {
    const template_id = parseInt(req.params.template_id, 10);
    const {
        event_name,
        event_date_time_start,
        event_date_time_end,
        event_location,
        event_capacity,
        event_registration_deadline
    } = req.body;

    // First verify that the event template exists
    knex('event_templates')
        .where('event_template_id', template_id)
        .first()
        .then(template => {
            if (!template) {
                // Template doesn't exist, redirect with error
                return res.redirect('/manage-events?error=Event template does not exist');
            }

            // Insert the event occurrence with the template_id
            return knex('event_occurrences')
                .insert({
                    event_template_id: template_id,
                    event_name,
                    event_date_time_start,
                    event_date_time_end,
                    event_location,
                    event_capacity: event_capacity || null,
                    event_registration_deadline: event_registration_deadline || null
                })
                .then(() => {
                    res.redirect('/manage-events');
                });
        })
        .catch(err => {
            console.log('Error creating occurrence:', err);
            // Fetch events for error display
            const page = 1;
            const perPage = 20;
            const offset = (page - 1) * perPage;
            
            const eventsQuery = knex('event_templates')
                .select(
                    'event_template_id',
                    'event_name',
                    'event_type',
                    'event_description',
                    'event_recurrence_pattern',
                    'event_default_capacity'
                )
                .orderBy('event_name')
                .limit(perPage)
                .offset(offset);

            const countQuery = getCount('event_templates');

            Promise.all([eventsQuery, countQuery])
                .then(([events, countResult]) => {
                    const totalCount = parseInt(countResult.count, 10);
                    const totalPages = Math.ceil(totalCount / perPage);

                    res.render('manage-events', {
                        event: events,
                        currentPage: page,
                        totalPages,
                        totalCount,
                        error_message: 'Something went wrong creating the event occurrence. Please try again.'
                    });
                })
                .catch(renderErr => {
                    console.log('Error fetching events for error display:', renderErr);
                    res.render('manage-events', {
                        event: [],
                        currentPage: 1,
                        totalPages: 0,
                        totalCount: 0,
                        error_message: 'Something went wrong creating the event occurrence. Please try again.'
                    });
                });
        });
})

// Update event template
app.post('/manage-events/:template_id/update', (req, res) => {
    const template_id = parseInt(req.params.template_id, 10);
    const { 
        event_name, 
        event_type, 
        event_description, 
        event_recurrence_pattern, 
        event_default_capacity 
    } = req.body;

    const updateData = {
        event_name,
        event_type,
        event_description: event_description || null,
        event_recurrence_pattern: event_recurrence_pattern || null,
        event_default_capacity: event_default_capacity ? parseInt(event_default_capacity, 10) : null
    };

    knex('event_templates')
        .where('event_template_id', template_id)
        .update(updateData)
        .then(() => {
            res.redirect('/manage-events');
        })
        .catch(err => {
            console.log('Error updating event template:', err);
            res.redirect('/manage-events?error=Error updating event template. Please try again.');
        });
});

app.post('/manage-events/:template_id/delete', (req, res) => {
    const template_id = parseInt(req.params.template_id, 10);

    // Verify that the event template exists
    knex('event_templates')
        .where('event_template_id', template_id)
        .first()
        .then(template => {
            if (!template) {
                // Template doesn't exist, redirect with error
                return res.redirect('/manage-events?error=Event template does not exist');
            }

            // Delete the event template (CASCADE will handle related records)
            return knex('event_templates')
                .where('event_template_id', template_id)
                .del()
                .then(() => {
                    res.redirect('/manage-events');
                });
        })
        .catch(err => {
            console.log('Error deleting event template:', err);
            res.redirect('/manage-events?error=Error deleting event template. Please try again.');
        });
})

// ~~~ ~~~ ~~~ ~~~ ~~~ MILESTONES ~~~ ~~~ ~~~ ~~~ ~~~ 
app.get('/milestone-progress', (req, res) => {
    // Get milestones for current user only
    knex('user_milestones')
        .innerJoin('milestones', 'user_milestones.milestone_id', '=', 'milestones.milestone_id')
        .select(
            'milestones.milestone_id',
            'milestones.milestone_title',
            'user_milestones.milestone_date'
        )
        .where('user_milestones.user_id', req.session.user_id)
        .orderBy('user_milestones.milestone_date', 'desc')
        .then(milestone => {
            res.render('milestone-progress', {
                milestone: milestone,
                error_message: ""
            });
        }).catch(err => {
            console.log('Error fetching milestone information: ', err);
            res.render('milestone-progress', {
                milestone: [],
                error_message: 'Error fetching milestone information'
            });
        });
});

app.get('/manage-milestones', (req, res) => {
    // Get search query from URL
    const searchQuery = req.query.search || '';
    
    // Pagination Logic
    const page = parseInt(req.query.page, 10) || 1;
    const perPage = 20;
    const offset = (page - 1) * perPage;

    // Query for the current page of milestones
    let milestonesQuery = knex('milestones')
        .select('milestone_id', 'milestone_title');

    // If there's a search query, filter by milestone title
    if (searchQuery.trim() !== '') {
        const searchTerm = '%' + searchQuery.trim() + '%';
        milestonesQuery = milestonesQuery.where('milestone_title', 'ilike', searchTerm);
    }

    milestonesQuery = milestonesQuery
        .orderBy('milestone_title')
        .limit(perPage)
        .offset(offset);

    // Count query with same filter
    let countQuery = knex('milestones');
    if (searchQuery.trim() !== '') {
        const searchTerm = '%' + searchQuery.trim() + '%';
        countQuery = countQuery.where('milestone_title', 'ilike', searchTerm);
    }
    countQuery = countQuery.count('* as count').first();

    Promise.all([milestonesQuery, countQuery])
        .then(([milestones, countResult]) => {
            const totalCount = parseInt(countResult.count, 10);
            const totalPages = Math.ceil(totalCount / perPage);
            
            res.render('manage-milestones', {
                milestone: milestones,
                currentPage: page,
                totalPages,
                totalCount,
                searchQuery: searchQuery,
                error_message: ""
            })
        }).catch(err => {
            console.log('Error fetching milestone information: ', err);
            res.render('manage-milestones', {
                milestone: [],
                searchQuery: searchQuery,
                error_message: 'Error fetching milestone information'
            });
        });
});

app.get('/manage-milestones/new', (req, res) => {
    res.render('add-milestone', {
        error_message: ""
    });
});

app.post('/manage-milestones/new', (req, res) => {
    const { milestone_title } = req.body;

    knex('milestones')
        .insert({ milestone_title })
        .then(() => {
            res.redirect('/manage-milestones');
        })
        .catch(err => {
            console.log('Error creating milestone: ', err);
            res.render('add-milestone', {
                error_message: 'An error occurred while creating the milestone.'
            });
        });
});

app.post('/manage-milestones/:milestone_id/delete', (req, res) => {
    const milestone_id = parseInt(req.params.milestone_id, 10);

    knex('milestones')
        .where('milestone_id', milestone_id)
        .first()
        .then(milestone => {
            if (!milestone) {
                return res.redirect('/manage-milestones?error=Milestone does not exist');
            }

            return knex('milestones')
                .where('milestone_id', milestone_id)
                .del()
                .then(() => {
                    res.redirect('/manage-milestones');
                });
        })
        .catch(err => {
            console.log('Error deleting milestone: ', err);
            res.redirect('/manage-milestones?error=Error deleting milestone. Please try again');
        });
});

app.post('/manage-milestones/:milestone_id/update', (req, res) => {
    const milestone_id = parseInt(req.params.milestone_id, 10);
    const { milestone_title } = req.body;

    knex('milestones')
        .where('milestone_id', milestone_id)
        .first()
        .then(milestone => {
            if (!milestone) {
                return res.redirect('/manage-milestones?error=Milestone does not exist');
            }

            return knex('milestones')
                .where('milestone_id', milestone_id)
                .update({ milestone_title })
                .then(() => {
                    res.redirect('/manage-milestones');
                });
        })
        .catch(err => {
            console.log('Error updating milestone: ', err);
            res.redirect('/manage-milestones?error=Error updating milestone. Please try again');
        });
});

// ~~~ ~~~ ~~~ ~~~ ~~~ DONATIONS ~~~ ~~~ ~~~ ~~~ ~~~ 
/*
 * Donation Routes
 * Handles the public donation page and tracking user donations.
 * 
 * Note: The payment processing is just a demo - no real charges happen.
 * Anonymous donations use user_id 1179 (a pre-created "anonymous" user).
 */

// Public donation page
app.get('/donate', (req, res) => {
    const success_message = req.query.success || "";
    res.render('donate', { error_message: "", success_message: success_message });
});

// Process a donation submission
app.post('/donate', (req, res) => {
    const { donation_amount } = req.body;
    
    // Make sure they entered a valid positive amount
    if (!donation_amount || parseFloat(donation_amount) <= 0) {
        return res.render('donate', { 
            error_message: "Please enter a valid donation amount",
            success_message: ""
        });
    }

    // If logged in, use their user_id. Otherwise use 1179 (anonymous donor account)
    const user_id = req.session.isLoggedIn ? req.session.user_id : 1179;

    // Get the next available donation_id (max + 1)
    // Note: In production, you'd probably let the database handle auto-increment
    knex('donations')
        .max('donation_id as maxId')
        .first()
        .then(result => {
            const nextId = (result.maxId || 0) + 1;
            
            // Create the donation record
            return knex('donations').insert({
                donation_id: nextId,
                user_id: user_id,
                donation_amount: parseFloat(donation_amount),
                donation_date: new Date().toISOString().split('T')[0] // Today's date in YYYY-MM-DD format
            });
        })
        .then(() => {
            // Success! Redirect back with a thank you message
            res.redirect('/donate?success=Thank+you+for+your+generous+donation!');
        })
        .catch(err => {
            console.log('Error processing donation: ', err);
            res.render('donate', { 
                error_message: "Error processing donation. Please try again.",
                success_message: ""
            });
        });
});

// User's donation history page (for logged-in users)
app.get('/my-donations', (req, res) => {
    // Fetch all donations made by the current user
    knex('donations')
        .select(
            'donation_amount',
            'donation_date'
        )
        .where('user_id', req.session.user_id)
        .orderBy('donation_date', 'desc') // Newest first
        .then(donation => {
            res.render('my-donations', {
                donation: donation,
                error_message: ""
            });
        }).catch(err => {
            console.log('Error fetching donation information: ', err);
            res.render('my-donations', {
                donation: [],
                error_message: 'Error fetching donation information'
            });
        });
});

app.get('/manage-donations', (req, res) => {
    // Get search query from URL
    const searchQuery = req.query.search || '';

    // Pagination logic
    const page = parseInt(req.query.page, 10) || 1;
    const perPage = 20;
    const offset = (page - 1) * perPage;

    // Query for the current page of donations
    let donationsQuery = knex('donations')
        .innerJoin('users', 'donations.user_id', '=', 'users.user_id') // Join user and donations tables
        .select( // Select necessary information
            'donations.donation_id',
            'donations.user_id',
            'donation_amount',
            'donation_date',
            'user_email',
            'user_first_name',
            'user_last_name'
        );

    // If there's a search query, filter by donor name
    if (searchQuery.trim() !== '') {
        const searchTerm = '%' + searchQuery.trim() + '%';
        donationsQuery = donationsQuery.where(function () {
            this.where('user_first_name', 'ilike', searchTerm)
                .orWhere('user_last_name', 'ilike', searchTerm)
                .orWhere(knex.raw("concat_ws(' ', user_first_name, user_last_name) ilike ?", [searchTerm]));
        });
    }

    donationsQuery = donationsQuery
        .orderByRaw('donation_date DESC NULLS LAST') // Order by date newest to oldest
        .limit(perPage)
        .offset(offset); // Offset is the number of rows to skip

    // Query for the total amount of donations
    const totalDonationsQuery = knex('donations')
        .sum('donation_amount as total_donations')
        .first();

    // Get start of current year (January 1st)
    const now = new Date();
    const startOfYear = new Date(now.getFullYear(), 0, 1);
    const endOfYear = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
    const year = now.getFullYear();
    const month = now.getMonth()

    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    const totalYearlyDonationsQuery = knex('donations')
        .sum('donation_amount as total_yearly_donations')
        .where('donation_date', '>=', startOfYear)
        .andWhere('donation_date', '<=', endOfYear)
        .first();

    const totalMonthlyDonationsQuery = knex('donations')
        .sum('donation_amount as total_monthly_donations')
        .where('donation_date', '>=', startOfMonth)
        .andWhere('donation_date', '<=', endOfMonth)
        .first();
        
    // Query for the total count of donations (for pagination) - with same search filter
    let countQuery = knex('donations')
        .innerJoin('users', 'donations.user_id', '=', 'users.user_id');
    if (searchQuery.trim() !== '') {
        const searchTerm = '%' + searchQuery.trim() + '%';
        countQuery = countQuery.where(function () {
            this.where('user_first_name', 'ilike', searchTerm)
                .orWhere('user_last_name', 'ilike', searchTerm)
                .orWhere(knex.raw("concat_ws(' ', user_first_name, user_last_name) ilike ?", [searchTerm]));
        });
    }
    countQuery = countQuery.count('* as count').first();

    Promise.all([donationsQuery, countQuery, totalDonationsQuery, totalYearlyDonationsQuery, totalMonthlyDonationsQuery]) // Ensures that both queries are executed before running
        .then(([donations, countResult, totalDonationsResult, totalYearlyDonationsResult, totalMonthlyDonationsResult]) => {
            const totalCount = parseInt(countResult.count, 10);
            const totalPages = Math.ceil(totalCount / perPage);
            const totalDonations = totalDonationsResult.total_donations;
            const totalYearlyDonations = totalYearlyDonationsResult.total_yearly_donations;
            const totalMonthlyDonations = totalMonthlyDonationsResult.total_monthly_donations;
            res.render('manage-donations', {
                donation: donations,
                currentPage: page,
                totalPages,
                totalCount,
                totalDonations,
                totalYearlyDonations,
                totalMonthlyDonations,
                year,
                month,
                searchQuery: searchQuery,
                error_message: ''
            });
        })
        .catch(err => {
            console.log('Error fetching donations/users: ', err);
            res.render('manage-donations', {
                donation: [],
                currentPage: page,
                totalPages: 0,
                totalCount: 0,
                searchQuery: searchQuery,
                error_message: 'Error fetching donation/user information.'
            });
        });
});

app.get('/manage-donations/new', (req, res) => {
    res.render('add-donation', {
        error_message: ""
    });
});

app.post('/manage-donations/new', (req, res) => {
    const { user_id, donation_amount, donation_date } = req.body;

    knex('donations')
        .insert({
            user_id,
            donation_amount,
            donation_date
        })
        .then(() => {
            res.redirect('/manage-donations');
        })
        .catch(err => {
            console.log('Error creating donation: ', err);
            res.render('add-donation', {
                error_message: 'An error occurred while creating the donation.'
            });
        });
});

app.post('/manage-donations/:donation_id/delete', (req, res) => {
    const donation_id = parseInt(req.params.donation_id, 10);

    knex('donations')
        .where('donation_id', donation_id)
        .first()
        .then(donation => {
            if (!donation) {
                return res.redirect('/manage-donations?error=Donation does not exist');
            }

            return knex('donations')
                .where('donation_id', donation_id)
                .del()
                .then(() => {
                    res.redirect('/manage-donations');
                });
        })
        .catch(err => {
            console.log('Error deleting donation: ', err);
            res.redirect('/manage-donations?error=Error deleting donation. Please try again');
        });
});

app.post('/manage-donations/:donation_id/update', (req, res) => {
    const donation_id = parseInt(req.params.donation_id, 10);
    const { user_id, donation_amount, donation_date } = req.body;

    knex('donations')
        .where('donation_id', donation_id)
        .first()
        .then(donation => {
            if (!donation) {
                return res.redirect('/manage-donations?error=Donation does not exist');
            }

            return knex('donations')
                .where('donation_id', donation_id)
                .update({
                    user_id,
                    donation_amount,
                    donation_date
                })
                .then(() => {
                    res.redirect('/manage-donations');
                });
        })
        .catch(err => {
            console.log('Error updating donation: ', err);
            res.redirect('/manage-donations?error=Error updating donation. Please try again');
        });
});

app.get('/manage-donations/export', (req, res) => {
    // Fetch all donations (no pagination for export)
    knex('donations')
        .innerJoin('users', 'donations.user_id', '=', 'users.user_id')
        .select(
            'donations.donation_id',
            'donations.user_id',
            'donation_amount',
            'donation_date',
            'user_email',
            'user_first_name',
            'user_last_name'
        )
        .orderByRaw('donation_date DESC NULLS LAST')
        .then(donations => {
            // Format data for Excel
            const excelData = donations.map(donation => {
                const date = donation.donation_date 
                    ? new Date(donation.donation_date).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric'
                    })
                    : 'N/A';
                
                return {
                    'Donation ID': donation.donation_id,
                    'User ID': donation.user_id,
                    'First Name': donation.user_first_name,
                    'Last Name': donation.user_last_name,
                    'Email': donation.user_email,
                    'Amount': parseFloat(donation.donation_amount).toFixed(2),
                    'Date': date
                };
            });

            // Create workbook and worksheet
            const workbook = XLSX.utils.book_new();
            const worksheet = XLSX.utils.json_to_sheet(excelData);

            // Add worksheet to workbook
            XLSX.utils.book_append_sheet(workbook, worksheet, 'Donations');

            // Generate Excel file buffer
            const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

            // Set response headers for file download
            const filename = `donations_export_${new Date().toISOString().split('T')[0]}.xlsx`;
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

            // Send the file
            res.send(excelBuffer);
        })
        .catch(err => {
            console.log('Error exporting donations: ', err);
            res.redirect('/manage-donations?error=Error exporting donations. Please try again.');
        });
});

// ~~~ ~~~ ~~~ ~~~ ~~~ SURVEYS ~~~ ~~~ ~~~ ~~~ ~~~ 
app.get('/surveys', (req, res) => {
    // Get surveys for current user only
    knex('registration')
        .leftJoin('event_occurrences', 'registration.event_occurrence_id', '=', 'event_occurrences.event_occurrence_id')
        .leftJoin('surveys', 'registration.registration_id', '=', 'surveys.registration_id')
        .select(
            'registration.registration_id',
            'registration.event_occurrence_id',
            'registration.user_id',
            'registration.registration_status',
            'registration.registration_attended_flag',
            'registration.registration_check_in_time',
            'registration.registration_created_at',
            'surveys.survey_id',
            'surveys.satisfaction_score',
            'surveys.usefulness_score',
            'surveys.instructor_score',
            'surveys.recommendation_score',
            'surveys.nps_bucket',
            'surveys.survey_comments',
            'event_occurrences.event_name',
            'event_occurrences.event_location',
            'event_occurrences.event_date_time_start',
            'event_occurrences.event_date_time_end',
            'surveys.survey_submission_date',
            'surveys.overall_score'
        )
        .where('registration.user_id', req.session.user_id)
        .orderBy('event_occurrences.event_date_time_end', 'desc') // Order by survey submission date newest to oldest
        .then(registrations => {
            if (registrations.length > 0) {
                res.render('surveys', {
                    registrations: registrations,
                    error_message: ""
                });
            } else {
                res.render('surveys', {
                    registrations: [],
                    error_message: 'No registrations found'
                });
            }
        })
        .catch(err => {
            console.log('Error fetching registrations: ', err);
            res.render('surveys', {
                registrations: [],
                error_message: 'Error fetching registrations'
            });
        });
});

// ~~~ ~~~ NEW SURVEY ~~~ ~~~
app.get('/add-survey/:registration_id/:event_occurrence_id', (req, res) => { // Get the new survey page
    const registration_id = parseInt(req.params.registration_id, 10);
    const event_occurrence_id = parseInt(req.params.event_occurrence_id, 10);

    // First check if survey already exists
    knex('surveys')
        .where('registration_id', registration_id)
        .first()
        .then(survey => {
            if (survey) {
                return res.redirect('/surveys?error=Survey already exists');
            }

            // Fetch event occurrence data for the survey form
            return knex('event_occurrences')
                .where('event_occurrence_id', event_occurrence_id)
                .first()
                .then(eventOccurrence => {
                    if (!eventOccurrence) {
                        return res.redirect('/surveys?error=Event occurrence not found');
                    }

                    // Format the event date
                    const date = new Date(eventOccurrence.event_date_time_start);
                    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                    const formattedDate = months[date.getMonth()] + ' ' + date.getDate() + ', ' + date.getFullYear();

                    res.render('add-survey', {
                        registration_id: registration_id,
                        event_occurrence_id: event_occurrence_id,
                        event_name: eventOccurrence.event_name,
                        event_date: formattedDate,
                        event_location: eventOccurrence.event_location || 'TBD',
                        error_message: ""
                    });
                });
        })
        .catch(err => {
            console.log('Error fetching survey: ', err);
            res.redirect('/surveys?error=Error loading survey form');
        });
});

app.post('/add-survey/:registration_id', (req, res) => { // Add a new survey
    const registration_id = parseInt(req.params.registration_id, 10);
    const { satisfaction_score, usefulness_score, instructor_score, recommendation_score, survey_comments } = req.body;

    // Get the current date and time
    const survey_submission_date = new Date();
    // Calculate the overall score
    const overall_score = (parseFloat(satisfaction_score) + parseFloat(usefulness_score) + parseFloat(instructor_score) + parseFloat(recommendation_score)) / 4;

    // Determine the NPS bucket
    const nps_bucket = parseInt(recommendation_score) >= 4 ? 'Promoter' : parseInt(recommendation_score) < 3 ? 'Detractor' : 'Passive';

    knex('surveys')
        .insert({ registration_id, overall_score, survey_submission_date, satisfaction_score, usefulness_score, instructor_score, recommendation_score, nps_bucket, survey_comments })
        .then(() => {
            res.redirect('/surveys');
        })
        .catch(err => {
            console.log('Error creating survey: ', err);
            res.render('add-survey', {
                error_message: 'An error occurred while creating the survey.'
            });
        });
});

// ~~~ ~~~ DELETE SURVEY (User) ~~~ ~~~
app.post('/surveys/:survey_id/delete', (req, res) => {
    const survey_id = parseInt(req.params.survey_id, 10);

    // First verify that the survey exists and belongs to the current user
    knex('surveys')
        .innerJoin('registration', 'surveys.registration_id', '=', 'registration.registration_id')
        .where('surveys.survey_id', survey_id)
        .where('registration.user_id', req.session.user_id)
        .first()
        .then(survey => {
            if (!survey) {
                // Survey doesn't exist or doesn't belong to user
                return res.redirect('/surveys?error=Survey not found or you do not have permission to delete it');
            }

            // Delete only the survey (not registration or event_occurrence)
            return knex('surveys')
                .where('survey_id', survey_id)
                .del()
                .then(() => {
                    res.redirect('/surveys');
                });
        })
        .catch(err => {
            console.log('Error deleting survey:', err);
            res.redirect('/surveys?error=Error deleting survey. Please try again.');
        });
});

// ~~~ ~~~ ~~~ ~~~ ~~~ REGISTRATIONS ~~~ ~~~ ~~~ ~~~ ~~~ 
app.get('/registrations/:user_id', (req, res) => {
    const user_id = parseInt(req.params.user_id, 10);
    // Get registrations for current user only
    knex('registration')
        .innerJoin('event_occurrences', 'registration.event_occurrence_id', '=', 'event_occurrences.event_occurrence_id')
        .select(
            'registration.registration_id',
            'registration.event_occurrence_id',
            'registration.user_id',
            'registration.registration_status',
            'registration.registration_attended_flag',
            'registration.registration_check_in_time',
            'registration.registration_created_at',
            'event_occurrences.event_name',
            'event_occurrences.event_location',
            'event_occurrences.event_date_time_start',
            'event_occurrences.event_date_time_end'
        )
        .where('registration.user_id', user_id)
        .orderBy('event_occurrences.event_date_time_end', 'desc')
        .then(registrations => {
            if (registrations.length > 0) {
                res.render('registrations', {
                    registrations: registrations,
                    error_message: "",
                    user_id: user_id
                });
            } else {
                res.render('registrations', {
                    registrations: [],
                    error_message: "",
                    user_id: user_id
                });
            }
        }).catch(err => {
            console.log('Error fetching registrations: ', err);
            res.render('registrations', {
                registrations: [],
                error_message: 'Error fetching registrations',
                user_id: user_id
            });
        });
});

app.post('/registrations/:registration_id/cancel', (req, res) => {
    const registration_id = parseInt(req.params.registration_id, 10);
    knex('registration')
        .where('registration_id', registration_id)
        .first()
        .then(registration => {
            if (!registration) {
                return res.redirect('/registrations?error=Registration does not exist');
            }
            // Cancel the registration
            return knex('registration')
                .where('registration_id', registration_id)
                .update({
                    registration_status: 'Cancelled'
                })
                .then(() => {
                    res.redirect(`/registrations/${registration.user_id}`);
                });
        })
        .catch(err => {
            console.log('Error canceling registration: ', err);
            res.redirect('/registrations?error=Error canceling registration. Please try again');
        })
});

// ~~~ ~~~ REGISTER FOR EVENT ~~~ ~~~
app.post('/registration/:user_id/register/:event_occurrence_id', (req, res) => {
    const user_id = parseInt(req.params.user_id, 10);
    const event_occurrence_id = parseInt(req.params.event_occurrence_id, 10);
    const { registration_status, event_registration_deadline, event_capacity } = req.body;

    // Check if the event registration deadline has passed
    const currentDate = new Date();
    const eventRegistrationDeadline = new Date(event_registration_deadline);
    if (eventRegistrationDeadline < currentDate) {
        return res.redirect('/registrations?error=Event registration deadline has passed');
    }

    // Check if the event capacity has been reached
    const eventCapacity = parseInt(event_capacity, 10);
    knex('registration')
        .where('event_occurrence_id', event_occurrence_id)
        .count('* as count')
        .first()
        .then(result => {
            const currentCapacity = parseInt(result.count, 10);
            if (currentCapacity >= eventCapacity) { // If the event capacity has been reached, redirect with an error message
                return res.redirect('/registrations?error=Event capacity has been reached');
            }
            // Register the user
            return knex('registration')
                .insert({ user_id, event_occurrence_id, registration_status, registration_created_at: new Date() })
                .then(() => {
                    res.redirect('/events?success=Registration+Successful');
                });
        })
        .catch(err => { // If there is an error checking the event capacity, redirect with an error message
            console.log('Error checking event capacity: ', err);
            res.redirect('/registrations?error=Error checking event capacity. Please try again');
        })
});

// ~~~ ~~~ MANAGE SURVEYS ~~~ ~~~
app.get('/manage-surveys', (req, res) => { // Get the manage surveys page
    // Get search query from URL
    const searchQuery = req.query.search || '';
    
    // Pagination logic
    const page = parseInt(req.query.page, 10) || 1;
    const perPage = 20;
    const offset = (page - 1) * perPage;

    // Query for the current page of surveys
    let surveyQuery = knex('surveys')
        .innerJoin('registration', 'surveys.registration_id', '=', 'registration.registration_id')
        .innerJoin('users', 'registration.user_id', '=', 'users.user_id')
        .innerJoin('event_occurrences', 'registration.event_occurrence_id', '=', 'event_occurrences.event_occurrence_id')
        .select(
            'survey_id',
            'overall_score',
            'survey_submission_date',
            'registration.registration_id',
            'event_occurrences.event_occurrence_id',
            'event_name',
            'event_location',
            'users.user_id',
            'user_first_name',
            'user_last_name'
        );

    // If there's a search query, filter by user name or event name
    if (searchQuery.trim() !== '') {
        const searchTerm = '%' + searchQuery.trim() + '%';
        surveyQuery = surveyQuery.where(function () {
            this.where('user_first_name', 'ilike', searchTerm)
                .orWhere('user_last_name', 'ilike', searchTerm)
                .orWhere('event_name', 'ilike', searchTerm)
                .orWhere(knex.raw("concat_ws(' ', user_first_name, user_last_name) ilike ?", [searchTerm]));
        });
    }

    surveyQuery = surveyQuery
        .orderBy('survey_submission_date', 'desc')
        .limit(perPage)
        .offset(offset);

    // Count query with same filter
    let countQuery = knex('surveys')
        .innerJoin('registration', 'surveys.registration_id', '=', 'registration.registration_id')
        .innerJoin('users', 'registration.user_id', '=', 'users.user_id')
        .innerJoin('event_occurrences', 'registration.event_occurrence_id', '=', 'event_occurrences.event_occurrence_id');
    
    if (searchQuery.trim() !== '') {
        const searchTerm = '%' + searchQuery.trim() + '%';
        countQuery = countQuery.where(function () {
            this.where('user_first_name', 'ilike', searchTerm)
                .orWhere('user_last_name', 'ilike', searchTerm)
                .orWhere('event_name', 'ilike', searchTerm)
                .orWhere(knex.raw("concat_ws(' ', user_first_name, user_last_name) ilike ?", [searchTerm]));
        });
    }
    countQuery = countQuery.count('* as count').first();
    
    Promise.all([surveyQuery, countQuery])
        .then(([surveys, countResult]) => {
            const totalCount = parseInt(countResult.count, 10);
            const totalPages = Math.ceil(totalCount / perPage)

            res.render('manage-surveys', {
                survey: surveys,
                currentPage: page,
                totalPages,
                totalCount,
                searchQuery: searchQuery,
                error_message: ""
            })
        }).catch(err => {
            console.log('Error fetching surveys: ', err);
            res.render('manage-surveys', {
                survey: [],
                searchQuery: searchQuery,
                error_message: 'Error fetching surveys'
            });
        });
});

// Update survey
app.post('/manage-surveys/:survey_id/update', (req, res) => {
    const survey_id = parseInt(req.params.survey_id, 10);
    const { overall_score, survey_submission_date } = req.body;

    const updateData = {
        overall_score: overall_score ? parseInt(overall_score, 10) : null,
        survey_submission_date: survey_submission_date || null
    };

    knex('surveys')
        .where('survey_id', survey_id)
        .update(updateData)
        .then(() => {
            res.redirect('/manage-surveys');
        })
        .catch(err => {
            console.log('Error updating survey:', err);
            res.redirect('/manage-surveys?error=Error updating survey. Please try again.');
        });
});

app.post('/manage-surveys/:survey_id/delete', (req, res) => {
    const survey_id = parseInt(req.params.survey_id, 10);

    // Verify that the survey exists
    knex('surveys')
        .where('survey_id', survey_id)
        .first()
        .then(survey => {
            if (!survey) {
                // Survey doesn't exist
                return res.redirect('/manage-surveys?error=Survey does not exist');
            }

            // Delete the survey
            return knex('surveys')
                .where('survey_id', survey_id)
                .del()
                .then(() => {
                    res.redirect('/manage-surveys');
                })
        })
        .catch(err => {
            console.log('Error deleting survey', err);
            res.redirect('/manage-surveys?error=Error deleting survey. Please try again')
        })
});

// ~~~ ~~~ ~~~ ~~~ ~~~ Participants (Admin only) ~~~ ~~~ ~~~ ~~~ ~~~ 
app.get('/manage-participants', (req, res) => {
    // Get search query from URL
    const searchQuery = req.query.search || '';
    
    // Pagination Logic
    const page = parseInt(req.query.page, 10) || 1;
    const perPage = 20;
    const offset = (page - 1) * perPage;

    // Build the users query
    let usersQuery = knex('users')
        .select(
            'user_id',
            'user_first_name',
            'user_last_name',
            'user_email',
            'user_role',
            'user_dob',
            'user_phone',
            'user_city',
            'user_state',
            'user_zip',
            'user_school',
            'user_employer',
            'user_field_of_interest'
        );

    // If there's a search query, filter the database
    if (searchQuery.trim() !== '') {
        const searchTerm = '%' + searchQuery.trim() + '%';
        usersQuery = usersQuery.where(function () {
            this.where('user_first_name', 'ilike', searchTerm)
                .orWhere('user_last_name', 'ilike', searchTerm)
                // Also allow searching for full name:
                .orWhere(
                    knex.raw(
                        "concat_ws(' ', user_first_name, user_last_name) ilike ?",
                        [searchTerm]
                    )
                );
        });
    }

    // Add ordering and pagination
    usersQuery = usersQuery
        .orderBy('user_last_name')
        .orderBy('user_first_name')
        .limit(perPage)
        .offset(offset);

    // Build count query with same filter
    let countQuery = knex('users');
    if (searchQuery.trim() !== '') {
        const searchTerm = '%' + searchQuery.trim() + '%';
        countQuery = countQuery.where(function() {
            this.where('user_first_name', 'ilike', searchTerm)
                .orWhere('user_last_name', 'ilike', searchTerm);
        });
    }
    countQuery = countQuery.count('* as count').first();

    Promise.all([usersQuery, countQuery])
        .then(([users, countResult]) => {
            const totalCount = parseInt(countResult.count, 10);
            const totalPages = Math.ceil(totalCount / perPage);

            res.render('manage-participants', {
                user: users,
                currentPage: page,
                totalPages,
                totalCount,
                searchQuery: searchQuery,
                error_message: ""
            })
        }).catch(err => {
            console.log('Error fetching users: ', err);
            res.render('manage-participants', {
                user: [],
                searchQuery: searchQuery,
                error_message: 'Error fetching users.'
            });
        });
});

app.get('/manage-participants/new', (req, res) => {
    res.render('add-participant', {
      error_message: ""
    });
});

// ~~~ ~~~ ~~~ ~~~ ~~~ Dashboard ~~~ ~~~ ~~~ ~~~ ~~~ 
/*
 * User Dashboard
 * Shows different KPIs (Key Performance Indicators) based on user role:
 * - Admins see organizational stats (total donations, participant count, etc.)
 * - Participants see personal stats (upcoming reservations, milestones, pending surveys)
 */
app.get('/dashboard', (req, res) => {
    const currentUserId = req.session.user_id;
    const currentDate = new Date();

    // ===== ADMIN KPIs =====
    // These queries fetch organization-wide statistics
    
    // Total registered users in the system
    const totalParticipantsQuery = knex('users')
        .count('* as count')
        .first()
        .then(count => parseInt(count.count, 10))
        .catch(err => {
            console.log('Error fetching total participants: ', err);
            return 0;
        });

    // Sum of all donations ever received (regardless of donor)
    const totalDonationsQuery = knex('donations')
        .sum('donation_amount as total_donations')
        .first()
        .then(result => result.total_donations || 0)
        .catch(err => {
            console.log('Error fetching total donations: ', err);
            return 0;
        });

    // How many events are scheduled for the future
    const upcomingEventsCountQuery = knex('event_occurrences')
        .where('event_date_time_start', '>=', currentDate)
        .count('* as count')
        .first()
        .then(result => parseInt(result.count, 10))
        .catch(err => {
            console.log('Error fetching upcoming events count: ', err);
            return 0;
        });

    // Details of the NEXT upcoming event (soonest one)
    const upcomingEventQuery = knex('event_occurrences')
        .select('event_occurrence_id', 'event_name', 'event_date_time_start', 'event_date_time_end', 'event_location')
        .where('event_date_time_start', '>=', currentDate)
        .orderBy('event_date_time_start', 'asc')
        .first()
        .then(upcomingEvent => upcomingEvent || null)
        .catch(err => {
            console.log('Error fetching upcoming event: ', err);
            return null;
        });

    // ===== PARTICIPANT KPIs =====
    // These queries fetch stats specific to the logged-in user
    
    // 1. Upcoming Reservations: events they're registered for that haven't happened yet
    //    (registration_status = NULL means pending/confirmed, vs cancelled)
    const upcomingReservationsQuery = knex('registration')
        .join('event_occurrences', 'registration.event_occurrence_id', '=', 'event_occurrences.event_occurrence_id')
        .where('registration.user_id', currentUserId)
        .whereNull('registration.registration_status')
        .where('event_occurrences.event_date_time_start', '>=', currentDate)
        .count('* as count')
        .first()
        .then(result => parseInt(result.count, 10))
        .catch(err => {
            console.log('Error fetching upcoming reservations: ', err);
            return 0;
        });

    // 2. Milestones Completed: how many achievements/badges the user has earned
    const milestonesCompletedQuery = knex('user_milestones')
        .where('user_id', currentUserId)
        .count('* as count')
        .first()
        .then(result => parseInt(result.count, 10))
        .catch(err => {
            console.log('Error fetching milestones completed: ', err);
            return 0;
        });

    // 3. Surveys Pending: past events they attended but haven't submitted feedback for
    //    Uses LEFT JOIN to find registrations that DON'T have a matching survey
    const surveysPendingQuery = knex('registration')
        .join('event_occurrences', 'registration.event_occurrence_id', '=', 'event_occurrences.event_occurrence_id')
        .leftJoin('surveys', 'registration.registration_id', '=', 'surveys.registration_id')
        .where('registration.user_id', currentUserId)
        .where('event_occurrences.event_date_time_start', '<', currentDate) // Event already happened
        .whereNull('surveys.survey_id') // No survey submitted yet
        .count('registration.registration_id as count')
        .first()
        .then(result => parseInt(result.count, 10))
        .catch(err => {
            console.log('Error fetching surveys pending: ', err);
            return 0;
        });

    // Run all queries in parallel and render the dashboard with all the data
    Promise.all([
        totalDonationsQuery, 
        upcomingEventQuery, 
        totalParticipantsQuery,
        upcomingEventsCountQuery,
        upcomingReservationsQuery,
        milestonesCompletedQuery,
        surveysPendingQuery
    ])
        .then(([totalDonations, upcomingEvent, totalParticipants, upcomingEvents, upcomingReservations, milestonesCompleted, surveysPending]) => {
            res.render('dashboard', {
                error_message: "",
                // Admin KPIs
                totalDonations: totalDonations,
                upcomingEvent: upcomingEvent,
                totalParticipants: totalParticipants,
                upcomingEvents: upcomingEvents,
                // Participant KPIs
                upcomingReservations: upcomingReservations,
                milestonesCompleted: milestonesCompleted,
                surveysPending: surveysPending
            });
        }).catch(err => {
            console.log('Error fetching dashboard information: ', err);
            // On error, render dashboard with null values (the EJS template handles this gracefully)
            res.render('dashboard', {
                error_message: 'Error fetching dashboard information',
                totalDonations: null,
                upcomingEvent: null,
                totalParticipants: null,
                upcomingEvents: null,
                upcomingReservations: null,
                milestonesCompleted: null,
                surveysPending: null
            });
        });
});

app.post('/manage-participants/new', (req, res) => {
    const { user_first_name, user_last_name, user_email, user_role } = req.body;

    knex('users')
        .insert({
            user_first_name,
            user_last_name,
            user_email,
            user_role,
            user_password: 'default' // Same as seed data
        })
        .then(() => {
            res.redirect('/manage-participants');
        })
        .catch(err => {
            console.log('Error creating participant: ', err);
            res.render('add-participant', {
                error_message: 'An error occurred while creating the participant.'
            });
        });
});

app.post('/manage-participants/:user_id/delete', (req, res) => {
    const user_id = parseInt(req.params.user_id, 10);

    knex('users')
        .where('user_id', user_id)
        .first()
        .then(user => {
            if (!user) {
                return res.redirect('/manage-participants?error=User does not exist');
            }

            return knex('users')
                .where('user_id', user_id)
                .del()
                .then(() => {
                    res.redirect('/manage-participants');
                });
        })
        .catch(err => {
            console.log('Error deleting user: ', err);
            res.redirect('/manage-participants?error=Error deleting user. Please try again');
        });
});

app.post('/manage-participants/:user_id/update', (req, res) => {
    const user_id = parseInt(req.params.user_id, 10);
    const { 
        user_first_name, 
        user_last_name, 
        user_email, 
        user_role,
        user_dob,
        user_phone,
        user_city,
        user_state,
        user_zip,
        user_school,
        user_employer,
        user_field_of_interest
    } = req.body;

    knex('users')
        .where('user_id', user_id)
        .first()
        .then(user => {
            if (!user) {
                return res.redirect('/manage-participants?error=User does not exist');
            }

            // Build update object, only including fields that are provided
            const updateData = {};
            if (user_first_name !== undefined) updateData.user_first_name = user_first_name;
            if (user_last_name !== undefined) updateData.user_last_name = user_last_name;
            if (user_email !== undefined) updateData.user_email = user_email;
            if (user_role !== undefined) updateData.user_role = user_role;
            if (user_dob !== undefined && user_dob !== '') updateData.user_dob = user_dob;
            if (user_phone !== undefined) updateData.user_phone = user_phone;
            if (user_city !== undefined) updateData.user_city = user_city;
            if (user_state !== undefined) updateData.user_state = user_state;
            if (user_zip !== undefined && user_zip !== '') updateData.user_zip = user_zip;
            if (user_school !== undefined) updateData.user_school = user_school;
            if (user_employer !== undefined) updateData.user_employer = user_employer;
            if (user_field_of_interest !== undefined) updateData.user_field_of_interest = user_field_of_interest;

            return knex('users')
                .where('user_id', user_id)
                .update(updateData)
                .then(() => {
                    res.redirect('/manage-participants');
                });
        })
        .catch(err => {
            console.log('Error updating user: ', err);
            res.redirect('/manage-participants?error=Error updating user. Please try again');
        });
});

// Get user milestones and available milestones for a specific user
app.get('/manage-participants/:user_id/milestones', (req, res) => {
    const user_id = parseInt(req.params.user_id, 10);

    // Get user's current milestones
    const userMilestonesQuery = knex('user_milestones')
        .innerJoin('milestones', 'user_milestones.milestone_id', '=', 'milestones.milestone_id')
        .select(
            'milestones.milestone_id',
            'milestones.milestone_title',
            'user_milestones.milestone_date'
        )
        .where('user_milestones.user_id', user_id)
        .orderBy('user_milestones.milestone_date', 'desc');

    // Get all available milestones
    const allMilestonesQuery = knex('milestones')
        .select('milestone_id', 'milestone_title')
        .orderBy('milestone_title');

    Promise.all([userMilestonesQuery, allMilestonesQuery])
        .then(([userMilestones, allMilestones]) => {
            res.json({
                userMilestones: userMilestones,
                availableMilestones: allMilestones
            });
        })
        .catch(err => {
            console.log('Error fetching milestones: ', err);
            res.status(500).json({ error: 'Error fetching milestone information' });
        });
});

// Add milestone to user
app.post('/manage-participants/:user_id/milestones/add', (req, res) => {
    const user_id = parseInt(req.params.user_id, 10);
    
    if (!req.body) {
        return res.status(400).json({ error: 'Request body is missing' });
    }
    
    const { milestone_id, milestone_date } = req.body;

    if (!milestone_id) {
        return res.status(400).json({ error: 'Milestone ID is required' });
    }

    // Check if user already has this milestone (composite primary key prevents duplicates)
    knex('user_milestones')
        .where('user_id', user_id)
        .where('milestone_id', milestone_id)
        .first()
        .then(existing => {
            if (existing) {
                return res.status(400).json({ error: 'User already has this milestone' });
            }

            // Insert the milestone
            return knex('user_milestones')
                .insert({
                    user_id: user_id,
                    milestone_id: milestone_id,
                    milestone_date: milestone_date || new Date().toISOString().split('T')[0]
                })
                .then(() => {
                    res.json({ success: true });
                });
        })
        .catch(err => {
            console.log('Error adding milestone to user: ', err);
            res.status(500).json({ error: 'Error adding milestone to user' });
        });
});

// Remove milestone from user
app.post('/manage-participants/:user_id/milestones/remove', (req, res) => {
    const user_id = parseInt(req.params.user_id, 10);
    
    if (!req.body) {
        return res.status(400).json({ error: 'Request body is missing' });
    }
    
    const { milestone_id } = req.body;

    if (!milestone_id) {
        return res.status(400).json({ error: 'Milestone ID is required' });
    }

    knex('user_milestones')
        .where('user_id', user_id)
        .where('milestone_id', milestone_id)
        .del()
        .then(() => {
            res.json({ success: true });
        })
        .catch(err => {
            console.log('Error removing milestone from user: ', err);
            res.status(500).json({ error: 'Error removing milestone from user' });
        });
});

// ~~~ ~~~ ~~~ ~~~ ~~~ Account Info ~~~ ~~~ ~~~ ~~~ ~~~ 
app.get('/account-info', (req, res) => {
    // Fetch current user's information from database
    knex('users')
        .select(
            'user_first_name', 
            'user_last_name', 
            'user_email', 
            'user_dob', 
            'user_phone', 
            'user_city', 
            'user_state', 
            'user_zip', 
            'user_role'
        )
        .where('user_id', req.session.user_id)
        .first()
        .then(user => {
            if (user) {
                // Format date of birth for HTML date input (needs YYYY-MM-DD format)
                let formattedDob = '';
                if (user.user_dob) {
                    // If it's already a string in YYYY-MM-DD format, use it
                    if (typeof user.user_dob === 'string' && user.user_dob.match(/^\d{4}-\d{2}-\d{2}/)) {
                        formattedDob = user.user_dob.split('T')[0]; // Remove time if present
                    } else {
                        // If it's a Date object or other format, convert it
                        const date = new Date(user.user_dob);
                        if (!isNaN(date.getTime())) {
                            const year = date.getFullYear();
                            const month = String(date.getMonth() + 1).padStart(2, '0');
                            const day = String(date.getDate()).padStart(2, '0');
                            formattedDob = `${year}-${month}-${day}`;
                        }
                    }
                }

                // Format phone number for display (remove formatting, then re-format)
                let formattedPhone = '';
                if (user.user_phone) {
                    // Remove all non-digit characters
                    const digits = user.user_phone.replace(/\D/g, '');
                    // Format as (XXX) XXX-XXXX if we have 10 digits
                    if (digits.length === 10) {
                        formattedPhone = `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
                    } else {
                        // If not 10 digits, just use the original value
                        formattedPhone = user.user_phone;
                    }
                }

                res.render('account-info', {
                    first_name: user.user_first_name,
                    last_name: user.user_last_name,
                    email: user.user_email,
                    birthdate: formattedDob,
                    user_phone: formattedPhone,
                    user_city: user.user_city,
                    user_state: user.user_state,
                    user_zip: user.user_zip,
                    level: user.user_role,
                    error_message: "",
                    success_message: ""
                });
            } else {
                res.render('account-info', {
                    error_message: "User not found",
                    success_message: ""
                });
            }
        }).catch(err => {
            console.log('Error fetching user info:', err);
            res.render('account-info', {
                error_message: 'Error loading account information',
                success_message: ""
            });
        });
});

// ========== AUTHENTICATION ROUTES ==========
/*
 * Login, Logout, and Registration handling.
 * We use bcrypt for password hashing - never store passwords in plain text!
 * Sessions keep users logged in across page requests.
 */

/*
 * Login Route
 * Validates email/password combo and creates a session if successful.
 * Supports both bcrypt-hashed passwords (new users) and legacy plaintext (seed data).
 */
app.post('/login', async (req, res) => {
    const email = req.body.email;
    const password = req.body.password;

    try {
        // Look up the user by email
        const user = await knex('users')
            .select('user_id', 'user_email', 'user_password', 'user_role', 'user_first_name', 'user_last_name')
            .where('user_email', email)
            .first();

        // User not found? Don't tell them which field was wrong (security best practice)
        if (!user) {
            return res.render('login', { error_message: 'Incorrect email or password' });
        }

        // Password validation - we need to handle two cases:
        // 1. New users have bcrypt hashed passwords (start with $2)
        // 2. Seed data users might have plaintext passwords like "default"
        let validPassword = false;
        
        if (user.user_password && user.user_password.startsWith('$2')) {
            // It's a bcrypt hash - use bcrypt.compare() for secure comparison
            validPassword = await bcrypt.compare(password, user.user_password);
        } else {
            // Legacy plaintext password (for demo/seed data purposes)
            validPassword = (user.user_password === password);
        }

        if (!validPassword) {
            return res.render('login', { error_message: 'Incorrect email or password' });
        }

        // Success! Store user info in the session
        // This data becomes available as req.session.* in all future requests
        req.session.isLoggedIn = true;
        req.session.email = user.user_email;
        req.session.level = user.user_role; // 'admin' or 'participant'
        req.session.first_name = user.user_first_name;
        req.session.last_name = user.user_last_name;
        req.session.user_id = user.user_id;

        console.log('User "', user.user_email, '" successfully logged in.');

        // Make sure session is saved before redirecting
        req.session.save((err) => {
            if (err) {
                console.log('Session save error:', err);
                return res.render('login', { error_message: 'Session error. Please try again.' });
            }
            res.redirect('/dashboard'); // Take them to their dashboard
        });
    } catch (err) {
        console.log('LOGIN ERROR:', err);
        res.render('login', { error_message: 'Server connection error' });
    }
});

/*
 * Logout Route
 * Destroys the session and sends user back to login page.
 */
app.post('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.log(err)
        }
        res.redirect("/login");
    });
});

/*
 * Registration Route
 * Creates a new user account and automatically logs them in.
 * All new users are created as 'participant' role (admins are created manually).
 */
app.post('/register', async (req, res) => {
    // Pull all the form fields from the request body
    let first_name = req.body.first_name;
    let last_name = req.body.last_name;
    let email = req.body.email;
    let password = req.body.password;
    let confirmPassword = req.body.confirm_password;
    let dob = req.body.birthdate;
    let phone = req.body.user_phone;
    let city = req.body.user_city;
    let state = req.body.user_state;
    let zipcode = req.body.user_zip;
    let level = 'participant'; // New users are always participants

    // Hash the password before storing - 10 salt rounds is standard
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Make sure passwords match (client-side validation too, but always validate server-side)
    if (password !== confirmPassword) {
        return res.render('register', { error_message: 'Passwords do not match' });
    }

    // Check if email is already registered
    knex.select('user_email')
        .from('users')
        .where('user_email', email)
        .first()
        .then(existingUser => {
            if (existingUser) {
                // Email already taken
                res.render('register', { error_message: 'An account with this email already exists' });
            } else {
                // All good - create the new user account
                knex('users')
                    .insert({
                        user_email: email,
                        user_password: hashedPassword, // Store the HASHED password, never plaintext!
                        user_role: level,
                        user_first_name: first_name,
                        user_last_name: last_name,
                        user_dob: dob,
                        user_phone: phone,
                        user_state: state,
                        user_city: city,
                        user_zip: zipcode
                    })
                    .then(() => {
                        console.log('New user registered:', first_name, last_name, 'Email:', email, 'Level:', level);
                        
                        // Fetch the new user's ID so we can log them in automatically
                        return knex('users')
                            .select('user_id')
                            .where('user_email', email)
                            .first();
                    })
                    .then(user => {
                        // Auto-login: set up their session just like the login route does
                        req.session.isLoggedIn = true;
                        req.session.first_name = first_name;
                        req.session.last_name = last_name;
                        req.session.email = email;
                        req.session.level = level;
                        req.session.user_id = user.user_id;
                        
                        // Take them straight to their dashboard
                        res.redirect('/dashboard');
                    })
                    .catch(err => {
                        console.log('REGISTRATION ERROR:', err);
                        res.render('register', { error_message: 'Error creating account. Please try again.' });
                    });
            }
        })
        .catch(err => {
            console.log('REGISTRATION ERROR:', err);
            res.render('register', { error_message: 'Server connection error' });
        });
});

// ~~~ Update Account Info ~~~
app.post('/account-info', async (req, res) => {
    let first_name = req.body.first_name;
    let last_name = req.body.last_name;
    let email = req.body.email;
    let dob = req.body.birthdate;
    let phone = req.body.user_phone;
    let city = req.body.user_city;
    let state = req.body.user_state;
    let zipcode = req.body.user_zip;
    let current_password = req.body.current_password;
    let new_password = req.body.new_password;
    let confirm_password = req.body.confirm_password;

    // Helper function to format user data for display
    function formatUserDataForDisplay(user) {
        // Format date of birth for HTML date input (needs YYYY-MM-DD format)
        let formattedDob = '';
        if (user.user_dob) {
            if (typeof user.user_dob === 'string' && user.user_dob.match(/^\d{4}-\d{2}-\d{2}/)) {
                formattedDob = user.user_dob.split('T')[0]; // Remove time if present
            } else {
                const date = new Date(user.user_dob);
                if (!isNaN(date.getTime())) {
                    const year = date.getFullYear();
                    const month = String(date.getMonth() + 1).padStart(2, '0');
                    const day = String(date.getDate()).padStart(2, '0');
                    formattedDob = `${year}-${month}-${day}`;
                }
            }
        }

        // Format phone number for display
        let formattedPhone = '';
        if (user.user_phone) {
            const digits = user.user_phone.replace(/\D/g, '');
            if (digits.length === 10) {
                formattedPhone = `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
            } else {
                formattedPhone = user.user_phone;
            }
        }

        return {
            first_name: user.user_first_name,
            last_name: user.user_last_name,
            email: user.user_email,
            birthdate: formattedDob,
            user_phone: formattedPhone,
            user_city: user.user_city,
            user_state: user.user_state,
            user_zip: user.user_zip,
            level: user.user_role
        };
    }

    // Build update object for user information
    let updateData = {
        user_first_name: first_name,
        user_last_name: last_name,
        user_email: email,
        user_dob: dob,
        user_phone: phone,
        user_city: city,
        user_state: state,
        user_zip: zipcode
    };

    // If user wants to change password
    if (current_password || new_password || confirm_password) {
        // Validate that all password fields are filled
        if (!current_password || !new_password || !confirm_password) {
            return knex('users')
                .select('user_first_name', 'user_last_name', 'user_email', 'user_dob', 'user_phone', 'user_city', 'user_state', 'user_zip', 'user_role')
                .where('user_id', req.session.user_id)
                .first()
                .then(user => {
                    const formattedData = formatUserDataForDisplay(user);
                    res.render('account-info', {
                        ...formattedData,
                        error_message: 'All password fields are required to change password',
                        success_message: ""
                    });
                });
        }

        // Validate password confirmation
        if (new_password !== confirm_password) {
            return knex('users')
                .select('user_first_name', 'user_last_name', 'user_email', 'user_dob', 'user_phone', 'user_city', 'user_state', 'user_zip', 'user_role')
                .where('user_id', req.session.user_id)
                .first()
                .then(user => {
                    const formattedData = formatUserDataForDisplay(user);
                    res.render('account-info', {
                        ...formattedData,
                        error_message: 'New passwords do not match',
                        success_message: ""
                    });
                });
        }

        // Verify current password
        try {
            const user = await knex('users')
                .select('user_password')
                .where('user_id', req.session.user_id)
                .first();

            if (!user) {
                const userData = await knex('users')
                    .select('user_first_name', 'user_last_name', 'user_email', 'user_dob', 'user_phone', 'user_city', 'user_state', 'user_zip', 'user_role')
                    .where('user_id', req.session.user_id)
                    .first();
                const formattedData = formatUserDataForDisplay(userData);
                return res.render('account-info', {
                    ...formattedData,
                    error_message: 'User not found',
                    success_message: ""
                });
            }

            // Compare password - handle both hashed and legacy plaintext passwords
            let validPassword = false;
            
            if (user.user_password && user.user_password.startsWith('$2')) {
                // Password is a bcrypt hash (starts with $2a$, $2b$, etc.)
                validPassword = await bcrypt.compare(current_password, user.user_password);
            } else {
                // Legacy plaintext password (for existing seed data with "default")
                validPassword = (user.user_password === current_password);
            }

            if (!validPassword) {
                const userData = await knex('users')
                    .select('user_first_name', 'user_last_name', 'user_email', 'user_dob', 'user_phone', 'user_city', 'user_state', 'user_zip', 'user_role')
                    .where('user_id', req.session.user_id)
                    .first();
                const formattedData = formatUserDataForDisplay(userData);
                return res.render('account-info', {
                    ...formattedData,
                    error_message: 'Current password is incorrect',
                    success_message: ""
                });
            }

            // Hash the new password before storing
            const saltRounds = 10;
            const hashedNewPassword = await bcrypt.hash(new_password, saltRounds);

            // Add hashed new password to update data
            updateData.user_password = hashedNewPassword;

            // Update user information including password
            return performUpdate(updateData);
        } catch (err) {
            console.log('PASSWORD VERIFICATION ERROR:', err);
            const userData = await knex('users')
                .select('user_first_name', 'user_last_name', 'user_email', 'user_dob', 'user_phone', 'user_city', 'user_state', 'user_zip', 'user_role')
                .where('user_id', req.session.user_id)
                .first();
            const formattedData = formatUserDataForDisplay(userData);
            return res.render('account-info', {
                ...formattedData,
                error_message: 'Error verifying password',
                success_message: ""
            });
        }
    } else {
        // No password change, just update user info
        performUpdate(updateData);
    }

    // Helper function to perform the update
    function performUpdate(data) {
        knex('users')
            .where('user_id', req.session.user_id)
            .update(data)
            .then(() => {
                // Update session data
                req.session.first_name = first_name;
                req.session.last_name = last_name;
                req.session.email = email;

                console.log('User account updated:', email);

                // Fetch updated user data to render
                return knex('users')
                    .select('user_first_name', 'user_last_name', 'user_email', 'user_dob', 'user_phone', 'user_city', 'user_state', 'user_zip', 'user_role')
                    .where('user_id', req.session.user_id)
                    .first();
            })
            .then(user => {
                const formattedData = formatUserDataForDisplay(user);
                res.render('account-info', {
                    ...formattedData,
                    error_message: "",
                    success_message: "Your account information has been successfully updated!"
                });
            })
            .catch(err => {
                console.log('UPDATE ERROR:', err);
                return knex('users')
                    .select('user_first_name', 'user_last_name', 'user_email', 'user_dob', 'user_phone', 'user_city', 'user_state', 'user_zip', 'user_role')
                    .where('user_id', req.session.user_id)
                    .first()
                    .then(user => {
                        const formattedData = formatUserDataForDisplay(user);
                        res.render('account-info', {
                            ...formattedData,
                            error_message: 'Error updating account information',
                            success_message: ""
                        });
                    });
            });
    }
});

// ========== SERVER LISTENING ==========
/*
 * Start the server!
 * This is the last thing that runs - it tells Express to start
 * accepting HTTP requests on the configured port.
 */
app.listen(port, () => {
    console.log(`🚀 Ella Rises server is running at http://localhost:${port}`);
});