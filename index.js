// ========== INITIALIZATION ==========

require('dotenv').config(); // Load environment variables from .env file into memory

const express = require("express"); 
const session = require("express-session"); // Needed for the session variable
let path = require("path");
let bodyParser = require("body-parser");
let app = express();

app.set("view engine", "ejs");

app.use(express.static(path.join(__dirname))); // Making sure that Express can serve static files (for imported fonts)

const port = process.env.PORT || 3000;

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
    let admin_routes = ['/manage-events', '/manage-milestones', '/manage-surveys', '/manage-donations', '/manage-participants'];
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

// ~~~ EVENTS ~~~
app.get('/events', (req, res) => {
    res.render('events', { error_message: "" });
});

app.get('/manage-events', (req, res) => {
    knex('event_templates')
        .innerJoin('event_occurrences', 'event_templates.event_template_id', '=', 'event_occurrences.event_template_id')
        .select({
            event_occurrence_id: 'event_occurrences.event_occurrence_id',
            event_template_id: 'event_occurrences.event_template_id',
            event_name: 'event_occurrences.event_name',
            event_date_time_start: 'event_occurrences.event_date_time_start',
            event_date_time_end: 'event_occurrences.event_date_time_end',
            event_location: 'event_occurrences.event_location',
            event_capacity: 'event_occurrences.event_capacity',
            event_registration_deadline: 'event_occurrences.event_registration_deadline',
            event_type: 'event_templates.event_type',
            event_description: 'event_templates.event_description',
            event_recurrence_pattern: 'event_templates.event_recurrence_pattern'
        })
        .orderBy('event_occurrences.event_date_time_start', 'desc')
        .then(event => {
            res.render('manage-events', {
                event: event,
                error_message: ""
            });
        }).catch(err => {
            console.log('Error fetching event information: ', err);
            res.render('manage-events', {
                event: [],
                error_message: 'Error fetching event information'
            });
        });
});

// ~~~ MILESTONES ~~~
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
    knex('users')
        .innerJoin('user_milestones', 'users.user_id', '=', 'user_milestones.user_id')
        .innerJoin('milestones', 'user_milestones.milestone_id', '=', 'milestones.milestone_id')
        .select({
            user_id: 'users.user_id',
            user_first_name: 'user_first_name',
            user_last_name: 'user_last_name',
            milestone_id: 'user_milestones.milestone_id',
            milestone_date: 'milestone_date',
            milestone_title: 'milestone_title'
        })
        .orderBy('milestone_date', 'desc')
        .then(milestone => {
            res.render('manage-milestones', {
                milestone: milestone,
                error_message: ""
            });
        }).catch(err => {
            console.log('Error fetching milestone information: ', err);
            res.render('manage-milestones', {
                milestone: [],
                error_message: 'Error fetching milestone information'
            });
        });
});

// ~~~ DONATIONS ~~~
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
    // Get all the donation information with the user email, and name
    knex('donations')
        .innerJoin('users', 'donations.user_id', '=', 'users.user_id') // Join user and donations tables
        .select( // Select necessary information
            'donation_amount',
            'donation_date',
            'user_email',
            'user_first_name',
            'user_last_name'
        )
        .orderBy('donation_date', 'desc') // Order by date initially
        .then(donation => {
            res.render('manage-donations', {
                donation: donation,
                error_message: ""
            });
        }).catch(err => {
            console.log('Error fetching donations/users: ', err);
            res.render('manage-donations', {
                donation: [],
                error_message: "Error fetching donation/user information."
            });
        });
});

// ~~~ SURVEYS ~~~
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
    knex('surveys')
        .innerJoin('registration', 'surveys.registration_id', '=', 'registration.registration_id') // Inner join "registration" on registration_id
        .innerJoin('users', 'registration.user_id', '=', 'users.user_id') // INNER JOIN "users" ON user_id
        .innerJoin('event_occurrences', 'registration.event_occurrence_id', '=', 'event_occurrences.event_occurrence_id') // INNER JOIN "event_occurrences" on "event_occurrence_id"
        .select({
            survey_id: 'survey_id',
            overall_score: 'overall_score',
            survey_submission_date: 'survey_submission_date',
            registration_id: 'registration.registration_id',
            event_occurrence_id: 'event_occurrences.event_occurrence_id',
            event_name: 'event_name',
            event_location: 'event_location',
            user_id: 'users.user_id',
            user_first_name: 'user_first_name',
            user_last_name: 'user_last_name'
        })
        .orderBy('survey_submission_date', 'desc')
        .then(survey => {
            res.render('manage-surveys', {
                survey: survey,
                error_message: ""
            });
        }).catch(err => {
            console.log('Error fetching surveys: ', err);
            res.render('manage-surveys', {
                survey: [],
                error_message: 'Error fetching surveys'
            });
        });
});

// ~~~ Participants (Admin only) ~~~
app.get('/manage-participants', (req, res) => {
    // Get all the information for each participant. 
    knex('users')
        .select('user_id', 'user_first_name', 'user_last_name', 'user_email', 'user_role')
        .orderBy('user_last_name')
        .then(user => {
            res.render('manage-participants', {
                user: user,
                error_message: ""
            });
        }).catch(err => {
            console.log('Error fetching users: ', err);
            res.render('manage-participants', {
                user: [],
                error_message: 'Error fetching users.'
            });
        });
});

// ~~~ Account Info ~~~
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
    console.log(`Node.js app running on http://localhost:${port}`);
});