// ========== INITIALIZATION ==========

require('dotenv').config(); // Load environment variables from .env file into memory

const express = require("express"); 
const session = require("express-session"); // Needed for the session variable
let path = require("path");
let bodyParser = require("body-parser");
let app = express();

app.set("view engine", "ejs");

app.use(express.static(path.join(__dirname))); // Making sure that Express can serve static files (for imported fonts)

const port = process.env.PORT || 3000; // Use AWS port, or 3000 if local

app.use(express.urlencoded({extended: true}));

// Initializing Knex and connecting to the database
const knexConfig = require("./knexfile"); 
const environment = process.env.NODE_ENV || "development";
const knex = require("knex")(knexConfig[environment]);

// Initialize session
app.use(
    session({ 
    secret: process.env.SESSION_SECRET || 'secret',
    resave: false,
    saveUninitialized: false
  })
);

// ========== MIDDLEWARE ==========

// Makes session variables automatically available on each EJS view without having to pass them individually through each route
app.use((req, res, next) => {
    res.locals.isLoggedIn = req.session.isLoggedIn || false;
    res.locals.email = req.session.email || '';
    res.locals.level = req.session.level || '';
    res.locals.first_name = req.session.first_name || '';
    res.locals.last_name = req.session.last_name || '';
    next();
});

// ~~~~~ Global Authentication ~~~~~
app.use((req, res, next) => {
    // Skip authentication for login routes
    let public_routes = ['/', '/login', '/register', '/about', '/events', '/donate'];
    if (public_routes.includes(req.path)) {
        return next();
    }

    // Checks if user is admin for the following routes
    let admin_routes = [
        '/manage-events',
        '/manage-events/new',
        '/manage-milestones',
        '/manage-milestones/new',
        '/manage-surveys',
        '/manage-donations',
        '/manage-donations/new',
        '/manage-participants',
        '/manage-participants/new'
    ];
    // Also check admin routes with parameters (like /manage-events/:id/delete or /manage-events/:id/new)
    if (req.path.startsWith('/manage-events/') && (req.path.endsWith('/delete') || req.path.endsWith('/new'))) {
        if (!req.session.isLoggedIn || req.session.level !== 'admin') {
            return res.render("login", { error_message: "Authentication error" });
        } else {
            return next();
        }
    }
    if (admin_routes.includes(req.path)) {
        if (!req.session.isLoggedIn || req.session.level !== 'admin') {
            return res.render("login", { error_message: "Authentication error" });
        } else {
            return next();
        }
    }

    // Check if user is logged in for all other routes
    if (req.session.isLoggedIn) {
        next();
    } else {
        res.render('login', { error_message: "" }); // TODO: Set EJS files to receive error message
    }
});

// ========== HELPER FUNCTIONS ==========
function getCount (tableName) {
    return knex(tableName)
        .count('* as count')
        .first()
}


// ========== VIEWS ==========
app.get('/', (req, res) => {
    res.render('home', { error_message: "" });
});

app.get('/login', (req, res) => {
    res.render('login', { error_message: "" });
});

app.get('/register', (req, res) => {
    res.render('register', { error_message: "" });
});

app.get('/about', (req, res) => {
    res.render('about', { error_message: "" });
});

// ~~~ ~~~ ~~~ ~~~ ~~~ EVENTS ~~~ ~~~ ~~~ ~~~ ~~~ 
app.get('/events', (req, res) => {
    res.render('events', { error_message: "" });
});

app.get('/manage-events', (req, res) => {
    // Pagination logic
    const page = parseInt(req.query.page, 10) || 1;
    const perPage = 20;
    const offset = (page - 1) * perPage;
    
    // Get error message from query parameter if present
    const errorMessage = req.query.error || "";

    // Query for the current page of events
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
        .offset(offset)

    const countQuery = getCount('event_templates')

    Promise.all([eventsQuery, countQuery])
        .then(([events, countResult]) => {
            const totalCount = parseInt(countResult.count, 10);
            const totalPages = Math.ceil(totalCount / perPage);

            res.render('manage-events', {
                event: events,
                currentPage: page,
                totalPages,
                totalCount,
                error_message: errorMessage
            });
        }).catch(err => {
            console.log('Error fetching event information: ', err);
            res.render('manage-events', {
                event: [],
                currentPage: page,
                totalPages: 0,
                totalCount: 0,
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
})

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
    // Pagination Logic
    const page = parseInt(req.query.page, 10) || 1;
    const perPage = 20;
    const offset = (page - 1) * perPage;

    // Query for the current page of milestones
    const milestonesQuery = knex('milestones')
        .select('milestone_id', 'milestone_title')
        .orderBy('milestone_title')
        .limit(perPage)
        .offset(offset)

    const countQuery = getCount('milestones')

    Promise.all([milestonesQuery, countQuery])
        .then(([milestones, countResult]) => {
            const totalCount = parseInt(countResult.count, 10);
            const totalPages = Math.ceil(totalCount / perPage);
            
            res.render('manage-milestones', {
                milestone: milestones,
                currentPage: page,
                totalPages,
                totalCount,
                error_message: ""
            })
        }).catch(err => {
            console.log('Error fetching milestone information: ', err);
            res.render('manage-milestones', {
                milestone: [],
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

// ~~~ ~~~ ~~~ ~~~ ~~~ DONATIONS ~~~ ~~~ ~~~ ~~~ ~~~ 
app.get('/donate', (req, res) => {
    res.render('donate', { error_message: "" });
});

app.get('/my-donations', (req, res) => {
    knex('donations')
        .select(
            'donation_amount',
            'donation_date'
        )
        .where('user_id', req.session.user_id)
        .orderBy('donation_date', 'desc')
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
    // Entered the route?
    // console.log('Managing donations');

    // Pagination logic
    const page = parseInt(req.query.page, 10) || 1;
    const perPage = 20;
    const offset = (page - 1) * perPage;

    // Query for the current page of donations
    const donationsQuery = knex('donations')
        .innerJoin('users', 'donations.user_id', '=', 'users.user_id') // Join user and donations tables
        .select( // Select necessary information
            'donations.donation_id',
            'donation_amount',
            'donation_date',
            'user_email',
            'user_first_name',
            'user_last_name'
        )
        .orderByRaw('donation_date DESC NULLS LAST') // Order by date newest to oldest
        .limit(perPage)
        .offset(offset); // Offset is the number of rows to skip

    // Query for the total count of donations (for pagination)
    const countQuery = getCount('donations')

    Promise.all([donationsQuery, countQuery]) // Ensures that both queries are executed before running
        .then(([donations, countResult]) => {
            const totalCount = parseInt(countResult.count, 10);
            const totalPages = Math.ceil(totalCount / perPage);

            res.render('manage-donations', {
                donation: donations,
                currentPage: page,
                totalPages,
                totalCount,
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

// ~~~ ~~~ ~~~ ~~~ ~~~ SURVEYS ~~~ ~~~ ~~~ ~~~ ~~~ 
app.get('/surveys', (req, res) => {
    // Get surveys for current user only
    knex('surveys')
        .innerJoin('registration', 'surveys.registration_id', '=', 'registration.registration_id')
        .innerJoin('event_occurrences', 'registration.event_occurrence_id', '=', 'event_occurrences.event_occurrence_id')
        .select(
            'surveys.survey_id',
            'surveys.overall_score',
            'surveys.survey_submission_date',
            'event_occurrences.event_name'
        )
        .where('registration.user_id', req.session.user_id)
        .orderBy('surveys.survey_submission_date', 'desc')
        .then(survey => {
            res.render('surveys', {
                survey: survey,
                error_message: ""
            });
        }).catch(err => {
            console.log('Error fetching survey information: ', err);
            res.render('surveys', {
                survey: [],
                error_message: 'Error fetching survey information'
            });
        });
});

app.get('/manage-surveys', (req, res) => {
    // Pagination logic
    const page = parseInt(req.query.page, 10) || 1;
    const perPage = 20;
    const offset = (page - 1) * perPage;

    // Query for the current page of surveys
    const surveyQuery = knex('surveys')
        .innerJoin('registration', 'surveys.registration_id', '=', 'registration.registration_id') // Inner join "registration" on registration_id
        .innerJoin('users', 'registration.user_id', '=', 'users.user_id') // INNER JOIN "users" ON user_id
        .innerJoin('event_occurrences', 'registration.event_occurrence_id', '=', 'event_occurrences.event_occurrence_id') // INNER JOIN "event_occurrences" on "event_occurrence_id"
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
        )
        .orderBy('survey_submission_date', 'desc')
        .limit(perPage)
        .offset(offset)

    const countQuery = knex('surveys')
        .innerJoin('registration', 'surveys.registration_id', '=', 'registration.registration_id') // Inner join "registration" on registration_id
        .innerJoin('users', 'registration.user_id', '=', 'users.user_id') // INNER JOIN "users" ON user_id
        .innerJoin('event_occurrences', 'registration.event_occurrence_id', '=', 'event_occurrences.event_occurrence_id') // INNER JOIN "event_occurrences" on "event_occurrence_id"
        .count('* as count')
        .first()
    
    Promise.all([surveyQuery, countQuery])
        .then(([surveys, countResult]) => {
            const totalCount = parseInt(countResult.count, 10);
            const totalPages = Math.ceil(totalCount / perPage)

            res.render('manage-surveys', {
                survey: surveys,
                currentPage: page,
                totalPages,
                totalCount,
                error_message: ""
            })
        }).catch(err => {
            console.log('Error fetching surveys: ', err);
            res.render('manage-surveys', {
                survey: [],
                error_message: 'Error fetching surveys'
            });
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
    // Pagination Logic
    const page = parseInt(req.query.page, 10) || 1;
    const perPage = 20;
    const offset = (page - 1) * perPage;

    // Gets users for a page for the pagination
    const usersQuery = knex('users')
        .select(
            'user_id',
            'user_first_name',
            'user_last_name',
            'user_email',
            'user_role'
        )
        .orderBy('user_last_name')
        .orderBy('user_first_name')
        .limit(perPage)
        .offset(offset)

    const countQuery = getCount('users')

    Promise.all([usersQuery, countQuery])
        .then(([users, countResult]) => {
            const totalCount = parseInt(countResult.count, 10);
            const totalPages = Math.ceil(totalCount / perPage);

            res.render('manage-participants', {
                user: users,
                currentPage: page,
                totalPages,
                totalCount,
                error_message: ""
            })
        }).catch(err => {
            console.log('Error fetching users: ', err);
            res.render('manage-participants', {
                user: [],
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
app.get('/dashboard', (req, res) => {
    // Render the user dashboard/landing page
    res.render('user-home', {
        error_message: ""
    });
});

app.post('/manage-participants/new', (req, res) => {
    const { user_first_name, user_last_name, user_email, user_role } = req.body;

    knex('users')
        .insert({
            user_first_name,
            user_last_name,
            user_email,
            user_role
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
                res.render('account-info', {
                    first_name: user.user_first_name,
                    last_name: user.user_last_name,
                    email: user.user_email,
                    birthdate: user.user_dob,
                    user_phone: user.user_phone,
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

// ========== POST ROUTES ==========

// ~~~ Login ~~~
app.post('/login', (req, res) => {
    let email = req.body.email
    let password = req.body.password

    knex.select('user_email', 'user_role', 'user_first_name', 'user_last_name', 'user_id') // Gets user row where email and password match row values
        .from('users')
        .where('user_email', email)
        .andWhere('user_password', password) // NOTE: All passwords are "default", we should add encryption here as well
        .first() // Gets only first return
        .then(user => {
            if (user) {
                req.session.isLoggedIn = true; // Sets session login value to true
                req.session.email = user.user_email; // Saves email to session storage
                req.session.level = user.user_role // Saves user authentication level
                req.session.first_name = user.user_first_name // Saves user first name
                req.session.last_name = user.user_last_name // Saves user last name
                req.session.user_id = user.user_id // Saves user id
                console.log('User "', user.user_email, '" successfully logged in.'); // Logs user login in console
                res.redirect('/'); // Sends successful login to the home page                
            } else {
                res.render('login', { error_message: 'Incorrect email or password'}); // Otherwise returns to login page with error message
            }
        }).catch(err => {
            console.log('LOGIN ERROR:', err);
            res.render('login', { error_message: 'Server connection error'}); // Returns to login page with error message
        });
});

// ~~~ Logout ~~~
app.post('/logout', (req, res) => {
    // Destroys the session object
    req.session.destroy((err) => {
        if (err) {
            console.log(err)
        }
        res.redirect("/login"); // Redirects to the login page
    });
});

// ~~~ Register New User ~~~
app.post('/register', (req, res) => {
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
    let level = 'participant';

    // Validate password confirmation
    if (password !== confirmPassword) {
        return res.render('register', { error_message: 'Passwords do not match' });
    }

    // Check if user already exists
    knex.select('user_email')
        .from('users')
        .where('user_email', email)
        .first()
        .then(existingUser => {
            if (existingUser) {
                res.render('register', { error_message: 'An account with this email already exists' });
            } else {
                // Insert new user
                knex('users')
                    .insert({
                        user_email: email,
                        user_password: password, // NOTE: currently omitting passwords from the requirements because we don't have a column for it in the database
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
                        // Get the newly created user's ID and auto-login
                        return knex('users')
                            .select('user_id')
                            .where('user_email', email)
                            .first();
                    })
                    .then(user => {
                        req.session.isLoggedIn = true;
                        req.session.first_name = first_name;
                        req.session.last_name = last_name;
                        req.session.email = email;
                        req.session.level = level;
                        req.session.user_id = user.user_id;
                        res.redirect('/');
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
app.post('/account-info', (req, res) => {
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
                    res.render('account-info', {
                        first_name: user.user_first_name,
                        last_name: user.user_last_name,
                        email: user.user_email,
                        birthdate: user.user_dob,
                        user_phone: user.user_phone,
                        user_city: user.user_city,
                        user_state: user.user_state,
                        user_zip: user.user_zip,
                        level: user.user_role,
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
                    res.render('account-info', {
                        first_name: user.user_first_name,
                        last_name: user.user_last_name,
                        email: user.user_email,
                        birthdate: user.user_dob,
                        user_phone: user.user_phone,
                        user_city: user.user_city,
                        user_state: user.user_state,
                        user_zip: user.user_zip,
                        level: user.user_role,
                        error_message: 'New passwords do not match',
                        success_message: ""
                    });
                });
        }

        // Verify current password
        knex('users')
            .select('user_password')
            .where('user_id', req.session.user_id)
            .first()
            .then(user => {
                if (!user || user.user_password !== current_password) {
                    return knex('users')
                        .select('user_first_name', 'user_last_name', 'user_email', 'user_dob', 'user_phone', 'user_city', 'user_state', 'user_zip', 'user_role')
                        .where('user_id', req.session.user_id)
                        .first()
                        .then(user => {
                            res.render('account-info', {
                                first_name: user.user_first_name,
                                last_name: user.user_last_name,
                                email: user.user_email,
                                birthdate: user.user_dob,
                                user_phone: user.user_phone,
                                user_city: user.user_city,
                                user_state: user.user_state,
                                user_zip: user.user_zip,
                                level: user.user_role,
                                error_message: 'Current password is incorrect',
                                success_message: ""
                            });
                        });
                }

                // Add new password to update data
                updateData.user_password = new_password;

                // Update user information including password
                return performUpdate(updateData);
            })
            .catch(err => {
                console.log('PASSWORD VERIFICATION ERROR:', err);
                return knex('users')
                    .select('user_first_name', 'user_last_name', 'user_email', 'user_dob', 'user_phone', 'user_city', 'user_state', 'user_zip', 'user_role')
                    .where('user_id', req.session.user_id)
                    .first()
                    .then(user => {
                        res.render('account-info', {
                            first_name: user.user_first_name,
                            last_name: user.user_last_name,
                            email: user.user_email,
                            birthdate: user.user_dob,
                            user_phone: user.user_phone,
                            user_city: user.user_city,
                            user_state: user.user_state,
                            user_zip: user.user_zip,
                            level: user.user_role,
                            error_message: 'Error verifying password',
                            success_message: ""
                        });
                    });
            });
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
                res.render('account-info', {
                    first_name: user.user_first_name,
                    last_name: user.user_last_name,
                    email: user.user_email,
                    birthdate: user.user_dob,
                    user_phone: user.user_phone,
                    user_city: user.user_city,
                    user_state: user.user_state,
                    user_zip: user.user_zip,
                    level: user.user_role,
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
                        res.render('account-info', {
                            first_name: user.user_first_name,
                            last_name: user.user_last_name,
                            email: user.user_email,
                            birthdate: user.user_dob,
                            user_phone: user.user_phone,
                            user_city: user.user_city,
                            user_state: user.user_state,
                            user_zip: user.user_zip,
                            level: user.user_role,
                            error_message: 'Error updating account information',
                            success_message: ""
                        });
                    });
            });
    }
});

// ========== SERVER LISTENING ==========
app.listen(port, () => {
    console.log(`Listening on port ${port}`);
});