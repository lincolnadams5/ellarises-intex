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
    let public_routes = ['/', '/login', '/register', '/about', '/event-info', '/donate'];
    if (public_routes.includes(req.path)) {
        return next();
    }

    // Checks if user is admin for the following routes
    let admin_routes = ['/event-manage', '/milestones-manage', '/surveys-manage', '/manage-donations'];
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

app.get('/event-info', (req, res) => {
    // Get all events that are within the next 6 months -- Do we even have any data for this?

    res.render('event-info', { error_message: "" });
});

// ~~~ Donations ~~~
app.get('/donate', (req, res) => {
    res.render('donate', { error_message: "" });
});

app.get('/view-donations', (req, res) => {
    knex('donations')
        .select(
            'donation_amount',
            'donation_date'
        )
        .where('user_id', req.session.user_id)
        .orderBy('donation_date', 'desc')
        .then(userDonations => {
            res.render('view-donations', {
                userDonations: userDonations,
                error_message: ""
            });
        }).catch(err => {
            console.log('Error fetching donation information: ', err);
            res.render('view-donations', {
                userDonations: [],
                error_message: 'Error fetching donation information'
            });
        });
});

app.get('/manage-donations', (req, res) => {
    // Get all the donation information with the user email, and name
    knex('donations')
        .join('users', 'donations.user_id', '=', 'users.user_id') // Join user and donations tables
        .select( // Select necessary information
            'donation_amount',
            'donation_date',
            'user_email',
            'user_first_name',
            'user_last_name'
        )
        .orderBy('donation_date', 'desc') // Order by date initially
        .then(userDonations => {
            res.render('manage-donations', {
                userDonations: userDonations,
                error_message: ""
            });
        }).catch(err => {
            console.log('Error fetching donations/users: ', err);
            res.render('manage-donations', {
                userDonations: [],
                error_message: "Error fetching donation/user information."
            });
        });
});

// ========== POST ROUTES ==========
app.post('/login', (req, res) => {
    let email = req.body.email
    let password = req.body.password

    knex.select('user_email', 'user_role', 'user_first_name', 'user_last_name', 'user_id') // Gets user row where email and password match row values
        .from('users')
        .where('user_email', email)
        // .andWhere('password', password) NOTE: Omitting this line for now because we don't have a column to store user passwords
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

app.post('/logout', (req, res) => {
    // Destroys the session object
    req.session.destroy((err) => {
        if (err) {
            console.log(err)
        }
        res.redirect("/login"); // Redirects to the login page
    });
});

app.post('/register', (req, res) => {
    let first_name = req.body.first_name;
    let last_name = req.body.last_name;
    let email = req.body.email;
    let password = req.body.password;
    let confirmPassword = req.body.confirm_password;
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
                        // password: password, // NOTE: currently omitting passwords from the requirements because we don't have a column for it in the database
                        user_role: level,
                        user_first_name: first_name,
                        user_last_name: last_name
                    })
                    .then(() => {
                        console.log('New user registered:', email, 'Level:', level);
                        // Auto-login after registration
                        req.session.isLoggedIn = true;
                        req.session.first_name = first_name;
                        req.session.last_name = last_name;
                        req.session.email = email;
                        req.session.level = level;
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

// ========== SERVER LISTENING ==========
app.listen(port, () => {
    console.log(`Node.js app running on http://localhost:${port}`);
});