// ========== INITIALIZATION ==========

require('dotenv').config(); // Load environment variables from .env file into memory

const express = require("express"); 
const session = require("express-session"); // Needed for the session variable
let path = require("path");
let bodyParser = require("body-parser");
let app = express();

app.set("view engine", "ejs");

app.use(express.static(path.join(__dirname))); // Making sure that Express can serve static files (for imported fonts)

const port = process.env.PORT || 3001;

app.use(express.urlencoded({extended: true}));

// Database Connection
const knex = require("knex")({
    client: "pg",
    connection: {
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || 'password',
        database: process.env.DB_NAME || 'db_name',
    }
});

// ========== MIDDLEWARE ==========
app.use(session({ // Important middleware that allows us to use session.isLoggedIn
    secret: process.env.SESSION_SECRET || 'secret',
    resave: false,
    saveUninitialized: false
  }));

// Makes session variables automatically available on each EJS view without having to pass them individually through each route
app.use((req, res, next) => {
    res.locals.isLoggedIn = req.session.isLoggedIn || false;
    res.locals.email = req.session.email || '';
    res.locals.level = req.session.level || '';
    next();
});

// ~~~~~ Global Authentication ~~~~~
app.use((req, res, next) => {
    // Skip authentication for login routes
    if (req.path === "/" || req.path === "/login" || req.path === "/register") {
        return next();
    }

    // TODO: Routes that require manager authentication

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

// ========== POST ROUTES ==========
app.post('/login', (req, res) => {
    let email = req.body.email
    let password = req.body.password

    knex.select('email', 'password', 'level') // Gets user row where email and password match row values
        .from('users')
        .where('email', email)
        .andWhere('password', password)
        .first() // Gets only first return
        .then(user => {
            if (user) {
                req.session.isLoggedIn = true; // Sets session login value to true
                req.session.email = user.email; // Saves email to session storage
                req.session.level = user.level // Saves user authentication level
                console.log('User "', user.email, '" successfully logged in.'); // Logs user login in console
                res.redirect('/'); // Sends successful login to the home page                
            } else {
                res.render('login', { error_message: 'Incorrect email or password'}); // Otherwise returns to login page with error message
            }
        }).catch(err => {
            console.log('LOGIN ERROR:', err);
            res.render('login', { error_message: 'Server connection error'}); // Returns to login page with error message
        });
});

app.post('/register', (req, res) => {
    let email = req.body.email;
    let password = req.body.password;
    let confirmPassword = req.body.confirm_password;
    let accountType = req.body.account_type;
    let managerKey = req.body.manager_key;

    // Validate password confirmation
    if (password !== confirmPassword) {
        return res.render('register', { error_message: 'Passwords do not match' });
    }

    // Validate manager key if account type is manager
    if (accountType === 'manager') {
        const validManagerKey = process.env.MANAGER_KEY || 'secret-key-123';
        if (managerKey !== validManagerKey) {
            return res.render('register', { error_message: 'Invalid manager authentication key' });
        }
    }

    // Set user level based on account type
    let level = accountType === 'manager' ? 'manager' : 'participant';

    // Check if user already exists
    knex.select('email')
        .from('users')
        .where('email', email)
        .first()
        .then(existingUser => {
            if (existingUser) {
                res.render('register', { error_message: 'An account with this email already exists' });
            } else {
                // Insert new user
                knex('users')
                    .insert({
                        email: email,
                        password: password, // TODO: In production, hash this password!
                        level: level
                    })
                    .then(() => {
                        console.log('New user registered:', email, 'Level:', level);
                        // Auto-login after registration
                        req.session.isLoggedIn = true;
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