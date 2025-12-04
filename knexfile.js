require('dotenv').config(); // Loads .env for local development

module.exports = {
    development: {
        client: 'pg',
        connection: {
            host: 'localhost',
            user: 'postgres',
            password: 'admin',
            database: 'ellarises',
            port: 5432,
        },
        migrations: {
            directory: './.db/migrations'
        },
        seeds: {
            directory: "./.db/seeds"
        }
    },

    production: {
        client: 'pg',
        connection: {
            host: process.env.RDS_HOSTNAME,
            user: process.env.RDS_USERNAME,
            password: process.env.RDS_PASSWORD,
            database: process.env.RDS_DB_NAME,
            port: process.env.RDS_PORT,
            ssl: { rejectUnauthorized: false }
        },
        pool: {
            min: 2, // Always keeps at least 2 connections open
            max: 10 // Never allows more than 10 connections at once
        },
        migrations: {
            directory: './.db/migrations'
        },
        seeds: {
            directory: "./.db/seeds"
        }
    }
};