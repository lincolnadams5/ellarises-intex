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

/*
// Important middleware that allows us to use session.isLoggedIn
app.use(session({
    secret: process.env.SESSION_SECRET || 'secret',
    resave: false,
    saveUninitialized: false
  }));

// Makes session variables automatically available on each EJS view without having to pass them individually through each route
app.use((req, res, next) => {
    res.locals.isLoggedIn = req.session.isLoggedIn || false;
    res.locals.username = req.session.username || '';
    res.locals.level = req.session.level || '';
    next();
});

// ~~ Global Authentication ~~
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
*/

// ========== VIEWS ==========
app.get('/', (req, res) => {
    res.render('home', { error_message: "" });
});

// ========== SERVER LISTENING ==========
app.listen(port, () => {
    console.log(`Node.js app running on http://localhost:${port}`);
});